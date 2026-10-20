import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import type { Severity } from './types.js';

/**
 * The check catalog: every check TEA knows is a YAML entry, not hard-coded logic, so packs can
 * be ranked, updated and extended without a TEA upgrade. Free entries ship here with their rule
 * and fix prompt. Pro entries ship here only as stubs; their rules and prompts come from a
 * licensed pro pack loaded at runtime.
 */

export type CheckCategory =
  | 'functional' | 'security' | 'wiring' | 'db-scale' | 'prod-ready' | 'code-health'
  | 'performance' | 'accessibility' | 'seo' | 'features' | 'ux';

export interface CheckEntry {
  id: string;
  title: string;
  category: CheckCategory;
  severity: Severity;
  stacks?: string[];
  detect?: 'static-rule' | 'crawl' | 'sandbox-test' | 'ai-review';
  rule?: string;
  criteria?: { pass?: string; warn?: string; fail?: string };
  fix_prompt?: string;
  suggest_only?: boolean;
  pack: 'free' | 'pro';
  version: number;
  risk_at_scale?: string;
  /** Set by the loader: which catalog or pack the entry came from, and its root folder. */
  source?: { name: string; root: string };
}

export interface PackSource {
  /** e.g. "tea-pro" */
  name: string;
  /** Folder holding the pack's <category>/<id>.yaml entries and prompts/. */
  dir: string;
}

export interface Catalog {
  entries: CheckEntry[];
  get(id: string): CheckEntry | undefined;
  /** Free checks plus pro checks whose real rules were loaded from a licensed pack. */
  runnable: CheckEntry[];
  /** Pro checks known only as stubs (no licence or no pack): shown by id and title only. */
  lockedPro: CheckEntry[];
  /** Packs that were loaded, and packs that were skipped with the reason. */
  packs: { name: string; loaded: boolean; reason?: string }[];
}

export class CatalogError extends Error {}

export const BUILTIN_CATALOG_DIR = fileURLToPath(new URL('../checks', import.meta.url));

const schema = JSON.parse(readFileSync(join(BUILTIN_CATALOG_DIR, 'check.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateEntry = ajv.compile<CheckEntry>(schema);

async function yamlFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'prompts') out.push(...(await yamlFiles(abs)));
    } else if (/\.ya?ml$/.test(e.name)) {
      out.push(abs);
    }
  }
  return out.sort();
}

async function readEntries(root: string, name: string, mode: 'public' | 'pack'): Promise<CheckEntry[]> {
  const entries: CheckEntry[] = [];
  for (const file of await yamlFiles(root)) {
    const rel = relative(root, file).split(sep).join('/');
    const raw = parse(await readFile(file, 'utf8'));
    if (!validateEntry(raw)) {
      const why = (validateEntry.errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message}`).join('; ');
      throw new CatalogError(`${name}/${rel}: invalid check entry: ${why}`);
    }
    const entry = raw as CheckEntry;
    if (mode === 'public' && entry.pack === 'pro' && (entry.rule || entry.fix_prompt || entry.criteria)) {
      // Guard rail: pro rules and prompts must never be written into the public catalog.
      throw new CatalogError(`${name}/${rel}: pro check "${entry.id}" must be a stub here (no rule, criteria or fix_prompt).`);
    }
    if (mode === 'pack' && (entry.pack !== 'pro' || !entry.rule || !entry.fix_prompt)) {
      throw new CatalogError(`${name}/${rel}: pack entries must be pro checks with a rule and a fix_prompt.`);
    }
    if (entry.fix_prompt && !existsSync(resolvePrompt(root, entry.fix_prompt))) {
      throw new CatalogError(`${name}/${rel}: fix_prompt not found: ${entry.fix_prompt}`);
    }
    entries.push({ ...entry, source: { name, root } });
  }
  return entries;
}

function resolvePrompt(root: string, prompt: string): string {
  const abs = resolve(root, prompt);
  if (relative(root, abs).startsWith('..')) throw new CatalogError(`fix_prompt escapes its catalog: ${prompt}`);
  return abs;
}

export interface LoadCatalogOptions {
  /** Extra public catalog folders (community rule packs). Same rules as the built-in catalog. */
  dirs?: string[];
  /** Licensed pro packs. Loaded only with a licence key. */
  packs?: PackSource[];
  licenseKey?: string;
}

/** Pro packs and the licence key come from TEA_PRO_PACK (a folder) and TEA_LICENSE_KEY. */
export function packsFromEnv(env: NodeJS.ProcessEnv = process.env): Pick<LoadCatalogOptions, 'packs' | 'licenseKey'> {
  const packs = env.TEA_PRO_PACK ? [{ name: 'tea-pro', dir: resolve(env.TEA_PRO_PACK) }] : [];
  return { packs, licenseKey: env.TEA_LICENSE_KEY || undefined };
}

export async function loadCatalog(opts: LoadCatalogOptions = {}): Promise<Catalog> {
  const byId = new Map<string, CheckEntry>();
  for (const [name, dir] of [['tea', BUILTIN_CATALOG_DIR] as const, ...(opts.dirs ?? []).map((d) => [d, d] as const)]) {
    for (const e of await readEntries(dir, name, 'public')) {
      if (byId.has(e.id)) throw new CatalogError(`Duplicate check id "${e.id}" in ${name}.`);
      byId.set(e.id, e);
    }
  }

  const packs: Catalog['packs'] = [];
  for (const pack of opts.packs ?? []) {
    if (!opts.licenseKey) {
      packs.push({ name: pack.name, loaded: false, reason: 'no TEA_LICENSE_KEY set' });
      continue;
    }
    if (!existsSync(pack.dir)) {
      packs.push({ name: pack.name, loaded: false, reason: `folder not found: ${pack.dir}` });
      continue;
    }
    // Licence keys are verified by the pack itself and TEA Cloud; the engine only gates loading.
    for (const e of await readEntries(pack.dir, pack.name, 'pack')) byId.set(e.id, e);
    packs.push({ name: pack.name, loaded: true });
  }

  const entries = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  const isLocked = (e: CheckEntry) => e.pack === 'pro' && !e.rule;
  return {
    entries,
    get: (id) => byId.get(id),
    runnable: entries.filter((e) => !isLocked(e)),
    lockedPro: entries.filter(isLocked),
    packs,
  };
}

/** The catalog entry a finding belongs to: finding ids look like "<check id>:<location>". */
export function checkIdOf(findingId: string): string {
  return findingId.split(':')[0]!;
}

/** Fill a fix-prompt template. Unknown placeholders are left as they are. */
export async function renderFixPrompt(entry: CheckEntry, vars: Record<string, string | undefined>): Promise<string | undefined> {
  if (!entry.fix_prompt || !entry.source) return undefined;
  const template = await readFile(resolvePrompt(entry.source.root, entry.fix_prompt), 'utf8');
  return template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? (k === 'file' ? 'the file that renders it' : m)).trim();
}
