import { createServer, request, type Server } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { setLogLevel } from '../core/index.js';
import { parseRunInput, startUi, type UiServer } from './server.js';
import { FAKE_TOKEN, fakeGitHub, makeGitRepo } from '../github/__tests__/fake-github.js';

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

  it('reports a bad target as a failed run, not a crash, and masks credentials', async () => {
    const started = await authed('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'http://admin:s3cretpass@127.0.0.1:1' }) });
    expect(started.body).not.toContain('s3cretpass');
    const { id } = JSON.parse(started.body);
    await authed(`/api/runs/${id}/events`);
    const run = JSON.parse((await authed(`/api/runs/${id}`)).body);
    expect(run.status).toBe('failed');
    expect(run.error).toMatch(/could not reach/);
    expect(JSON.stringify(run)).not.toContain('s3cretpass');
    const saved = (await import('node:fs')).readFileSync(join(dir, 'runs', id, 'run.json'), 'utf8');
    expect(saved).not.toContain('s3cretpass');
  });
});

describe('local UI: GitHub and folders', () => {
  let gh: Server;
  let ui2: UiServer;
  let c2: string;
  const call = (path: string, opts: { method?: string; body?: unknown } = {}) =>
    fetch(`${ui2.url}${path}`, {
      method: opts.method ?? 'GET',
      headers: { 'x-tea-token': ui2.token, 'content-type': 'application/json' },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    }).then(async (r) => ({ status: r.status, text: await r.text() }));

  beforeAll(async () => {
    gh = fakeGitHub();
    await new Promise<void>((r) => gh.listen(0, '127.0.0.1', r));
    const ghBase = `http://127.0.0.1:${(gh.address() as AddressInfo).port}`;
    await makeGitRepo(join(dir, 'remote'), 'mira-example', 'leaf-kettle');
    ui2 = await startUi({
      port: 0,
      runsDir: join(dir, 'runs2'),
      cloneDir: join(dir, 'clones'),
      githubApi: ghBase,
      githubOAuth: ghBase,
      githubClientId: 'client-1',
      gitBase: join(dir, 'remote'),
      ghToken: async () => FAKE_TOKEN,
    });
    c2 = ui2.token;
  });

  afterAll(async () => {
    await ui2?.close();
    gh?.close();
  });

  it('connects with the GitHub CLI login and never returns the token', async () => {
    expect(JSON.parse((await call('/api/github')).text)).toEqual({ connected: false, deviceFlow: true });
    expect((await call('/api/github/repos')).status).toBe(401);
    const res = await call('/api/github/connect', { method: 'POST', body: { method: 'cli' } });
    expect(res.status).toBe(200);
    expect(JSON.parse(res.text)).toMatchObject({ connected: true, login: 'mira-example', via: 'cli' });
    for (const path of ['/api/github', '/api/github/repos', '/api/github/repo?owner=mira-example&repo=leaf-kettle']) {
      expect((await call(path)).text, path).not.toContain(FAKE_TOKEN);
    }
    expect(c2).toBeTruthy();
  });

  it('lists repos, branches and suggested live URLs', async () => {
    const repos = JSON.parse((await call('/api/github/repos')).text).repos;
    expect(repos.map((r: { fullName: string }) => r.fullName)).toEqual(['mira-example/leaf-kettle', 'mira-example/notes']);
    const detail = JSON.parse((await call('/api/github/repo?owner=mira-example&repo=leaf-kettle')).text);
    expect(detail.branches).toContain('feature/checkout');
    expect(detail.urls.map((u: { url: string }) => u.url)).toContain('https://leaf-kettle.example.com');
    expect((await call('/api/github/repo?owner=-x&repo=y')).status).toBe(400);
  });

  it('clones a GitHub repo and tests it with the live URL', async () => {
    const started = await call('/api/runs', { method: 'POST', body: { url: appUrl, github: { owner: 'mira-example', repo: 'leaf-kettle', branch: 'main' }, maxPages: 3 } });
    expect(started.status).toBe(202);
    const { id } = JSON.parse(started.text);
    const events = (await call(`/api/runs/${id}/events`)).text;
    expect(events).toMatch(/Cloning mira-example\/leaf-kettle@main/);
    const run = JSON.parse((await call(`/api/runs/${id}`)).text);
    expect(run.status).toBe('done');
    expect(run.input.github).toEqual({ owner: 'mira-example', repo: 'leaf-kettle', branch: 'main' });
    expect(JSON.stringify(run)).not.toContain(FAKE_TOKEN);
  });

  it('refuses a folder and a GitHub repo together, and bad tokens', async () => {
    expect((await call('/api/runs', { method: 'POST', body: { repo: dir, github: { owner: 'a', repo: 'b' } } })).status).toBe(400);
    expect((await call('/api/github/connect', { method: 'POST', body: { method: 'token', token: 'not a token' } })).status).toBe(400);
  });

  it('signs in with the device flow', async () => {
    await call('/api/github/disconnect', { method: 'POST', body: {} });
    const start = JSON.parse((await call('/api/github/device', { method: 'POST', body: { action: 'start' } })).text);
    expect(start.userCode).toBe('WDJB-MJHT');
    let poll = JSON.parse((await call('/api/github/device', { method: 'POST', body: { action: 'poll' } })).text);
    if (poll.status === 'pending') poll = JSON.parse((await call('/api/github/device', { method: 'POST', body: { action: 'poll' } })).text);
    expect(poll).toMatchObject({ status: 'done', login: 'mira-example' });
  });

  it('connects GitHub, picks a repo and runs it from the page', async () => {
    await call('/api/github/disconnect', { method: 'POST', body: {} });
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(ui2.openUrl);
      await page.click('#tabGithub');
      await page.click('#ghCli');
      await page.click('#ghRepos li:has-text("mira-example/leaf-kettle")');
      await page.waitForFunction(() => (document.getElementById('urlSuggest')?.children.length ?? 0) > 0);
      await page.fill('#url', appUrl);
      await page.click('#form details summary');
      await page.fill('#maxPages', '3');
      await page.click('#go');
      await page.waitForFunction(() => document.getElementById('pill')?.textContent === 'Done', undefined, { timeout: 60_000 });
      expect(await page.textContent('#target')).toContain('github.com/mira-example/leaf-kettle@main');
      expect(await page.textContent('#log')).toContain('Cloning mira-example/leaf-kettle@main');
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
    }
  });

  it('lists folders for the folder picker', async () => {
    const listing = JSON.parse((await call(`/api/folders?path=${encodeURIComponent(join(dir, 'remote', 'mira-example'))}`)).text);
    expect(listing.folders).toEqual([expect.objectContaining({ name: 'leaf-kettle', looksLikeApp: true })]);
    expect(listing.parent).toBe(join(dir, 'remote'));
    expect((await call(`/api/folders?path=${encodeURIComponent(join(dir, 'nope'))}`)).status).toBe(400);
  });
});

describe('local UI in a real browser', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage();
  });
  afterAll(async () => {
    await browser?.close();
  });

  it('runs a test from the form and shows the score', async () => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(ui.openUrl);
    await page.fill('#url', appUrl);
    await page.click('#form details summary');
      await page.fill('#maxPages', '3');
    await page.click('#go');
    await page.waitForFunction(() => document.getElementById('pill')?.textContent === 'Done', undefined, { timeout: 60_000 });
    expect(await page.textContent('#verdict')).toMatch(/Here's the TEA: \d+\/100/);
    expect(await page.locator('#log div').count()).toBeGreaterThan(0);
    expect(await page.locator('#history li').count()).toBeGreaterThan(0);
    expect(await page.isVisible('#empty')).toBe(false);
    expect(errors).toEqual([]);
  });
});
