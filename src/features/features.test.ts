import { describe, expect, it } from 'vitest';
import { emptyDiscovery, evaluateGate, loadCatalog, type Discovery, type Finding, type PageVisit } from '../core/index.js';
import { scanSources, sourceFromPath } from '../repo-map/index.js';
import { useTempDirs } from '../__tests__/temp.js';
import {
  assertSandboxAllowed,
  buildCodeIndex,
  buildInventory,
  claimFindings,
  claimPaths,
  evaluateFeatures,
  featureKey,
  isDocFile,
  matchClaim,
  parseClaims,
  renderFeaturesMarkdown,
  stripComments,
  type CodeIndex,
  type MatchContext,
} from './index.js';

const tempRepo = useTempDirs('features');

describe('parseClaims', () => {
  it('reads list items under feature headings, skips rules and setup, and honours checkboxes', () => {
    const md = [
      '# My app',
      '## Rules for this codebase',
      '- All API routes require auth.',
      "## What's built",
      '- CSV export of orders: done.',
      '- Gift cards (not started)',
      '## Next.js setup',
      '- npm install',
      '- Run the dev server',
      '## Roadmap',
      '- Dark mode',
      '```',
      '- not a claim (in a code fence)',
      '```',
    ].join('\n');
    const claims = parseClaims('CLAUDE.md', md);
    expect(claims.map((c) => [c.text, c.status, c.line])).toEqual([
      ['CSV export of orders: done.', 'done', 5],
      ['Gift cards (not started)', 'planned', 6],
      ['Dark mode', 'planned', 11],
    ]);
  });

  it('treats a TODO file as planned unless the box is ticked', () => {
    const claims = parseClaims('TODO.md', '# TODO\n\n- [x] Shop page\n- [ ] Gift cards\n- Loyalty points\n');
    expect(claims.map((c) => [c.text, c.status])).toEqual([
      ['Shop page', 'done'],
      ['Gift cards', 'planned'],
      ['Loyalty points', 'planned'],
    ]);
  });

  it('only takes checkboxes from rule files like .cursorrules', () => {
    expect(parseClaims('.cursorrules', '## Features\n- Always use TypeScript\n- [x] Login page\n').map((c) => c.text)).toEqual(['Login page']);
  });
});

describe('doc files and comments', () => {
  it('knows agent docs at the root, in docs/ and in editor rule folders', () => {
    for (const f of ['CLAUDE.md', 'AGENTS.md', 'README.md', 'TODO.md', 'docs/PRD.md', '.cursorrules', '.cursor/rules/app.mdc', '.github/copilot-instructions.md']) expect(isDocFile(f)).toBe(true);
    for (const f of ['src/README.md', 'node_modules/x/README.md', 'CHANGELOG.md', 'notes.md']) expect(isDocFile(f)).toBe(false);
  });

  it('strips comments but keeps URLs and strings', () => {
    const code = "// rate limit here\nconst u = 'http://x.test/a'; /* throttle */ const t = 'text/csv';\n{/* JSX comment */}";
    const out = stripComments(code, 'a.tsx');
    expect(out).not.toMatch(/rate limit|throttle|JSX/);
    expect(out).toContain("'http://x.test/a'");
    expect(out).toContain('text/csv');
    expect(stripComments('# send_mail later\nx = 1', 'a.py')).not.toContain('send_mail');
  });
});

describe('featureKey', () => {
  it('names features after the first meaningful path segment, with aliases', () => {
    expect(featureKey('/')).toBe('home');
    expect(featureKey('/orders/[id]')).toBe('order');
    expect(featureKey('/api/orders')).toBe('order');
    expect(featureKey('/api/v1/sign-in')).toBe('login');
    expect(featureKey('/reset-password')).toBe('password-reset');
    expect(featureKey('/api/password-reset')).toBe('password-reset');
    expect(featureKey('/api/plans')).toBe('pricing');
  });
});

function ctx(over: Partial<MatchContext> & { code?: Record<string, string>; deps?: string[] } = {}): MatchContext {
  const index: CodeIndex = { files: Object.keys(over.code ?? {}), deps: new Set(over.deps ?? []), code: new Map(Object.entries(over.code ?? {})), docs: new Map() };
  return { routes: [], calls: [], endpoints: [], stack: [], models: [], ...over, index };
}

