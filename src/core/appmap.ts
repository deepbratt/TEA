import { emptyDiscovery } from './plugin.js';
import { matchRoute, normalisePath } from './routes.js';
import type { AppMap, Discovery, PageVisit, Route } from './types.js';

/**
 * Merge what the code says (discovery) with what the live UI showed (pages).
 * Code routes get the status seen live; UI-only pages become routes with source "ui".
 */
export function buildAppMap(input: { discovery?: Discovery; pages?: PageVisit[]; target: AppMap['target']; startUrl?: string }): AppMap {
  const d = input.discovery ?? emptyDiscovery();
  const pages = input.pages ?? [];
  const routes: Route[] = d.routes.map((r) => ({ ...r }));
  const start = input.startUrl ? normalisePath(new URL(input.startUrl).pathname) : '/';

  for (const p of pages) {
    const path = normalisePath(p.path.split('?')[0]!);
    const reachable = p.referrers.length > 0 || path === start;
    const code = matchRoute(path, routes.filter((r) => r.source !== 'ui'), 'page');
    if (code) {
      code.source = 'both';
      code.status = code.status && code.status >= 400 ? code.status : (p.status ?? code.status);
      code.reachableFromUi = code.reachableFromUi || reachable;
    } else if (!routes.some((r) => r.kind === 'page' && r.path === path)) {
      routes.push({ path, kind: 'page', dynamic: false, source: 'ui', status: p.status, reachableFromUi: reachable });
    }
  }
  if (pages.length) {
    for (const r of routes) if (r.kind === 'page' && r.reachableFromUi === undefined) r.reachableFromUi = false;
  }

  return {
    ...d,
    routes: routes.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path)),
    forms: [...d.forms, ...pages.flatMap((p) => p.forms)],
    generatedAt: new Date().toISOString(),
    target: input.target,
    pages,
  };
}
