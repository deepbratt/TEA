import { delimiter, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { useTempDirs } from '../__tests__/temp.js';
import { CatalogError, catalogFromEnv, checkIdOf, loadCatalog, renderFixPrompt } from './index.js';

const folder = useTempDirs('catalog');

const communityCheck = `id: community.leak
title: A check from a community pack
description: Something a community pack catches.
category: security
severity: high
detect: static-rule
rule: community:leak
fix_prompt: prompts/leak.md
version: 3
`;

describe('built-in catalog', () => {
  it('is all open source: runnable checks plus planned ones, nothing locked', async () => {
    const c = await loadCatalog();
    expect(c.get('crawl.server-error')).toMatchObject({ detect: 'crawl', severity: 'high' });
    expect(c.runnable.every((e) => e.rule)).toBe(true);
    expect(c.planned.map((e) => e.id)).toEqual(expect.arrayContaining(['auth.idor.deep', 'supabase.rls.correctness', 'stripe.edge-cases']));
    expect(c.runnable.length + c.planned.length).toBe(c.entries.length);
  });

  it('describes every check in plain English', async () => {
    for (const e of (await loadCatalog()).entries) expect(e.description, e.id).toMatch(/\w+ \w+/);
  });

  it('renders fix prompts from templates', async () => {
    const c = await loadCatalog();
    const text = renderFixPrompt(c.get('crawl.server-error'), { route: '/pricing', evidence: 'HTTP 500', file: 'app/pricing/page.tsx' });
    expect(text).toContain('/pricing');
    expect(text).toContain('app/pricing/page.tsx');
    expect(text).not.toContain('{route}');
  });

  it('maps finding ids to check ids', () => {
    expect(checkIdOf('crawl.api-failure:/pricing:/api/plans')).toBe('crawl.api-failure');
  });
});

describe('community check packs', () => {
  it('load from extra folders, with their prompts', async () => {
    const dir = await folder({ 'security/leak.yaml': communityCheck, 'prompts/leak.md': 'Fix {route}' });
    const c = await loadCatalog({ dirs: [dir] });
    expect(c.get('community.leak')).toMatchObject({ rule: 'community:leak', version: 3 });
    expect(renderFixPrompt(c.get('community.leak'), { route: '/api/orders/1' })).toBe('Fix /api/orders/1');
  });

  it('are configured from TEA_CHECKS', () => {
    expect(catalogFromEnv({})).toEqual({});
    expect(catalogFromEnv({ TEA_CHECKS: ['a', 'b'].join(delimiter) }).dirs).toEqual([resolve('a'), resolve('b')]);
  });
});

describe('guard rails', () => {
  it('refuses invalid entries and unknown fields', async () => {
    const bad = await folder({ 'a.yaml': 'id: a.b\ntitle: Something wrong\ncategory: nope\nseverity: low\nversion: 1\n' });
    await expect(loadCatalog({ dirs: [bad] })).rejects.toThrow(CatalogError);
    const extra = await folder({ 'a.yaml': 'id: a.b\ntitle: Something wrong\ncategory: security\nseverity: low\nversion: 1\nsurprise: 1\n' });
    await expect(loadCatalog({ dirs: [extra] })).rejects.toThrow(/additional properties/);
  });

  it('refuses duplicate ids, missing folders and prompts outside the catalog', async () => {
    const dup = await folder({ 'a.yaml': 'id: crawl.slow\ntitle: Duplicate entry\ncategory: performance\nseverity: low\nversion: 1\n' });
    await expect(loadCatalog({ dirs: [dup] })).rejects.toThrow(/Duplicate/);
    await expect(loadCatalog({ dirs: [join(tmpdir(), 'tea-no-such-folder')] })).rejects.toThrow(/not found/);
    const escape = await folder({
      'a.yaml': 'id: a.b\ntitle: Escaping prompt\ncategory: security\nseverity: low\ndetect: crawl\nrule: x:y\nfix_prompt: ../../etc/passwd\nversion: 1\n',
    });
    await expect(loadCatalog({ dirs: [escape] })).rejects.toThrow(/escapes/);
    const absolute = await folder({
      'a.yaml': `id: a.b
title: Absolute prompt
category: security
severity: low
detect: crawl
rule: x:y
fix_prompt: ${JSON.stringify(join(tmpdir(), 'x.md'))}
version: 1
`,
    });
    await expect(loadCatalog({ dirs: [absolute] })).rejects.toThrow(/escapes/);
  });
});
