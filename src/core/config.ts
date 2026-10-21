import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { masker } from './mask.js';
import { SEVERITIES } from './types.js';

const Account = z.object({
  role: z.string().default('user'),
  email: z.string(),
  password: z.string(),
});

export const ConfigSchema = z
  .object({
    /** Base URLs TEA may test. The first one is the main target. */
    urls: z.array(z.string().url()).default([]),
    repo: z.string().optional(),
    /** Extra hosts TEA may navigate to (the target URLs' hosts are always allowed). */
    allowlist: z.array(z.string()).default([]),
    /** Route globs TEA must never visit, e.g. "/admin/**". */
    skip: z.array(z.string()).default([]),
    accounts: z.array(Account).default([]),
    seed: z.record(z.unknown()).optional(),
    crawl: z
      .object({
        maxPages: z.number().int().positive().default(50),
        timeoutMs: z.number().int().positive().default(30_000),
        slowPageMs: z.number().int().positive().default(3_000),
        viewport: z.object({ width: z.number(), height: z.number() }).default({ width: 1280, height: 800 }),
      })
      .default({}),
    load: z
      .object({
        maxUsers: z.number().int().positive().default(100),
        maxDurationSec: z.number().int().positive().default(180),
        maxRequests: z.number().int().positive().default(20_000),
      })
      .default({}),
    llm: z
      .object({
        provider: z.enum(['none', 'openai', 'anthropic', 'gemini', 'ollama']).default('none'),
        model: z.string().optional(),
        budgetUsd: z.number().nonnegative().default(1),
      })
      .default({}),
    plugins: z.array(z.string()).default([]),
    failOn: z.enum([...SEVERITIES, 'none'] as [string, ...string[]]).default('critical'),
  })
  .strict();

export type TeaConfig = z.infer<typeof ConfigSchema>;

export const CONFIG_FILE = 'tea.yaml';

export class ConfigError extends Error {}

export function parseConfig(raw: unknown): TeaConfig {
  const result = ConfigSchema.safeParse(raw ?? {});
  if (!result.success) {
    const msg = result.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n');
    throw new ConfigError(`Invalid ${CONFIG_FILE}:\n${msg}`);
  }
  return result.data;
}

/** Only TEA_* variables may be read from tea.yaml, so a hostile config can't pull other secrets. */
export const CONFIG_ENV_PREFIX = 'TEA_';

function expandString(value: string, env: NodeJS.ProcessEnv): string {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => {
    if (!name.startsWith(CONFIG_ENV_PREFIX)) {
      throw new ConfigError(`${CONFIG_FILE} may only read environment variables that start with ${CONFIG_ENV_PREFIX} (found \${${name}}).`);
    }
    const v = env[name];
    if (v === undefined) throw new ConfigError(`${CONFIG_FILE} uses \${${name}} but that environment variable is not set.`);
    masker.add(v);
    return v;
  });
}

/**
 * Replace ${TEA_NAME} with the env var in account credentials only, so passwords stay out of
 * tea.yaml. Other fields (urls, allowlist...) are never expanded: a config that could put
 * env values into a URL could send them to any host. Expanded values are masked.
 */
export function expandEnv<T>(raw: T, env: NodeJS.ProcessEnv = process.env): T {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { accounts?: unknown }).accounts)) return raw;
  const accounts = (raw as unknown as { accounts: unknown[] }).accounts.map((a) => {
    if (!a || typeof a !== 'object') return a;
    const out = { ...(a as Record<string, unknown>) };
    for (const key of ['email', 'password'] as const) {
      if (typeof out[key] === 'string') out[key] = expandString(out[key] as string, env);
    }
    return out;
  });
  return { ...(raw as object), accounts } as T;
}

/**
 * Load tea.yaml. Zero setup is the default: a missing file means all defaults.
 * Lookup order: explicit path, then the repo root, then the current directory.
 */
export async function loadConfig(opts: { path?: string; repo?: string; cwd?: string } = {}): Promise<{
  config: TeaConfig;
  file?: string;
}> {
  const cwd = opts.cwd ?? process.cwd();
  const candidates = opts.path
    ? [resolve(cwd, opts.path)]
    : [opts.repo && join(resolve(cwd, opts.repo), CONFIG_FILE), join(cwd, CONFIG_FILE)].filter(Boolean) as string[];

  for (const file of candidates) {
    if (existsSync(file)) {
      const text = await readFile(file, 'utf8');
      return { config: parseConfig(expandEnv(parse(text) ?? {})), file };
    }
  }
  if (opts.path) throw new ConfigError(`Config file not found: ${opts.path}`);
  return { config: parseConfig({}) };
}
