import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { log } from '../core/index.js';

export interface LocalApp {
  url: string;
  command: string;
  stop(): Promise<void>;
}

export type StartPlan = { ok: true; command: string; script: string; pm: string } | { ok: false; reason: string };

/**
 * Patterns that suggest a script downloads or evaluates code. This is a tripwire, not a
 * sandbox: the real control is that TEA only starts an app with the user's consent
 * (--start or a yes at the prompt). The full supply-chain scan arrives in milestone 3.
 */
const SUSPICIOUS_SCRIPT = /\b(curl|wget|Invoke-WebRequest|iwr|certutil|bitsadmin)\b|\beval\b|\bnode\s+-e\b|base64|https?:\/\/|\|\s*(sh|bash|powershell)\b|\bnpx\s+-y\b|[A-Za-z0-9+/=]{120,}/i;

/** The package manager whose lockfile is nearest, walking up for monorepo workspaces. */
export function packageManager(root: string): string {
  for (let dir = resolve(root); ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(join(dir, 'yarn.lock'))) return 'yarn';
    if (existsSync(join(dir, 'bun.lockb')) || existsSync(join(dir, 'bun.lock'))) return 'bun';
    if (existsSync(join(dir, 'package-lock.json')) || dirname(dir) === dir) return 'npm';
  }
}

/** Decide whether and how TEA can start the app. Never installs anything. */
export function planLocalStart(root: string): StartPlan {
  const pkgFile = join(root, 'package.json');
  if (!existsSync(pkgFile)) return { ok: false, reason: 'no package.json, so TEA does not know how to start this app' };
  let pkg: { scripts?: Record<string, string> };
  try {
    pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  } catch {
    return { ok: false, reason: 'package.json is not valid JSON' };
  }
  const script = ['dev', 'start', 'serve', 'preview'].find((s) => pkg.scripts?.[s]);
  if (!script) return { ok: false, reason: 'package.json has no dev/start script' };
  if (!existsSync(join(root, 'node_modules'))) {
    return { ok: false, reason: 'dependencies are not installed. TEA never runs install for you (install scripts are how supply-chain malware gets in). Install them yourself, or pass --url' };
  }
  // npm also runs the pre/post hooks of the script, so check those too.
  for (const name of [`pre${script}`, script, `post${script}`]) {
    const body = pkg.scripts?.[name];
    if (body && SUSPICIOUS_SCRIPT.test(body)) {
      return { ok: false, reason: `the "${name}" script looks like it downloads or evaluates code, so TEA will not run it: ${body}` };
    }
  }
  const pm = packageManager(root);
  return { ok: true, script, pm, command: `${pm} run ${script}` };
}

/** The app gets the user's environment minus TEA's own TEA_* settings (test passwords etc.). */
export function appEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(env).filter(([k]) => !k.toUpperCase().startsWith('TEA_')));
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as { port: number }).port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url: string, timeoutMs: number, child: ChildProcess): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) return false;
    try {
      await fetch(url, { signal: AbortSignal.timeout(3_000), redirect: 'manual' });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return false;
}

function killTree(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || !child.pid) return resolve();
    child.once('exit', () => resolve());
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
    }
    setTimeout(resolve, 5_000).unref();
  });
}

const URL_IN_OUTPUT = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0):(\d{2,5})/;

export async function startLocalApp(root: string, plan: Extract<StartPlan, { ok: true }>, timeoutMs = 120_000): Promise<LocalApp> {
  const port = await freePort();
  log.step(`Starting your app locally: ${plan.command} (PORT=${port})`);
  const child = spawn(plan.pm, ['run', plan.script], {
    cwd: root,
    env: { ...appEnv(), PORT: String(port), BROWSER: 'none', CI: '1' },
    shell: process.platform === 'win32',
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let announced: string | undefined;
  const onData = (buf: Buffer) => {
    const text = buf.toString();
    log.debug(`[app] ${text.trimEnd()}`);
    const m = URL_IN_OUTPUT.exec(text);
    if (m && !announced) announced = `http://localhost:${m[1]}`;
  };
  child.stdout!.on('data', onData);
  child.stderr!.on('data', onData);

  const deadline = Date.now() + timeoutMs;
  let url = `http://localhost:${port}`;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) break;
    const candidate = announced ?? url;
    if (await waitForHttp(candidate, 2_000, child)) {
      url = candidate;
      return { url, command: plan.command, stop: () => killTree(child) };
    }
  }
  await killTree(child);
  throw new Error(`Your app did not start within ${Math.round(timeoutMs / 1000)}s with "${plan.command}". Start it yourself and pass --url.`);
}
