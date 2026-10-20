import { sortFindings, type AppMap, type Finding, type Results, type Route } from '@tea-qa/core';
import { AREA_LABEL, scoreVerdict, summaryBody, topFindings } from './summary.js';

const SEV_ICON: Record<Finding['severity'], string> = { critical: '🔴', high: '🟠', medium: '🟡', low: '🔵', info: '⚪' };

const cell = (s: string | number | undefined | null) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const loc = (f: Finding) => (f.evidence?.file ? `${f.evidence.file}${f.evidence.line && f.evidence.line > 1 ? `:${f.evidence.line}` : ''}` : '');

export function renderMarkdown(results: Results, appMap: AppMap): string {
  const v = scoreVerdict(results.score);
  const out: string[] = [];
  out.push(`# Here's the TEA on your app: ${results.score ?? '–'}/100`);
  out.push('');
  out.push(`**${v.label}.** ${summaryBody(results.summary)}`);
  out.push('');
  out.push(`Target: ${[results.target.url, results.target.repo].filter(Boolean).join(' + ')}  `);
  out.push(`Run: ${results.startedAt} · TEA ${results.tool.version}`);
  out.push('');
  out.push('## Scores');
  out.push('');
  out.push('| Area | Score | Issues |');
  out.push('|---|---|---|');
  for (const a of results.areas) out.push(`| ${AREA_LABEL[a.area]} | ${a.score ?? 'not run yet'} | ${a.status === 'ran' ? a.findings : ''} |`);
  out.push('');

  const top = topFindings(results.findings);
  if (top.length) {
    out.push('## Fix these first');
    out.push('');
    top.forEach((f, i) => {
      out.push(`### ${i + 1}. ${SEV_ICON[f.severity]} ${f.title}`);
      out.push('');
      out.push(f.summary);
      out.push('');
      if (loc(f)) out.push(`**Where:** \`${loc(f)}\`  `);
      if (f.evidence?.url) out.push(`**Page:** ${f.evidence.url}  `);
      if (f.evidence?.screenshot) out.push(`**Screenshot:** [${f.evidence.screenshot}](${f.evidence.screenshot})`);
      if (f.steps?.length) {
        out.push('');
        out.push('**Steps to reproduce**');
        out.push('');
        f.steps.forEach((s, n) => out.push(`${n + 1}. ${s}`));
      }
      if (f.fix) {
        out.push('');
        out.push('**Paste this into your AI tool**');
        out.push('');
        out.push('```text');
        out.push(f.fix);
        out.push('```');
      }
      out.push('');
    });
  }

  out.push('## All issues');
  out.push('');
  if (!results.findings.length) out.push('No issues found in what TEA checked.');
  else {
    out.push('| Severity | Area | Issue | Where |');
    out.push('|---|---|---|---|');
    for (const f of sortFindings(results.findings)) {
      out.push(`| ${SEV_ICON[f.severity]} ${f.severity} | ${AREA_LABEL[f.area]} | ${cell(f.title)} | ${cell(loc(f) || f.evidence?.url)} |`);
    }
  }
  out.push('');
  out.push(renderFeatureMap(appMap, { heading: '## Feature map' }));
  return out.join('\n');
}

function status(r: Route): string {
  if (r.status === undefined) return r.kind === 'api' ? 'not called yet' : r.dynamic ? 'needs data (dynamic)' : 'not visited';
  return r.status >= 400 ? `❌ ${r.status}` : `✅ ${r.status}`;
}

export function renderFeatureMap(appMap: AppMap, opts: { heading?: string } = {}): string {
  const out: string[] = [];
  out.push(opts.heading ?? '# TEA feature map');
  out.push('');
  if (appMap.stack.length) {
    out.push(`**Stack:** ${appMap.stack.filter((s) => s.kind !== 'language').map((s) => s.name).join(', ')}`);
    out.push('');
  }
  const facts: [string, string[]][] = [
    ['Auth', appMap.auth],
    ['Payments', appMap.payments],
    ['Database', appMap.database.map((d) => `${d.kind}${d.models.length ? ` (${d.models.slice(0, 12).join(', ')}${d.models.length > 12 ? ', …' : ''})` : ''}`)],
    ['OpenAPI', appMap.openapi],
  ];
  for (const [k, v] of facts) if (v.length) out.push(`- **${k}:** ${v.join('; ')}`);
  const exposed = appMap.envVars.filter((e) => e.clientExposed).map((e) => e.name);
  if (appMap.envVars.length) out.push(`- **Env vars:** ${appMap.envVars.length} used${exposed.length ? `, ${exposed.length} bundled into the browser (${exposed.join(', ')})` : ''}`);
  out.push(`- **Forms:** ${appMap.forms.length}`);
  out.push('');

  const pages = appMap.routes.filter((r) => r.kind === 'page');
  const apis = appMap.routes.filter((r) => r.kind === 'api');
  if (pages.length) {
    out.push('### Pages');
    out.push('');
    out.push('| Route | Found in | Live status | Linked in UI | File |');
    out.push('|---|---|---|---|---|');
    for (const r of pages) {
      const linked = r.reachableFromUi === undefined ? '' : r.reachableFromUi ? 'yes' : 'no';
      out.push(`| \`${cell(r.path)}\` | ${r.source} | ${status(r)} | ${linked} | ${cell(r.file ? `${r.file}` : '')} |`);
    }
    out.push('');
    const orphans = pages.filter((r) => r.reachableFromUi === false && !r.dynamic);
    if (orphans.length) {
      out.push(`> ${orphans.length} page(s) exist in the code but nothing in the UI links to them: ${orphans.map((r) => `\`${r.path}\``).join(', ')}. Either link them or remove them.`);
      out.push('');
    }
  }
  if (apis.length) {
    out.push('### API endpoints');
    out.push('');
    out.push('| Endpoint | Methods | File |');
    out.push('|---|---|---|');
    for (const r of apis) out.push(`| \`${cell(r.path)}\` | ${r.methods?.join(', ') ?? '?'} | ${cell(r.file ? `${r.file}${r.line && r.line > 1 ? `:${r.line}` : ''}` : '')} |`);
    out.push('');
  }
  if (appMap.notes.length) {
    out.push('### Notes');
    out.push('');
    for (const n of appMap.notes) out.push(`- ${n}`);
    out.push('');
  }
  return out.join('\n');
}
