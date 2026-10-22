import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../core/index.js';

const app = fileURLToPath(new URL('../../examples/buggy-next-app/', import.meta.url));
const manifest = JSON.parse(readFileSync(join(app, 'tea-seeded-bugs.json'), 'utf8')) as {
  bugs: { id: string; title: string; where: string; check: string; step: number; caughtBy?: string[] }[];
};

describe('example app seeded-bug manifest', () => {
  it('has unique ids, valid steps and packs', () => {
    const ids = manifest.bugs.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of manifest.bugs) {
      expect(b.step, b.id).toBeGreaterThanOrEqual(1);
      expect(b.step, b.id).toBeLessThanOrEqual(14);
      expect(b.title.length, b.id).toBeGreaterThan(5);
    }
  });

  it('points at files that exist', () => {
    for (const b of manifest.bugs) {
      for (const where of b.where.split(',').map((w) => w.trim())) {
        if (where === '/' || where.endsWith('/')) continue;
        expect(existsSync(join(app, where)), `${b.id}: ${where}`).toBe(true);
      }
    }
  });

  it('covers the seeded bugs the plan asks for', () => {
    const ids = new Set(manifest.bugs.map((b) => b.id));
    for (const id of [
      'stripe-key-in-bundle', 'exposed-source-map', 'missing-security-headers', 'broken-link-blog', 'slow-dashboard',
      'a11y-image-alt', 'docs-csv-export', 'duplicated-component', 'circular-import', 'unused-dependency',
      'route-no-auth', 'login-no-rate-limit', 'unvalidated-input', 'missing-env-example', 'no-health-endpoint',
      'dead-export-button', 'hard-coded-stats', 'orphan-api-call', '200-on-error', 'no-empty-state',
      'n-plus-one', 'missing-index', 'unbounded-read', 'insert-in-loop',
      'ai-no-limits', 'idor-orders-deep', 'double-submit-order', 'reset-token-never-expires', 'llm-key-in-client', 'hydration-error',
      'hero-image-3mb', 'heavy-import', 'duplicate-requests', 'sync-work-in-request',
      'blank-without-js', 'noindex-home', 'missing-sitemap', 'broken-og-image',
    ]) {
      expect(ids.has(id), id).toBe(true);
    }
  });

  it('expects no catch from checks that are still planned', async () => {
    const catalog = await loadCatalog();
    for (const b of manifest.bugs.filter((x) => catalog.planned.some((e) => e.id === x.check))) {
      expect(b.caughtBy, b.id).toBeUndefined();
    }
  });

  it('keeps every fake key obviously fake', () => {
    const env = readFileSync(join(app, '.env.development'), 'utf8');
    const stripe = readFileSync(join(app, 'lib/stripe-client.ts'), 'utf8');
    expect(env).toMatch(/FAKE/);
    expect(stripe).toMatch(/sk_test_FAKE/);
  });
});
