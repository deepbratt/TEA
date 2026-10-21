import { createServer, request, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setLogLevel } from '../core/index.js';
import { parseRunInput, startUi, type UiServer } from './server.js';

let ui: UiServer;
let app: Server;
let appUrl: string;
let dir: string;
let cookie: string;

interface Res { status: number; headers: Record<string, string | string[] | undefined>; body: string }

function http(path: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Res> {
  const u = new URL(path, ui.url);
  return new Promise((resolve, reject) => {
    const req = request({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: opts.method ?? 'GET', headers: { host: u.host, ...opts.headers } }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

const authed = (path: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}) =>
  http(path, { ...opts, headers: { cookie, ...opts.headers } });

beforeAll(async () => {
  setLogLevel('quiet');
  dir = await mkdtemp(join(tmpdir(), 'tea-ui-'));
  app = createServer((req, res) => {
    res.writeHead(req.url === '/broken' ? 500 : 200, { 'content-type': 'text/html' });
    res.end('<title>Mini</title><h1>Hello</h1><a href="/broken">x</a>');
  });
  await new Promise<void>((r) => app.listen(0, '127.0.0.1', r));
  appUrl = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  ui = await startUi({ port: 0, runsDir: join(dir, 'runs') });
});

afterAll(async () => {
  await ui?.close();
  app?.close();
  await rm(dir, { recursive: true, force: true });
});

describe('local UI security', () => {
  it('listens on loopback only and needs the token', async () => {
    expect(ui.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect((await http('/')).status).toBe(401);
    expect((await http('/api/runs')).status).toBe(401);
    expect((await http('/?token=wrong')).status).toBe(401);
  });

  it('trades the token for a same-site, http-only cookie', async () => {
    const res = await http(`/?token=${ui.token}`);
    expect(res.status).toBe(303);
    const set = String(res.headers['set-cookie']);
    expect(set).toMatch(/HttpOnly/);
    expect(set).toMatch(/SameSite=Strict/);
    cookie = set.split(';')[0]!;
    const page = await authed('/');
    expect(page.status).toBe(200);
    expect(page.body).toContain('Spill the TEA');
    expect(String(page.headers['content-security-policy'])).toContain("frame-ancestors 'none'");
  });

  it('rejects other hosts (DNS rebinding) and cross-site writes', async () => {
    expect((await authed('/api/runs', { headers: { host: 'evil.example:80' } })).status).toBe(403);
    const cross = await authed('/api/runs', { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: JSON.stringify({ url: appUrl }) });
    expect(cross.status).toBe(403);
    const form = await authed('/api/runs', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'url=x' });
    expect(form.status).toBe(415);
  });

  it('validates run input', () => {
    expect(() => parseRunInput({})).toThrow(/URL, a repo folder/);
    expect(() => parseRunInput({ url: 'x', maxPages: 9999 })).toThrow(/Max pages/);
    expect(parseRunInput({ url: ' http://a ', start: 'yes', extra: 1 })).toEqual({ url: 'http://a', repo: undefined, start: false });
  });
});

describe('local UI runs', () => {
  it('runs TEA, streams progress and serves the report', async () => {
    const started = await authed('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: appUrl, maxPages: 5 }) });
    expect(started.status).toBe(202);
    const { id } = JSON.parse(started.body);

    const busy = await authed('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: appUrl }) });
    expect(busy.status).toBe(409);

    const events = await authed(`/api/runs/${id}/events`); // resolves when the run finishes
    expect(events.body).toMatch(/event: log/);
    expect(events.body).toMatch(/Visiting/);
    expect(events.body).toMatch(/event: done/);

    const run = JSON.parse((await authed(`/api/runs/${id}`)).body);
    expect(run.status).toBe('done');
    expect(typeof run.score).toBe('number');
    expect(run.counts.high).toBeGreaterThanOrEqual(1); // the 500 page

    const report = await authed(`/runs/${id}/report.html`);
    expect(report.status).toBe(200);
    expect(report.body).toContain("Here's the TEA on your app");
    expect(String(report.headers['content-security-policy'])).toContain("default-src 'none'");

    for (const bad of ['..%2F..%2Fpackage.json', '%2E%2E/run.json', 'run.json/../../x.html', 'results.exe']) {
      expect((await authed(`/runs/${id}/${bad}`)).status, bad).toBe(404);
    }
    const list = JSON.parse((await authed('/api/runs')).body);
    expect(list.runs[0].id).toBe(id);

    // History (with its log) survives a restart of the UI.
    const again = await startUi({ port: 0, runsDir: join(dir, 'runs') });
    try {
      const r = await fetch(`${again.url}/api/runs/${id}`, { headers: { 'x-tea-token': again.token } });
      const body = await r.json();
      expect(body.status).toBe('done');
      expect(body.events.length).toBeGreaterThan(0);
    } finally {
      await again.close();
    }
  });

  it('reports a bad target as a failed run, not a crash', async () => {
    const started = await authed('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://127.0.0.1:1' }) });
    const { id } = JSON.parse(started.body);
    await authed(`/api/runs/${id}/events`);
    const run = JSON.parse((await authed(`/api/runs/${id}`)).body);
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/could not reach/);
  });
});
