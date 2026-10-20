import type { Discovery, Finding, StackDetection } from './types.js';

/** Read-only view of the target repo handed to plugins. Paths are POSIX, relative to root. */
export interface RepoContext {
  root: string;
  files: string[];
  has(file: string): boolean;
  /** Files matching a predicate on their relative path. */
  find(pred: (file: string) => boolean): string[];
  read(file: string): Promise<string>;
  /** Merged dependency names from package.json, requirements.txt, pyproject.toml, Gemfile... */
  deps: Set<string>;
  packageJson?: Record<string, any>;
}

/**
 * A TEA plugin adds stack-specific knowledge on top of the generic core.
 * It switches on when any stack id in `activatesOn` was detected (or "always"),
 * or when its own detect() reports a stack. The other hooks only run when it is on.
 */
export interface TeaPlugin {
  name: string;
  activatesOn?: string[] | 'always';
  detect?(ctx: RepoContext): StackDetection[] | StackDetection | null | Promise<StackDetection[] | StackDetection | null>;
  discover?(ctx: RepoContext): Promise<Partial<Discovery>>;
  /** Static checks (milestone 3). */
  checks?(ctx: RepoContext, discovery: Discovery): Promise<Finding[]>;
}

export function definePlugin(plugin: TeaPlugin): TeaPlugin {
  return plugin;
}

export function emptyDiscovery(): Discovery {
  return { stack: [], routes: [], forms: [], auth: [], envVars: [], envFiles: [], database: [], payments: [], openapi: [], notes: [] };
}
