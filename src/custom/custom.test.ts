import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDirs } from '../__tests__/temp.js';
import { loadCatalog } from '../core/index.js';
import { Workspace } from '../workspace/index.js';
import { CUSTOM_RULE_TEMPLATES, CustomRuleSchema, customFindings, type CustomRule } from './index.js';

const dir = useTempDirs('custom');
const rule = (r: Partial<CustomRule> & Pick<CustomRule, 'id' | 'type'>): CustomRule => CustomRuleSchema.parse({ title: r.id, ...r });

describe('custom rules', () => {
  it('forbid-text reports each file, require-text and require-file report what is missing', async () => {
    const app = await dir({
      'src/a.ts': 'const x = 1;\nconsole.log(x);',
      'src/b.tsx': '// TODO: wire this up',
      'src/a.test.ts': 'console.log("tests are ignored")',
      'README.md': '# app',
    });
    const { findings, ran } = await customFindings(
      [
        rule({ id: 'no-console', type: 'forbid-text', text: 'console.log(', severity: 'low' }),
        rule({ id: 'no-todo', type: 'forbid-text', text: '\\bTODO\\b', regex: true }),
        rule({ id: 'cookie-banner', type: 'require-text', text: 'CookieBanner' }),
        rule({ id: 'env-example', type: 'require-file', files: '**/.env.example' }),
        rule({ id: 'readme', type: 'require-file', files: 'README*' }),
        rule({ id: 'off', type: 'forbid-text', text: 'const', enabled: false }),
      ],
      { sources: [{ name: 'web', path: app }], routes: [], pages: [] },
    );
    expect(ran).toEqual(['code']);
    expect(findings.map((f) => f.id).sort()).toEqual(['custom.cookie-banner:CookieBanner', 'custom.env-example:**/.env.example', 'custom.no-console:src/a.ts', 'custom.no-todo:src/b.tsx']);
    expect(findings.find((f) => f.id === 'custom.no-console:src/a.ts')).toMatchObject({ severity: 'low', area: 'code', evidence: { file: 'src/a.ts', line: 2 } });
  });

  it('require-route checks code routes and visited pages', async () => {
    const routes = [{ path: '/privacy', kind: 'page' as const, dynamic: false, source: 'code' as const }];
    const { findings } = await customFindings(
      [rule({ id: 'privacy', type: 'require-route', path: '/privacy*' }), rule({ id: 'terms', type: 'require-route', path: '/terms' })],
      { sources: [], routes, pages: [] },
    );
    expect(findings.map((f) => f.id)).toEqual(['custom.terms:/terms']);
  });

  it('validates rules in plain words', () => {
    expect(() => CustomRuleSchema.parse({ id: 'x', title: 'Missing text', type: 'forbid-text' })).toThrow(/which text/);
    expect(() => CustomRuleSchema.parse({ id: 'x', title: 'Bad path', type: 'require-route', path: 'privacy' })).toThrow(/starts with/);
    expect(() => CustomRuleSchema.parse({ id: 'x', title: 'Bad regex', type: 'forbid-text', text: '(', regex: true })).toThrow(/regular expression/);
    for (const t of CUSTOM_RULE_TEMPLATES) expect(() => CustomRuleSchema.parse(t), t.id).not.toThrow();
  });

  it('are saved in the config file and run with the project', async () => {
    const root = await dir();
    const app = await dir({ 'package.json': '{}', 'src/a.js': 'console.log(1)' });
    const ws = new Workspace(join(root, 'tea.config.yaml'), await loadCatalog());
    await ws.update((w) => {
      w.customRules.push(CustomRuleSchema.parse(CUSTOM_RULE_TEMPLATES.find((t) => t.id === 'no-console-log')));
    });
    const { data, text } = await ws.read();
    expect(text).toContain('id: no-console-log');
    expect(text).toContain('# Your own rules, no code needed');
    const { findings } = await customFindings(data.customRules, { sources: [{ name: 'app', path: app }], routes: [], pages: [] });
    expect(findings.map((f) => f.id)).toEqual(['custom.no-console-log:src/a.js']);
  });
});
