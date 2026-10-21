import { isDynamicPath, normalisePath, type Discovery, type EnvVar, type FormInfo, type RepoContext, type Route } from '../core/index.js';
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

/** API endpoints the front end calls: fetch('/api/x'), axios.post('/api/x'). Feeds API tests (M3). */
async function clientCalls(ctx: RepoContext): Promise<Route[]> {
  const out: Route[] = [];
  const re = /\b(?:fetch|axios(?:\.(get|post|put|patch|delete))?|ky(?:\.(get|post|put|patch|delete))?|\$fetch|useFetch)\(\s*["'`](\/(?:api|v\d|graphql|trpc|rest|functions)[^"'`$?]*)/g;
  for (const f of ctx.find((f) => isSource(f) && /\.(m?[jt]sx?|vue|svelte)$/.test(f))) {
    const text = await ctx.read(f);
    for (const m of text.matchAll(re)) {
      const p = normalisePath(m[3]!);
      const method = (m[1] ?? m[2])?.toUpperCase();
      out.push({ path: p, kind: 'api', file: f, line: lineOf(text, m.index!), dynamic: isDynamicPath(p), source: 'code', plugin: 'client-calls', ...(method ? { methods: [method] } : {}) });
    }
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
  const [env, formList, specs, calls, links] = await Promise.all([envVars(ctx), forms(ctx), openapi(ctx), clientCalls(ctx), linkLiterals(ctx)]);
  const notes: string[] = [];
  const realEnvFiles = env.envFiles.filter((f) => !ENV_TEMPLATE.test(f));
  if (realEnvFiles.length) notes.push(`Env files on disk: ${realEnvFiles.join(', ')} (values never read; whether they are committed is checked in the code scan).`);
  return { ...env, forms: formList, openapi: specs, routes: calls, notes, linkHints: links };
}
