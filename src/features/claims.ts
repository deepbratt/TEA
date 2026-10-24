import { normalisePath, routePattern, type ApiCall, type Route, type StackDetection, type StackKind } from '../core/index.js';
import type { CodeIndex } from './code.js';
import type { RawClaim } from './docs.js';
import type { Claim, MissingPart } from './types.js';
import { words } from './words.js';

/**
 * Check what the docs claim against the code. TEA only says something is missing when it has a
 * concrete reason: a path the docs name that no route serves, a capability (CSV export, email,
 * rate limits...) with no library or code for it, or a thing the UI calls that nothing serves.
 * A claim TEA can't check either way is marked unverified, never failed.
 */

interface Capability {
  id: string;
  label: string;
  mentions: (text: string) => boolean;
  deps?: RegExp;
  code?: RegExp;
  /** Source files whose path shows it (lib/llm.ts). */
  files?: RegExp;
  routes?: RegExp;
  stackKind?: StackKind;
  /** Evidence is only a route: skip it when the claim names its own path. */
  routeOnly?: boolean;
}

const has = (re: RegExp) => (t: string) => re.test(t);

const CAPABILITIES: Capability[] = [
  {
    id: 'csv-export',
    label: 'CSV export',
    mentions: has(/\bcsv\b/i),
    deps: /^(papaparse|csv-stringify|csv-writer|json2csv|@json2csv\/.+|fast-csv|csv|react-csv|export-to-csv|xlsx|exceljs)$/i,
    code: /text\/csv|\.csv\b|to_?csv|csv(Writer|Stringify|Export)|DictWriter|csv\.writer|unparse\(/i,
    routes: /csv|\/export/i,
  },
  {
    id: 'pdf',
    label: 'PDF generation',
    mentions: has(/\bpdfs?\b/i),
    deps: /^(pdfkit|jspdf|pdf-lib|@react-pdf\/renderer|pdfmake|puppeteer|reportlab|weasyprint|wkhtmltopdf|prawn|dompdf\/dompdf|html-pdf)$/i,
    code: /application\/pdf|\.pdf\b|generatePdf|toPdf|renderToBuffer|page\.pdf\(/i,
  },
  {
    id: 'email',
    label: 'sending email',
    mentions: (t) => /\be-?mails?\b/i.test(t) && /\b(sen[dt]s?|sending|deliver\w*|notif\w*|confirmations?|welcome|receipts?|digest)\b/i.test(t),
    deps: /^(nodemailer|resend|@sendgrid\/mail|postmark|mailgun(\.js)?|@aws-sdk\/client-sesv?2?|emailjs|@emailjs\/.+|react-email|@react-email\/.+|mailersend|@getbrevo\/.+|sib-api-v3-sdk|django-anymail|flask-mail|lettre|node-mailjet|@mailchimp\/.+|loops|plunk)$/i,
    code: /\b(sendMail|sendEmail|send_mail|send_email|emails\.send|transporter\.send|createTransport|ActionMailer|Mail::|SmtpClient|smtplib|MailMessage)\b/i,
  },
  {
    id: 'rate-limit',
    label: 'rate limiting',
    mentions: has(/\brate[- ]?limit|\bthrottl|\blimited to \d+|\b\d+\s*(attempts|requests|calls|tries|times)\s*(per|\/|an?|every)\s*(sec|second|min|minute|hour|day)|\b\d+ per (user|day|hour|minute)\b|\bper[- ]user (limit|quota)/i),
    deps: /rate-?limit|ratelimit|limiter|throttl|slowapi|rack-attack|bottleneck|@upstash\/ratelimit|express-slow-down|governor/i,
    code: /rate[-_ ]?limit|ratelimit|limiter|throttl|RateLimit|slidingWindow|tokenBucket|quota/i,
  },
  {
    id: 'search',
    label: 'search',
    mentions: has(/\bsearch(es|ing|able)?\b/i),
    deps: /^(algoliasearch|algolia.*|meilisearch|typesense|@elastic\/elasticsearch|elasticsearch|fuse\.js|flexsearch|lunr|minisearch|searchkick|django-haystack|pg_search|@orama\/orama)$/i,
    code: /type=\{?["']search["']|role=["']search["']|placeholder=\{?["'][^"']*search|\bsearch(Products|Items|Query|Term|Text|Box|Bar|Input|Results|Index)\b|full[_ -]?text|to_tsvector|\$search|\bILIKE\b|\bicontains\b|\.search\(\s*["'`{]/i,
    routes: /search/i,
  },
  {
    id: 'payments',
    label: 'payments',
    mentions: has(/\b(stripe|paypal|paddle|lemon ?squeezy|braintree|razorpay|payments?|subscriptions?|billing|charg(e|es|ing))\b/i),
    stackKind: 'payments',
    deps: /stripe|paypal|paddle|lemonsqueezy|braintree|razorpay|mollie|square|adyen/i,
    code: /stripe|paypal|paddle|lemonsqueezy|braintree|razorpay|mollie|adyen|checkout\.sessions/i,
  },
  {
    id: 'ai',
    label: 'an AI model',
    mentions: has(/\b(ai|a\.i\.|llm|gpt[-\w]*|openai|anthropic|claude|gemini|chat ?bot|mistral|ollama)\b/i),
    stackKind: 'ai',
    deps: /^(openai|@anthropic-ai\/sdk|anthropic|ai|@ai-sdk\/.+|langchain|@langchain\/.+|@google\/generative-ai|@google\/genai|google-generativeai|cohere-ai|replicate|groq-sdk|ollama|llamaindex|@mistralai\/.+|transformers)$/i,
    code: /openai|anthropic|chat\.completions|generateText|streamText|\bllm\b|gemini|ollama|messages\.create/i,
    files: /(^|\/)(ai|llm|openai|gpt|anthropic|claude)[./_-]/i,
    routes: /\/(ai|llm|chat|completions?)(\/|$)/i,
  },
  {
    id: 'upload',
    label: 'file uploads',
    mentions: has(/\buploads?\b|\battachments?\b/i),
    deps: /^(multer|busboy|formidable|uploadthing|@uploadthing\/.+|@aws-sdk\/client-s3|aws-sdk|cloudinary|filepond|react-dropzone|@vercel\/blob|boto3|carrierwave|shrine|active_storage)$/i,
    code: /type=\{?["']file["']|multipart|putObject|storage\.from\(|upload(File|Image)?\s*\(|UploadFile|request\.files|FileField/i,
  },
  {
    id: 'sms',
    label: 'sending SMS',
    mentions: has(/\bsms\b|\btext messages?\b/i),
    deps: /twilio|vonage|messagebird|plivo|@aws-sdk\/client-sns|textbelt/i,
    code: /twilio|sendSms|send_sms|messages\.create\(\s*\{[^}]*\bto\b/i,
  },
  {
    id: 'realtime',
    label: 'real-time updates',
    mentions: has(/\breal-?time\b|\blive updates?\b|\bwebsockets?\b/i),
    deps: /^(socket\.io|socket\.io-client|ws|pusher|pusher-js|ably|@supabase\/realtime-js|liveblocks|@liveblocks\/.+|partykit|channels|actioncable|@microsoft\/signalr)$/i,
    code: /WebSocket|socket\.io|\.channel\(|EventSource|\.subscribe\(|on\(['"]postgres_changes/i,
  },
  {
    id: 'health',
    label: 'a health check',
    mentions: has(/\bhealth ?(check|endpoint)s?\b|\buptime (check|monitor)/i),
    routes: /\/(health(z|check)?|ready|readiness|live|liveness|status|ping)(\/|$)/i,
    routeOnly: true,
  },
];

/** Paths a claim names, like /api/health or /orders/:id. */
const CLAIM_PATH = /(?<![\w./])\/(?:[a-z0-9_-]+|\[[\w.]+\]|:\w+|\{\w+\})(?:\/(?:[a-z0-9_.-]+|\[[\w.]+\]|:\w+|\{\w+\}))*/gi;

export function claimPaths(text: string): string[] {
  return [...new Set([...text.matchAll(CLAIM_PATH)].map((m) => normalisePath(m[0].replace(/[.,;:]+$/, ''))))];
}

export interface MatchContext {
  routes: Route[];
  calls: ApiCall[];
  /** Routes that can serve calls (the wiring check's backend side). */
  endpoints: Route[];
  stack: StackDetection[];
  models: string[];
  index: CodeIndex;
}

const sample = (p: string) => p.replace(/:param\b|:\w+|\[[^\]]+\]|\{[^}]+\}/g, 'tea-sample-id');

function routeFor(path: string, routes: Route[]): Route | undefined {
  const probe = sample(path);
  return routes.find((r) => routePattern(r.path).test(probe) || normalisePath(r.path) === path);
}

function capabilityEvidence(cap: Capability, ctx: MatchContext): string | undefined {
  if (cap.stackKind) {
    const s = ctx.stack.find((x) => x.kind === cap.stackKind);
    if (s) return s.name;
  }
  if (cap.deps) {
    const d = [...ctx.index.deps].find((x) => cap.deps!.test(x));
    if (d) return `dependency ${d}`;
  }
  if (cap.routes) {
    const r = ctx.routes.find((x) => cap.routes!.test(x.path));
    if (r) return `route ${r.path}`;
  }
  if (cap.files) {
    const f = [...ctx.index.code.keys()].find((x) => cap.files!.test(x));
    if (f) return `file ${f}`;
  }
  if (cap.code) {
    for (const [file, text] of ctx.index.code) if (cap.code.test(text)) return `code in ${file}`;
  }
  return undefined;
}

/** Words that name a thing the UI calls but nothing serves, e.g. "wishlist" for GET /api/wishlist. */
function unservedCall(word: string, ctx: MatchContext): ApiCall | undefined {
  const inPath = (p: string) => p.toLowerCase().split(/[^a-z0-9]+/).map((w) => w.replace(/s$/, '')).includes(word);
  if (ctx.routes.some((r) => inPath(r.path))) return undefined;
  return ctx.calls.find((c) => inPath(c.path) && !ctx.endpoints.some((r) => routePattern(r.path).test(sample(c.path))));
}

function namedInCode(word: string, ctx: MatchContext): string | undefined {
  const seg = (p: string) => p.toLowerCase().split(/[^a-z0-9]+/).map((w) => w.replace(/s$/, ''));
  const r = ctx.routes.find((x) => seg(x.path).includes(word));
  if (r) return `${r.kind === 'api' ? 'API' : 'page'} ${r.path}`;
  const m = ctx.models.find((x) => x.toLowerCase().replace(/s$/, '') === word);
  if (m) return `data model ${m}`;
  const f = [...ctx.index.code.keys()].find((x) => seg(x.split('/').pop()!.replace(/\.[^.]+$/, '')).includes(word));
  if (f) return `file ${f}`;
  return undefined;
}

export function matchClaim(raw: RawClaim, ctx: MatchContext): Claim {
  const claim: Claim = { ...raw, found: [], missing: [], verified: false };
  // Planned work isn't checked against the code: it's not built yet, and that's fine.
  if (raw.status === 'planned') return claim;
  const missing: MissingPart[] = [];
  const paths = claimPaths(raw.text);
  for (const path of paths) {
    const r = routeFor(path, ctx.routes);
    if (r) claim.found.push(`${r.kind === 'api' ? 'API' : 'page'} ${r.path}`);
    else missing.push({ key: path, label: path, why: `no page or API route in the code serves ${path}` });
  }
  const capWords = new Set<string>();
  for (const cap of CAPABILITIES) {
    if (!cap.mentions(raw.text)) continue;
    if (cap.routeOnly && paths.length) continue;
    cap.label.split(' ').forEach((w) => capWords.add(w));
    const ev = capabilityEvidence(cap, ctx);
    if (ev) claim.found.push(ev);
    else missing.push({ key: cap.id, label: cap.label, why: `TEA found no code for ${cap.label}: no library for it, and nothing in the code that does it` });
  }
  for (const w of new Set(words(raw.text))) {
    if (w.length < 4 || capWords.has(w)) continue;
    const named = namedInCode(w, ctx);
    if (named) {
      claim.found.push(named);
      continue;
    }
    const call = unservedCall(w, ctx);
    if (call) missing.push({ key: w, label: w, why: `the UI calls ${call.method} ${call.path} (${call.file}), but nothing in the backend serves it` });
  }
  claim.found = [...new Set(claim.found)];
  claim.missing = missing.filter((m, i) => missing.findIndex((x) => x.key === m.key) === i);
  claim.verified = claim.found.length > 0 || claim.missing.length > 0;
  return claim;
}