describe('matchClaim', () => {
  const raw = (text: string) => ({ text, file: 'CLAUDE.md', line: 3, status: 'done' as const });

  it('finds paths the docs name, and flags the ones nothing serves', () => {
    expect(claimPaths('Health check at /api/health, and /orders/:id.')).toEqual(['/api/health', '/orders/:id']);
    const c = matchClaim(raw('Order history on /orders, health at /api/health'), ctx({ routes: [{ path: '/orders', kind: 'page', dynamic: false, source: 'code' }] }));
    expect(c.found).toContain('page /orders');
    expect(c.missing.map((m) => m.key)).toEqual(['/api/health']);
  });

  it('checks capabilities against libraries and code, not comments', () => {
    const missing = matchClaim(raw('Order confirmation emails are sent after checkout'), ctx({ code: { 'app/a.ts': 'const x = 1;' } }));
    expect(missing.missing.map((m) => m.key)).toEqual(['email']);
    const byDep = matchClaim(raw('Order confirmation emails are sent after checkout'), ctx({ deps: ['resend'] }));
    expect(byDep.missing).toEqual([]);
    expect(byDep.found).toContain('dependency resend');
    const byCode = matchClaim(raw('Login is rate limited (5 attempts per minute)'), ctx({ code: { 'lib/limit.ts': 'export const limiter = new Ratelimit()' } }));
    expect(byCode.missing).toEqual([]);
  });

  it('flags a thing the UI calls but nothing serves', () => {
    const c = matchClaim(
      raw('Wishlist: done. Saved teas show on the dashboard.'),
      ctx({ calls: [{ path: '/api/wishlist', method: 'GET', file: 'app/w.tsx', line: 4, via: 'code' }], routes: [{ path: '/dashboard', kind: 'page', dynamic: false, source: 'code' }] }),
    );
    expect(c.missing.map((m) => m.key)).toEqual(['wishlist']);
    expect(c.found).toContain('page /dashboard');
  });

  it("leaves claims it can't check unverified, and doesn't check planned ones", () => {
    expect(matchClaim(raw('Delightful onboarding'), ctx()).verified).toBe(false);
    const planned = matchClaim({ ...raw('CSV export'), status: 'planned' }, ctx());
    expect(planned.missing).toEqual([]);
  });
});

function discovery(over: Partial<Discovery>): Discovery {
  return { ...emptyDiscovery(), ...over };
}

describe('buildInventory', () => {
  const d = discovery({
    routes: [
      { path: '/', kind: 'page', file: 'app/page.tsx', dynamic: false, source: 'code' },
      { path: '/pricing', kind: 'page', file: 'app/pricing/page.tsx', dynamic: false, source: 'code' },
      { path: '/dashboard', kind: 'page', file: 'app/dashboard/page.tsx', dynamic: false, source: 'code' },
      { path: '/orders', kind: 'page', file: 'app/orders/page.tsx', dynamic: false, source: 'code' },
      { path: '/api/plans', kind: 'api', methods: ['GET'], file: 'app/api/plans/route.ts', dynamic: false, source: 'code' },
      { path: '/api/stats', kind: 'api', methods: ['GET'], file: 'app/api/stats/route.ts', dynamic: false, source: 'code' },
      { path: '/api/orders/[id]', kind: 'api', methods: ['GET'], file: 'app/api/orders/[id]/route.ts', dynamic: true, source: 'code' },
      { path: '/api/reviews', kind: 'api', methods: ['POST'], file: 'app/api/reviews/route.ts', dynamic: false, source: 'code' },
    ],
    apiCalls: [
      { path: '/api/plans', method: 'GET', file: 'app/pricing/page.tsx', line: 3, via: 'code' },
      { path: '/api/stats', method: 'GET', file: 'app/dashboard/widgets.tsx', line: 9, via: 'code' },
      { path: '/api/stats', method: 'GET', file: 'components/Shared.tsx', line: 2, via: 'code' },
    ],
    forms: [{ location: 'app/dashboard/widgets.tsx:20', fields: [] }],
    database: [{ kind: 'prisma', models: ['Order', 'User'] }],
    payments: ['Stripe'],
  });

  it('groups pages with the API routes and calls behind them', () => {
    const features = buildInventory({ discovery: d });
    const by = (k: string) => features.find((f) => f.key === k)!;
    expect(features[0]!.key).toBe('home');
    expect(by('pricing').endpoints).toEqual(['GET /api/plans']);
    expect(by('pricing').integrations).toEqual(['Stripe']);
    // /api/stats has no page of its own, but only the dashboard's folder calls it.
    expect(by('dashboard').endpoints).toEqual(['GET /api/stats']);
    expect(by('dashboard').calls).toEqual(['GET /api/stats']);
    expect(by('dashboard').forms).toEqual(['app/dashboard/widgets.tsx:20']);
    expect(by('order').endpoints).toEqual(['GET /api/orders/[id]']);
    expect(by('order').models).toEqual(['Order']);
    expect(by('review').name).toBe('Reviews (API)');
  });

  it('adds what the docs claim, on the feature they talk about or on their own', async () => {
    const root = await tempRepo({
      'package.json': JSON.stringify({ dependencies: { next: '15.0.0' } }),
      'app/page.tsx': 'export default function Home() { return <a href="/dashboard">Dash</a>; }',
      'app/dashboard/page.tsx': "export default function D() { fetch('/api/wishlist'); return <button>Export</button>; }",
      'CLAUDE.md': "## What's built\n- CSV export: the Export button on /dashboard downloads a CSV.\n- Health check at /api/health.\n\n## Roadmap\n- Gift cards (not started)\n",
    });
    const sources = [sourceFromPath(root)];
    const scan = await scanSources(sources);
    const index = await buildCodeIndex(sources);
    const features = buildInventory({ discovery: scan, wiring: scan.wiring, index });
    const dash = features.find((f) => f.key === 'dashboard')!;
    expect(dash.origin).toBe('both');
    expect(dash.claims[0]!.missing.map((m) => m.key)).toEqual(['csv-export']);
    const health = features.find((f) => f.key === 'api-health')!;
    expect([health.origin, health.name]).toEqual(['docs', 'Health check']);
    expect(features.find((f) => f.key === 'gift-card')?.claims[0]?.status).toBe('planned');

    const catalog = await loadCatalog();
    const findings = claimFindings(features, catalog);
    expect(findings.map((f) => [f.id, f.severity])).toEqual([
      ['features.claimed-missing:csv-export', 'high'],
      ['features.claimed-missing:/api/health', 'high'],
      ['features.not-built-yet:gift-card', 'info'],
    ]);
    // Doc text only reaches fix prompts inside the untrusted-evidence block.
    expect(findings[0]!.fix).toContain('UNTRUSTED EVIDENCE');

    const report = evaluateFeatures(features, { findings, pages: [], live: false, wiring: scan.wiring.comparable, docs: [...index.docs.keys()] });
    const status = (k: string) => report.features.find((f) => f.key === k)!.status;
    expect(status('api-health')).toBe('missing');
    expect(status('gift-card')).toBe('not-built-yet');
    expect(status('dashboard')).toBe('partial');
    expect(report.summary.coverage).toBeNull();
    expect(renderFeaturesMarkdown(report)).toContain('| Dashboard | ⚠️ Partly works |');
  });
});

