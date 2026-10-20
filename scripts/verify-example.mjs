#!/usr/bin/env node
// Checks that a TEA run against examples/buggy-nextjs caught every bug planted for the
// milestones shipped so far. Usage: node scripts/verify-example.mjs [tea-report-dir]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'tea-report';
const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
const appMap = JSON.parse(readFileSync(join(dir, 'app-map.json'), 'utf8'));
const ids = new Set(results.findings.map((f) => f.id));

const expected = [
  ['crawl.api-failure:/pricing:/api/plans', 'paywall shows no plans because /api/plans returns 500'],
  ['crawl.server-error:/account', 'account page crashes for signed-out visitors'],
  ['crawl.js-crash:/about', 'about page throws in the browser'],
  ['crawl.console-errors:/about', 'leftover console.error on the about page'],
  ['crawl.not-found:/blog', 'broken nav link to /blog'],
  ['crawl.not-found:/terms', 'missing Terms page linked from the footer'],
  ['crawl.slow:/dashboard', 'dashboard takes more than 3s'],
  ['crawl.broken-images:/', 'missing logo image'],
];

const failures = [];
for (const [id, why] of expected) if (!ids.has(id)) failures.push(`missing finding ${id} (${why})`);

const byFile = results.findings.find((f) => f.id === 'crawl.api-failure:/pricing:/api/plans')?.evidence?.file;
if (byFile !== 'app/api/plans/route.ts') failures.push(`api failure should point at app/api/plans/route.ts, got ${byFile}`);

const admin = appMap.routes.find((r) => r.path === '/admin');
if (!admin || admin.reachableFromUi !== false) failures.push('/admin should be mapped as a page nothing links to');

const stack = appMap.stack.map((s) => s.id);
if (!stack.includes('nextjs')) failures.push('stack should include nextjs');

if (typeof results.score !== 'number' || results.score < 20 || results.score > 80) {
  failures.push(`score ${results.score} is outside the expected 20-80 range for this buggy app`);
}

const noise = results.findings.filter((f) => !expected.some(([id]) => id === f.id));
console.log(`TEA score: ${results.score}/100, ${results.findings.length} findings (${noise.length} beyond the planted bugs)`);
for (const f of noise) console.log(`  extra: [${f.severity}] ${f.id}`);

if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  x ${f}`);
  process.exit(1);
}
console.log(`All ${expected.length} planted bugs were caught.`);
