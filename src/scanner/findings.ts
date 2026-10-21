import { cleanEvidence, matchRoute, renderFixPrompt, untrustedBlock, type Area, type Catalog, type Evidence, type Finding, type PageVisit, type Route, type Severity } from '../core/index.js';

export interface CrawlFindingOptions {
  /** The check catalog: severity defaults and fix-prompt templates come from here. */
  catalog: Catalog;
  routes?: Route[];
  slowPageMs?: number;
  baseUrl: string;
}

const MAX_DETAILS = 8;

/** Observed text in a one-line summary: cleaned and short. In fix prompts it only appears fenced. */
const short = (s: string) => cleanEvidence(s, 120);

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function where(path: string, routes: Route[] | undefined, kind: Route['kind'] = 'page'): Pick<Evidence, 'file' | 'line'> {
  const r = routes ? matchRoute(path, routes, kind) : undefined;
  return r?.file ? { file: r.file, line: r.line } : {};
}

const fileRef = (ev: Pick<Evidence, 'file' | 'line'>) => (ev.file ? `${ev.file}${ev.line && ev.line > 1 ? `:${ev.line}` : ''}` : undefined);

interface Draft {
  check: string;
  location: string;
  title: string;
  summary: string;
  steps: string[];
  evidence: Evidence;
  /** Observed lines for the fix prompt; shown inside an untrusted-evidence block. */
  observed: string[];
  severity?: Severity;
}

