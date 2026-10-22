import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { log } from '../core/index.js';
import { WORKSPACE_FILE } from '../workspace/index.js';
import { freePort, killTree, waitForHttp } from './local.js';

/**
 * `tea-qa ui`: start the TEA Workbench (the Next.js app in web/) on 127.0.0.1 with a one-time
 * token, for one workspace config file. Builds the app first if it hasn't been built.
 */

export const TEA_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const WEB_DIR = join(TEA_ROOT, 'web');

export interface Workbench {
  url: string;
  openUrl: string;
  workspaceFile: string;
  stop(): Promise<void>;
}

function nextBin(): string {
  return createRequire(join(WEB_DIR, 'package.json')).resolve('next/dist/bin/next');
}

function runNode(args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawn(process.execPath, args, { cwd: WEB_DIR, env, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`next exited with ${code}`))));
    child.on('error', fail);
  });
}

export async function startWorkbench(opts: { workspace?: string; port?: number } = {}): Promise<Workbench> {
  if (!existsSync(join(WEB_DIR, 'package.json'))) throw new Error(`The TEA Workbench app is missing from ${WEB_DIR}.`);
  const workspaceFile = resolve(opts.workspace ?? WORKSPACE_FILE);
  const env = { ...process.env, TEA_ROOT, TEA_WORKSPACE: workspaceFile, NEXT_TELEMETRY_DISABLED: '1' };

  if (!existsSync(join(WEB_DIR, '.next', 'BUILD_ID'))) {
    log.step('Building the TEA Workbench (first run only)');
    await runNode([nextBin(), 'build'], { ...env, NODE_ENV: 'production' });
  }

  const port = opts.port ?? (await freePort());
  const token = randomBytes(24).toString('hex');
  const child: ChildProcess = spawn(process.execPath, [nextBin(), 'start', '-H', '127.0.0.1', '-p', String(port)], {
    cwd: WEB_DIR,
    env: { ...env, NODE_ENV: 'production', TEA_UI_TOKEN: token },
    stdio: ['ignore', 'ignore', 'inherit'],
    detached: process.platform !== 'win32',
  });
  const url = `http://127.0.0.1:${port}`;
  // The proxy answers 401 without the token; any answer means the server is up.
  if (!(await waitForHttp(url, 60_000, child))) {
    await killTree(child);
    throw new Error('The TEA Workbench did not start.');
  }
  return { url, openUrl: `${url}/?token=${token}`, workspaceFile, stop: () => killTree(child) };
}
