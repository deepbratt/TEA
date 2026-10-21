import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildAppMap, masker, overallScore, scoreAreas, type Finding, type Results } from '../core/index.js';
import { plainSummary, renderHtml, renderMarkdown, scoreVerdict, writeReport } from './index.js';

const findings: Finding[] = [
  {
    id: 'crawl.server-error:/pricing',
    area: 'functional',
    severity: 'high',
    title: 'Page crashes with a server error (500): /pricing',
    summary: 'Nobody can see your plans <script>alert(1)</script>',
    evidence: { url: 'http://localhost:3000/pricing', screenshot: 'screenshots/001-pricing.png', file: 'app/pricing/page.tsx', line: 1 },
    fix: 'Fix the crash in app/pricing/page.tsx',
    steps: ['Open /pricing'],
    source: 'crawler',
  },
  { id: 'crawl.slow:/', area: 'performance', severity: 'medium', title: 'Slow page', summary: 's', source: 'crawler' },
];

const dirs: string[] = [];
afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

function results(): Results {
  const areas = scoreAreas(findings, ['functional', 'performance']);
  const score = overallScore(areas, findings);
  return {
    tool: { name: 'tea-qa', version: '0.1.0' },
    startedAt: '2026-10-20T00:00:00.000Z',
    finishedAt: '2026-10-20T00:01:00.000Z',
    target: { url: 'http://localhost:3000', repo: './app' },
    score,
    areas,
    findings,
    summary: plainSummary({ score, findings, pagesChecked: 3, stack: ['Next.js'], ranLabels: ['Functional', 'Performance'], notRunLabels: ['Security'] }),
    ran: ['functional', 'performance'],
    notRun: ['security'],
  };
}

const appMap = buildAppMap({
  target: { url: 'http://localhost:3000' },
  startUrl: 'http://localhost:3000',
  discovery: {
    stack: [{ id: 'nextjs', name: 'Next.js', kind: 'framework', confidence: 'high', evidence: [] }],
    routes: [
      { path: '/', kind: 'page', dynamic: false, source: 'code', file: 'app/page.tsx' },
      { path: '/pricing', kind: 'page', dynamic: false, source: 'code', file: 'app/pricing/page.tsx' },
      { path: '/admin', kind: 'page', dynamic: false, source: 'code', file: 'app/admin/page.tsx' },
      { path: '/api/plans', kind: 'api', methods: ['GET'], dynamic: false, source: 'code', file: 'app/api/plans/route.ts' },
    ],
    forms: [],
    auth: [],
    envVars: [{ name: 'NEXT_PUBLIC_KEY', clientExposed: true, files: ['a.ts'] }],
    envFiles: [],
    database: [],
    payments: ['Stripe'],
    openapi: [],
    notes: [],
  },
  pages: [
    { url: 'http://localhost:3000/', path: '/', status: 200, consoleErrors: [], pageErrors: [], failedRequests: [], links: [], buttons: [], forms: [], brokenImages: [], referrers: [] },
    { url: 'http://localhost:3000/pricing', path: '/pricing', status: 500, consoleErrors: [], pageErrors: [], failedRequests: [], links: [], buttons: [], forms: [], brokenImages: [], referrers: ['http://localhost:3000/'] },
    { url: 'http://localhost:3000/new-ui-only', path: '/new-ui-only', status: 200, consoleErrors: [], pageErrors: [], failedRequests: [], links: [], buttons: [], forms: [], brokenImages: [], referrers: ['http://localhost:3000/'] },
  ],
});

describe('app map merge', () => {
  it('marks routes seen in code and UI, UI-only pages, and orphans', () => {
    const by = Object.fromEntries(appMap.routes.map((r) => [r.path, r]));
    expect(by['/pricing']).toMatchObject({ source: 'both', status: 500, reachableFromUi: true });
    expect(by['/admin']).toMatchObject({ source: 'code', reachableFromUi: false });
    expect(by['/new-ui-only']).toMatchObject({ source: 'ui', status: 200 });
  });
});

describe('report', () => {
  it('summarises in plain English', () => {
    const r = results();
    expect(r.summary).toMatch(/^Here's the TEA on your app: \d+\/100/);
    expect(r.summary).toContain('Fix this first: Page crashes');
    expect(r.summary).toContain('Not checked in this run: Security');
    expect(scoreVerdict(95).label).toBe('Piping hot');
    expect(scoreVerdict(null).tone).toBe('none');
  });

  it('renders escaped HTML with the top fixes', () => {
    const html = renderHtml(results(), appMap);
    expect(html).toContain("Here's the TEA on your app");
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('screenshots/001-pricing.png');
    expect(html).toContain('Paste this into your AI tool');
    expect(html).toContain('Not run yet');
  });

  it('renders markdown with a feature map', () => {
    const md = renderMarkdown(results(), appMap);
    expect(md).toContain('## Fix these first');
    expect(md).toContain('`app/pricing/page.tsx`');
    expect(md).toContain('| `/pricing` | both | ❌ 500 | yes |');
    expect(md).toMatch(/nothing in the UI links to them: `\/admin`/);
  });

  it('writes all files and masks secrets', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tea-report-'));
    dirs.push(dir);
    masker.add('super-secret-password-123');
    const r = results();
    r.findings = [{ ...findings[0]!, summary: 'login used super-secret-password-123' }];
    const out = await writeReport(dir, r, appMap);
    expect(out.files).toEqual(['results.json', 'app-map.json', 'feature-map.md', 'report.md', 'report.html']);
    for (const f of out.files) expect(await readFile(join(dir, f), 'utf8')).not.toContain('super-secret-password-123');
    expect(JSON.parse(await readFile(join(dir, 'results.json'), 'utf8')).score).toBe(r.score);
  });
});
