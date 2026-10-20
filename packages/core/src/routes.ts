import type { Route } from './types.js';

/** Segment syntaxes for path params across frameworks. */
const PARAM = /^(\[\[?\.\.\.[^\]]+\]\]?|\[[^\]]+\]|:[^/]+|\{[^}]+\}|<[^>]+>|\*+|\$[^/]*)$/;
const CATCH_ALL = /^(\[\[?\.\.\.[^\]]+\]\]?|\*\*?|\{[^}]*\*[^}]*\}|<path:[^>]+>)$/;

export function normalisePath(p: string): string {
  let out = p.trim();
  if (!out.startsWith('/')) out = '/' + out;
  out = out.replace(/\/{2,}/g, '/');
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

export function isDynamicPath(p: string): boolean {
  return p.split('/').some((s) => PARAM.test(s));
}

export function routePattern(path: string): RegExp {
  const segs = normalisePath(path).split('/').filter(Boolean);
  let re = '';
  for (const s of segs) {
    if (CATCH_ALL.test(s)) re += '(?:/.*)?';
    else if (PARAM.test(s)) re += '/[^/]+';
    else re += '/' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re || '/'}/?$`, 'i');
}

/** Find the code route that most likely serves a URL path (static routes beat dynamic ones). */
export function matchRoute(urlPath: string, routes: Route[], kind?: Route['kind']): Route | undefined {
  const raw = urlPath.split('?')[0]!;
  let decoded = raw;
  try {
    decoded = decodeURI(raw);
  } catch {
    /* malformed escape sequence: match the raw path */
  }
  const path = normalisePath(decoded);
  let best: Route | undefined;
  let bestScore = -1;
  for (const r of routes) {
    if (kind && r.kind !== kind) continue;
    if (!routePattern(r.path).test(path)) continue;
    const segs = normalisePath(r.path).split('/').filter(Boolean);
    const score = segs.reduce((n, s) => n + (CATCH_ALL.test(s) ? 0 : PARAM.test(s) ? 1 : 3), 0);
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}
