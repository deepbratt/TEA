#!/usr/bin/env node
// Clicks through the website demo the way GitHub Pages serves it (under /TEA/), and checks every
// page loads, every button works, nothing 404s, and axe finds no WCAG 2 A/AA problems.
// Needs: node scripts/build-demo.mjs && node scripts/build-site.mjs. Usage: node scripts/demo-e2e.mjs
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const site = join(root, '_site');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain', '.woff2': 'font/woff2', '.md': 'text/markdown' };

// A tiny static server that behaves like GitHub Pages: /TEA/<path>, directories serve index.html.
const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/TEA/')) return res.writeHead(404).end();
  let file = normalize(join(site, decodeURIComponent(url.pathname.slice('/TEA/'.length))));
  if (!file.startsWith(site)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const axeSource = await readFile(join(root, 'node_modules/axe-core/axe.min.js'), 'utf8');

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
  console.log(`  ${ok ? '✓' : 'x'} ${message}`);
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`page error: ${e.message}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()} ${r.url()}`));
  const settle = () => page.evaluate(() => Promise.all(globalThis.document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished)));

  await page.goto(`${origin}/TEA/demo/`);
  await page.getByText('Live demo.').waitFor();
  check(await page.getByRole('link', { name: 'Leaf and Kettle' }).isVisible(), 'lists the example project with the demo banner');

  await page.getByRole('link', { name: 'Leaf and Kettle' }).click();
  await page.getByRole('heading', { name: 'Measures' }).waitFor();
  check(/passed|failed/i.test(await page.locator('.gate-panel .gate').innerText()), 'shows the recorded quality gate and measures');

  await page.getByRole('button', { name: 'Run analysis' }).click();
  await page.locator('.brewing-row').waitFor();
  await page.locator('.log li').nth(3).waitFor({ timeout: 20_000 });
  check(true, 'replays the recorded analysis live');
  await page.locator('.brewing-row').waitFor({ state: 'detached', timeout: 60_000 });

  const [report] = await Promise.all([page.waitForEvent('popup'), page.getByRole('link', { name: 'Open full report' }).click()]);
  await report.waitForLoadState();
  check(/TEA report/.test(await report.title()), 'opens the recorded full report');
  await report.close();

  await page.getByRole('link', { name: 'Features', exact: true }).click();
  await page.locator('.feature-card').first().waitFor();
  await page.locator('.feature-card', { hasText: 'Sign up' }).locator('summary').click();
  await page.locator('.feature-card', { hasText: 'Sign up' }).locator('.plan-step').first().waitFor();
  check((await page.locator('.feature-card.st-missing').count()) > 0, 'shows the recorded features and their test plans');

  await page.getByRole('link', { name: 'Issues', exact: true }).click();
  await page.locator('.issue').first().waitFor();
  await page.getByLabel('Severity').selectOption('high');
  await page.waitForURL(/severity=high/);
  check((await page.locator('.issue').count()) > 0, 'filters the recorded issues');

  await page.getByRole('link', { name: 'Rules' }).click();
  await page.getByRole('radio', { name: /Strict/ }).first().click();
  await page.getByRole('button', { name: 'Save rules' }).click();
  await page.getByText('Saved to the config file').waitFor();
  await page.getByRole('button', { name: 'Add rule: Has a README' }).click();
  await page.getByText('Added "Has a README"').waitFor();
  check(true, 'rules presets and your own rules work on screen');

  await page.getByRole('link', { name: 'Quality gate' }).click();
  await page.getByRole('radio', { name: /Relaxed/ }).click();
  await page.getByRole('button', { name: 'Save gate' }).click();
  await page.getByText('Saved. Projects without').waitFor();
  check(true, 'gate presets work on screen');

  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  await page.getByRole('link', { name: 'Add project' }).click();
  await page.getByRole('button', { name: 'Choose folder and detect' }).click();
  await page.getByRole('button', { name: /leaf-and-kettle/ }).click();
  await page.getByRole('button', { name: 'Use this folder' }).click();
  await page.locator('.stack-chips li', { hasText: 'Next.js' }).waitFor();
  check(true, 'detects the example project from the folder picker');

  // Every page, with axe.
  for (const path of ['', 'projects/new/', 'projects/leaf-and-kettle/', 'projects/leaf-and-kettle/features/', 'projects/leaf-and-kettle/issues/', 'projects/leaf-and-kettle/settings/', 'rules/', 'gate/', 'config/']) {
    await page.goto(`${origin}/TEA/demo/${path}`);
    await page.locator('main').waitFor();
    await settle();
    await page.addScriptTag({ content: axeSource });
    const v = await page.evaluate(async () => (await globalThis.axe.run(globalThis.document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map((x) => `${x.id} (${x.nodes.length})`));
    check(v.length === 0, `axe /demo/${path}${v.length ? `: ${v.join(', ')}` : ''}`);
  }
  const text = await page.content();
  check(!/[A-Z]:\\Users|\/home\/runner|\/Users\//.test(text), 'shows no build-machine paths');
  check(problems.length === 0, `no errors or missing files${problems.length ? `: ${[...new Set(problems)].slice(0, 6).join(' | ')}` : ''}`);
} finally {
  await browser.close();
  server.close();
}

if (failures.length) {
  console.error(`\n${failures.length} demo check(s) failed.`);
  process.exit(1);
}
console.log('\nThe website demo works.');
