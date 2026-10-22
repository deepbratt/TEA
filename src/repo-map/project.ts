import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { scanRepo, type ScanOptions } from './index.js';
import { inferRole, stackNames, type ResolvedRole } from './sources.js';

/**
 * Auto-detect a project from one folder: the apps in it (a single app, or each app of a monorepo
 * such as apps/web + apps/api or frontend/ + backend/), what each one is, and where it probably
 * runs locally. Reads files only; the one network access is a quick look at ports on this computer.
 */

/** Files that mark the root of an app, in any ecosystem. */
export const APP_MARKERS = [
  'package.json', 'requirements.txt', 'pyproject.toml', 'Pipfile', 'manage.py', 'Gemfile', 'go.mod', 'Cargo.toml',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'build.sbt', 'composer.json', 'mix.exs', 'pubspec.yaml', 'Package.swift', 'deno.json',
];
const isAppMarker = (name: string) => APP_MARKERS.includes(name) || /\.(csproj|fsproj|sln)$/.test(name);

const SKIP = new Set(['node_modules', 'vendor', 'dist', 'build', 'out', 'target', 'bin', 'obj', 'coverage', 'examples', 'example', 'docs', 'test', 'tests', 'e2e', 'scripts', 'tools', 'infra', 'terraform', 'android', 'ios']);
const MAX_APPS = 10;

export interface DetectedSource {
  name: string;
  path: string;
  role: ResolvedRole;
  stack: string[];
  pages: number;
  endpoints: number;
  calls: number;
}

export interface DetectedProject {
  name: string;
  sources: DetectedSource[];
  /** Local URLs where the app may be running, the reachable ones first. */
  urls: { url: string; reachable: boolean; source: string }[];
}

async function entries(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function hasMarker(dir: string): Promise<boolean> {
  return (await entries(dir)).some((e) => e.isFile() && isAppMarker(e.name));
}

/** A JS workspace root or a folder holding several apps is a container, not an app of its own. */
async function isWorkspaceRoot(dir: string): Promise<boolean> {
  try {
    const pkg = JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
    if (pkg.workspaces) return true;
  } catch {
    /* no package.json */
  }
  return ['pnpm-workspace.yaml', 'turbo.json', 'nx.json', 'lerna.json', 'go.work'].some((f) => existsSync(join(dir, f)));
}

/** App folders one or two levels below `root`, shallowest first; an app's own subfolders are not searched. */
async function subApps(root: string): Promise<string[]> {
  const found: string[] = [];
  const visit = async (dir: string, depth: number) => {
    for (const e of await entries(dir)) {
      if (!e.isDirectory() || e.name.startsWith('.') || SKIP.has(e.name) || found.length >= MAX_APPS) continue;
      const child = join(dir, e.name);
      if (await hasMarker(child)) found.push(child);
      else if (depth < 2) await visit(child, depth + 1);
    }
  };
  await visit(root, 1);
  return found;
}

/** Dev-server ports by stack, and any port the app's own config names. */
const DEFAULT_PORTS: [RegExp, number][] = [
  [/^Vite$|SvelteKit|Solid|Qwik|Preact/, 5173],
  [/^Astro$/, 4321],
  [/^Angular$/, 4200],
  [/^Next\.js$|Remix|Nuxt|Ruby on Rails|Express|NestJS|Fastify|Hono|Koa|Gatsby/, 3000],
  [/Django|FastAPI|Laravel|Symfony/, 8000],
  [/^Flask$/, 5000],
  [/Spring|Ktor|Gin|Echo|Fiber|chi|Gorilla|Go net\/http|Quarkus|Micronaut|Vapor|Axum|Actix|Rocket/, 8080],
  [/ASP\.NET/, 5000],
  [/Phoenix/, 4000],
];

async function configuredPorts(dir: string): Promise<number[]> {
  const ports: number[] = [];
  const read = async (f: string) => readFile(join(dir, f), 'utf8').catch(() => '');
  const pkg = await read('package.json');
  for (const m of pkg.matchAll(/(?:--port[ =]|-p\s+|PORT=)(\d{2,5})/g)) ports.push(Number(m[1]));
  for (const f of ['vite.config.ts', 'vite.config.js', 'vite.config.mjs', 'application.properties', '.env.example', 'Properties/launchSettings.json']) {
    for (const m of (await read(f)).matchAll(/\bport\s*[:=]\s*(\d{2,5})|server\.port\s*=\s*(\d{2,5})|PORT\s*=\s*(\d{2,5})|localhost:(\d{2,5})/gi)) ports.push(Number(m[1] ?? m[2] ?? m[3] ?? m[4]));
  }
  return ports.filter((p) => p > 0 && p < 65536);
}

/** Whether something answers on this computer at `port`. Loopback only, one quick request. */
async function answers(port: number): Promise<boolean> {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(800) });
    return true;
  } catch {
    return false;
  }
}

export async function detectProject(folder: string, opts: ScanOptions & { probe?: boolean } = {}): Promise<DetectedProject> {
  const root = resolve(folder);
  if (!existsSync(root)) throw new Error(`Folder not found: ${root}`);
  // An app folder is one source (its subfolders are part of it). A workspace root, or a folder with
  // no manifest of its own, is split into the apps inside it.
  const rootIsApp = (await hasMarker(root)) && !(await isWorkspaceRoot(root));
  const apps = rootIsApp ? [] : await subApps(root);
  const dirs = apps.length ? apps : [root];

  const sources: DetectedSource[] = [];
  const taken = new Set<string>();
  for (const dir of dirs) {
    const r = await scanRepo(dir, opts);
    let name = basename(dir).replace(/[^A-Za-z0-9._-]/g, '-') || 'app';
    for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${basename(dir)}-${n}`;
    taken.add(name.toLowerCase());
    sources.push({
      name,
      path: dir,
      role: inferRole(r),
      stack: stackNames(r),
      pages: r.routes.filter((x) => x.kind === 'page').length,
      endpoints: r.routes.filter((x) => x.kind === 'api').length,
      calls: r.apiCalls.length,
    });
  }

  // Where the UI probably runs: the app's configured port, else its stack's default dev port.
  const candidates = new Map<number, string>();
  for (const s of [...sources].sort((a, b) => Number(a.role === 'backend') - Number(b.role === 'backend'))) {
    for (const p of await configuredPorts(s.path)) if (!candidates.has(p)) candidates.set(p, s.name);
    const stackPort = DEFAULT_PORTS.find(([re]) => s.stack.some((n) => re.test(n)))?.[1];
    if (stackPort && !candidates.has(stackPort)) candidates.set(stackPort, s.name);
  }
  const urls = await Promise.all(
    [...candidates].slice(0, 6).map(async ([port, source]) => ({ url: `http://localhost:${port}`, reachable: opts.probe === false ? false : await answers(port), source })),
  );
  urls.sort((a, b) => Number(b.reachable) - Number(a.reachable));

  return { name: titleCase(basename(root)), sources, urls };
}

function titleCase(s: string): string {
  return s.replace(/[-_.]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'My app';
}
