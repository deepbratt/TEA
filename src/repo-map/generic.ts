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

/**
 * Call sites: fetch('/api/x'), axios.post('/api/x'), api.get(`${BASE}/orders/${id}`), $fetch, ky...
 * Group 1: the callee; group 2: the method in `x.get(`; group 3: the URL up to its quote.
 */
const CALL_SITE =
  /\b((?:axios|ky|api|apiClient|client|http|request|instance|\$fetch|ofetch)\.(get|post|put|patch|delete)|fetch|\$fetch|ofetch|useFetch|axios|ky)\(\s*["'`]((?:\$\{[^}]*\})?\/[^"'`?#\s]*)/g;
const FETCH_METHOD = /method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE)["'`]/i;
const ASSET_PATH = /\.(png|jpe?g|svg|ico|css|js|mjs|webp|gif|pdf|xml|txt|json|woff2?)$/i;

/** Turn a URL literal into a route-like path: drop a `${BASE}` prefix, template parts become :param. */
export function callPath(raw: string): string {
  return normalisePath(raw.replace(/^\$\{[^}]*\}/, '').replace(/\$\{[^}]*\}/g, ':param'));
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
async function apiCalls(ctx: RepoContext): Promise<ApiCall[]> {
  const out: ApiCall[] = [];
  for (const f of ctx.find((f) => isSource(f) && /\.(m?[jt]sx?|vue|svelte|astro)$/.test(f))) {
    const text = await ctx.read(f);
    for (const m of text.matchAll(CALL_SITE)) {
      const path = callPath(m[3]!);
      if (ASSET_PATH.test(path)) continue;
      // fetch() defaults to GET unless its own options say otherwise.
      const open = m.index! + m[1]!.length;
      const method = m[2]?.toUpperCase() ?? FETCH_METHOD.exec(callArgs(text, open))?.[1]?.toUpperCase() ?? 'GET';
      out.push({ path, method, file: f, line: lineOf(text, m.index!), via: 'code' });
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