/** Turn crawl observations into founder-readable findings, using the catalog for each check. */
export function crawlFindings(pages: PageVisit[], opts: CrawlFindingOptions): Finding[] {
  const out: Finding[] = [];
  const slow = opts.slowPageMs ?? 3_000;
  const baseOrigin = new URL(opts.baseUrl).origin;
  const sameOrigin = (u: string) => {
    try {
      return new URL(u).origin === baseOrigin;
    } catch {
      return false;
    }
  };

  const add = (d: Draft, route: string) => {
    const entry = opts.catalog.get(d.check);
    if (!entry) throw new Error(`Check "${d.check}" is missing from the catalog.`);
    out.push({
      id: `${d.check}:${d.location}`,
      area: (entry.category === 'performance' ? 'performance' : 'functional') satisfies Area,
      severity: d.severity ?? entry.severity,
      title: d.title,
      summary: d.summary,
      steps: d.steps,
      evidence: d.evidence,
      fix: renderFixPrompt(entry, { route, file: fileRef(d.evidence), evidence: d.observed.length ? untrustedBlock(d.observed) : undefined }),
      source: 'crawler',
    });
  };

  for (const p of pages) {
    if (p.redirectedOutOfScope) continue; // reported as a note, not a bug
    const ev: Evidence = { url: p.url, screenshot: p.screenshot, ...where(p.path, opts.routes) };
    const linkedFrom = p.referrers.length ? `It is linked from ${p.referrers.slice(0, 3).join(', ')}.` : '';
    const open = `Open ${p.url} in a browser.`;
    const page = (d: Omit<Draft, 'evidence'> & { evidence?: Evidence }) => add({ ...d, evidence: d.evidence ?? ev }, p.path);

    if (p.error) {
      page({
        check: 'crawl.unreachable',
        location: p.path,
        severity: p.referrers.length || !p.seededFromCode ? 'high' : 'medium',
        title: `Page does not load: ${p.path}`,
        summary: `TEA could not load ${p.path} at all (${short(p.error)}). Visitors see an error or a blank screen.`,
        steps: [open],
        observed: [p.error],
      });
      continue;
    }

    const status = p.status ?? 0;
    if (status >= 500) {
      page({
        check: 'crawl.server-error',
        location: p.path,
        title: `Page crashes with a server error (${status}): ${p.path}`,
        summary: `${p.path} returns HTTP ${status}. Anyone who opens it sees an error page instead of your app. ${linkedFrom}`.trim(),
        steps: [open, `See the ${status} error.`],
        observed: [`GET ${p.url} -> HTTP ${status}`],
      });
    } else if (status === 404 || status === 410 || p.softNotFound) {
      const linked = p.referrers.length > 0;
      page({
        check: 'crawl.not-found',
        location: p.path,
        severity: linked ? undefined : 'low',
        title: linked ? `Broken link to ${p.path}` : `Page in your code is missing on the live site: ${p.path}`,
        summary: linked
          ? `${p.path} shows "not found"${p.softNotFound ? ' (the server says 200, but the page says not found)' : ''}. Visitors who click a link to it hit a dead end.`
          : `Your code has a page at ${p.path}, but the live site answers "not found". It may not be deployed, or the route is wrong.`,
        steps: linked ? [`Open ${p.referrers[0]}.`, `Click the link to ${p.path}.`] : [open],
        observed: linked ? p.referrers.map((r) => `linked from ${r}`) : [`GET ${p.url} -> ${p.softNotFound ? 'a "not found" page' : `HTTP ${status}`}`],
      });
    } else if (status >= 400 && status !== 401 && status !== 403) {
      page({
        check: 'crawl.client-error',
        location: p.path,
        title: `Page returns HTTP ${status}: ${p.path}`,
        summary: `${p.path} answers with HTTP ${status}.`,
        steps: [open],
        observed: [`GET ${p.url} -> HTTP ${status}`],
      });
    }

    // Error pages cause secondary JS errors; the status finding above already covers them.
    const isErrorPage = status >= 400 || !!p.softNotFound;
    // Chrome logs every failed request as a console error; those are reported from the network instead.
    const consoleErrors = isErrorPage ? [] : p.consoleErrors.filter((e) => !/^Failed to load resource:/.test(e));

    if (p.pageErrors.length && !isErrorPage) {
      page({
        check: 'crawl.js-crash',
        location: p.path,
        title: `JavaScript crashes on ${p.path}`,
        summary: `The page throws an uncaught error while loading ("${short(p.pageErrors[0]!)}"). Parts of the page may not work.`,
        steps: [open, 'Open the browser dev tools console and see the uncaught error.'],
        evidence: { ...ev, details: p.pageErrors.slice(0, MAX_DETAILS) },
        observed: p.pageErrors,
      });
    }

    if (consoleErrors.length) {
      page({
        check: 'crawl.console-errors',
        location: p.path,
        title: `${plural(consoleErrors.length, 'console error')} on ${p.path}`,
        summary: `The browser console shows errors on this page, for example "${short(consoleErrors[0]!)}".`,
        steps: [open, 'Open the browser dev tools console.'],
        evidence: { ...ev, details: consoleErrors.slice(0, MAX_DETAILS) },
        observed: consoleErrors,
      });
    }

    // Failed calls the page makes to its own server: 5xx and network errors are the serious ones.
    const serverFailures = p.failedRequests.filter(
      (r) => ['fetch', 'xhr'].includes(r.resourceType ?? '') && sameOrigin(r.url) && ((r.status ?? 0) >= 500 || (!r.status && r.error)),
    );
    if (serverFailures.length) {
      const first = serverFailures[0]!;
      const apiPath = new URL(first.url).pathname;
      const lines = serverFailures.map((r) => `${r.method} ${r.url} -> ${r.status ?? r.error}`);
      page({
        check: 'crawl.api-failure',
        location: `${p.path}:${apiPath}`,
        title: `API call fails on ${p.path}: ${first.method} ${apiPath} (${first.status ?? first.error})`,
        summary: `When ${p.path} loads, it asks your server for data and the server fails. Whatever that data powers (lists, plans, prices) is missing or broken for every visitor.`,
        steps: [open, `Watch the network tab: ${first.method} ${apiPath} fails with ${first.status ?? first.error}.`],
        evidence: { ...ev, ...where(apiPath, opts.routes, 'api'), details: lines.slice(0, MAX_DETAILS) },
        observed: lines,
      });
    }

    const missing = p.failedRequests.filter((r) => r.status === 404 && !['fetch', 'xhr', 'document'].includes(r.resourceType ?? '') && !p.brokenImages.includes(r.url));
    if (missing.length) {
      page({
        check: 'crawl.missing-assets',
        location: p.path,
        title: `${plural(missing.length, 'missing file')} on ${p.path}`,
        summary: `The page asks for files that don't exist (404), for example ${short(missing[0]!.url)}.`,
        steps: [open, 'Check the network tab for 404 responses.'],
        evidence: { ...ev, details: missing.slice(0, MAX_DETAILS).map((r) => `${r.resourceType} ${r.url}`) },
        observed: missing.map((r) => r.url),
      });
    }

    if (p.brokenImages.length) {
      page({
        check: 'crawl.broken-images',
        location: p.path,
        title: `${plural(p.brokenImages.length, 'broken image')} on ${p.path}`,
        summary: `Some images don't load and show as broken icons, for example ${short(p.brokenImages[0]!)}.`,
        steps: [open],
        evidence: { ...ev, details: p.brokenImages.slice(0, MAX_DETAILS) },
        observed: p.brokenImages,
      });
    }

    if ((p.loadMs ?? 0) > slow && status < 400) {
      const seconds = (p.loadMs! / 1000).toFixed(1);
      page({
        check: 'crawl.slow',
        location: p.path,
        severity: p.loadMs! > slow * 2 ? 'high' : undefined,
        title: `Slow page: ${p.path} takes ${seconds}s to load`,
        summary: `${p.path} took ${seconds} seconds to load. Pages slower than ${slow / 1000}s lose visitors.`,
        steps: [open],
        observed: [`${p.url} loaded in ${seconds}s (limit ${slow / 1000}s)`],
      });
    }
  }
  return out;
}
