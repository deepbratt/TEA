import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { CatalogError, checkIdOf, loadCatalog, packsFromEnv, renderFixPrompt } from './index.js';

const dirs: string[] = [];
async function folder(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'tea-catalog-'));
  dirs.push(root);
  for (const [rel, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, rel)), { recursive: true });
    await writeFile(join(root, rel), content);
  }
  return root;
}
afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

const proEntry = `id: auth.idor.deep
title: Real pro IDOR probe
category: security
severity: critical
detect: sandbox-test
rule: pro:auth.idor.deep
fix_prompt: prompts/idor.md
suggest_only: true
pack: pro
version: 3
`;

describe('built-in catalog', () => {
  it('loads, validates and keeps pro checks as locked stubs', async () => {
    const c = await loadCatalog();
    expect(c.get('crawl.server-error')).toMatchObject({ pack: 'free', detect: 'crawl', severity: 'high' });
    expect(c.runnable.every((e) => e.pack === 'free')).toBe(true);
    expect(c.lockedPro.map((e) => e.id)).toEqual(expect.arrayContaining(['auth.idor.deep', 'supabase.rls.correctness', 'stripe.edge-cases']));
    for (const e of c.lockedPro) {
      expect(e.rule).toBeUndefined();
      expect(e.fix_prompt).toBeUndefined();
    }
  });

  it('renders fix prompts from templates', async () => {
    const c = await loadCatalog();
    const text = await renderFixPrompt(c.get('crawl.server-error')!, { route: '/pricing', evidence: 'HTTP 500', file: 'app/pricing/page.tsx' });
    expect(text).toContain('/pricing');
    expect(text).toContain('app/pricing/page.tsx');
    expect(text).not.toContain('{route}');
  });

  it('maps finding ids to check ids', () => {
    expect(checkIdOf('crawl.api-failure:/pricing:/api/plans')).toBe('crawl.api-failure');
  });
});

describe('guard rails', () => {
  it('refuses a pro rule written into a public catalog', async () => {
    const dir = await folder({ 'security/x.yaml': proEntry.replace('auth.idor.deep', 'community.leak'), 'prompts/idor.md': 'x' });
    await expect(loadCatalog({ dirs: [dir] })).rejects.toThrow(/must be a stub here/);
  });

  it('refuses free entries without a rule or prompt, and unknown fields', async () => {
    const bad = await folder({ 'a.yaml': 'id: a.b\ntitle: Something wrong\ncategory: security\nseverity: low\npack: free\nversion: 1\n' });
    await expect(loadCatalog({ dirs: [bad] })).rejects.toThrow(CatalogError);
    const extra = await folder({ 'a.yaml': 'id: a.b\ntitle: Something wrong\ncategory: security\nseverity: low\npack: pro\nversion: 1\nsurprise: 1\n' });
    await expect(loadCatalog({ dirs: [extra] })).rejects.toThrow(/additional properties/);
  });

  it('refuses duplicate ids and prompts outside the catalog', async () => {
    const dup = await folder({ 'a.yaml': 'id: crawl.slow\ntitle: Duplicate entry\ncategory: performance\nseverity: low\npack: pro\nversion: 1\n' });
    await expect(loadCatalog({ dirs: [dup] })).rejects.toThrow(/Duplicate/);
    const escape = await folder({
      'a.yaml': 'id: a.b\ntitle: Escaping prompt\ncategory: security\nseverity: low\ndetect: crawl\nrule: x:y\nfix_prompt: ../../etc/passwd\npack: free\nversion: 1\n',
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
pack: free
version: 1
`,
    });
    await expect(loadCatalog({ dirs: [absolute] })).rejects.toThrow(/escapes/);
  });
});

describe('pro packs', () => {
  it('stay locked without a licence key', async () => {
    const pack = await folder({ 'security/idor.yaml': proEntry, 'prompts/idor.md': 'Fix {route}' });
    const c = await loadCatalog({ packs: [{ name: 'tea-pro', dir: pack }] });
    expect(c.packs).toEqual([{ name: 'tea-pro', loaded: false, reason: 'no TEA_LICENSE_KEY set' }]);
    expect(c.get('auth.idor.deep')!.rule).toBeUndefined();
  });

  it('replace their stubs when licensed', async () => {
    const pack = await folder({ 'security/idor.yaml': proEntry, 'prompts/idor.md': 'Fix {route}' });
    const c = await loadCatalog({ packs: [{ name: 'tea-pro', dir: pack }], licenseKey: 'test-key' });
    expect(c.packs[0]!.loaded).toBe(true);
    expect(c.get('auth.idor.deep')).toMatchObject({ rule: 'pro:auth.idor.deep', version: 3 });
    expect(c.lockedPro.map((e) => e.id)).not.toContain('auth.idor.deep');
    expect(await renderFixPrompt(c.get('auth.idor.deep')!, { route: '/api/orders/1' })).toBe('Fix /api/orders/1');
  });

  it('only accept full pro entries', async () => {
    const pack = await folder({ 'a.yaml': 'id: a.b\ntitle: Stub in a pack\ncategory: security\nseverity: low\npack: pro\nversion: 1\n' });
    await expect(loadCatalog({ packs: [{ name: 'p', dir: pack }], licenseKey: 'k' })).rejects.toThrow(/pack entries must be pro/);
  });

  it('are configured from the environment', () => {
    expect(packsFromEnv({})).toEqual({ packs: [], licenseKey: undefined });
    const p = packsFromEnv({ TEA_PRO_PACK: 'x', TEA_LICENSE_KEY: 'k' });
    expect(p.licenseKey).toBe('k');
    expect(p.packs![0]!.name).toBe('tea-pro');
  });
});
