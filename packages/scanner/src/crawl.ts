import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { log, mask, normalisePath, type FailedRequest, type FormInfo, type PageVisit, type Scope } from '@tea-qa/core';

export interface CrawlOptions {
  startUrl: string;
  /** Extra paths to visit even if no page links to them (static routes from the code). */
  seedPaths?: string[];
  scope: Scope;
  maxPages?: number;
  timeoutMs?: number;
  outDir: string;
  viewport?: { width: number; height: number };
  screenshots?: boolean;
  /** Injected for tests; otherwise Chromium is launched. */
  browser?: Browser;
}

export interface CrawlResult {
  pages: PageVisit[];
  /** In-scope links that were found but not visited because maxPages was reached. */
  unvisited: string[];
  /** Links to hosts outside the allowlist (never visited). */
  external: string[];
}

interface Extracted {
  title: string;
  links: string[];
  buttons: string[];
  forms: FormInfo[];
  brokenImages: string[];
  loadMs?: number;
  softNotFound: boolean;
}

/** Strip hash and trailing slash so /a, /a/ and /a#x are one page. Query strings are kept. */
export function canonicalUrl(raw: string, base?: string): string | null {
  try {
    const u = new URL(raw, base);
    u.hash = '';
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return null;
  }
}

/** The only methods TEA lets the browser send to the hosts under test. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const ASSET = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|map|woff2?|ttf|eot|mp4|webm|mp3|pdf|zip|xml|txt|json)$/i;

/**
 * Breadth-first, read-only crawl. TEA only navigates with GET: it never clicks buttons,
 * submits forms or fills inputs here, so it cannot change data on the target.
 */
export async function crawl(opts: CrawlOptions): Promise<CrawlResult> {
  const maxPages = opts.maxPages ?? 50;
  const timeout = opts.timeoutMs ?? 30_000;
  const shotDir = join(opts.outDir, 'screenshots');
  if (opts.screenshots !== false) await mkdir(shotDir, { recursive: true });

  const start = canonicalUrl(opts.startUrl)!;
  const queue: { url: string; from?: string; seeded?: boolean }[] = [{ url: start }];
  for (const p of opts.seedPaths ?? []) {
    const u = canonicalUrl(p, start);
    if (u) queue.push({ url: u, seeded: true });
  }

  const visits = new Map<string, PageVisit>();
  const referrers = new Map<string, Set<string>>();
  const seen = new Set<string>();
  const external = new Set<string>();
  const unvisited = new Set<string>();

  const ownBrowser = !opts.browser;
  const browser = opts.browser ?? (await chromium.launch());
  const context: BrowserContext = await browser.newContext({
    viewport: opts.viewport ?? { width: 1280, height: 800 },
  });
  // Scope and read-only guard, applied to every request the browser makes:
  // - writes (POST, PUT, PATCH, DELETE) to the hosts under test are blocked, even from page scripts;
  // - main-frame navigations must stay in scope (host and skip list). Redirects are followed one
  //   hop at a time so a redirect to a skipped route or another host is never requested.
  // Third-party iframes and subresources still load, as they would for any visitor.
  await context.route('**/*', async (route) => {
    const req = route.request();
    if (!READ_METHODS.has(req.method()) && opts.scope.isAllowed(req.url())) return route.abort('blockedbyclient');
    let mainFrame = false;
    try {
      mainFrame = req.isNavigationRequest() && req.frame() === req.frame().page().mainFrame();
    } catch {
      /* service worker requests have no frame */
    }
    if (!mainFrame) return route.continue();
    if (!opts.scope.canVisit(req.url())) return route.abort('blockedbyclient');
    const res = await route.fetch({ maxRedirects: 0 }).catch(() => null);
    if (!res) return route.abort('failed');
    const location = res.status() >= 300 && res.status() < 400 ? res.headers()['location'] : undefined;
    if (location) {
      const next = canonicalUrl(location, req.url());
      if (!next || !opts.scope.canVisit(next)) return route.abort('blockedbyclient');
    }
    return route.fulfill({ response: res });
  });

  try {
    while (queue.length) {
      const item = queue.shift()!;
      if (item.from) {
        if (!referrers.has(item.url)) referrers.set(item.url, new Set());
        referrers.get(item.url)!.add(item.from);
      }
      if (seen.has(item.url)) continue;
      if (!opts.scope.canVisit(item.url)) {
        if (!opts.scope.isAllowed(item.url)) external.add(item.url);
        continue;
      }
      if (visits.size >= maxPages) {
        unvisited.add(item.url);
        continue;
      }
      seen.add(item.url);
      log.debug(`crawl: ${item.url}`);
      const visit = await visitPage(context, item.url, { scope: opts.scope, timeout, shotDir: opts.screenshots === false ? undefined : shotDir, index: visits.size });
      visit.seededFromCode = item.seeded ?? false;
      visits.set(item.url, visit);
      for (const link of visit.links) {
        if (ASSET.test(new URL(link).pathname)) continue;
        queue.push({ url: link, from: item.url });
      }
    }
  } finally {
    await context.close();
    if (ownBrowser) await browser.close();
  }

  const pages = [...visits.values()].map((v) => ({ ...v, referrers: [...(referrers.get(v.url) ?? [])].sort() }));
  for (const u of seen) unvisited.delete(u);
  return { pages, unvisited: [...unvisited], external: [...external].sort() };
}

