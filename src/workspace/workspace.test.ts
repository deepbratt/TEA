import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDirs } from '../__tests__/temp.js';
import { loadCatalog } from '../core/index.js';
import { RunManager, Workspace, WorkspaceError, keyFromName, rulesView } from './index.js';

const dir = useTempDirs('workspace');

describe('Workspace config file', () => {
  it('creates a commented default file and keeps comments when the UI saves', async () => {
    const root = await dir();
    const ws = new Workspace(join(root, 'tea.config.yaml'), await loadCatalog());
    const { data } = await ws.read();
    expect(data).toMatchObject({ version: 1, projects: [], rules: {} });
    expect(data.gate.conditions.length).toBeGreaterThan(0);

    // Someone adds their own comment by hand.
    const file = ws.file;
    await writeFile(file, (await readFile(file, 'utf8')).replace('rules: {}', '# keep me\nrules: {}'));

    await ws.update((w) => {
      w.projects.push({ key: 'shop', name: 'Shop', sources: [{ name: 'web', path: '../shop-web', role: 'frontend' }] });
      w.rules['crawl.slow'] = { params: { thresholdMs: 2000 } };
    });
    const text = await readFile(file, 'utf8');
    expect(text).toContain('# keep me');
    expect(text).toContain('# Each project: a live URL');
    expect(text).toContain('thresholdMs: 2000');
    expect((await ws.read()).data.projects[0]!.name).toBe('Shop');
    expect(ws.sourcesOf((await ws.project('shop'))!)[0]!.path).toBe(join(root, '..', 'shop-web'));
  });

  it('rejects invalid settings without touching the file', async () => {
    const root = await dir();
    const ws = new Workspace(join(root, 'tea.config.yaml'), await loadCatalog());
    const before = (await ws.read()).text;
    await expect(ws.update((w) => w.projects.push({ key: 'x', name: 'No sources', sources: [] }))).rejects.toBeInstanceOf(WorkspaceError);
    await expect(ws.update((w) => (w.rules['crawl.slow'] = { params: { thresholdMs: 5 } }))).rejects.toThrow(/rules are not valid/);
    await expect(
      ws.update((w) =>
        w.projects.push({
          key: 'y',
          name: 'Dupes',
          sources: [
            { name: 'a', path: '.', role: 'frontend' },
            { name: 'A', path: '..', role: 'backend' },
          ],
        }),
      ),
    ).rejects.toThrow(WorkspaceError);
    expect((await ws.read()).text).toBe(before);
  });

  it('saves hand-edited text only when it is valid, and can show a broken file', async () => {
    const root = await dir();
    const ws = new Workspace(join(root, 'tea.config.yaml'), await loadCatalog());
    await ws.read();
    await expect(ws.replaceText('projects: [')).rejects.toThrow(/not valid YAML/);
    await expect(ws.replaceText('version: 2\n')).rejects.toThrow(WorkspaceError);
    await ws.replaceText('# mine\nversion: 1\nprojects: []\n');
    expect(await ws.text()).toBe('# mine\nversion: 1\nprojects: []\n');

    await writeFile(ws.file, 'projects: [');
    await expect(ws.read()).rejects.toThrow(WorkspaceError);
    expect(await ws.text()).toBe('projects: [');
  });

  it('makes URL-safe, unique project keys', () => {
    expect(keyFromName('My Shop!')).toBe('my-shop');
    expect(keyFromName('My Shop', ['my-shop', 'my-shop-2'])).toBe('my-shop-3');
    expect(keyFromName('☕')).toBe('project');
  });

  it('shows every check with its effective settings', async () => {
    const catalog = await loadCatalog();
    const slow = rulesView(catalog, { 'crawl.slow': { severity: 'high', params: { thresholdMs: 1000 } } }).find((r) => r.id === 'crawl.slow')!;
    expect(slow).toMatchObject({ enabled: true, severity: 'high', defaultSeverity: 'medium' });
    expect(slow.params[0]).toMatchObject({ name: 'thresholdMs', value: 1000, default: 3000 });
  });
});

describe('RunManager', () => {
  it('runs a code-only analysis of a project, records it and streams its log', async () => {
    const root = await dir();
    const app = await dir({
      'package.json': JSON.stringify({ name: 'x', dependencies: { react: '18', express: '4' } }),
      'src/client.ts': 'fetch("/api/missing")',
      'src/server.ts': 'app.get("/api/items", h)',
    });
    const ws = new Workspace(join(root, 'tea.config.yaml'), await loadCatalog());
    await ws.update((w) => w.projects.push({ key: 'demo', name: 'Demo', sources: [{ name: 'app', path: app, role: 'fullstack' }] }));
    const runs = new RunManager(ws);

    const started = await runs.start((await ws.project('demo'))!);
    expect(started.status).toBe('running');
    await expect(runs.start((await ws.project('demo'))!)).rejects.toThrow(/already running/);

    const done = await new Promise<{ status: string }>((ok) => {
      const stop = runs.follow(started.id, (e) => {
        if (e.type === 'done') ok(e.run);
      });
      if (!stop) void runs.get('demo', started.id).then((r) => ok(r!));
    });
    expect(done.status).toBe('done');

    const record = (await runs.get('demo', started.id))!;
    expect(record.gate?.status).toBeDefined();
    expect((await runs.list('demo')).map((r) => r.id)).toEqual([started.id]);
    expect((await runs.events('demo', started.id)).length).toBeGreaterThan(0);
    const results = (await runs.results('demo', started.id))!;
    expect(results.findings.map((f) => f.id)).toContain('wiring.orphan-call:GET /api/missing');
    expect(() => runs.runDir('demo', '../x')).toThrow();
  });
});
