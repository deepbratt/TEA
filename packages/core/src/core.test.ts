import { describe, expect, it } from 'vitest';
import {
  Masker,
  Scope,
  classifyUrl,
  expandEnv,
  masker,
  exceedsThreshold,
  globToRegExp,
  isDynamicPath,
  matchRoute,
  overallScore,
  parseConfig,
  scoreAreas,
  type Finding,
  type Route,
} from './index.js';

const finding = (severity: Finding['severity'], area: Finding['area'] = 'functional'): Finding => ({
  id: `${area}.${severity}.${Math.random()}`,
  area,
  severity,
  title: 't',
  summary: 's',
  source: 'test',
});

describe('Masker', () => {
  it('masks registered values and known secret patterns', () => {
    const m = new Masker();
    m.add('hunter2-super-secret');
    const out = m.mask('pw=hunter2-super-secret key=sk_live_abcdefghijklmnop jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U');
    expect(out).not.toContain('hunter2-super-secret');
    expect(out).not.toContain('abcdefghijklmnop');
    expect(out).not.toContain('dozjgNryP4J3');
  });

  it('masks credentials inside URLs but keeps the scheme', () => {
    const m = new Masker();
    expect(m.mask('postgres://admin:pa55word@db.example.com/app')).toBe('postgres://****:****@db.example.com/app');
  });

  it('picks secret-looking env vars only', () => {
    const m = new Masker();
    m.addFromEnv({ STRIPE_SECRET_KEY: 'abcdef123456', NODE_ENV: 'production' });
    expect(m.mask('abcdef123456 production')).toBe('**** production');
  });

  it('deep-masks objects', () => {
    const m = new Masker();
    m.add('topsecretvalue');
    expect(m.maskDeep({ a: ['x topsecretvalue'], b: 3 })).toEqual({ a: ['x topsecretvalue'.replace('topsecretvalue', 'tops****')], b: 3 });
  });
});

describe('Scope', () => {
  const scope = new Scope({ urls: ['https://staging.example.com'], allowlist: ['api.example.com'], skip: ['/admin/**', '/logout'] });

  it('allows only listed hosts', () => {
    expect(scope.isAllowed('https://staging.example.com/a')).toBe(true);
    expect(scope.isAllowed('https://api.example.com/v1')).toBe(true);
    expect(scope.isAllowed('https://evil.com/')).toBe(false);
    expect(scope.isAllowed('mailto:a@b.c')).toBe(false);
  });

  it('respects the skip list', () => {
    expect(scope.canVisit('https://staging.example.com/admin')).toBe(false);
    expect(scope.canVisit('https://staging.example.com/admin/users/1')).toBe(false);
    expect(scope.canVisit('https://staging.example.com/logout')).toBe(false);
    expect(scope.canVisit('https://staging.example.com/administer')).toBe(true);
  });

  it('globs', () => {
    expect(globToRegExp('/blog/*').test('/blog/post')).toBe(true);
    expect(globToRegExp('/blog/*').test('/blog/a/b')).toBe(false);
  });
});

describe('classifyUrl', () => {
  it('classifies local, preview and production hosts', () => {
    expect(classifyUrl('http://localhost:3000')).toBe('local');
    expect(classifyUrl('http://app.localhost')).toBe('local');
    expect(classifyUrl('https://staging.example.com')).toBe('preview');
    expect(classifyUrl('https://myapp-git-feature-me.vercel.app')).toBe('preview');
    expect(classifyUrl('https://myapp.vercel.app')).toBe('production');
    expect(classifyUrl('https://myapp.dev')).toBe('production');
    expect(classifyUrl('https://example.com')).toBe('production');
  });
});

describe('scoring', () => {
  it('scores only areas that ran', () => {
    const areas = scoreAreas([finding('high'), finding('low')], ['functional']);
    const functional = areas.find((a) => a.area === 'functional')!;
    expect(functional.score).toBe(86);
    expect(areas.find((a) => a.area === 'security')!.status).toBe('not-run');
    expect(overallScore(areas)).toBe(86);
  });

  it('caps the overall score when anything is critical', () => {
    const fs = [finding('critical', 'security')];
    const areas = scoreAreas(fs, ['functional', 'security']);
    expect(overallScore(areas, fs)).toBeLessThanOrEqual(49);
  });

  it('returns null when nothing ran', () => {
    expect(overallScore(scoreAreas([], []))).toBeNull();
  });

  it('applies the fail-on threshold', () => {
    expect(exceedsThreshold([finding('high')], 'critical')).toBe(false);
    expect(exceedsThreshold([finding('high')], 'high')).toBe(true);
    expect(exceedsThreshold([finding('critical')], 'none')).toBe(false);
  });
});

describe('config', () => {
  it('works with zero config', () => {
    const c = parseConfig({});
    expect(c.crawl.maxPages).toBe(50);
    expect(c.failOn).toBe('critical');
    expect(c.llm.provider).toBe('none');
  });

  it('expands env vars and masks their values', () => {
    const c = parseConfig(expandEnv({ accounts: [{ email: 'a@b.co', password: '${TEA_PW}' }] }, { TEA_PW: 'expanded-secret-1' }));
    expect(c.accounts[0]!.password).toBe('expanded-secret-1');
    expect(masker.mask('x expanded-secret-1')).not.toContain('expanded-secret-1');
    expect(() => expandEnv('${NOPE_NOT_SET}', {})).toThrow(/not set/);
  });

  it('rejects unknown keys with a readable message', () => {
    expect(() => parseConfig({ urlz: [] })).toThrow(/Invalid tea.yaml/);
  });
});

describe('routes', () => {
  const routes: Route[] = [
    { path: '/', kind: 'page', dynamic: false, source: 'code' },
    { path: '/blog/[slug]', kind: 'page', dynamic: true, source: 'code', file: 'app/blog/[slug]/page.tsx' },
    { path: '/blog/new', kind: 'page', dynamic: false, source: 'code', file: 'app/blog/new/page.tsx' },
    { path: '/docs/[...rest]', kind: 'page', dynamic: true, source: 'code' },
    { path: '/users/:id', kind: 'api', dynamic: true, source: 'code' },
  ];

  it('prefers static over dynamic matches', () => {
    expect(matchRoute('/blog/new', routes)?.file).toBe('app/blog/new/page.tsx');
    expect(matchRoute('/blog/hello', routes)?.file).toBe('app/blog/[slug]/page.tsx');
    expect(matchRoute('/docs/a/b/c', routes)?.path).toBe('/docs/[...rest]');
    expect(matchRoute('/users/7', routes, 'api')?.path).toBe('/users/:id');
    expect(matchRoute('/', routes)?.path).toBe('/');
    expect(matchRoute('/nope', routes)).toBeUndefined();
  });

  it('detects dynamic segments in any framework syntax', () => {
    for (const p of ['/a/[id]', '/a/:id', '/a/{id}', '/a/<int:id>', '/a/*']) expect(isDynamicPath(p)).toBe(true);
    expect(isDynamicPath('/a/b')).toBe(false);
  });
});
