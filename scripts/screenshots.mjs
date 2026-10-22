#!/usr/bin/env node
// Regenerates the README screenshots in docs/assets/screenshots/ from a real Workbench session
// against the bundled example app: npm run build && npm run build:web && node scripts/screenshots.mjs
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'docs', 'assets', 'screenshots');
const example = join(root, 'examples', 'buggy-next-app');
const { startWorkbench } = await import(pathToFileURL(join(root, 'dist/cli/workbench.js')).href);

await mkdir(out, { recursive: true });
const dir = await mkdtemp(join(tmpdir(), 'tea-shots-'));
const ui = await startWorkbench({ workspace: join(dir, 'tea.config.yaml') });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const settle = () => page.evaluate(() => Promise.all(globalThis.document.getAnimations().filter((a) => a.effect?.getTiming().iterations !== Infinity).map((a) => a.finished)));
  // Show neutral paths instead of this computer's folders (and its user name) in the pictures.
  const neutral = [
    [example, '~/code/leaf-and-kettle'],
    [dir, '~/code/my-workspace'],
    [homedir(), '~'],
  ];
  const anonymise = () =>
    page.evaluate((pairs) => {
      const swap = (t) => {
        const out = pairs.reduce((acc, [from, to]) => acc.split(from).join(to).split(from.replaceAll('\\', '/')).join(to), t);
        return out.includes('~/') ? out.replace(/(~\/[^\s"']*)/g, (p) => p.replaceAll('\\', '/')) : out;
      };
      const walker = globalThis.document.createTreeWalker(globalThis.document.body, 4);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) n.nodeValue = swap(n.nodeValue);
      for (const el of globalThis.document.querySelectorAll('input, textarea')) el.value = swap(el.value);
    }, neutral);
  const shot = async (name, opts = {}) => {
    await settle();
    await anonymise();
    await page.screenshot({ path: join(out, `${name}.png`), ...opts });
    console.log(`  ${name}.png`);
  };

  await page.goto(ui.openUrl);
  await shot('01-projects-empty');

  // Add the example app by detecting it from its folder.
  await page.getByRole('link', { name: 'Add your first project' }).click();
  await page.getByRole('button', { name: 'Choose folder and detect' }).click();
  await page.locator('.pick-list li').first().waitFor();
  await page.getByLabel('Folder path').fill(example);
  await page.getByLabel('Folder path').press('Enter');
  await page.locator('.pick-list .name', { hasText: /^components$/ }).waitFor();
  await page.getByRole('button', { name: 'Use this folder' }).click();
  await page.locator('.stack-chips li').first().waitFor();
  await page.getByLabel('Project name').fill('Leaf and Kettle');
  await shot('02-add-project-detect');
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('heading', { name: 'Leaf and Kettle' }).waitFor();

  // One rule of our own, so the analysis shows it.
  await page.goto(`${ui.url}/rules`);
  await page.getByRole('button', { name: 'Add rule: No console.log left in the code' }).click();
  await page.getByText('Added "No console.log left in the code"').waitFor();

  await page.goto(`${ui.url}/projects/leaf-and-kettle`);
  await page.getByRole('button', { name: 'Run analysis' }).click();
  await page.getByRole('heading', { name: 'Measures' }).waitFor({ timeout: 180_000 });
  await shot('04-project-overview', { fullPage: true });

  await page.goto(`${ui.url}/projects/leaf-and-kettle/issues`);
  await page.locator('.issue').first().waitFor();
  await page.locator('.issue-more summary').first().click();
  await shot('05-issues');

  await page.goto(`${ui.url}/rules`);
  await shot('06-rules');
  await page.getByRole('button', { name: 'Write a rule' }).click();
  await page.getByRole('radio', { name: /A page or endpoint must exist/ }).click();
  await page.getByLabel('Page or endpoint path').fill('/privacy');
  await page.getByLabel('Rule name').fill('Has a privacy page');
  await page.locator('.rule-builder').scrollIntoViewIfNeeded();
  await shot('07-rule-builder');

  await page.goto(`${ui.url}/gate`);
  await shot('08-quality-gate');
  await page.goto(`${ui.url}/config`);
  await shot('09-config-file');
} finally {
  await browser.close();
  await ui.stop();
  await rm(dir, { recursive: true, force: true });
}
console.log(`Screenshots written to ${out}`);
