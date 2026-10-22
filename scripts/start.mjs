#!/usr/bin/env node
// `npm start`: everything in one command. Installs dependencies (install scripts stay disabled by
// .npmrc), builds TEA and the Workbench when their sources changed, makes sure headless Chromium is
// there, then opens the TEA Workbench in your browser. Everything else happens in the UI.
// Options are passed to `tea-qa ui`, e.g. `npm start -- --port 5000 --workspace ../my-app/tea.config.yaml`.
// Uses only Node built-ins until dependencies are installed.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const isWin = process.platform === 'win32';
const say = (msg) => console.log(`☕ ${msg}`);

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 20 || (major === 20 && minor < 9)) {
  console.error(`TEA needs Node.js 20.9 or newer (you have ${process.versions.node}). Get it from https://nodejs.org`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', shell: isWin, ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`))));
    child.on('error', reject);
  });
}

/** Newest modification time of any file under these paths (skipping build output). */
function newest(paths) {
  let latest = 0;
  const visit = (p) => {
    if (!existsSync(p)) return;
    const s = statSync(p);
    if (s.isFile()) latest = Math.max(latest, s.mtimeMs);
    else if (s.isDirectory()) for (const e of readdirSync(p)) if (!['node_modules', '.next', 'dist'].includes(e)) visit(join(p, e));
  };
  paths.forEach((p) => visit(join(root, p)));
  return latest;
}
const mtime = (p) => (existsSync(join(root, p)) ? statSync(join(root, p)).mtimeMs : 0);

try {
  if (!existsSync(join(root, 'node_modules', 'next')) || mtime('package-lock.json') > mtime('node_modules/.package-lock.json')) {
    say('Installing dependencies (first run only; install scripts are disabled)');
    await run('npm', ['install', '--no-fund', '--no-audit']);
  }

  if (newest(['src', 'checks', 'tsconfig.json', 'tsconfig.build.json']) > mtime('dist/index.js')) {
    say('Building TEA');
    await run('npm', ['run', 'build', '--silent']);
  }

  const { chromium } = await import(pathToFileURL(join(root, 'node_modules', 'playwright', 'index.mjs')).href);
  if (!existsSync(chromium.executablePath())) {
    say('Downloading headless Chromium for testing apps (first run only)');
    await run('npx', ['playwright', 'install', 'chromium']);
  }

  if (newest(['web', 'theme']) > mtime('web/.next/BUILD_ID')) {
    say('Building the TEA Workbench');
    await run('npm', ['run', 'build:web', '--silent'], { env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } });
  }

  say('Opening the TEA Workbench');
  await run(process.execPath, [join(root, 'dist', 'cli', 'bin.js'), 'ui', ...process.argv.slice(2)], { shell: false });
} catch (err) {
  console.error(`\n${err.message}`);
  process.exit(1);
}
