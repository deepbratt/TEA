import { existsSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';

/** True when `target` is strictly inside `root` (not root itself, not a sibling, not elsewhere). */
export function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !rel.startsWith('../') && !isAbsolute(rel);
}

/**
 * Resolve a relative path that must stay inside `root`, following symlinks when the target
 * exists so a link can't point outside. Returns null for absolute paths or anything that escapes.
 */
export function resolveInside(root: string, path: string): string | null {
  if (isAbsolute(path)) return null;
  const abs = resolve(root, path);
  if (!isInside(root, abs)) return null;
  if (existsSync(abs) && existsSync(root) && !isInside(realpathSync(root), realpathSync(abs))) return null;
  return abs;
}
