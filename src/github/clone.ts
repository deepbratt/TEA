import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { validRepoRef } from './client.js';

export interface CloneOptions {
  owner: string;
  repo: string;
  branch?: string;
  token?: string;
  /** Folder that holds TEA's clones. */
  cacheDir: string;
  /** Base for clone URLs; tests point it at a local folder. */
  gitBase?: string;
}

/**
 * Shallow, read-only clone of one branch into TEA's cache. The token travels in an HTTP header
 * through environment variables, so it never appears in the command line, in .git/config or in
 * logs. Symlinks are checked out as plain files and LFS downloads are skipped. TEA reads the
 * files; it never runs anything from the clone.
 */
export async function cloneRepo(o: CloneOptions): Promise<string> {
  if (!validRepoRef(o.owner, o.repo, o.branch)) throw new Error('Not a valid repository or branch name.');
  const dir = join(o.cacheDir, `${o.owner}__${o.repo}`);
  if (existsSync(dir)) await rm(dir, { recursive: true, force: true });
  await mkdir(o.cacheDir, { recursive: true });

  const base = o.gitBase ?? 'https://github.com';
  const url = `${base}/${o.owner}/${o.repo}${o.gitBase ? '' : '.git'}`;
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_LFS_SKIP_SMUDGE: '1' };
  if (o.token) {
    env.GIT_CONFIG_COUNT = '1';
    env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
    env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${o.token}`).toString('base64')}`;
  }
  const args = ['-c', 'core.symlinks=false', 'clone', '--depth', '1', '--single-branch', '--no-tags'];
  if (o.branch) args.push('--branch', o.branch);
  args.push('--', url, dir);

  await new Promise<void>((resolve, reject) => {
    let stderr = '';
    const child = spawn('git', args, { env, stdio: ['ignore', 'ignore', 'pipe'], shell: false, windowsHide: true });
    child.stderr!.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', (err) => reject(new Error(`Could not run git: ${err.message}. Is git installed?`)));
    child.on('exit', (code) => {
      if (code === 0) return resolve();
      const hint = /not found|Repository not found|403|401/i.test(stderr) ? ' Check the repo name and that your GitHub connection can read it.' : '';
      reject(new Error(`git clone failed for ${o.owner}/${o.repo}${o.branch ? `@${o.branch}` : ''}.${hint}`));
    });
  });
  return dir;
}