async function visitPage(context: BrowserContext, url: string, o: { scope: Scope; timeout: number; shotDir?: string; index: number }): Promise<PageVisit> {
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: FailedRequest[] = [];
  const pageUrl = new URL(url);

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(mask(msg.text()).slice(0, 500));
  });
  page.on('pageerror', (err) => pageErrors.push(mask(err.message).slice(0, 500)));
  page.on('requestfailed', (req) => {
    const error = req.failure()?.errorText ?? 'failed';
    // Aborted navigations/prefetches are noise; ERR_BLOCKED_BY_CLIENT is TEA's own guard.
    if (/ERR_ABORTED|NS_BINDING_ABORTED|ERR_BLOCKED_BY_CLIENT/.test(error)) return;
    failedRequests.push({ url: mask(req.url()), method: req.method(), error, resourceType: req.resourceType() });
  });
  page.on('response', (res) => {
    if (res.status() >= 400 && res.request().frame() === page.mainFrame() && res.url() !== url) {
      failedRequests.push({ url: mask(res.url()), method: res.request().method(), status: res.status(), resourceType: res.request().resourceType() });
    }
  });

  const visit: PageVisit = {
    url,
    path: normalisePath(pageUrl.pathname) + pageUrl.search,
    consoleErrors,
    pageErrors,
    failedRequests,
    links: [],
    buttons: [],
    forms: [],
    brokenImages: [],
    referrers: [],
  };

  const started = Date.now();
  try {
    const res = await page.goto(url, { waitUntil: 'load', timeout: o.timeout });
    visit.status = res?.status();
    // A server-side redirect can still land somewhere TEA must not test: discard that page.
    const finalUrl = page.url();
    if (!o.scope.isAllowed(finalUrl) || o.scope.isSkipped(finalUrl)) {
      visit.error = `redirected to ${mask(finalUrl)}, which is outside what TEA may test`;
      visit.redirectedOutOfScope = true;
      return visit;
    }
    // Let client-side data fetching settle, but don't fail on long-polling pages.
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    const ex = await extract(page);
    visit.loadMs = ex.loadMs ?? Date.now() - started;
    visit.title = ex.title;
    if (ex.softNotFound && (visit.status ?? 200) < 400) visit.softNotFound = true;
    visit.buttons = ex.buttons;
    visit.forms = ex.forms.map((f) => ({ ...f, location: url }));
    visit.brokenImages = ex.brokenImages.map(mask);
    visit.links = [...new Set(ex.links.map((l) => canonicalUrl(l, url)).filter((l): l is string => !!l && /^https?:/.test(l)))];
    if (o.shotDir) {
      const file = `${String(o.index).padStart(3, '0')}-${slug(visit.path)}.png`;
      await page.screenshot({ path: join(o.shotDir, file), fullPage: true, timeout: 15_000 }).then(
        () => (visit.screenshot = `screenshots/${file}`),
        () => undefined,
      );
    }
  } catch (err) {
    visit.loadMs = Date.now() - started;
    visit.error = mask((err as Error).message.split('\n')[0]!);
    // Our own route guard stopped a redirect to a skipped route or another host.
    if (/ERR_BLOCKED_BY_CLIENT/.test(visit.error)) {
      visit.redirectedOutOfScope = true;
      visit.error = 'redirected outside what TEA may test';
    }
  } finally {
    await page.close();
  }
  return visit;
}

async function extract(page: Page): Promise<Extracted> {
  return page.evaluate(() => {
    const text = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const links = [...document.querySelectorAll('a[href]')].map((a) => (a as HTMLAnchorElement).href);
    const buttons = [...document.querySelectorAll('button, [role="button"], input[type="submit"], input[type="button"]')]
      .map((b) => text(b) || (b as HTMLInputElement).value || b.getAttribute('aria-label') || '')
      .filter(Boolean);
    const labelFor = (el: Element) => {
      const id = el.getAttribute('id');
      const l = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`) : el.closest('label');
      return (l && text(l)) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || undefined;
    };
    const forms = [...document.querySelectorAll('form')].map((f) => ({
      location: '',
      action: f.getAttribute('action') ?? undefined,
      method: (f.getAttribute('method') ?? 'GET').toUpperCase(),
      fields: [...f.querySelectorAll('input, textarea, select')]
        .filter((i) => (i as HTMLInputElement).type !== 'hidden')
        .map((i) => ({
          name: i.getAttribute('name') ?? i.getAttribute('id') ?? undefined,
          type: i.tagName === 'INPUT' ? (i as HTMLInputElement).type : i.tagName.toLowerCase(),
          required: (i as HTMLInputElement).required,
          label: labelFor(i),
        })),
    }));
    const brokenImages = [...document.querySelectorAll('img')]
      .filter((img) => img.complete && img.naturalWidth === 0 && !!img.currentSrc)
      .map((img) => img.currentSrc);
    // SPAs answer 200 for unknown routes and render a "not found" view instead.
    const headline = [...document.querySelectorAll('h1, h2, title')].map(text).join(' ');
    const softNotFound = /\b404\b|page not found|not found|doesn.t exist|could not be found/i.test(headline);
    return {
      softNotFound,
      title: document.title,
      links,
      buttons: [...new Set(buttons)].slice(0, 50),
      forms,
      brokenImages: [...new Set(brokenImages)],
      loadMs: nav && nav.loadEventEnd > 0 ? Math.round(nav.loadEventEnd - nav.startTime) : undefined,
    };
  });
}

function slug(path: string): string {
  return (path.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home').slice(0, 60);
}