describe('evaluateFeatures', () => {
  const visit = (path: string, over: Partial<PageVisit> = {}): PageVisit => ({
    url: `http://localhost:3000${path}`,
    path,
    status: 200,
    loadMs: 300,
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    links: [],
    buttons: [],
    forms: [],
    brokenImages: [],
    referrers: [],
    ...over,
  });
  const finding = (id: string, severity: Finding['severity'] = 'high'): Finding => ({ id, area: 'functional', severity, title: id, summary: id, source: 'crawler' });
  const d = discovery({
    routes: [
      { path: '/shop', kind: 'page', file: 'app/shop/page.tsx', dynamic: false, source: 'code' },
      { path: '/about', kind: 'page', file: 'app/about/page.tsx', dynamic: false, source: 'code' },
      { path: '/blog', kind: 'page', file: 'app/blog/page.tsx', dynamic: false, source: 'code' },
      { path: '/signup', kind: 'page', file: 'app/signup/page.tsx', dynamic: false, source: 'code' },
    ],
    apiCalls: [{ path: '/api/signup', method: 'POST', file: 'app/signup/page.tsx', line: 4, via: 'form' }],
  });

  it('runs each feature’s plan against what the run saw', () => {
    const findings = [finding('crawl.js-crash:/about'), finding('crawl.slow:/blog', 'medium'), finding('wiring.orphan-call:POST /api/signup')];
    const report = evaluateFeatures(buildInventory({ discovery: d }), {
      findings,
      pages: [visit('/shop'), visit('/about'), visit('/blog'), visit('/signup')],
      live: true,
      wiring: true,
    });
    const by = (k: string) => report.features.find((f) => f.key === k)!;
    expect(by('shop').status).toBe('works');
    expect(by('about').status).toBe('broken');
    expect(by('about').findings).toEqual(['crawl.js-crash:/about']);
    expect(by('blog').status).toBe('partial');
    expect(by('signup').status).toBe('broken');
    expect(by('signup').checks.find((c) => c.id === 'call:POST /api/signup')?.result).toBe('fail');
    expect(by('signup').checks.find((c) => c.id === 'form:sandbox-off')?.result).toBe('skip');
    expect(report.summary).toMatchObject({ total: 4, works: 1, broken: 2, partial: 1, coverage: 25 });

    const gate = evaluateGate({ conditions: [{ metric: 'broken-features', op: 'gt', value: 0 }, { metric: 'feature-coverage', op: 'lt', value: 50 }] }, { score: 50, areas: [], findings, features: report });
    expect(gate.conditions.map((c) => [c.actual, c.failed])).toEqual([[2, true], [25, true]]);
  });

  it('leaves out hidden features, and says what wasn’t tested', () => {
    const report = evaluateFeatures(buildInventory({ discovery: d }), { findings: [], pages: [], live: false, wiring: false, hidden: ['blog'] });
    expect(report.features.find((f) => f.key === 'blog')).toBeDefined();
    expect(report.hidden).toEqual(['blog']);
    expect(report.summary.total).toBe(3);
    expect(renderFeaturesMarkdown(report)).not.toContain('| Blog |');
    expect(report.features.every((f) => f.status === 'untested')).toBe(true);
    expect(report.features[0]!.checks[0]!.detail).toMatch(/didn't open the app/);
  });
});

describe('sandbox guard', () => {
  it('only allows local apps', () => {
    expect(() => assertSandboxAllowed('http://localhost:3000')).not.toThrow();
    expect(() => assertSandboxAllowed('http://127.0.0.1:8080/app')).not.toThrow();
    expect(() => assertSandboxAllowed('https://staging.myapp.com')).toThrow(/only run on an app on your own computer/);
    expect(() => assertSandboxAllowed('https://myapp.com')).toThrow();
  });
});
