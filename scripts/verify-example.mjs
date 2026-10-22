#!/usr/bin/env node
// Checks a TEA run against examples/buggy-next-app using its seeded-bug manifest:
// - every bug with `caughtBy` must have all of those findings (or app-map facts);
// - TEA must report no issue that isn't a seeded bug (no false positives; info suggestions aside);
// - pro bugs must name pro checks that exist as stubs in the public catalog.
// Usage: node scripts/verify-example.mjs [tea-report-dir]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = process.argv[2] ?? 'tea-report';
const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf8'));
const appMap = JSON.parse(readFileSync(join(dir, 'app-map.json'), 'utf8'));
const { bugs } = JSON.parse(readFileSync(join(root, 'examples/buggy-next-app/tea-seeded-bugs.json'), 'utf8'));
const { loadCatalog } = await import(pathToFileURL(join(root, 'dist/core/index.js')).href);
const catalog = await loadCatalog();

const findingIds = new Set(results.findings.map((f) => f.id));
const failures = [];

function proves(evidence) {
  const orphan = /^appmap:orphan:(.+)$/.exec(evidence);
  if (orphan) {
    const route = appMap.routes.find((r) => r.path === orphan[1] && r.kind === 'page');
    return !!route && route.reachableFromUi === false;
  }
  return findingIds.has(evidence);
}

const caught = [];
const waiting = new Map();
for (const bug of bugs) {
  if (bug.pack === 'pro') {
    const entry = catalog.get(bug.check);
    if (!entry || entry.pack !== 'pro') failures.push(`${bug.id}: pro check "${bug.check}" is not a pro stub in the catalog`);
  }
  if (bug.caughtBy?.length) {
    const missing = bug.caughtBy.filter((e) => !proves(e));
    if (missing.length) failures.push(`missed seeded bug "${bug.id}" (${bug.title}): no ${missing.join(', ')}`);
    else caught.push(bug);
  } else {
    waiting.set(bug.step, [...(waiting.get(bug.step) ?? []), bug]);
  }
}

// Anything TEA reports as an issue must be one of the seeded bugs. Info items are suggestions
// (e.g. an endpoint nothing calls), not issues.
const expected = new Set(bugs.flatMap((b) => b.caughtBy ?? []));
const extra = results.findings.filter((f) => f.severity !== 'info' && !expected.has(f.id));
for (const f of extra) failures.push(`unexpected finding (false positive or an unlisted bug): [${f.severity}] ${f.id}`);

if (appMap.stack.every((s) => s.id !== 'nextjs')) failures.push('stack should include Next.js');
if (typeof results.score !== 'number' || results.score < 20 || results.score > 80) {
  failures.push(`score ${results.score} is outside the expected 20-80 range for this buggy app`);
}

console.log(`TEA score: ${results.score}/100. Seeded bugs caught: ${caught.length} of ${bugs.length}.`);
for (const [step, list] of [...waiting.entries()].sort((a, b) => a[0] - b[0])) {
  const pro = list.filter((b) => b.pack === 'pro').length;
  console.log(`  waiting for step ${step}: ${list.length} bug(s)${pro ? ` (${pro} pro)` : ''}`);
}
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  x ${f}`);
  process.exit(1);
}
console.log('Every seeded bug that today\'s checks cover was caught, with no false positives.');
