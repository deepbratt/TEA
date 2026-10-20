import { cleanEvidence, matchRoute, untrustedBlock, type Finding, type PageVisit, type Route } from '@tea-qa/core';

export interface CrawlFindingOptions {
  routes?: Route[];
  slowPageMs?: number;
  baseUrl: string;
}

const MAX_DETAILS = 8;

/**
 * Text observed on the target (errors, URLs) is untrusted. In summaries it is cleaned and short;
 * in fix prompts, which get pasted into coding agents, it only appears in an untrustedBlock().
 */
const short = (s: string) => cleanEvidence(s, 120);

function where(path: string, routes: Route[] | undefined, kind: Route['kind'] = 'page') {
  const r = routes ? matchRoute(path, routes, kind) : undefined;
  return r?.file ? { file: r.file, line: r.line } : {};
}

function fileHint(ev: { file?: string; line?: number }): string {
  return ev.file ? ` The code for it is most likely in ${ev.file}${ev.line && ev.line > 1 ? `:${ev.line}` : ''}.` : '';
}

/** Turn crawl observations into founder-readable findings. */
export function crawlFindings(pages: PageVisit[], opts: CrawlFindingOptions): Finding[] {
  const out: Finding[] = [];
  const slow = opts.slowPageMs ?? 3_000;
  const sameOrigin = (u: string) => {
    try {
      return new URL(u).origin === new URL(opts.baseUrl).origin;
    } catch {
      return false;
    }
  };

  for (const p of pages) {
    const ev = { url: p.url, screenshot: p.screenshot, ...where(p.path, opts.routes) };
    const linkedFrom = p.referrers.length ? `It is linked from ${p.referrers.slice(0, 3).join(', ')}.` : '';
    const open = `Open ${p.url} in a browser.`;

    if (p.redirectedOutOfScope) continue; // reported as a note, not a bug

    if (p.error) {
      out.push({
        id: `crawl.unreachable:${p.path}`,
        area: 'functional',
        severity: p.referrers.length || !p.seededFromCode ? 'high' : 'medium',
        title: `Page does not load: ${p.path}`,
        summary: `TEA could not load ${p.path} at all (${short(p.error)}). Visitors see an error or a blank screen.`,
        steps: [open],
        evidence: ev,
        fix: `The page ${p.path} fails to load (error below).${fileHint(ev)} Find out why the request fails or times out and make the page load reliably.\n\n${untrustedBlock([p.error])}`,
        source: 'crawler',
      });
      continue;
    }

    const status = p.status ?? 0;
    if (status >= 500) {
      out.push({
        id: `crawl.server-error:${p.path}`,
        area: 'functional',
        severity: 'high',
        title: `Page crashes with a server error (${status}): ${p.path}`,
        summary: `${p.path} returns HTTP ${status}. Anyone who opens it sees an error page instead of your app. ${linkedFrom}`.trim(),
        steps: [open, `See the ${status} error.`],
        evidence: ev,
        fix: `My page ${p.path} returns HTTP ${status} on ${p.url}.${fileHint(ev)} Check the server logs for the stack trace, fix the crash, and add error handling so the page shows a friendly message instead of a 500.`,
        source: 'crawler',
      });
    } else if (status === 404 || status === 410 || p.softNotFound) {
      const linked = p.referrers.length > 0;
      out.push({
        id: `crawl.not-found:${p.path}`,
        area: 'functional',
        severity: linked ? 'medium' : 'low',
        title: linked ? `Broken link to ${p.path}` : `Page in your code is missing on the live site: ${p.path}`,
        summary: linked
          ? `${p.path} shows "not found"${p.softNotFound ? ' (the server says 200 but the page says not found)' : ''}. ${linkedFrom} Visitors who click it hit a dead end.`
          : `Your code has a page at ${p.path}, but the live site answers "not found". It may not be deployed, or the route is wrong.`,
        steps: linked ? [`Open ${p.referrers[0]}.`, `Click the link to ${p.path}.`] : [open],
        evidence: ev,
        fix: linked
          ? `The link to ${p.path} on ${p.referrers[0]} leads to a "not found" page. Either create the page at ${p.path} or change the link to point to the right page.`
          : `${p.path} exists in my code${ev.file ? ` (${ev.file})` : ''} but returns "not found" on ${p.url}. Check that it is deployed and that the route path is correct.`,
        source: 'crawler',
      });
    } else if (status >= 400 && status !== 401 && status !== 403) {
      out.push({
        id: `crawl.client-error:${p.path}`,
        area: 'functional',
        severity: 'low',
        title: `Page returns HTTP ${status}: ${p.path}`,
        summary: `${p.path} answers with HTTP ${status}.`,
        steps: [open],
        evidence: ev,
        source: 'crawler',
      });
    }

    // Error pages cause secondary JS errors; the status finding above already covers them.
    const isErrorPage = status >= 400 || !!p.softNotFound;
    // Chrome logs every failed request as a console error; those are reported from the network instead.
    const consoleErrors = isErrorPage ? [] : p.consoleErrors.filter((e) => !/^Failed to load resource:/.test(e));

    if (p.pageErrors.length && !isErrorPage) {
      out.push({
        id: `crawl.js-crash:${p.path}`,
        area: 'functional',
        severity: 'medium',
        title: `JavaScript crashes on ${p.path}`,
        summary: `The page throws an uncaught error while loading ("${short(p.pageErrors[0]!)}"). Parts of the page may not work.`,
        steps: [open, 'Open the browser dev tools console and see the uncaught error.'],
        evidence: { ...ev, details: p.pageErrors.slice(0, MAX_DETAILS) },
        fix: `On ${p.path} the browser throws an uncaught error (below).${fileHint(ev)} Find the cause and fix it, and guard against missing data so the page doesn't crash.\n\n${untrustedBlock(p.pageErrors)}`,
        source: 'crawler',
      });
    }

    if (consoleErrors.length) {
      out.push({
        id: `crawl.console-errors:${p.path}`,
        area: 'functional',
        severity: 'low',
        title: `${consoleErrors.length} console error(s) on ${p.path}`,
        summary: `The browser console shows errors on this page, e.g. "${short(consoleErrors[0]!)}".`,
        steps: [open, 'Open the browser dev tools console.'],
        evidence: { ...ev, details: consoleErrors.slice(0, MAX_DETAILS) },
        fix: `Fix the browser console errors on ${p.path} (below).${fileHint(ev)}\n\n${untrustedBlock(consoleErrors)}`,
        source: 'crawler',
      });
    }

    // Failed calls from the page itself (not the document): API 5xx are the serious ones.
    const apiFailures = p.failedRequests.filter((r) => ['fetch', 'xhr'].includes(r.resourceType ?? '') && sameOrigin(r.url));
    const serverFailures = apiFailures.filter((r) => (r.status ?? 0) >= 500 || (!r.status && r.error));
    if (serverFailures.length) {
      const first = serverFailures[0]!;
      const apiPath = new URL(first.url).pathname;
      const apiEv = where(apiPath, opts.routes, 'api');
      out.push({
        id: `crawl.api-failure:${p.path}:${apiPath}`,
        area: 'functional',
        severity: 'high',
        title: `API call fails on ${p.path}: ${first.method} ${apiPath} (${first.status ?? first.error})`,
        summary: `When ${p.path} loads, it asks your server for data and the server fails. Whatever that data powers (lists, plans, prices) is missing or broken for every visitor.`,
        steps: [open, `Watch the network tab: ${first.method} ${apiPath} fails with ${first.status ?? first.error}.`],
        evidence: { ...ev, ...apiEv, details: serverFailures.slice(0, MAX_DETAILS).map((r) => `${r.method} ${r.url} -> ${r.status ?? r.error}`) },
        fix: `${first.method} ${apiPath} returns ${first.status ?? 'a network error'} when ${p.path} loads.${fileHint(apiEv)} Fix the server error and make ${p.path} show a helpful message when the request fails instead of an empty view.\n\n${untrustedBlock(serverFailures.map((r) => `${r.method} ${r.url} -> ${r.status ?? r.error}`))}`,
        source: 'crawler',
      });
    }

    const missingResources = p.failedRequests.filter(
      (r) => r.status === 404 && !['fetch', 'xhr', 'document'].includes(r.resourceType ?? '') && !p.brokenImages.includes(r.url),
    );
    if (missingResources.length) {
      out.push({
        id: `crawl.missing-assets:${p.path}`,
        area: 'functional',
        severity: 'low',
        title: `${missingResources.length} missing file(s) on ${p.path}`,
        summary: `The page asks for files that don't exist (404), e.g. ${short(missingResources[0]!.url)}.`,
        steps: [open, 'Check the network tab for 404 responses.'],
        evidence: { ...ev, details: missingResources.slice(0, MAX_DETAILS).map((r) => `${r.resourceType} ${r.url}`) },
        fix: `Some files return 404 on ${p.path} (below). Add them or remove the references.\n\n${untrustedBlock(missingResources.map((r) => r.url))}`,
        source: 'crawler',
      });
    }

    if (p.brokenImages.length) {
      out.push({
        id: `crawl.broken-images:${p.path}`,
        area: 'functional',
        severity: 'low',
        title: `${p.brokenImages.length} broken image(s) on ${p.path}`,
        summary: `Some images don't load and show as broken icons, e.g. ${short(p.brokenImages[0]!)}.`,
        steps: [open],
        evidence: { ...ev, details: p.brokenImages.slice(0, MAX_DETAILS) },
        fix: `Some images are broken on ${p.path} (below).${fileHint(ev)} Fix the image paths or add the missing files.\n\n${untrustedBlock(p.brokenImages)}`,
        source: 'crawler',
      });
    }

    if ((p.loadMs ?? 0) > slow && status < 400) {
      out.push({
        id: `crawl.slow:${p.path}`,
        area: 'performance',
        severity: (p.loadMs ?? 0) > slow * 2 ? 'high' : 'medium',
        title: `Slow page: ${p.path} takes ${(p.loadMs! / 1000).toFixed(1)}s to load`,
        summary: `${p.path} took ${(p.loadMs! / 1000).toFixed(1)} seconds to load. Pages slower than ${slow / 1000}s lose visitors.`,
        steps: [open],
        evidence: ev,
        fix: `${p.path} takes ${(p.loadMs! / 1000).toFixed(1)}s to load.${fileHint(ev)} Find what blocks rendering (slow database queries, waterfalls of requests, large images or bundles) and make it load in under ${slow / 1000}s.`,
        source: 'crawler',
      });
    }
  }
  return out;
}
