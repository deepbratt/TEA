import { emptyDiscovery, log, type Discovery, type RepoContext, type Route, type StackDetection, type TeaPlugin } from '@tea-qa/core';
import { createRepoContext } from './context.js';
import { detectStack } from './detect.js';
import { genericDiscovery } from './generic.js';
import { firebase, payments, prisma, schemas, supabase } from './plugins/data.js';
import { django, nestjs, nodeServers, pythonWeb, rails } from './plugins/servers.js';
import { astro, nextjs, nuxt, remix, spaRouter, sveltekit } from './plugins/web-frameworks.js';

export { createRepoContext, walk, lineOf } from './context.js';
export { detectStack, STACK_RULES, type StackRule } from './detect.js';
export { isClientExposed, CLIENT_ENV_PREFIXES } from './generic.js';

export const BUILTIN_PLUGINS: TeaPlugin[] = [
  nextjs, sveltekit, nuxt, astro, remix, spaRouter,
  nodeServers, nestjs, pythonWeb, django, rails,
  prisma, supabase, firebase, schemas, payments,
];

export interface ScanOptions {
  plugins?: TeaPlugin[];
}

export interface ScanResult extends Discovery {
  /** Plugins that switched on for this repo. */
  activePlugins: string[];
}

const META_FRAMEWORKS = ['nextjs', 'remix', 'nuxt', 'sveltekit', 'astro'];

async function isActive(plugin: TeaPlugin, ctx: RepoContext, stack: StackDetection[]): Promise<StackDetection[] | null> {
  const ids = new Set(stack.map((s) => s.id));
  if (plugin.activatesOn === 'always') return [];
  if (Array.isArray(plugin.activatesOn) && plugin.activatesOn.some((id) => ids.has(id))) {
    // SPA routers are only useful when no meta-framework owns routing.
    if (plugin.name === 'spa-router' && META_FRAMEWORKS.some((id) => ids.has(id))) return null;
    return [];
  }
  if (plugin.detect) {
    const d = await plugin.detect(ctx);
    if (d) return Array.isArray(d) ? d : [d];
  }
  return null;
}

/** Discover everything TEA can learn from a repo without running it. Read-only. */
export async function scanRepo(root: string, opts: ScanOptions = {}): Promise<ScanResult> {
  const ctx = await createRepoContext(root);
  log.debug(`scanner: ${ctx.files.length} files`);
  const out = emptyDiscovery();
  out.stack = detectStack(ctx);

  const generic = await genericDiscovery(ctx);
  merge(out, generic);

  const activePlugins: string[] = [];
  for (const plugin of [...BUILTIN_PLUGINS, ...(opts.plugins ?? [])]) {
    const extraStack = await isActive(plugin, ctx, out.stack);
    if (!extraStack) continue;
    activePlugins.push(plugin.name);
    out.stack.push(...extraStack.filter((s) => !out.stack.some((x) => x.id === s.id)));
    if (!plugin.discover) continue;
    try {
      merge(out, await plugin.discover(ctx));
    } catch (err) {
      out.notes.push(`Plugin ${plugin.name} failed: ${(err as Error).message}`);
    }
  }

  // Unknown stack: fall back to internal links found in source as page hints.
  if (!out.routes.some((r) => r.kind === 'page')) merge(out, { routes: generic.linkHints });

  out.routes = dedupeRoutes(out.routes);
  out.auth = unique([...out.stack.filter((s) => s.kind === 'auth').map((s) => s.name), ...out.auth, ...authPages(out.routes)]);
  out.payments = unique([...out.stack.filter((s) => s.kind === 'payments').map((s) => s.name), ...out.payments]);
  out.notes = unique(out.notes);
  return { ...out, activePlugins };
}

function merge(into: Discovery, part: Partial<Discovery>): void {
  for (const key of Object.keys(into) as (keyof Discovery)[]) {
    const v = part[key];
    if (Array.isArray(v)) (into[key] as unknown[]).push(...v);
  }
}

const unique = (xs: string[]) => [...new Set(xs)];

/** Same kind + path → one route; framework plugins win over link/fetch hints. */
function dedupeRoutes(routes: Route[]): Route[] {
  const rank = (r: Route) => (r.plugin === 'client-calls' || r.plugin === 'links' ? 1 : 0);
  const byKey = new Map<string, Route>();
  for (const r of routes) {
    const key = `${r.kind} ${r.path.toLowerCase()}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...r });
      continue;
    }
    const keep = rank(r) < rank(prev) ? { ...r } : prev;
    const methods = unique([...(prev.methods ?? []), ...(r.methods ?? [])]);
    if (methods.length) keep.methods = methods;
    byKey.set(key, keep);
  }
  return [...byKey.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path));
}

const AUTH_PAGE = /\/(log-?in|sign-?in|sign-?up|register|auth|forgot-password|reset-password|logout|sign-?out)(\/|$)/i;

function authPages(routes: Route[]): string[] {
  const pages = routes.filter((r) => r.kind === 'page' && AUTH_PAGE.test(r.path)).map((r) => r.path);
  return pages.length ? [`Auth pages: ${pages.join(', ')}`] : [];
}
