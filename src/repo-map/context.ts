import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import type { RepoContext } from '../core/index.js';

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.next', '.nuxt', '.svelte-kit', '.output', '.vercel', '.turbo', '.cache',
  'dist', 'build', 'out', 'coverage', '.expo', 'ios/Pods', 'Pods', '__pycache__', '.venv', 'venv',
  'env', '.mypy_cache', '.pytest_cache', 'vendor', 'tmp', 'log', 'tea-report', '.gradle', 'DerivedData',
  'target', 'obj', 'bin', '_build', 'deps', '.dart_tool', '.idea', '.tea', '.elixir_ls', '.build', 'Carthage',
]);

const all = (text: string, re: RegExp, group = 1) => [...text.matchAll(re)].map((m) => m[group]!);

/** The section of a TOML/YAML-ish file under a header, up to the next header. */
function section(text: string, header: RegExp, next: RegExp): string {
  const start = header.exec(text);
  if (!start) return '';
  const rest = text.slice(start.index + start[0].length);
  const end = next.exec(rest);
  return end ? rest.slice(0, end.index) : rest;
}

/**
 * Dependency names from each ecosystem's manifest, so stack detection works the same way for every
 * language. Names are kept as the ecosystem writes them (Go module paths, Maven artifactIds, ...).
 */
const MANIFESTS: [RegExp, (text: string) => string[]][] = [
  // Go: require lines in go.mod, single or in a block.
  [/(^|\/)go\.mod$/, (t) => all(t, /^\s*(?:require\s+)?([a-z0-9.-]+\.[a-z]{2,}\/[^\s]+)\s+v[\d.]/gm)],
  // Rust: names in the [dependencies] sections of Cargo.toml.
  [/(^|\/)Cargo\.toml$/, (t) => all(section(t, /^\[(?:dev-|build-)?dependencies\]\s*$/m, /^\[/m), /^\s*([A-Za-z0-9_-]+)\s*=/gm)],
  // Java/Kotlin: Maven artifactIds and Gradle coordinates ("group:artifact:version").
  [/(^|\/)pom\.xml$/, (t) => all(t, /<artifactId>\s*([^<\s]+)\s*<\/artifactId>/g)],
  [/(^|\/)build\.gradle(\.kts)?$/, (t) => all(t, /["']([\w.-]+):([\w.-]+)(?::[^"']*)?["']/g, 2)],
  // C#: NuGet package references.
  [/\.(cs|fs|vb)proj$/, (t) => all(t, /<PackageReference\s+Include\s*=\s*"([^"]+)"/gi).map((n) => n.toLowerCase())],
  // PHP: composer.json require sections.
  [
    /(^|\/)composer\.json$/,
    (t) => {
      try {
        const j = JSON.parse(t);
        return [...Object.keys(j.require ?? {}), ...Object.keys(j['require-dev'] ?? {})];
      } catch {
        return [];
      }
    },
  ],
  // Elixir: {:phoenix, "~> 1.7"} in mix.exs.
  [/(^|\/)mix\.exs$/, (t) => all(t, /\{\s*:([a-z0-9_]+)\s*,/g)],
  // Dart/Flutter: keys under dependencies: in pubspec.yaml.
  [/(^|\/)pubspec\.yaml$/, (t) => all(section(t, /^(?:dev_)?dependencies:\s*$/m, /^\S/m), /^ {2}([a-z0-9_]+)\s*:/gm)],
  // Swift: .package(url: ".../vapor.git", ...) in Package.swift.
  [/(^|\/)Package\.swift$/, (t) => all(t, /\.package\(\s*url:\s*"[^"]*\/([\w.-]+?)(?:\.git)?"/g).map((n) => n.toLowerCase())],
  // Python: Pipfile [packages].
  [/(^|\/)Pipfile$/, (t) => all(section(t, /^\[(?:dev-)?packages\]\s*$/m, /^\[/m), /^\s*"?([A-Za-z0-9_.-]+)"?\s*=/gm).map((n) => n.toLowerCase())],
];

const MAX_FILES = 25_000;
const MAX_READ_BYTES = 2 * 1024 * 1024;

async function walk(root: string): Promise<string[]> {
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
  let packageJson: Record<string, unknown> | undefined;

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
  for (const [re, parse] of MANIFESTS) {
    for (const f of files.filter((f) => re.test(f))) for (const name of parse(await read(f))) deps.add(name);
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

const SOURCE_EXT = /\.(m?[jt]sx?|cjs|vue|svelte|astro|py|rb|php|go|java|kt|kts|scala|cs|fs|rs|ex|exs|dart|swift|erb|cshtml|razor)$/;
export const isTestPath = (f: string) => /(\.test|\.spec|\.stories)\.[a-z]+$/.test(f) || /(^|\/)(__tests__|__fixtures__|tests?|e2e|cypress)\//.test(f);
export const isSource = (f: string) => SOURCE_EXT.test(f) && !isTestPath(f);
