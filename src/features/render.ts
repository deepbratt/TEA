import type { Feature, FeatureCheck, FeatureReport, FeatureStatus } from './types.js';

export const STATUS_LABEL: Record<FeatureStatus, string> = {
  works: 'Works',
  broken: 'Broken',
  partial: 'Partly works',
  missing: 'Claimed but missing',
  'not-built-yet': 'Not built yet',
  untested: 'Not tested yet',
};

export const STATUS_ICON: Record<FeatureStatus, string> = {
  works: '✅',
  broken: '❌',
  partial: '⚠️',
  missing: '⛔',
  'not-built-yet': '⏳',
  untested: '⚪',
};

const RESULT_ICON: Record<FeatureCheck['result'], string> = { pass: '✓', fail: '✕', skip: '–' };

const cell = (s: string | undefined) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

/** The features to show: all but the ones hidden in the project settings. */
export const visibleFeatures = (r: FeatureReport): Feature[] => r.features.filter((f) => !r.hidden.includes(f.key));

/** "14 features: 9 work, 3 broken, 1 partly works, 1 claimed but missing". */
export function featureLine(r: FeatureReport): string {
  const s = r.summary;
  const parts: [number, string][] = [
    [s.works, s.works === 1 ? 'works' : 'work'],
    [s.broken, 'broken'],
    [s.partial, s.partial === 1 ? 'partly works' : 'partly work'],
    [s.missing, 'claimed but missing'],
    [s.notBuiltYet, 'not built yet'],
    [s.untested, 'not tested yet'],
  ];
  const shown = parts.filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}`);
  return `${s.total} feature${s.total === 1 ? '' : 's'}${shown.length ? `: ${shown.join(', ')}` : ''}${s.coverage === null ? '' : ` (feature coverage ${s.coverage}%)`}`;
}

function made(f: Feature): string[] {
  const out: string[] = [];
  if (f.pages.length) out.push(`**Pages:** ${f.pages.map((p) => `\`${p}\``).join(', ')}`);
  if (f.endpoints.length) out.push(`**API:** ${f.endpoints.map((p) => `\`${p}\``).join(', ')}`);
  if (f.calls.length) out.push(`**Calls:** ${f.calls.map((p) => `\`${p}\``).join(', ')}`);
  if (f.models.length) out.push(`**Data:** ${f.models.join(', ')}`);
  if (f.integrations.length) out.push(`**Uses:** ${f.integrations.join(', ')}`);
  return out;
}

/** features.md: every feature, its test plan and what happened. Readable without TEA. */
export function renderFeaturesMarkdown(report: FeatureReport, opts: { heading?: string } = {}): string {
  const r = { ...report, features: visibleFeatures(report) };
  const out: string[] = [];
  out.push(opts.heading ?? '# Features TEA found');
  out.push('');
  out.push(`${featureLine(r)}.`);
  out.push('');
  if (r.docs.length) out.push(`Docs read for claims: ${r.docs.map((d) => `\`${d}\``).join(', ')}.`);
  else out.push('No agent docs found (CLAUDE.md, AGENTS.md, .cursorrules, README, TODO, PRD): add one and TEA checks what it claims.');
  out.push(r.sandbox ? 'Sandbox tests ran: TEA submitted forms with test data on your local app.' : 'Sandbox tests were off: forms were not submitted. Turn them on for a local app to test forms and APIs.');
  out.push('');
  out.push('| Feature | Status | Checks passed | In the docs |');
  out.push('|---|---|---|---|');
  for (const f of r.features) {
    const ran = f.checks.filter((c) => c.result !== 'skip');
    const docs = f.origin === 'docs' ? 'only in the docs' : f.claims.length ? 'yes' : r.docs.length ? 'no' : '';
    out.push(`| ${cell(f.name)} | ${STATUS_ICON[f.status]} ${STATUS_LABEL[f.status]} | ${ran.filter((c) => c.result === 'pass').length}/${ran.length} | ${docs} |`);
  }
  out.push('');
  for (const f of r.features) {
    out.push(`## ${STATUS_ICON[f.status]} ${f.name}: ${STATUS_LABEL[f.status]}`);
    out.push('');
    const facts = made(f);
    if (facts.length) {
      out.push(facts.join('  \n'));
      out.push('');
    }
    if (f.checks.length) {
      out.push('| | Given | When | Then | Result |');
      out.push('|---|---|---|---|---|');
      for (const c of f.checks) out.push(`| ${RESULT_ICON[c.result]} | ${cell(c.given ?? '')} | ${cell(c.when)} | ${cell(c.then)} | ${cell(c.detail ?? c.result)} |`);
      out.push('');
    }
    if (f.findings.length) {
      out.push(`Issues: ${f.findings.map((id) => `\`${id}\``).join(', ')}`);
      out.push('');
    }
  }
  if (r.hidden.length) out.push(`Hidden (marked "not a feature"): ${r.hidden.join(', ')}.`);
  return out.join('\n');
}
