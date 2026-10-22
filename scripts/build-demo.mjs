#!/usr/bin/env node
// Builds the website demo of the TEA Workbench: a static, read-only copy with a real analysis of
// the bundled example app. Output: web/demo-out/ (build-site.mjs publishes it at /demo/).
// Needs: npm run build (engine), npm run example:build. Usage: node scripts/build-demo.mjs [base path]
import { spawn } from 'node:child_process';
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const web = join(root, 'web');
const example = join(root, 'examples', 'buggy-next-app');
const ws = join(root, '.demo');
const base = process.argv[2] ?? '/TEA/demo';
const isWin = process.platform === 'win32';
const say = (m) => console.log(`☕ ${m}`);

const engine = await import(pathToFileURL(join(root, 'dist', 'index.js')).href);
const local = await import(pathToFileURL(join(root, 'dist', 'cli', 'local.js')).href);

function run(cmd, args, opts = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: isWin, ...opts });
    child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(' ')} exited with ${code}`))));
    child.on('error', fail);
  });
}

// 1. A workspace with the example project and two rules of its own.
await rm(ws, { recursive: true, force: true });
await mkdir(ws, { recursive: true });
const port = await local.freePort();
const liveUrl = `http://localhost:${port}`;
const services = await engine.createServices({ workspaceFile: join(ws, 'tea.config.yaml') });
const templates = engine.CUSTOM_RULE_TEMPLATES.filter((t) => ['no-console-log', 'privacy-page'].includes(t.id));
await services.workspace.update((w) => {
  w.projects.push({ key: 'leaf-and-kettle', name: 'Leaf and Kettle', url: liveUrl, sources: [{ name: 'web', path: relative(ws, example).split('\\').join('/'), role: 'auto' }] });
  w.customRules.push(...templates.map((t) => engine.CustomRuleSchema.parse(t)));
});

// 2. Record two real analyses against the running example app.
say(`Starting the example app at ${liveUrl}`);
const app = spawn('npm', ['run', 'example:start', '--silent'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore', shell: isWin, detached: !isWin });
try {
  if (!(await local.waitForHttp(liveUrl, 90_000, app))) throw new Error('the example app did not start');
  for (let i = 1; i <= 2; i++) {
    say(`Recording analysis ${i} of 2`);
    const project = await services.workspace.project('leaf-and-kettle');
    const started = await services.runs.start(project);
    await new Promise((done) => {
      const stop = services.runs.follow(started.id, (e) => e.type === 'done' && done());
      if (!stop) done();
    });
    const rec = await services.runs.get('leaf-and-kettle', started.id);
    if (rec?.status !== 'done') throw new Error(`analysis ${i} failed: ${rec?.error}`);
  }
} finally {
  await local.killTree(app);
}

// 3. Neutral paths and ports in everything the demo shows: no build machine folders.
const swaps = [
  [example, '~/code/leaf-and-kettle'],
  [root, '~/code/tea'],
  [`localhost:${port}`, 'localhost:3000'],
  [`127.0.0.1:${port}`, 'localhost:3000'],
];
const neutral = (text) =>
  swaps.reduce((t, [from, to]) => t.split(from).join(to).split(from.split('\\').join('/')).join(to).split(JSON.stringify(from).slice(1, -1)).join(to), text);
async function neutralise(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await neutralise(p);
    else if (/\.(json|html|md|yaml)$/.test(e.name)) await writeFile(p, neutral(await readFile(p, 'utf8')));
  }
}
await neutralise(ws);

// 4. What the browser-side stand-ins answer with.
const runs = await services.runs.list('leaf-and-kettle');
const latest = runs[0];
const detected = await engine.detectProject(example, { probe: false });
const exampleFolders = (await readdir(example, { withFileTypes: true }))
  .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
  .map((e) => ({ name: e.name, path: `~/code/leaf-and-kettle/${e.name}`, looksLikeApp: false }));
const codeListing = { path: '~/code', parent: null, folders: [{ name: 'leaf-and-kettle', path: '~/code/leaf-and-kettle', looksLikeApp: true }], roots: [] };
const data = {
  projectKey: 'leaf-and-kettle',
  latestRunId: latest.id,
  folders: {
    '': codeListing,
    '~/code': codeListing,
    '~/code/leaf-and-kettle': { path: '~/code/leaf-and-kettle', parent: '~/code', folders: exampleFolders, roots: [] },
  },
  detect: JSON.parse(neutral(JSON.stringify(detected))),
  events: JSON.parse(await readFile(join(services.runs.runDir('leaf-and-kettle', latest.id), 'events.json'), 'utf8')),
};

// 5. Static export of the Workbench, rendered from the recorded workspace.
say(`Building the demo (base path ${base})`);
await rm(join(web, 'demo-out'), { recursive: true, force: true });
// A static export still builds in web/.next, which is where the local Workbench's build lives.
// Keep that build aside while the demo builds, and put it back afterwards.
const localBuild = join(web, '.next');
const kept = join(web, '.next-local');
await rm(kept, { recursive: true, force: true });
if (existsSync(localBuild)) await rename(localBuild, kept);
try {
  await run(process.execPath, [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
    cwd: web,
    shell: false,
    env: { ...process.env, NEXT_PUBLIC_TEA_DEMO: '1', NEXT_PUBLIC_BASE_PATH: base, TEA_ROOT: root, TEA_WORKSPACE: join(ws, 'tea.config.yaml'), NEXT_TELEMETRY_DISABLED: '1' },
  });
} finally {
  await rm(localBuild, { recursive: true, force: true });
  if (existsSync(kept)) await rename(kept, localBuild);
}
const out = join(web, 'demo-out');
if (!existsSync(join(out, 'index.html'))) throw new Error(`the static export is missing from ${out}`);
// Next writes segment payloads nested (rules/__next.rules/__PAGE__.txt) but its client prefetches
// them flat (rules/__next.rules.__PAGE__.txt). Add the flat names so client navigation works on a
// static host instead of falling back to full page loads.
async function flattenSegments(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (!e.isDirectory()) continue;
    if (e.name.startsWith('__next.')) {
      const walk = async (d, prefix) => {
        for (const f of await readdir(d, { withFileTypes: true })) {
          const name = `${prefix}.${f.name}`;
          if (f.isDirectory()) await walk(join(d, f.name), name);
          else await cp(join(d, f.name), join(dir, name));
        }
      };
      await walk(p, e.name);
    } else {
      await flattenSegments(p);
    }
  }
}
await flattenSegments(out);
await writeFile(join(out, 'demo-data.json'), JSON.stringify(data));
for (const r of runs) {
  const from = services.runs.runDir('leaf-and-kettle', r.id);
  const to = join(out, 'demo-runs', 'leaf-and-kettle', r.id);
  await mkdir(to, { recursive: true });
  for (const f of ['report.html', 'report.md', 'results.json']) if (existsSync(join(from, f))) await cp(join(from, f), join(to, f));
  if (existsSync(join(from, 'screenshots'))) await cp(join(from, 'screenshots'), join(to, 'screenshots'), { recursive: true });
}
say(`Demo ready in ${out}`);
