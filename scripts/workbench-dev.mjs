// `npm run ui:dev`: the TEA Workbench with hot reload, for working on the UI itself.
// Binds to 127.0.0.1 only. Uses tea.config.yaml in the folder you run it from (or TEA_WORKSPACE).
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const web = resolve(root, 'web');
const next = createRequire(resolve(web, 'package.json')).resolve('next/dist/bin/next');
const workspace = resolve(process.env.TEA_WORKSPACE ?? 'tea.config.yaml');

console.log(`TEA Workbench (dev) for ${workspace}\n  http://127.0.0.1:4747\n`);
const child = spawn(process.execPath, [next, 'dev', '-H', '127.0.0.1', '-p', process.env.PORT ?? '4747'], {
  cwd: web,
  stdio: 'inherit',
  env: { ...process.env, TEA_ROOT: root, TEA_WORKSPACE: workspace, NEXT_TELEMETRY_DISABLED: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
