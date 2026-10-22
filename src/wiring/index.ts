import { renderFixPrompt, routePattern, untrustedBlock, type ApiCall, type Catalog, type Finding, type Route } from '../core/index.js';
import type { WiringSides } from '../repo-map/index.js';

/**
 * Frontend-to-API wiring, statically: every call the frontend makes must reach a route the backend
 * serves, with a method it handles. Endpoints nothing calls are reported as info.
 */

/** Routes outside services call (webhooks, health checks, cron, auth callbacks): never "unused". */
const EXTERNALLY_CALLED = /(^|\/)(webhooks?|health(z|check)?|ready|live|status|cron|callback|oauth|auth|_next|robots|sitemap|favicon|well-known)(\/|$|\.)/i;

const fileRef = (file: string, line: number) => (line > 1 ? `${file}:${line}` : file);

/** A concrete stand-in for a call's ":param" parts, so it can be matched against route patterns. */
const sample = (path: string) => path.replace(/:param/g, 'tea-sample-id');

function servesPath(route: Route, call: ApiCall): boolean {
  return routePattern(route.path).test(sample(call.path));
}

function handlesMethod(route: Route, method: string): boolean {
  if (route.kind !== 'api' || !route.methods?.length) return true; // unknown methods: don't guess
  return route.methods.includes(method) || route.methods.includes('ANY') || (method === 'HEAD' && route.methods.includes('GET'));
}

export function wiringFindings(sides: WiringSides, catalog: Catalog): Finding[] {
  if (!sides.comparable) return [];
  const out: Finding[] = [];
  const orphanEntry = catalog.get('wiring.orphan-call');
  const unusedEntry = catalog.get('wiring.unused-endpoint');

  // Group call sites by method + path so one missing endpoint is one issue.
  const groups = new Map<string, ApiCall[]>();
  for (const c of sides.calls) {
    const key = `${c.method} ${c.path}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  for (const [key, calls] of groups) {
    const call = calls[0]!;
    const matching = sides.endpoints.filter((r) => servesPath(r, call));
    const wrongMethod = matching.length > 0 && !matching.some((r) => handlesMethod(r, call.method));
    if (matching.length && !wrongMethod) continue;
    const where = calls.map((c) => fileRef(c.file, c.line));
    const served = matching.flatMap((r) => r.methods ?? []).join(', ');
    out.push({
      id: `wiring.orphan-call:${key}`,
      area: 'api',
      severity: orphanEntry?.severity ?? 'high',
      title: wrongMethod ? `The UI sends ${key}, but that route only handles ${served}` : `The UI calls ${key}, but no backend route serves it`,
      summary: wrongMethod
        ? `Your frontend sends a ${call.method} request to ${call.path}, but the backend route there only handles ${served}. That request fails every time.`
        : `Your frontend calls ${call.path}, but none of your backend code defines that route. Whatever depends on it (a list, a button, a form) can't work.`,
      steps: [`Open ${where[0]} and find the ${call.via === 'form' ? 'form' : 'request'} to ${call.path}.`, `Look for a route that serves ${call.method} ${call.path} in the backend: there isn't one.`],
      evidence: { file: call.file, line: call.line, details: where.slice(0, 8) },
      fix: renderFixPrompt(orphanEntry, { route: key, file: fileRef(call.file, call.line), evidence: untrustedBlock(where.map((w) => `called from ${w}`)) }),
      source: 'wiring',
    });
  }

  if (!sides.calls.length) return out;
  for (const route of sides.endpoints) {
    if (route.kind !== 'api' || EXTERNALLY_CALLED.test(route.path)) continue;
    if (sides.calls.some((c) => servesPath(route, c))) continue;
    out.push({
      id: `wiring.unused-endpoint:${route.path}`,
      area: 'api',
      severity: unusedEntry?.severity ?? 'info',
      title: `Nothing in the frontend calls ${route.path}`,
      summary: `The backend serves ${route.path}${route.methods?.length ? ` (${route.methods.join(', ')})` : ''}, but no frontend code calls it. If nothing outside the app uses it, it's dead code and extra attack surface.`,
      steps: [`Open ${route.file ?? 'the backend'} and check who calls ${route.path}.`],
      evidence: { file: route.file, line: route.line },
      fix: renderFixPrompt(unusedEntry, { route: route.path, file: route.file ? fileRef(route.file, route.line ?? 1) : undefined }),
      source: 'wiring',
    });
  }
  return out;
}
