import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Scope, checkIdOf, loadCatalog, type Route } from '@tea-qa/core';
import { crawl, crawlFindings, canonicalUrl } from './index.js';

const html = (body: string, title = 'T') => `<!doctype html><html><head><title>${title}</title></head><body>${body}</body></html>`;

const pages: Record<string, { status?: number; body: string; delay?: number; type?: string }> = {
  '/': { body: html('<a href="/about">About</a> <a href="/missing">Gone</a> <a href="https://elsewhere.example/x">Ext</a> <a href="/admin">Admin</a> <a href="/boom#top">Boom</a> <a href="/redirect">Redir</a> <a href="/js-redirect">JS</a> <button>Sign up</button>', 'Home') },
  '/about': {
    body: html(`<h1>About</h1><img src="/nope.png"><form method="post"><label for="e">Email</label><input id="e" name="email" type="email" required></form>
      <script>console.error('boom from about'); fetch('/api/data');</script>`),
  },
  '/boom': { status: 500, body: 'Internal Server Error' },
  '/api/data': { status: 500, type: 'application/json', body: '{"error":"db down"}' },
  '/spa-missing': { body: html('<h1>404 - Page not found</h1>') },
  '/admin': { body: html('secret admin') },
  '/slow': { body: html('<h1>Slow</h1>'), delay: 1200 },
  '/js-redirect': { body: html('<script>location.href = OTHER_HOST + "/js-target"</script>') },
  '/js-target': { body: html('should never be requested') },
};

let server: Server;
let base: string;
let out: string;
const hits: string[] = [];

beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), 'tea-crawl-'));
  server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://x').pathname;
    hits.push(`${req.method} ${path}`);
    if (path === '/redirect') {
      // "localhost" is a different host from the 127.0.0.1 TEA was told to test.
      res.writeHead(302, { location: `http://localhost:${(server.address() as AddressInfo).port}/elsewhere` });
      return res.end();
    }
    const p = pages[path];
    setTimeout(() => {
      res.writeHead(p?.status ?? (p ? 200 : 404), { 'content-type': p?.type ?? 'text/html' });
      const other = `"http://localhost:${(server.address() as AddressInfo).port}"`;
      res.end((p?.body ?? html('<h1>Not here</h1>')).replace('OTHER_HOST', other));
    }, p?.delay ?? 0);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await rm(out, { recursive: true, force: true });
});

describe('canonicalUrl', () => {
  it('drops hashes and trailing slashes', () => {
    expect(canonicalUrl('/a/#x', 'http://h')).toBe('http://h/a');
    expect(canonicalUrl('/', 'http://h')).toBe('http://h/');
  });
});

describe('crawl', () => {
  it('crawls read-only, in scope, and reports what it saw', async () => {
    const scope = new Scope({ urls: [base], skip: ['/admin/**'] });
    const result = await crawl({ startUrl: base, seedPaths: ['/spa-missing', '/slow'], scope, outDir: out, maxPages: 20 });
    const byPath = Object.fromEntries(result.pages.map((p) => [p.path, p]));

    expect(Object.keys(byPath).sort()).toEqual(['/', '/about', '/boom', '/js-redirect', '/missing', '/redirect', '/slow', '/spa-missing']);
    expect(byPath['/redirect']!.redirectedOutOfScope).toBe(true);
    expect(byPath['/redirect']!.links).toEqual([]);
    await new Promise((r) => setTimeout(r, 300));
    expect(hits).not.toContain('GET /js-target');
    expect(hits.every((h) => h.startsWith('GET '))).toBe(true);
    expect(hits).not.toContain('GET /admin');
    expect(result.external).toEqual(['https://elsewhere.example/x']);

    expect(byPath['/']!.buttons).toContain('Sign up');
    expect(byPath['/']!.screenshot).toMatch(/^screenshots\/000-home\.png$/);
    expect(existsSync(join(out, byPath['/']!.screenshot!))).toBe(true);
    expect(byPath['/about']!.consoleErrors.join()).toContain('boom from about');
    expect(byPath['/about']!.brokenImages[0]).toContain('/nope.png');
    expect(byPath['/about']!.forms[0]!.fields[0]).toMatchObject({ name: 'email', type: 'email', required: true, label: 'Email' });
    expect(byPath['/about']!.failedRequests.some((r) => r.url.endsWith('/api/data') && r.status === 500)).toBe(true);
    expect(byPath['/boom']!.status).toBe(500);
    expect(byPath['/missing']!.status).toBe(404);
    expect(byPath['/missing']!.referrers).toEqual([`${base}/`]);
    expect(byPath['/spa-missing']!.softNotFound).toBe(true);

    const routes: Route[] = [
      { path: '/about', kind: 'page', file: 'app/about/page.tsx', line: 1, dynamic: false, source: 'code' },
      { path: '/api/data', kind: 'api', file: 'app/api/data/route.ts', line: 1, dynamic: false, source: 'code' },
    ];
    const findings = crawlFindings(result.pages, { routes, baseUrl: base, slowPageMs: 1000 });
    const ids = findings.map((f) => f.id);
    expect(ids.some((id) => id.includes('/redirect'))).toBe(false);
    expect(ids).toEqual(
      expect.arrayContaining([
        'crawl.server-error:/boom',
        'crawl.not-found:/missing',
        'crawl.not-found:/spa-missing',
        'crawl.console-errors:/about',
        'crawl.api-failure:/about:/api/data',
        'crawl.broken-images:/about',
        'crawl.slow:/slow',
      ]),
    );
    const catalog = await loadCatalog();
    for (const f of findings) expect(catalog.get(checkIdOf(f.id)), `catalog entry for ${f.id}`).toBeDefined();
    const api = findings.find((f) => f.id === 'crawl.api-failure:/about:/api/data')!;
    expect(api.severity).toBe('high');
    expect(api.evidence?.file).toBe('app/api/data/route.ts');
    expect(api.fix).toContain('app/api/data/route.ts');
    expect(findings.find((f) => f.id === 'crawl.not-found:/missing')!.severity).toBe('medium');
    expect(findings.find((f) => f.id === 'crawl.not-found:/spa-missing')!.severity).toBe('low');
  });

  it('stops at maxPages and lists what it skipped', async () => {
    const scope = new Scope({ urls: [base] });
    const result = await crawl({ startUrl: base, scope, outDir: out, maxPages: 1, screenshots: false });
    expect(result.pages).toHaveLength(1);
    expect(result.unvisited.length).toBeGreaterThan(0);
  });
});
