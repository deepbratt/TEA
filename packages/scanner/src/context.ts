import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { RepoContext } from '@tea-qa/core';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.output', '.vercel', '.turbo', '.cache',
  'dist', 'build', 'out', 'coverage', '.expo', 'ios/Pods', 'Pods', '__pycache__', '.venv', 'venv',
  'env', '.mypy_cache', '.pytest_cache', 'vendor', 'tmp', 'log', 'tea-report', '.gradle', 'DerivedData',
]);

const MAX_FILES = 25_000;
const MAX_READ_BYTES = 2 * 1024 * 1024;

export async function walk(root: string): Promise<string[]> {
  const out: string[] = [];
  async function visit(dir: string): Promise<void> {
    if (out.length >= MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_FILES) return;
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        if (IGNORED_DIRS.has(e.name)) continue;
        await visit(abs);
      } else if (e.isFile()) {
        out.push(relative(root, abs).split(sep).join('/'));
      }
    }
  }
  await visit(root);
  return out.sort();
}

export async function createRepoContext(root: string): Promise<RepoContext> {
  const files = await walk(root);
  const fileSet = new Set(files);
  const cache = new Map<string, string>();

  const read = async (file: string): Promise<string> => {
    const hit = cache.get(file);
    if (hit !== undefined) return hit;
    const abs = join(root, file);
    let text = '';
    try {
      const s = await stat(abs);
      if (s.size <= MAX_READ_BYTES) text = await readFile(abs, 'utf8');
    } catch {
      /* unreadable */
    }
    cache.set(file, text);
    return text;
  };

  const deps = new Set<string>();
  let packageJson: Record<string, any> | undefined;

  // Every package.json in the repo (monorepos, apps/web, mobile/ ...).
  for (const f of files.filter((f) => f === 'package.json' || f.endsWith('/package.json'))) {
    try {
      const pkg = JSON.parse(await read(f));
      if (f === 'package.json') packageJson = pkg;
      for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const name of Object.keys(pkg[k] ?? {})) deps.add(name);
      }
    } catch {
      /* invalid JSON */
    }
  }
  for (const f of files.filter((f) => /(^|\/)requirements[^/]*\.txt$/.test(f))) {
    for (const line of (await read(f)).split('\n')) {
      const m = /^\s*([A-Za-z0-9_.-]+)/.exec(line);
      if (m && !line.trim().startsWith('#')) deps.add(m[1]!.toLowerCase());
    }
  }
  for (const f of files.filter((f) => /(^|\/)pyproject\.toml$/.test(f))) {
    for (const m of (await read(f)).matchAll(/^\s*"?([A-Za-z0-9_.-]+)\s*(?:[<>=~!^]|"|\s*=\s*["{])/gm)) {
      deps.add(m[1]!.toLowerCase());
    }
  }
  for (const f of files.filter((f) => /(^|\/)Gemfile$/.test(f))) {
    for (const m of (await read(f)).matchAll(/^\s*gem\s+['"]([^'"]+)['"]/gm)) deps.add(m[1]!);
  }

  return {
    root,
    files,
    has: (file) => fileSet.has(file),
    find: (pred) => files.filter(pred),
    read,
    deps,
    packageJson,
  };
}

/** 1-based line number of a character offset. */
export function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export const SOURCE_EXT = /\.(m?[jt]sx?|cjs|vue|svelte|astro|py|rb|php|go|java|kt|cs)$/;
export const isTestPath = (f: string) => /(\.test|\.spec|\.stories)\.[a-z]+$/.test(f) || /(^|\/)(__tests__|__fixtures__|tests?|e2e|cypress)\//.test(f);
export const isSource = (f: string) => SOURCE_EXT.test(f) && !isTestPath(f);
