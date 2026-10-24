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

  // Add a project by detecting it from the example app's folder.
  await page.getByRole('link', { name: 'Add your first project' }).click();
  await page.getByRole('button', { name: 'Choose folder and detect' }).click();
  await page.locator('.pick-list li').first().waitFor(); // the first listing (home folder) has loaded
  await page.getByLabel('Folder path').fill(example);
  await page.getByLabel('Folder path').press('Enter');
  await page.locator('.pick-list .name', { hasText: /^components$/ }).waitFor(); // the example's own subfolders are listed
  await page.getByRole('button', { name: 'Use this folder' }).click();
  await page.locator('.stack-chips li', { hasText: 'Next.js' }).waitFor();
  check((await page.getByLabel('Folder 1 path').inputValue()) === example, 'detects the project from its folder');
  check(/fullstack/.test(await page.getByLabel('Folder 1 role').locator('option:checked').innerText()), 'auto-detects the folder role (fullstack)');
  check((await page.locator('.suggest .chip').count()) > 0, 'suggests a local URL to test');
  await page.getByLabel('Project name').fill('Leaf and Kettle');
  await page.getByLabel('Folder 1 name').fill('web');
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
  // Code only: 2 wiring issues plus 6 things the example's CLAUDE.md claims but doesn't have,
  // over the default gate's "more than 3 high".
  check(/failed/i.test(gate), `fails the default gate in code-only mode: the docs claim what isn't built (${gate.trim()})`);

  // Features: every feature listed from the code and the docs, each with its test plan.
  await page.getByRole('link', { name: 'Features', exact: true }).click();
  await page.waitForURL('**/features');
  await page.locator('.feature-name', { hasText: 'CSV export' }).waitFor();
  check((await page.locator('.feature-card.st-missing').count()) === 2, 'lists features the docs claim but the code lacks (CSV export, health check)');
  check((await page.locator('.feature-card.st-broken', { hasText: 'Sign up' }).count()) === 1, 'marks Sign up broken: its form posts to a route nothing serves');
  check((await page.locator('.feature-card.st-not-built-yet').count()) === 3, 'shows TODO items as not built yet, not as failures');
  await page.locator('.feature-card', { hasText: 'Sign up' }).locator('summary').click();
  await page.locator('.feature-card', { hasText: 'Sign up' }).getByRole('button', { name: 'Not a feature: hide it' }).click();
  await page.getByText('Hid “Sign up”').waitFor();
  check(/hide:\s*\n\s*- signup/.test(await readFile(join(dir, 'tea.config.yaml'), 'utf8')), 'hides a feature and saves it in tea.config.yaml');
  await page.locator('.hidden-features summary').click();
  await page.getByRole('button', { name: 'Show again' }).click();
  await page.getByText('“Sign up” is back').waitFor();
  check(!(await readFile(join(dir, 'tea.config.yaml'), 'utf8')).includes('- signup'), 'shows a hidden feature again');

  await page.getByRole('link', { name: 'Issues', exact: true }).click();
  await page.waitForURL('**/issues');
  await page.locator('.issue-title', { hasText: 'The UI calls GET /api/wishlist, but no backend route serves it' }).waitFor();
  check(true, 'lists the orphan API call as an issue');
  await page.getByLabel('Severity').selectOption('high');
  await page.waitForURL(/severity=high/);
  check((await page.locator('.issue').count()) === 8, 'filters issues by severity, kept in the URL');

  // Rules: turn the orphan-call check off, save, and see it in the config file.
  await page.getByRole('link', { name: 'Rules' }).click();
  await page.getByPlaceholder(/Find a check/).fill('orphan');
  await page.getByLabel(/Check: .*backend route/i).uncheck();
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
  await page.getByPlaceholder(/Find a check/).fill('orphan');
  await page.getByLabel(/Check: .*backend route/i).check();
  await page.getByRole('button', { name: 'Save rules' }).click();
  await page.getByText('Saved to the config file').waitFor();
  await page.goto(`${ui.url}/projects/leaf-and-kettle`);
  await page.getByRole('button', { name: 'Run analysis' }).click();
  // The new run's result has the added fourth condition.
  await page.locator('.conditions li').nth(3).waitFor({ timeout: 180_000 });
  check(/failed/i.test(await page.locator('.gate-panel .gate').innerText()), 'fails the edited gate on the next analysis');
  const failed = await page.locator('.conditions li.failed span:first-child').allInnerTexts();
  const all = await page.locator('.conditions li').count();
  check(failed.some((t) => /greater than 0/.test(t)) && failed.length < all, `marks exactly the failing conditions (${failed.join('; ')})`);

  // Quick setup: the Strict preset, saved in one click.
  await page.getByRole('link', { name: 'Rules' }).click();
  await page.getByRole('radio', { name: /Strict/ }).first().click();
  await page.getByRole('button', { name: 'Save rules' }).click();
  await page.getByText('Saved to the config file').waitFor();
  check((await readFile(join(dir, 'tea.config.yaml'), 'utf8')).includes('thresholdMs: 2000'), 'applies a rules preset (Strict)');

  // Your own rules: one from a template, one written with the builder, then removed.
  await page.getByRole('button', { name: 'Add rule: No console.log left in the code' }).click();
  await page.getByText('Added "No console.log left in the code"').waitFor();
  await page.getByRole('button', { name: 'Write a rule' }).click();
  await page.getByRole('radio', { name: /A page or endpoint must exist/ }).click();
  await page.getByLabel('Page or endpoint path').fill('/privacy');
  await page.getByLabel('Rule name').fill('Has a privacy page');
  await page.getByRole('button', { name: 'Save rule' }).click();
  await page.getByText('Added "Has a privacy page"').waitFor();
  let cfg = await readFile(join(dir, 'tea.config.yaml'), 'utf8');
  // (The default file's comments show examples too, so match real YAML lines, not commented ones.)
  check(/^\s+- id: no-console-log$/m.test(cfg) && /^\s+path: \/privacy$/m.test(cfg), 'adds your own rules (template and builder) to tea.config.yaml');
  await page.getByRole('button', { name: 'Remove Has a privacy page' }).click();
  await page.getByText('Removed "Has a privacy page"').waitFor();
  cfg = await readFile(join(dir, 'tea.config.yaml'), 'utf8');
  check(!/^\s+path: \/privacy$/m.test(cfg), 'removes your own rule');

  // Gate quick setup.
  await page.getByRole('link', { name: 'Quality gate' }).click();
  await page.getByRole('radio', { name: /Relaxed/ }).click();
  await page.getByRole('button', { name: 'Save gate' }).click();
  await page.getByText('Saved. Projects without').waitFor();
  check((await readFile(join(dir, 'tea.config.yaml'), 'utf8')).includes('value: 40'), 'applies a gate preset (Relaxed)');

  // Config: a broken edit is refused with the reason.
  await page.getByRole('link', { name: 'Config file' }).click();
  await page.getByLabel('Config file').fill('version: 1\nprojects: [');
  await page.getByRole('button', { name: 'Save file' }).click();
  await page.getByText('That is not valid YAML.').waitFor();
  check(true, 'refuses invalid YAML from the config editor');

  // Accessibility of every page, light and dark.
  const key = 'leaf-and-kettle';
  const pages = ['/', '/projects/new', `/projects/${key}`, `/projects/${key}/features`, `/projects/${key}/issues`, `/projects/${key}/settings`, '/rules', '/gate', '/config'];
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const path of pages) {
      await page.goto(`${ui.url}${path}`);
      // Let one-off animations (content easing in) finish: people read the settled page.
      await page.evaluate(() => Promise.all(globalThis.document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished)));
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
