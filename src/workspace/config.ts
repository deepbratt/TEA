import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { isMap, parseDocument, type Document } from 'yaml';
import { z } from 'zod';
import { DEFAULT_GATE, GateSchema, RulesSchema, classifyUrl, validateRules, type Catalog } from '../core/index.js';
import { CustomRuleSchema } from '../custom/index.js';
import { SOURCE_ROLES, type SourceFolder } from '../repo-map/index.js';

/**
 * The workspace config file (tea.config.yaml): projects, rules (the quality profile) and the quality
 * gate. The UI reads it on every request and rewrites it on save; people can edit it by hand too.
 * Writes are validated, atomic and keep the file's comments.
 */

const KEY = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const SourceSchema = z
  .object({
    name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,62}$/, 'Use letters, numbers, dots, dashes or underscores'),
    path: z.string().min(1),
    /** frontend, backend, fullstack, or auto (decided from the code). */
    role: z.enum(SOURCE_ROLES).default('auto'),
  })
  .strict();

export const ProjectSchema = z
  .object({
    key: z.string().regex(KEY, 'Use lowercase letters, numbers and dashes'),
    name: z.string().min(1).max(120),
    url: z.string().url().optional(),
    sources: z.array(SourceSchema).max(10).default([]),
    maxPages: z.number().int().min(1).max(500).optional(),
    skip: z.array(z.string().min(1)).max(100).optional(),
    /** Overrides the workspace gate for this project. */
    gate: GateSchema.optional(),
    /** Sandbox tests: submit forms with test data and call APIs directly. Only for an app on this computer. */
    sandbox: z.boolean().optional(),
    /** Features to leave out of the feature report: things TEA listed that aren't features. */
    features: z.object({ hide: z.array(z.string().min(1).max(120)).max(500).default([]) }).strict().optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (!p.url && !p.sources.length) ctx.addIssue({ code: 'custom', message: 'Add a live URL or at least one source folder.' });
    const names = p.sources.map((s) => s.name.toLowerCase());
    if (new Set(names).size !== names.length) ctx.addIssue({ code: 'custom', path: ['sources'], message: 'Each folder needs a different name.' });
    if (p.url && !/^https?:\/\//i.test(p.url)) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Use an http or https address.' });
    else if (p.sandbox && p.url && classifyUrl(p.url) !== 'local') {
      ctx.addIssue({ code: 'custom', path: ['sandbox'], message: 'Sandbox tests submit forms with test data, so they only run on an app on this computer (a localhost URL).' });
    }
  });

export const WorkspaceSchema = z
  .object({
    version: z.literal(1).default(1),
    projects: z.array(ProjectSchema).default([]),
    rules: RulesSchema.default({}),
    /** Your own rules: forbid or require text, require files or routes. */
    customRules: z.array(CustomRuleSchema).max(200).default([]),
    gate: GateSchema.default(DEFAULT_GATE),
  })
  .strict()
  .superRefine((w, ctx) => {
    const keys = w.projects.map((p) => p.key);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', path: ['projects'], message: 'Each project needs a different key.' });
    const ids = w.customRules.map((r) => r.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', path: ['customRules'], message: 'Each custom rule needs a different id.' });
  });

export type Project = z.infer<typeof ProjectSchema>;
export type WorkspaceData = z.infer<typeof WorkspaceSchema>;

export const WORKSPACE_FILE = 'tea.config.yaml';

/** The text of a fresh config file (what "Reset to defaults" writes). */
export const defaultWorkspaceText = (): string => DEFAULT_TEXT;

const DEFAULT_TEXT = `# TEA workspace: your projects, the rules TEA checks and the quality gate.
# The TEA UI rewrites this file when you save; you can also edit it by hand.
# Paths are relative to this file. Docs: https://github.com/deepbratt/TEA
version: 1

# Each project: a live URL (optional) and one or more code folders, each a frontend,
# backend or fullstack app. Example:
#   - key: shop
#     name: My shop
#     url: http://localhost:3000
#     sources:
#       - { name: web, path: ../shop-web, role: frontend }
#       - { name: api, path: ../shop-api }      # role: auto (the default) lets TEA decide
projects: []

# Per-check settings (the quality profile). Checks not listed use their defaults.
#   crawl.slow: { enabled: true, severity: medium, params: { thresholdMs: 3000 } }
rules: {}

# Your own rules, no code needed. Types: forbid-text, require-text, require-file, require-route.
#   - { id: no-console-log, title: No console.log in the code, type: forbid-text, text: "console.log(", severity: low }
#   - { id: privacy-page, title: Has a privacy page, type: require-route, path: /privacy, severity: medium }
customRules: []

# The gate fails when any condition is met. Metrics: score, issues, critical, high,
# medium, low, an area (functional, api, performance, ...), broken-features or
# feature-coverage (% of features seen working). op: lt or gt.
gate:
  conditions:
    - { metric: critical, op: gt, value: 0 }
    - { metric: high, op: gt, value: 3 }
    - { metric: score, op: lt, value: 60 }
`;

export class WorkspaceError extends Error {
  constructor(message: string, readonly problems: string[] = []) {
    super(message);
  }
}

function zodProblems(err: z.ZodError): string[] {
  return err.issues.map((i) => `${i.path.join('.') || 'workspace'}: ${i.message}`);
}

export class Workspace {
  readonly file: string;
  readonly dir: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(file: string, private catalog?: Catalog) {
    this.file = resolve(file);
    this.dir = dirname(this.file);
  }

  /** The current file contents, created with commented defaults when missing. */
  async read(): Promise<{ data: WorkspaceData; text: string }> {
    if (!existsSync(this.file)) {
      await mkdir(this.dir, { recursive: true });
      await writeFile(this.file, DEFAULT_TEXT);
    }
    const text = await readFile(this.file, 'utf8');
    const doc = parseDocument(text);
    if (doc.errors.length) throw new WorkspaceError(`${this.file} is not valid YAML.`, doc.errors.map((e) => e.message));
    const parsed = WorkspaceSchema.safeParse(doc.toJS() ?? {});
    if (!parsed.success) throw new WorkspaceError(`${this.file} has invalid settings.`, zodProblems(parsed.error));
    return { data: parsed.data, text };
  }

  /**
   * Change the workspace and rewrite the file. `mutate` edits a copy of the data; only the
   * top-level sections it changed are rewritten, so comments elsewhere in the file survive.
   * Updates run one at a time.
   */
  update(mutate: (data: WorkspaceData) => void): Promise<WorkspaceData> {
    const next = this.queue.then(async () => {
      const { data, text } = await this.read();
      const draft = structuredClone(data);
      mutate(draft);
      const parsed = WorkspaceSchema.safeParse(draft);
      if (!parsed.success) throw new WorkspaceError('Those settings are not valid.', zodProblems(parsed.error));
      if (this.catalog) {
        const problems = validateRules(this.catalog, parsed.data.rules);
        if (problems.length) throw new WorkspaceError('Some rules are not valid.', problems);
      }
      const doc = parseDocument(text);
      for (const key of ['version', 'projects', 'rules', 'customRules', 'gate'] as const) {
        if (JSON.stringify(data[key]) !== JSON.stringify(parsed.data[key])) setSection(doc, key, parsed.data[key]);
      }
      await this.write(doc.toString({ lineWidth: 0 }));
      return parsed.data;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  /** The file as text, without validating it (so a broken file can still be shown and fixed). */
  async text(): Promise<string> {
    return existsSync(this.file) ? readFile(this.file, 'utf8') : DEFAULT_TEXT;
  }

  /** Replace the whole file with hand-edited text, after checking it the same way as read(). */
  replaceText(text: string): Promise<WorkspaceData> {
    const next = this.queue.then(async () => {
      const doc = parseDocument(text);
      if (doc.errors.length) throw new WorkspaceError('That is not valid YAML.', doc.errors.map((e) => e.message));
      const parsed = WorkspaceSchema.safeParse(doc.toJS() ?? {});
      if (!parsed.success) throw new WorkspaceError('Those settings are not valid.', zodProblems(parsed.error));
      if (this.catalog) {
        const problems = validateRules(this.catalog, parsed.data.rules);
        if (problems.length) throw new WorkspaceError('Some rules are not valid.', problems);
      }
      await this.write(text);
      return parsed.data;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private async write(text: string): Promise<void> {
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, text);
    await rename(tmp, this.file);
  }

  async project(key: string): Promise<Project | undefined> {
    return (await this.read()).data.projects.find((p) => p.key === key);
  }

  /** A project's folders with absolute paths (relative paths are relative to the config file). */
  sourcesOf(project: Project): SourceFolder[] {
    return project.sources.map((s) => ({ ...s, path: isAbsolute(s.path) ? s.path : resolve(this.dir, s.path) }));
  }
}

/** Replace one top-level section, keeping the comment written above it. */
function setSection(doc: Document, key: string, value: unknown): void {
  const contents = doc.contents;
  if (!isMap(contents)) {
    doc.set(key, value);
    return;
  }
  const pair = contents.items.find((p) => (p.key as { value?: unknown })?.value === key);
  const node = doc.createNode(value);
  if (pair) {
    const old = pair.value as { commentBefore?: string; comment?: string } | null;
    if (old?.commentBefore) (node as { commentBefore?: string }).commentBefore = old.commentBefore;
    pair.value = node;
  } else {
    doc.set(key, node);
  }
}

/** A URL-safe key from a project name. */
export function keyFromName(name: string, taken: string[] = []): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'project';
  let key = base;
  for (let n = 2; taken.includes(key); n++) key = `${base}-${n}`;
  return key;
}
