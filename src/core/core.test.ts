import { describe, expect, it } from 'vitest';
import {
  Masker,
  looksSecretName,
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
    // Fake secrets are assembled at runtime so secret scanners don't flag this test file.
    const stripeKey = ['sk', 'live', 'abcdefghijklmnop'].join('_');
    const jwt = [['ey', 'JhbGciOiJIUzI1NiJ9'].join(''), ['ey', 'JzdWIiOiIxMjM0NTY3ODkwIn0'].join(''), 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'].join('.');
    const out = m.mask(`pw=hunter2-super-secret key=${stripeKey} jwt=${jwt}`);
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
    const value = ['abc', 'def', '123456'].join('');
    m.addFromEnv({ ['STRIPE_' + 'SECRET_KEY']: value, NODE_ENV: 'production' });
    expect(m.mask(`${value} production`)).toBe('**** production');
  });

  it('decides secret env var names by whole name parts', () => {
    for (const n of ['STRIPE_SECRET_KEY', 'OPENAI_API_KEY', 'DB_PWD', 'GITHUB_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'NEXTAUTH_SECRET', 'SMTP_PASS']) {
      expect(looksSecretName(n), n).toBe(true);
    }
    for (const n of ['PWD', 'OLDPWD', 'AUTHOR_NAME', 'KEYBOARD_LAYOUT', 'PATH', 'HOME', 'NODE_ENV', 'TOKENIZER_MODE']) {
      expect(looksSecretName(n), n).toBe(false);
    }
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

  it('cannot be dodged by encoding, case, slashes, dot segments or params', () => {
    for (const p of ['/%61dmin', '/ADMIN', '//admin/', '/x/../admin/users', '/admin;jsessionid=1', '/Admin/%2E%2E/admin', '/LOGOUT']) {
      expect(scope.canVisit(`https://staging.example.com${p}`), p).toBe(false);
    }
    expect(scope.isSkipped('/admin%2Fusers')).toBe(true); // encoded separator: fail closed
    expect(scope.isSkipped('/%E0%A4%A')).toBe(true); // bad encoding: fail closed
    expect(scope.canVisit('https://staging.example.com/pricing')).toBe(true);
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
    expect(() => expandEnv({ accounts: [{ email: 'a', password: '${TEA_NOPE}' }] }, {})).toThrow(/not set/);
  });

  it('never expands env vars outside account credentials or without the TEA_ prefix', () => {
    const env = { OPENAI_API_KEY: 'sk-should-not-leak', TEA_X: 'x' };
    const raw = { urls: ['https://evil.example/?k=${OPENAI_API_KEY}'], accounts: [] };
    expect(expandEnv(raw, env).urls[0]).toBe('https://evil.example/?k=${OPENAI_API_KEY}');
    expect(() => expandEnv({ accounts: [{ email: 'a', password: '${OPENAI_API_KEY}' }] }, env)).toThrow(/TEA_/);
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
    expect(() => matchRoute('/blog/%E0%A4%A', routes)).not.toThrow();
  });

  it('detects dynamic segments in any framework syntax', () => {
    for (const p of ['/a/[id]', '/a/:id', '/a/{id}', '/a/<int:id>', '/a/*']) expect(isDynamicPath(p)).toBe(true);
    expect(isDynamicPath('/a/b')).toBe(false);
  });
});
