import { basename, resolve } from 'node:path';
import { emptyDiscovery, type ApiCall, type Discovery, type Route, type TeaPlugin } from '../core/index.js';
import { scanRepo } from './index.js';

export const SOURCE_ROLES = ['frontend', 'backend', 'fullstack'] as const;
export type SourceRole = (typeof SOURCE_ROLES)[number];

/** One folder of a project's code, e.g. the Next.js frontend or the Express API. */
export interface SourceFolder {
  name: string;
  path: string;
  role: SourceRole;
}

export interface ScannedSource extends SourceFolder {
  stack: string[];
  files: number;
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
  return { name: basename(resolve(path)) || 'app', path: resolve(path), role: 'fullstack' };
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

  for (const source of sources) {
    const r = await scanRepo(source.path, opts);
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
    scanned.push({ ...source, stack: r.stack.filter((s) => s.kind !== 'language').map((s) => s.name), files: r.routes.length });
  }

  const canCall = sources.some((s) => s.role !== 'backend');
  const canServe = sources.some((s) => s.role !== 'frontend');
  wiring.comparable = canCall && canServe && wiring.endpoints.some((r) => r.kind === 'api' || sources.some((s) => s.role === 'backend'));
  out.envVars.sort((a, b) => a.name.localeCompare(b.name));
  return { ...out, activePlugins: [...activePlugins], sources: scanned, wiring };
}
