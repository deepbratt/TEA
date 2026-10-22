import { normalisePath, type ApiCall, type Discovery, type EnvVar, type FormInfo, type RepoContext, type Route } from '../core/index.js';
import { isSource, isTestPath, lineOf } from './context.js';

/** Prefixes that frameworks inline into the browser bundle. */
const CLIENT_ENV_PREFIXES = ['NEXT_PUBLIC_', 'VITE_', 'EXPO_PUBLIC_', 'REACT_APP_', 'NUXT_PUBLIC_', 'PUBLIC_', 'GATSBY_', 'VUE_APP_'];

const ENV_PATTERNS = [
  /process\.env\.([A-Z_][A-Z0-9_]*)/g,
  /process\.env\[\s*["'`]([A-Z_][A-Z0-9_]*)["'`]\s*\]/g,
  /import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g,
  /os\.environ(?:\.get)?\(\s*["']([A-Z_][A-Z0-9_]*)["']/g,
  /os\.environ\[\s*["']([A-Z_][A-Z0-9_]*)["']\s*\]/g,
  /os\.getenv\(\s*["']([A-Z_][A-Z0-9_]*)["']/g,
  /ENV(?:\.fetch\()?\[?\s*["']([A-Z_][A-Z0-9_]*)["']/g,
  /Deno\.env\.get\(\s*["']([A-Z_][A-Z0-9_]*)["']/g,
  /\$env\/static\/(?:public|private)['"][^;]*?\{([^}]+)\}/g,
];

const ENV_FILE = /(^|\/)\.env(\.[\w.-]+)?$/;
const ENV_TEMPLATE = /\.(example|sample|template|dist|defaults)$/;

function isClientExposed(name: string): boolean {
  return CLIENT_ENV_PREFIXES.some((p) => name.startsWith(p));
}

/** Env var NAMES only. Values are never read into the app map. */
async function envVars(ctx: RepoContext): Promise<{ envVars: EnvVar[]; envFiles: string[] }> {
  const map = new Map<string, Set<string>>();
  const add = (name: string, file: string) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name)!.add(file);
  };
  for (const f of ctx.find((f) => isSource(f) || /\.(svelte|vue|astro)$/.test(f))) {
    const text = await ctx.read(f);
    for (const re of ENV_PATTERNS) {
      for (const m of text.matchAll(re)) {
        for (const name of m[1]!.split(',').map((s) => s.trim()).filter((s) => /^[A-Z_][A-Z0-9_]*$/.test(s))) add(name, f);
      }
    }
  }
  const envFiles = ctx.find((f) => ENV_FILE.test(f));
  for (const f of envFiles.filter((f) => ENV_TEMPLATE.test(f))) {
    for (const m of (await ctx.read(f)).matchAll(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=/gm)) add(m[1]!, f);
  }
  const vars = [...map.entries()]
    .filter(([name]) => !['NODE_ENV', 'PORT', 'HOST', 'CI', 'HOSTNAME', 'PWD', 'HOME', 'PATH'].includes(name))
    .map(([name, files]) => ({ name, clientExposed: isClientExposed(name), files: [...files].sort() }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { envVars: vars, envFiles };
}

const FORM_FILE = /\.(jsx|tsx|vue|svelte|html|astro|erb|hbs|ejs|php)$/;

function attr(tag: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|\\{\\s*["'\`]([^"'\`]*)["'\`]\\s*\\})`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? m[3]) : undefined;
}

async function forms(ctx: RepoContext): Promise<FormInfo[]> {
  const out: FormInfo[] = [];
  for (const f of ctx.find((f) => FORM_FILE.test(f) && !isTestPath(f))) {
    const text = await ctx.read(f);
    for (const m of text.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)) {
      const fields = [...m[2]!.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)]
        .map(([, tagName, rest]) => ({
          name: attr(rest!, 'name') ?? attr(rest!, 'id'),
          type: tagName!.toLowerCase() === 'input' ? (attr(rest!, 'type') ?? 'text') : tagName!.toLowerCase(),
          required: /\brequired\b/.test(rest!),
          label: attr(rest!, 'placeholder') ?? attr(rest!, 'aria-label'),
        }))
        .filter((fl) => fl.type !== 'hidden');
      out.push({ location: `${f}:${lineOf(text, m.index!)}`, action: attr(m[1]!, 'action'), method: attr(m[1]!, 'method')?.toUpperCase(), fields });
    }
  }
  return out;
}

async function openapi(ctx: RepoContext): Promise<string[]> {
  return ctx.find((f) => /(^|\/)(openapi|swagger)[\w.-]*\.(json|ya?ml)$/i.test(f));
}

/*
 * HTTP calls, in any language. A call is a client method or function followed by a URL argument:
 *   JS/TS   fetch('/api/x'), axios.post(`${BASE}/x/${id}`), this.http.get('/x'), useSWR('/api/x')
 *   Python  requests.get(f"{BASE}/api/x"), httpx.post(BASE + "/x")
 *   Go      http.Get(baseURL + "/api/x"), http.NewRequest("POST", fmt.Sprintf("%s/x", base), b)
 *   Rust    client.get(format!("{}/api/x", base))
 *   JVM     restTemplate.getForObject("/x"), client.get("/x"), Retrofit @GET("users/{id}")
 *   C#      _http.GetFromJsonAsync<T>($"{base}/api/x"), new HttpRequestMessage(HttpMethod.Post, "/x")
 *   PHP     Http::get($base . '/api/x'), $client->post('/x')
 *   Ruby    HTTParty.get("#{BASE}/x"), conn.get('/x')
 *   Dart    http.get(Uri.parse('$baseUrl/api/x')), dio.post('/x')
 *   Swift   URL(string: "\(base)/api/x")
 * Only paths count: a full URL to another host is a third-party API, not this app's backend.
 */

/** Receivers that are HTTP clients (the last part of `this.api`, `_httpClient`, `$client`...). */
const CLIENT_RECEIVER = /(?:api|client|http|https|httpx|axios|ky|requests?|session|dio|faraday|httparty|rest\w*|fetch\w*|instance|conn)$/i;
const RECEIVER_CALL = /(?<![@\w$])(?<recv>[A-Za-z_$][\w$]*(?:(?:\.|->|::|\?\.)[A-Za-z_$][\w$]*)*)\s*(?:\.|->|::|\?\.)\s*(?<verb>get|post|put|patch|delete)(?:Async|FromJsonAsync|AsJsonAsync|ForObject|ForEntity|Json|!)?\s*(?:<[^<>()]*>)?\(/gi;
const BARE_CALL = /(?<![\w$.])(?<bare>fetch|\$fetch|ofetch|useFetch|useSWR|useSWRMutation|axios|ky|URL)\s*\(/g;
/** `http.NewRequest("POST", url)`, `new HttpRequestMessage(HttpMethod.Post, url)`. */
const METHOD_FIRST = /(?:\bNewRequest(?:WithContext)?\(\s*(?:ctx\s*,\s*)?"(?<m1>GET|POST|PUT|PATCH|DELETE)"|HttpRequestMessage\(\s*HttpMethod\.(?<m2>Get|Post|Put|Patch|Delete))\s*,/g;
/** Retrofit interfaces: @GET("users/{id}"). JAX-RS writes @GET without arguments, so it never matches. */
const RETROFIT = /@(?<verb>GET|POST|PUT|PATCH|DELETE)\(\s*"(?<url>[^"]*)"\s*\)/g;

/** The URL argument at a position: optional wrappers (Uri.parse, format!, ...), an optional `base +`, then a literal. */
const URL_ARG =
  /\s*(?:(?:Uri\.parse|Uri\.https?|URI\.create|URI|new\s+URL|URL|format!|fmt\.Sprintf|String\.format|sprintf)\s*\(\s*|string:\s*)*(?:(?<concat>[\w$]+(?:\.[\w$]+)*)\s*(?:\+|\.(?=\s*["']))\s*)?[fr$@]{0,2}(?<q>["'`])(?<url>(?:https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?|\$\{[^}]*\}|\{[^}]*\}|\$\w+|\\\([^)]*\)|#\{[^}]*\}|%[sv])?\/[^"'`?#\s]*)/y;

/** Base URL variables that point at a third-party API rather than the app's own backend. */
const EXTERNAL_BASE = /stripe|openai|anthropic|github|google|slack|twilio|sendgrid|resend|mailgun|supabase|firebase|discord|paypal|shopify|notion|airtable|external|third_?party/i;

const FETCH_METHOD = /method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE)["'`]|httpMethod\s*=\s*"(GET|POST|PUT|PATCH|DELETE)"|HttpMethod\.(Get|Post|Put|Patch|Delete)/i;
const ASSET_PATH = /\.(png|jpe?g|svg|ico|css|js|mjs|webp|gif|pdf|xml|txt|json|woff2?)$/i;

/** Template parts in any language: ${x}, {x}, $x, \(x), #{x}, %s. */
const TEMPLATE_PART = /\$\{[^}]*\}|\{[^}]*\}|\$\w+|\\\([^)]*\)|#\{[^}]*\}|%[sdv]/g;
const LEADING_BASE = /^(?:https?:\/\/[^/]+|\$\{[^}]*\}|\{[^}]*\}|\$\w+|\\\([^)]*\)|#\{[^}]*\}|%[sv])/;

/** Turn a URL literal into a route-like path: drop the base URL, template parts become :param. */
export function callPath(raw: string): string {
  return normalisePath(raw.replace(LEADING_BASE, '').replace(TEMPLATE_PART, ':param'));
}

/** The text of a call's argument list, from its opening paren to the matching close (bounded). */
function callArgs(text: string, open: number): string {
  let depth = 0;
  const end = Math.min(text.length, open + 600);
  for (let i = open; i < end; i++) {
    const c = text[i];
    if (c === '(' || c === '{' || c === '[') depth++;
    else if ((c === ')' || c === '}' || c === ']') && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open, end);
}

/** API calls the code makes, plus form actions. Feeds the frontend-to-API wiring checks. */
/** The URL argument of a call whose argument list starts at `from`, if it is a path on this app. */
function urlArg(text: string, from: number): string | undefined {
  URL_ARG.lastIndex = from;
  const m = URL_ARG.exec(text);
  if (!m?.groups) return undefined;
  const base = m.groups.concat ?? /^(?:\$\{|\{|\$|\\\(|#\{)(\w+)/.exec(m.groups.url!)?.[1] ?? '';
  if (EXTERNAL_BASE.test(base)) return undefined;
  // "/api/items/" + id: what's concatenated after a trailing slash is a path parameter.
  const appended = m.groups.url!.endsWith('/') && /^["'`]\s*(?:\+|\.)\s*[\w$(]/.test(text.slice(URL_ARG.lastIndex));
  const path = callPath(appended ? `${m.groups.url}:param` : m.groups.url!);
  return ASSET_PATH.test(path) ? undefined : path;
}

const methodIn = (args: string) => {
  const m = FETCH_METHOD.exec(args);
  return (m?.[1] ?? m?.[2] ?? m?.[3])?.toUpperCase();
};

async function apiCalls(ctx: RepoContext): Promise<ApiCall[]> {
  const out: ApiCall[] = [];
  for (const f of ctx.find(isSource)) {
    const text = await ctx.read(f);
    const add = (path: string | undefined, method: string, at: number) => {
      if (path) out.push({ path, method, file: f, line: lineOf(text, at), via: 'code' });
    };
    for (const m of text.matchAll(RECEIVER_CALL)) {
      const last = m.groups!.recv!.split(/\.|->|::|\?\./).pop()!;
      if (!CLIENT_RECEIVER.test(last)) continue;
      add(urlArg(text, m.index! + m[0].length), m.groups!.verb!.toUpperCase(), m.index!);
    }
    for (const m of text.matchAll(BARE_CALL)) {
      if (m.groups!.bare === 'URL' && !f.endsWith('.swift')) continue;
      const open = m.index! + m[0].length - 1;
      // fetch() and URLRequest default to GET unless their own options (or the next lines in Swift) say otherwise.
      const args = f.endsWith('.swift') ? text.slice(open, open + 400) : callArgs(text, open);
      add(urlArg(text, open + 1), methodIn(args) ?? 'GET', m.index!);
    }
    for (const m of text.matchAll(METHOD_FIRST)) add(urlArg(text, m.index! + m[0].length), (m.groups!.m1 ?? m.groups!.m2)!.toUpperCase(), m.index!);
    if (/\.(kt|java)$/.test(f) && /retrofit2?\./.test(text)) {
      for (const m of text.matchAll(RETROFIT)) add(callPath(m.groups!.url!), m.groups!.verb!, m.index!);
    }
  }
  return out;
}

function formCalls(list: FormInfo[]): ApiCall[] {
  const out: ApiCall[] = [];
  for (const form of list) {
    if (!form.action?.startsWith('/')) continue;
    const [file, line] = form.location.split(/:(?=\d+$)/);
    out.push({ path: callPath(form.action), method: form.method ?? 'GET', file: file!, line: Number(line) || 1, via: 'form' });
  }
  return out;
}

/** Fallback for unknown stacks: internal links found in source become page hints. */
async function linkLiterals(ctx: RepoContext): Promise<Route[]> {
  const out: Route[] = [];
  const re = /\b(?:href|to)\s*=\s*\{?\s*["'`](\/[A-Za-z0-9\-_/.]*)["'`]|\b(?:router\.push|router\.replace|navigate|redirect)\(\s*["'`](\/[A-Za-z0-9\-_/.]*)["'`]/g;
  for (const f of ctx.find((f) => (FORM_FILE.test(f) || /\.(m?[jt]s)$/.test(f)) && !isTestPath(f))) {
    const text = await ctx.read(f);
    for (const m of text.matchAll(re)) {
      const p = normalisePath(m[1] ?? m[2]!);
      if (/\.(png|jpe?g|svg|ico|css|js|webp|gif|pdf|xml|txt)$/i.test(p) || p.startsWith('/api/')) continue;
      out.push({ path: p, kind: 'page', file: f, line: lineOf(text, m.index!), dynamic: false, source: 'code', plugin: 'links' });
    }
  }
  return out;
}

export async function genericDiscovery(ctx: RepoContext): Promise<Partial<Discovery> & { linkHints: Route[] }> {
  const [env, formList, specs, calls, links] = await Promise.all([envVars(ctx), forms(ctx), openapi(ctx), apiCalls(ctx), linkLiterals(ctx)]);
  const notes: string[] = [];
  const realEnvFiles = env.envFiles.filter((f) => !ENV_TEMPLATE.test(f));
  if (realEnvFiles.length) notes.push(`Env files on disk: ${realEnvFiles.join(', ')} (values never read; whether they are committed is checked in the code scan).`);
  return { ...env, forms: formList, openapi: specs, apiCalls: [...calls, ...formCalls(formList)], notes, linkHints: links };
}
