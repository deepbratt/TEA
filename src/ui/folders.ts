import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * Folder browser for the local UI's "Choose folder" dialog. Browsers can't give a web page a
 * real folder path, so the UI asks TEA's own server. Lists folder names only, never file
 * contents, and only for the person at this computer (the UI is loopback + token only).
 */

export interface FolderListing {
  path: string;
  parent: string | null;
  folders: { name: string; path: string; looksLikeApp: boolean }[];
  roots: string[];
}

const HIDDEN = new Set(['node_modules', '$RECYCLE.BIN', 'System Volume Information']);
const APP_MARKERS = ['package.json', 'requirements.txt', 'pyproject.toml', 'Gemfile', 'go.mod', 'pubspec.yaml', 'composer.json'];

function roots(): string[] {
  if (process.platform !== 'win32') return ['/'];
  return 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `${l}:\\`).filter((d) => existsSync(d));
}

export async function listFolders(path?: string): Promise<FolderListing> {
  const dir = resolve(path?.trim() || homedir());
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    throw new Error(`Can't open ${dir}.`);
  }
  const folders = entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !HIDDEN.has(e.name))
    .map((e) => ({ name: e.name, path: join(dir, e.name), looksLikeApp: false }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .slice(0, 500);
  for (const f of folders) f.looksLikeApp = APP_MARKERS.some((m) => existsSync(join(f.path, m)));
  const parent = dirname(dir);
  return { path: dir, parent: parent === dir ? null : parent, folders, roots: roots() };
}
