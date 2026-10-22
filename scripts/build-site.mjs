#!/usr/bin/env node
// Assembles the GitHub Pages site into _site/: the page in site/, the shared theme, the README
// images, (when tea-report/ exists, e.g. after `npm run demo`) a live sample report, and (when
// web/demo-out/ exists, after scripts/build-demo.mjs) the clickable Workbench demo.
// Usage: node scripts/build-site.mjs [report-dir]
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, '_site');
const report = join(root, process.argv[2] ?? 'tea-report');

await rm(out, { recursive: true, force: true });
await mkdir(join(out, 'assets'), { recursive: true });
await cp(join(root, 'site'), out, { recursive: true });
await cp(join(root, 'theme', 'tea.css'), join(out, 'tea.css'));
await cp(join(root, 'web', 'public', 'cup.svg'), join(out, 'assets', 'cup.svg'));
for (const f of ['tea-hero.svg', 'tea-pipeline.svg', 'tea-score-card.svg']) await cp(join(root, 'docs', 'assets', f), join(out, 'assets', f));
await cp(join(root, 'docs', 'assets', 'screenshots'), join(out, 'assets', 'screenshots'), { recursive: true });

if (existsSync(join(report, 'report.html'))) {
  // The report and its screenshots only; the JSON files stay out of the public site.
  await mkdir(join(out, 'report'), { recursive: true });
  await cp(join(report, 'report.html'), join(out, 'report', 'report.html'));
  if (existsSync(join(report, 'screenshots'))) await cp(join(report, 'screenshots'), join(out, 'report', 'screenshots'), { recursive: true });
  console.log('Site built with a sample report.');
} else {
  console.log(`Site built without a sample report (no ${report}/report.html; run npm run demo first).`);
}
const demo = join(root, 'web', 'demo-out');
if (existsSync(join(demo, 'index.html'))) {
  await cp(demo, join(out, 'demo'), { recursive: true });
  console.log('Site built with the Workbench demo at /demo/.');
} else {
  console.log('Site built without the Workbench demo (run node scripts/build-demo.mjs first).');
}
console.log(`  ${out}`);
