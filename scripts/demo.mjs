#!/usr/bin/env node
// One command to see TEA work: `npm run demo`.
// Installs dependencies if needed, builds TEA, builds and starts the example app on a free port,
// runs TEA against it, checks every seeded bug that today's checks cover, then stops the app.
// Flags: --skip-build (reuse the last builds), --keep (leave the example app running).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const isWin = process.platform === 'win32';
const say = (msg) => console.log(`\n☕ ${msg}`);

function run(cmd, cmdArgs, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: isWin, ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${cmdArgs.join(' ')} exited with ${code}`))));
    child.on('error', reject);
  });
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitFor(url, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('the example app stopped before it was ready');
    try {
      await fetch(url, { signal: AbortSignal.timeout(2000) });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`the example app did not answer at ${url} within ${timeoutMs / 1000}s`);
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (isWin) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else process.kill(-child.pid, 'SIGTERM');
}

let app;
try {
  if (!existsSync(join(root, 'node_modules'))) {
    say('Installing dependencies (install scripts are disabled in .npmrc)');
    await run('npm', ['install']);
  }
  if (!args.has('--skip-build')) {
    say('Building TEA');
    await run('npm', ['run', 'build', '--silent']);
  }
  say('Making sure headless Chromium is installed');
  await run('npx', ['playwright', 'install', 'chromium']);
  if (!args.has('--skip-build') || !existsSync(join(root, 'examples/buggy-next-app/.next'))) {
    say('Building the example app (Leaf & Kettle)');
    await run('npm', ['run', 'example:build', '--silent']);
  }

  const port = await freePort();
  const url = `http://localhost:${port}`;
  say(`Starting the example app at ${url}`);
  app = spawn('npm', ['run', 'example:start', '--silent'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
    shell: isWin,
    detached: !isWin,
  });
  await waitFor(url, 90_000, app);

  say('Spilling the TEA');
  await run('node', ['dist/cli/bin.js', 'run', url, '--repo', 'examples/buggy-next-app', '--out', 'tea-report', '--fail-on', 'none']);
  say('Checking TEA caught every seeded bug it should');
  await run('node', ['scripts/verify-example.mjs', 'tea-report']);
  say(`Done. Open ${join(root, 'tea-report', 'report.html')}`);
  if (args.has('--keep')) {
    say(`The example app is still running at ${url}. Press Ctrl+C to stop it.`);
    await new Promise(() => {});
  }
} catch (err) {
  console.error(`\nx ${err.message}`);
  process.exitCode = 1;
} finally {
  if (!args.has('--keep')) stop(app);
}
