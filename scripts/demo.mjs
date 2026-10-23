#!/usr/bin/env node
// One command to see TEA work: `npm run demo`.
// Installs dependencies if needed, builds TEA, builds and starts the example app on a free port,
// runs TEA against it (once read-only, once with sandbox tests), checks every seeded bug that
// today's checks cover, then stops the app.
// Flags: --skip-build (reuse the last builds), --keep (leave the example app running).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = new Set(process.argv.slice(2));
const isWin = process.platform === 'win32';
const say = (msg) => console.log(`\n☕ ${msg}`);

function run(cmd, cmdArgs) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { cwd: root, stdio: 'inherit', shell: isWin });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${cmdArgs.join(' ')} exited with ${code}`))));
    child.on('error', reject);
  });
}

let app;
let killTree;
try {
  if (!existsSync(join(root, 'node_modules'))) {
    say('Installing dependencies (install scripts are disabled in .npmrc)');
    await run('npm', ['install']);
  }
  if (!args.has('--skip-build') || !existsSync(join(root, 'dist'))) {
    say('Building TEA');
    await run('npm', ['run', 'build', '--silent']);
  }
  // Reuse TEA's own helpers for ports, waiting and stopping processes.
  const local = await import(pathToFileURL(join(root, 'dist/cli/local.js')).href);
  killTree = local.killTree;

  say('Making sure headless Chromium is installed');
  await run('npx', ['playwright', 'install', 'chromium']);
  if (!args.has('--skip-build') || !existsSync(join(root, 'examples/buggy-next-app/.next'))) {
    say('Building the example app (Leaf & Kettle)');
    await run('npm', ['run', 'example:build', '--silent']);
  }

  const port = await local.freePort();
  const url = `http://localhost:${port}`;
  say(`Starting the example app at ${url}`);
  app = spawn('npm', ['run', 'example:start', '--silent'], {
    cwd: root,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
    shell: isWin,
    detached: !isWin,
  });
  if (!(await local.waitForHttp(url, 90_000, app))) throw new Error(`the example app did not answer at ${url} within 90s`);

  say('Spilling the TEA');
  await run('node', ['dist/cli/bin.js', 'run', url, '--repo', 'examples/buggy-next-app', '--out', 'tea-report', '--fail-on', 'none']);
  say('Checking TEA caught every seeded bug it should');
  await run('node', ['scripts/verify-example.mjs', 'tea-report']);
  say('Again with sandbox tests: submitting forms with test data and calling the API signed out');
  await run('node', ['dist/cli/bin.js', 'run', url, '--repo', 'examples/buggy-next-app', '--out', 'tea-report-sandbox', '--fail-on', 'none', '--sandbox', '--quiet']);
  await run('node', ['scripts/verify-example.mjs', 'tea-report-sandbox', '--sandbox']);
  say(`Done. Open ${join(root, 'tea-report', 'report.html')}`);
  if (args.has('--keep')) {
    say(`The example app is still running at ${url}. Press Ctrl+C to stop it.`);
    await new Promise(() => {});
  }
} catch (err) {
  console.error(`\nx ${err.message}`);
  process.exitCode = 1;
} finally {
  if (app && killTree && !args.has('--keep')) await killTree(app);
}
