import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { delimiter, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { parse } from 'yaml';
import { resolveInside } from './paths.js';
import type { Severity } from './types.js';

/**
 * The check catalog: every check TEA knows is a YAML entry, not hard-coded logic, so checks can
 * be ranked, updated and extended without a TEA upgrade. Everything is open source: there are no
 * locked or licensed checks. A check whose detector isn't built yet has no `rule` and is listed
 * as planned. Extra catalog folders (community packs) load the same way as the built-in one.
 */

export type CheckCategory =
  | 'functional' | 'security' | 'wiring' | 'db-scale' | 'prod-ready' | 'code-health'
  | 'performance' | 'accessibility' | 'seo' | 'features' | 'ux';

export interface CheckEntry {
  id: string;
  title: string;
  /** One plain-English sentence: what the check catches. */
  description?: string;
  category: CheckCategory;
  severity: Severity;
  stacks?: string[];
  detect?: 'static-rule' | 'crawl' | 'sandbox-test' | 'ai-review';
  rule?: string;
  criteria?: { pass?: string; warn?: string; fail?: string };
  fix_prompt?: string;
  suggest_only?: boolean;
  version: number;
  risk_at_scale?: string;
  /** Settings users can change per check in their rules, with defaults. */
  params?: Record<string, CheckParam>;
  /** Set by the loader: which catalog the entry came from, and its root folder. */
  source?: { name: string; root: string };
  /** Set by the loader: the fix_prompt template's text. */
  promptTemplate?: string;
}

export interface CheckParam {
  default: number | string | boolean;
  description: string;
  min?: number;
  max?: number;
}

export interface Catalog {
  entries: CheckEntry[];
  get(id: string): CheckEntry | undefined;
  /** Checks TEA can run today. */
  runnable: CheckEntry[];
  /** Checks whose detector isn't built yet: listed so users see what's coming. */
  planned: CheckEntry[];
}

/** A check is planned until it has a detector rule. */
export const isPlanned = (e: Pick<CheckEntry, 'rule'>): boolean => !e.rule;

export class CatalogError extends Error {}

export const BUILTIN_CATALOG_DIR = fileURLToPath(new URL('../../checks', import.meta.url));

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

async function readEntries(root: string, name: string): Promise<CheckEntry[]> {
  const entries: CheckEntry[] = [];
  for (const file of await yamlFiles(root)) {
    const rel = relative(root, file).split(sep).join('/');
    const raw = parse(await readFile(file, 'utf8'));
    if (!validateEntry(raw)) {
      const why = (validateEntry.errors ?? []).map((e) => `${e.instancePath || '(root)'} ${e.message}`).join('; ');
      throw new CatalogError(`${name}/${rel}: invalid check entry: ${why}`);
    }
    const entry = raw as CheckEntry;
    let promptTemplate: string | undefined;
    if (entry.fix_prompt) {
      const file = resolveInside(root, entry.fix_prompt);
      if (!file) throw new CatalogError(`${name}/${rel}: fix_prompt escapes its catalog: ${entry.fix_prompt}`);
      if (!existsSync(file)) throw new CatalogError(`${name}/${rel}: fix_prompt not found: ${entry.fix_prompt}`);
      promptTemplate = (await readFile(file, 'utf8')).trim();
    }
    entries.push({ ...entry, source: { name, root }, promptTemplate });
  }
  return entries;
}

export interface LoadCatalogOptions {
  /** Extra catalog folders (community check packs). Same format as the built-in catalog. */
  dirs?: string[];
}

/** Extra catalog folders from TEA_CHECKS (separated like PATH). */
export function catalogFromEnv(env: NodeJS.ProcessEnv = process.env): LoadCatalogOptions {
  const dirs = (env.TEA_CHECKS ?? '').split(delimiter).map((d) => d.trim()).filter(Boolean).map((d) => resolve(d));
  return dirs.length ? { dirs } : {};
}

export async function loadCatalog(opts: LoadCatalogOptions = {}): Promise<Catalog> {
  const byId = new Map<string, CheckEntry>();
  for (const [name, dir] of [['tea', BUILTIN_CATALOG_DIR] as const, ...(opts.dirs ?? []).map((d) => [d, d] as const)]) {
    if (!existsSync(dir)) throw new CatalogError(`Check folder not found: ${dir}`);
    for (const e of await readEntries(dir, name)) {
      if (byId.has(e.id)) throw new CatalogError(`Duplicate check id "${e.id}" in ${name}.`);
      byId.set(e.id, e);
    }
  }

  const entries = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  return {
    entries,
    get: (id) => byId.get(id),
    runnable: entries.filter((e) => !isPlanned(e)),
    planned: entries.filter(isPlanned),
  };
}

/** The catalog entry a finding belongs to: finding ids look like "<check id>:<location>". */
export function checkIdOf(findingId: string): string {
  return findingId.split(':')[0]!;
}

export interface PromptVars {
  route?: string;
  /** The likely file, e.g. "app/pricing/page.tsx:12". */
  file?: string;
  /** Observed evidence, already wrapped in an untrusted-evidence block. */
  evidence?: string;
}

const PROMPT_FALLBACK: Required<PromptVars> = { route: 'this page', file: 'the file that renders it', evidence: '' };

/** Fill a check's fix-prompt template. Missing values get a neutral fallback. */
export function renderFixPrompt(entry: CheckEntry | undefined, vars: PromptVars): string | undefined {
  if (!entry?.promptTemplate) return undefined;
  return entry.promptTemplate
    .replace(/\{(route|file|evidence)\}/g, (_, k: keyof PromptVars) => vars[k] ?? PROMPT_FALLBACK[k])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
