import { createRepoContext, isSource } from '../repo-map/context.js';
import type { SourceFolder } from '../repo-map/index.js';

/**
 * What the docs check compares claims against: every file name, every dependency, and the code of
 * every source file with its comments removed (so "// TODO: rate limit" doesn't count as a rate limit).
 */
export interface CodeIndex {
  files: string[];
  deps: Set<string>;
  /** Source text by file, comments stripped. */
  code: Map<string, string>;
  /** Doc files by path, raw text. */
  docs: Map<string, string>;
}

const MAX_CODE_FILES = 6_000;

/** Agent instructions, READMEs, TODOs, PRDs and specs: where the docs say what's built. */
const DOC_FILE =
  /(^|\/)((CLAUDE|AGENTS|GEMINI|README|TODO|ROADMAP|FEATURES|PRD|SPEC|SPECS|REQUIREMENTS|PLAN)([._-][^/]*)?\.(md|mdx|markdown|txt)|\.cursorrules|\.windsurfrules|\.clinerules|copilot-instructions\.md|[^/]+\.mdc)$/i;
const DOC_DIR_OK = /^(|docs?\/|\.cursor\/rules\/|\.github\/|\.windsurf\/rules\/)$/i;

export function isDocFile(file: string): boolean {
  if (!DOC_FILE.test(file)) return false;
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/') + 1) : '';
  return DOC_DIR_OK.test(dir);
}

/** Remove comments from C-like, Python/Ruby/shell-like and HTML/JSX code. Strings are left alone. */
export function stripComments(text: string, file: string): string {
  let s = text.replace(/<!--[\s\S]*?-->/g, ' ');
  if (/\.(py|rb|ex|exs|sh|ya?ml|toml|r)$/i.test(file)) {
    s = s.replace(/("""|''')[\s\S]*?\1/g, ' ').replace(/(^|[^\w"'$])#(?!\{).*$/gm, '$1');
  }
  if (!/\.(py|rb)$/i.test(file)) {
    s = s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:"'`\\\w])\/\/.*$/gm, '$1');
  }
  return s;
}

/** Read every folder of a project. File paths get the folder's name in front when there are several. */
export async function buildCodeIndex(sources: SourceFolder[]): Promise<CodeIndex> {
  const index: CodeIndex = { files: [], deps: new Set(), code: new Map(), docs: new Map() };
  const many = sources.length > 1;
  for (const src of sources) {
    const ctx = await createRepoContext(src.path);
    const p = (f: string) => (many ? `${src.name}/${f}` : f);
    ctx.deps.forEach((d) => index.deps.add(d));
    for (const f of ctx.files) {
      index.files.push(p(f));
      if (isDocFile(f)) index.docs.set(p(f), await ctx.read(f));
      else if (isSource(f) && index.code.size < MAX_CODE_FILES) index.code.set(p(f), stripComments(await ctx.read(f), f));
    }
  }
  return index;
}
