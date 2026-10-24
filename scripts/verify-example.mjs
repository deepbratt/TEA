#!/usr/bin/env node
// Checks a TEA run against examples/buggy-next-app using its seeded-bug manifest:
// - every bug with `caughtBy` must have all of those findings (or app-map facts);
// - TEA must report no issue that isn't a seeded bug (no false positives; info suggestions aside);
// - bugs whose check is still planned can't list caughtBy yet.
// - with --sandbox, the run used sandbox tests: every bug's caughtBySandbox findings must be there too.
// Usage: node scripts/verify-example.mjs [tea-report-dir] [--sandbox]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const sandbox = args.includes('--sandbox');
const dir = args.find((a) => !a.startsWith('--')) ?? 'tea-report';
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
  if (catalog.planned.some((e) => e.id === bug.check) && bug.caughtBy?.length) {
    failures.push(`${bug.id}: "${bug.check}" is still a planned check, so nothing can catch it yet`);
  }
  const evidence = [...(bug.caughtBy ?? []), ...(sandbox ? (bug.caughtBySandbox ?? []) : [])];
  if (evidence.length) {
    const missing = evidence.filter((e) => !proves(e));
    if (missing.length) failures.push(`missed seeded bug "${bug.id}" (${bug.title}): no ${missing.join(', ')}`);
    else caught.push(bug);
  } else {
    waiting.set(bug.step, [...(waiting.get(bug.step) ?? []), bug]);
  }
}

// Anything TEA reports as an issue must be one of the seeded bugs. Info items are suggestions
// (e.g. an endpoint nothing calls), not issues.
const expected = new Set(bugs.flatMap((b) => [...(b.caughtBy ?? []), ...(sandbox ? (b.caughtBySandbox ?? []) : [])]));
const extra = results.findings.filter((f) => f.severity !== 'info' && !expected.has(f.id));
for (const f of extra) failures.push(`unexpected finding (false positive or an unlisted bug): [${f.severity}] ${f.id}`);

if (appMap.stack.every((s) => s.id !== 'nextjs')) failures.push('stack should include Next.js');
// Every docs claim the example plants must show up as a feature that's missing or partly built.
const features = results.features?.features ?? [];
if (!features.length) failures.push('results.json has no feature report');
for (const key of ['csv-export', 'health']) {
  const f = features.find((x) => x.key === key || x.key === `api-${key}`);
  if (!f || f.status !== 'missing') failures.push(`feature "${key}" should be "claimed but missing", got ${f ? f.status : 'nothing'}`);
}
const gift = features.find((x) => x.key === 'gift-card');
if (!gift || gift.status !== 'not-built-yet') failures.push(`feature "gift-card" should be "not built yet", got ${gift ? gift.status : 'nothing'}`);
for (const key of ['signup', 'dashboard']) {
  const f = features.find((x) => x.key === key);
  if (!f || f.status !== 'broken') failures.push(`feature "${key}" should be broken, got ${f ? f.status : 'nothing'}`);
}

if (typeof results.score !== 'number' || results.score < 20 || results.score > 80) {
  failures.push(`score ${results.score} is outside the expected 20-80 range for this buggy app`);
}

console.log(`TEA score: ${results.score}/100. Seeded bugs caught: ${caught.length} of ${bugs.length}${sandbox ? ' (with sandbox tests)' : ''}.`);
if (results.features) console.log(`Features: ${results.features.summary.total} found, ${results.features.summary.works} work, ${results.features.summary.broken} broken, ${results.features.summary.missing} claimed but missing.`);
for (const [step, list] of [...waiting.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  waiting for step ${step}: ${list.length} bug(s)`);
}
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed:`);
  for (const f of failures) console.error(`  x ${f}`);
  process.exit(1);
}
console.log('Every seeded bug that today\'s checks cover was caught, with no false positives.');
