// Test helper: temp folders filled with files, removed after the test file's tests finish.
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll } from 'vitest';

export function useTempDirs(prefix: string): (files?: Record<string, string>) => Promise<string> {
  const dirs: string[] = [];
  afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));
  return async (files = {}) => {
    const root = await mkdtemp(join(tmpdir(), `tea-${prefix}-`));
    dirs.push(root);
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, rel)), { recursive: true });
      await writeFile(join(root, rel), content);
    }
    return root;
  };
}
