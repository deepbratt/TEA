#!/usr/bin/env node
// End-to-end test of the TEA Workbench, through its UI in a real browser:
// add a project with two folders, run an analysis, see the gate, issues, rules, gate and config pages,
// and check every page with axe in light and dark mode. Needs `npm run build` (and builds web/).
// Usage: node scripts/workbench-e2e.mjs
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const example = join(root, 'examples', 'buggy-next-app');
const { startWorkbench } = await import(pathToFileURL(join(root, 'dist/cli/workbench.js')).href);
const axeSource = await readFile(join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
  console.log(`  ${ok ? '✓' : 'x'} ${message}`);
};

const dir = await mkdtemp(join(tmpdir(), 'tea-workbench-'));
const ui = await startWorkbench({ workspace: join(dir, 'tea.config.yaml') });
const browser = await chromium.launch();
try {
  // Without the token, nothing is served.
  check((await fetch(ui.url)).status === 401, 'refuses requests without the one-time token');
  const rebound = await new Promise((ok, fail) => {
    const req = request(`${ui.url}/api/projects`, { headers: { host: 'evil.example' } }, (res) => ok(res.statusCode));
    req.on('error', fail);
    req.end();
  });
  check(rebound === 403, 'refuses other host names (DNS rebinding)');

  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ui.openUrl);
  check(!page.url().includes('token='), 'drops the token from the address bar');
  await page.getByRole('heading', { name: 'No projects yet' }).waitFor();

  // Add a project: the example app as a "frontend" folder and its API folder as a "backend".
  await page.getByRole('link', { name: 'Add your first project' }).click();
  await page.getByLabel('Project name').fill('Leaf and Kettle');
  await page.getByLabel('Folder 1 path').fill(example);
  await page.getByLabel('Folder 1 name').fill('web');
  await page.getByLabel('Folder 1 role').selectOption('fullstack');
  await page.getByRole('button', { name: 'Add another folder' }).click();
  await page.getByLabel('Folder 2 path').fill('does-not-exist');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('heading', { name: 'Leaf and Kettle' }).waitFor();
  check(true, 'creates a project from the form');

  // A missing folder fails the analysis with a clear message, not a crash.
  await page.getByRole('button', { name: 'Run analysis' }).click();
  await page.getByText('The last analysis failed').waitFor({ timeout: 60_000 });
  check(/Folder "does-not-exist" not found/.test(await page.locator('section[role="alert"]').innerText()), 'reports a missing source folder clearly');

  // Fix it in Settings: remove the bad folder.
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Remove folder 2' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('heading', { name: 'Quality gate' }).waitFor();

  await page.getByRole('button', { name: 'Run analysis' }).click();
  await page.getByRole('heading', { name: 'Measures' }).waitFor({ timeout: 180_000 });
  const gate = await page.locator('.gate-panel .gate').innerText();
  // Code only: 2 high issues, under the default gate's "more than 3 high".
  check(/passed/i.test(gate), `passes the default gate in code-only mode (${gate.trim()})`);

  await page.getByRole('link', { name: 'Issues', exact: true }).click();
  await page.waitForURL('**/issues');
  await page.locator('.issue-title', { hasText: 'The UI calls GET /api/wishlist, but no backend route serves it' }).waitFor();
  check(true, 'lists the orphan API call as an issue');
  await page.getByLabel('Severity').selectOption('high');
  await page.waitForURL(/severity=high/);
  check((await page.locator('.issue').count()) === 2, 'filters issues by severity, kept in the URL');

  // Rules: turn the orphan-call check off, save, and see it in the config file.
  await page.getByRole('link', { name: 'Rules' }).click();
  await page.getByPlaceholder('Filter checks').fill('orphan');
  await page.getByLabel(/Enable .*backend route/i).uncheck();
  await page.getByRole('button', { name: 'Save rules' }).click();
  await page.getByText('Saved to the config file').waitFor();
  const yaml = await readFile(join(dir, 'tea.config.yaml'), 'utf8');
  check(/wiring\.orphan-call:\s*\n\s*enabled: false/.test(yaml), 'writes rules to tea.config.yaml');
  check(yaml.includes('# Each project: a live URL'), 'keeps the comments in tea.config.yaml');

  // Gate: add a condition and save.
  await page.getByRole('link', { name: 'Quality gate' }).click();
  await page.getByRole('button', { name: 'Add condition' }).click();
  await page.getByRole('button', { name: 'Save gate' }).click();
  await page.getByText('Saved. Projects without').waitFor();
  check((await readFile(join(dir, 'tea.config.yaml'), 'utf8')).includes('value: 0'), 'writes the gate to tea.config.yaml');

  // Re-run: the new condition (high issues > 0) fails the gate. The orphan-call check is off now,
  // so the signup and wishlist issues are gone too: turn it back on via the config file first.
  await page.getByRole('link', { name: 'Rules' }).click();
  await page.getByPlaceholder('Filter checks').fill('orphan');
  await page.getByLabel(/Enable .*backend route/i).check();
  await page.getByRole('button', { name: 'Save rules' }).click();
  await page.getByText('Saved to the config file').waitFor();
  await page.goto(`${ui.url}/projects/leaf-and-kettle`);
  await page.getByRole('button', { name: 'Run analysis' }).click();
  await page.locator('.gate-panel .gate', { hasText: /failed/i }).waitFor({ timeout: 180_000 });
  check(true, 'fails the edited gate on the next analysis');
  check((await page.locator('.conditions li.failed').count()) === 1, 'marks exactly the failing condition');

  // Config: a broken edit is refused with the reason.
  await page.getByRole('link', { name: 'Config file' }).click();
  await page.getByLabel('Config file').fill('version: 1\nprojects: [');
  await page.getByRole('button', { name: 'Save file' }).click();
  await page.getByText('That is not valid YAML.').waitFor();
  check(true, 'refuses invalid YAML from the config editor');

  // Accessibility of every page, light and dark.
  const key = 'leaf-and-kettle';
  const pages = ['/', '/projects/new', `/projects/${key}`, `/projects/${key}/issues`, `/projects/${key}/settings`, '/rules', '/gate', '/config'];
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of pages) {
      await page.goto(`${ui.url}${path}`);
      await page.addScriptTag({ content: axeSource });
      const violations = await page.evaluate(async () => (await globalThis.axe.run(globalThis.document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((v) => `${v.id} (${v.nodes.length})`));
      check(violations.length === 0, `axe ${scheme} ${path}${violations.length ? `: ${violations.join(', ')}` : ''}`);
    }
  }
  check(errors.length === 0, `no browser errors${errors.length ? `: ${errors.join(' | ')}` : ''}`);
} finally {
  await browser.close();
  await ui.stop();
  await rm(dir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\n${failures.length} Workbench check(s) failed.`);
  process.exit(1);
}
console.log('\nThe Workbench works end to end.');
