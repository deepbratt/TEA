import { createServer, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Scope, loadCatalog, type Route } from '../core/index.js';
import { crawl } from '../scanner/index.js';
import { sandboxTests } from './sandbox.js';

const html = (body: string) => `<!doctype html><html><head><title>T</title></head><body>${body}</body></html>`;
const form = (action: string, fields: string, button = 'Send') => `<form action="${action}" method="post">${fields}<button type="submit">${button}</button></form>`;

const pages: Record<string, string> = {
  '/': html('<a href="/signup">Sign up</a> <a href="/join">Join</a> <a href="/contact">Contact</a> <a href="/pay">Pay</a> <a href="/danger">Danger</a> <a href="/crash">Crash</a>'),
  // Posts to a route that doesn't exist.
  '/signup': html(form('/api/signup', '<label for="e">Email</label><input id="e" name="email" type="email"><input name="password" type="password">')),
  // Works, but accepts any text as an email.
  '/join': html(form('/api/join', '<label for="e">Email</label><input id="e" name="email" type="text">')),
  // Works and checks the email on the server.
  '/contact': html(form('/api/contact', '<label for="e">Email</label><input id="e" name="email" type="text"><textarea name="message"></textarea>')),
  // Card fields: never filled.
  '/pay': html(form('/api/pay', '<input name="card-number" autocomplete="cc-number">')),
  // A delete button: never pressed.
  '/danger': html(form('/api/account', '<input name="reason">', 'Delete my account')),
  // The page throws when the form is submitted.
  '/crash': html(`${form('/api/contact', '<input name="name">')}<script>document.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); null.boom(); })</script>`),
};

let server: Server;
let base: string;
let out: string;
const writes: string[] = [];

beforeAll(async () => {
  out = await mkdtemp(join(tmpdir(), 'tea-sandbox-'));
  server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://x').pathname;
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.method !== 'GET') writes.push(`${req.method} ${path}`);
      const json = (status: number, data: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(data));
      };
      if (path === '/api/join' && req.method === 'POST') return json(200, { ok: true });
      if (path === '/api/contact' && req.method === 'POST') return /email=[^&]*%40/.test(body) ? json(200, { ok: true }) : json(422, { error: 'bad email' });
      if (path === '/api/orders') return json(200, [{ id: 'o1', total: 12 }]);
      if (path === '/api/me') return json(401, { error: 'sign in' });
      if (path === '/api/broken') return json(500, { error: 'db down' });
      if (path === '/api/send-digest') return json(200, { sent: true });
      if (pages[path]) {
        res.writeHead(200, { 'content-type': 'text/html' });
        return res.end(pages[path]);
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((r) => server.close(r));
  await rm(out, { recursive: true, force: true });
});

const api = (path: string, methods = ['GET']): Route => ({ path, kind: 'api', methods, dynamic: false, source: 'code', file: `app${path}/route.ts` });

describe('sandboxTests', () => {
  it('submits forms with test data and calls APIs signed out, on a local app only', async () => {
    const scope = new Scope({ urls: [base] });
    const catalog = await loadCatalog();
    const { pages: visits } = await crawl({ startUrl: base, scope, outDir: out, screenshots: false, maxPages: 20 });
    const routes = [api('/api/orders'), api('/api/me'), api('/api/broken'), api('/api/send-digest'), api('/api/join', ['POST'])];
    const r = await sandboxTests({ url: base, pages: visits, routes, scope, outDir: out, catalog, screenshots: false });

    const form = (page: string, kind = 'valid') => r.forms.find((t) => t.page === page && t.kind === kind);
    expect(form('/signup')).toMatchObject({ result: 'fail', status: 404 });
    expect(form('/join')).toMatchObject({ result: 'pass', status: 200 });
    expect(form('/join', 'invalid-email')).toMatchObject({ result: 'fail', status: 200 });
    expect(form('/contact', 'invalid-email')).toMatchObject({ result: 'pass', status: 422 });
    expect(form('/pay')?.result).toBe('skip');
    expect(form('/danger')?.result).toBe('skip');
    expect(form('/crash')).toMatchObject({ result: 'fail' });
    expect(form('/crash')?.detail).toMatch(/crashed/);

    const apiTest = (path: string) => r.apis.find((t) => t.path === path);
    expect(apiTest('/api/orders')).toMatchObject({ result: 'fail', private: true });
    expect(apiTest('/api/me')).toMatchObject({ result: 'pass', status: 401 });
    expect(apiTest('/api/broken')).toMatchObject({ result: 'fail', status: 500 });
    expect(apiTest('/api/send-digest')?.result).toBe('skip');
    expect(apiTest('/api/join')).toBeUndefined();

    expect(r.findings.map((f) => f.id).sort()).toEqual([
      'features.api-error:/api/broken',
      'features.api-open:/api/orders',
      'features.form-accepts-invalid:/join:email',
      'features.form-fails:/crash:POST /api/contact',
      'features.form-fails:/signup:POST /api/signup',
    ]);
    // Nothing was ever written to the routes TEA must not touch.
    expect(writes).not.toContain('POST /api/pay');
    expect(writes).not.toContain('POST /api/account');
  }, 90_000);

  it('refuses anything that is not local', async () => {
    const catalog = await loadCatalog();
    await expect(
      sandboxTests({ url: 'https://shop.example.com', pages: [], routes: [], scope: new Scope({ urls: ['https://shop.example.com'] }), outDir: out, catalog }),
    ).rejects.toThrow(/only run on an app on your own computer/);
  });
});
