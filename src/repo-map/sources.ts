import { basename, resolve } from 'node:path';
import { emptyDiscovery, type ApiCall, type Discovery, type Route, type TeaPlugin } from '../core/index.js';
import { scanRepo, type ScanResult } from './index.js';

/** "auto" lets TEA decide from the code: an app with pages or API calls and no endpoints is a frontend. */
export const SOURCE_ROLES = ['auto', 'frontend', 'backend', 'fullstack'] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];
export type ResolvedRole = Exclude<SourceRole, 'auto'>;

/** One folder of a project's code, e.g. the Next.js frontend or the Express API. */
export interface SourceFolder {
  name: string;
  path: string;
  role: SourceRole;
}

export interface ScannedSource extends SourceFolder {
  role: ResolvedRole;
  /** True when the role came from the code ("auto"). */
  detected: boolean;
  stack: string[];
  files: number;
}

/** Frameworks that serve pages and API routes from one codebase. */
const FULLSTACK_FRAMEWORKS = new Set(['nextjs', 'remix', 'nuxt', 'sveltekit', 'astro', 'rails', 'django', 'laravel', 'phoenix', 'blazor']);

/** What a folder is, from what TEA found in it: endpoints, pages, API calls and the stack. */
export function inferRole(r: Pick<ScanResult, 'routes' | 'apiCalls' | 'stack'>): ResolvedRole {
  const ids = new Set(r.stack.map((s) => s.id));
  if ([...FULLSTACK_FRAMEWORKS].some((id) => ids.has(id))) return 'fullstack';
  const endpoints = r.routes.some((x) => x.kind === 'api' && x.plugin !== 'links');
  const ui = r.routes.some((x) => x.kind === 'page') || r.stack.some((s) => s.kind === 'mobile' || (s.kind === 'framework' && s.id !== 'static-html')) || r.apiCalls.length > 0;
  if (endpoints && ui) return r.stack.some((s) => s.kind === 'backend') && !r.routes.some((x) => x.kind === 'page') ? 'backend' : 'fullstack';
  if (endpoints || r.stack.some((s) => s.kind === 'backend' && s.confidence !== 'low')) return 'backend';
  return 'frontend';
}

/** The two sides of the frontend-to-API wiring check. */
export interface WiringSides {
  /** Calls made by frontend and fullstack folders. */
  calls: ApiCall[];
  /** Routes served by backend and fullstack folders. */
  endpoints: Route[];
  /** True when at least one folder can call and at least one can serve. */
  comparable: boolean;
}

export interface ScanSourcesResult extends Discovery {
  activePlugins: string[];
  sources: ScannedSource[];
  wiring: WiringSides;
}

/** A single repo folder as a source: it may both call and serve, so it is "fullstack". */
export function sourceFromPath(path: string): SourceFolder {
  return { name: basename(resolve(path)) || 'app', path: resolve(path), role: 'auto' };
}

const prefixer = (prefix: string) => (file: string) => (prefix ? `${prefix}/${file}` : file);

/**
 * Scan every folder of a project and merge what they contain. With more than one folder, file
 * paths are prefixed with the folder's name (api/src/routes/orders.ts) so issues point at real files.
 */
export async function scanSources(sources: SourceFolder[], opts: { plugins?: TeaPlugin[] } = {}): Promise<ScanSourcesResult> {
  const out = emptyDiscovery();
  const activePlugins = new Set<string>();
  const scanned: ScannedSource[] = [];
  const wiring: WiringSides = { calls: [], endpoints: [], comparable: false };
  const many = sources.length > 1;
  const roles: ResolvedRole[] = [];

  for (const input of sources) {
    const r = await scanRepo(input.path, opts);
    const source = { ...input, role: input.role === 'auto' ? inferRole(r) : input.role };
    roles.push(source.role);
    const p = prefixer(many ? source.name : '');
    const label = many ? `[${source.name}] ` : '';
    const routes = r.routes.map((route) => ({ ...route, file: route.file ? p(route.file) : route.file }));
    const calls = r.apiCalls.map((c) => ({ ...c, file: p(c.file) }));

    for (const s of r.stack) {
      const existing = out.stack.find((x) => x.id === s.id);
      const evidence = s.evidence.map((e) => `${label}${e}`);
      if (existing) existing.evidence.push(...evidence);
      else out.stack.push({ ...s, evidence });
    }
    out.routes.push(...routes);
    out.apiCalls.push(...calls);
    out.forms.push(...r.forms.map((f) => ({ ...f, location: p(f.location) })));
    out.auth.push(...r.auth.filter((a) => !out.auth.includes(a)));
    for (const v of r.envVars) {
      const existing = out.envVars.find((x) => x.name === v.name);
      if (existing) existing.files.push(...v.files.map(p));
      else out.envVars.push({ ...v, files: v.files.map(p) });
    }
    out.envFiles.push(...r.envFiles.map(p));
    out.database.push(...r.database.map((d) => ({ ...d, file: d.file ? p(d.file) : d.file })));
    out.payments.push(...r.payments.filter((x) => !out.payments.includes(x)));
    out.openapi.push(...r.openapi.map(p));
    out.notes.push(...r.notes.map((n) => `${label}${n}`));
    r.activePlugins.forEach((x) => activePlugins.add(x));

    if (source.role !== 'backend') wiring.calls.push(...calls);
    if (source.role !== 'frontend') wiring.endpoints.push(...routes);
    scanned.push({ ...source, detected: input.role === 'auto', stack: stackNames(r), files: r.routes.length });
  }

  const canCall = roles.some((role) => role !== 'backend');
  const canServe = roles.some((role) => role !== 'frontend');
  wiring.comparable = canCall && canServe && wiring.endpoints.some((r) => r.kind === 'api' || roles.includes('backend'));
  out.envVars.sort((a, b) => a.name.localeCompare(b.name));
  return { ...out, activePlugins: [...activePlugins], sources: scanned, wiring };
}

/** Stack names for display: frameworks and services first, then languages. */
export function stackNames(r: Pick<ScanResult, 'stack'>): string[] {
  const rank = (k: string) => (k === 'language' ? 2 : k === 'builder' || k === 'hosting' ? 1 : 0);
  return [...r.stack].sort((a, b) => rank(a.kind) - rank(b.kind)).map((s) => s.name);
}
