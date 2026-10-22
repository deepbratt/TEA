import { describe, expect, it } from 'vitest';
import { DEFAULT_GATE, applyRules, evaluateGate, loadCatalog, ruleNumber, validateRules, type Finding, type Results } from './index.js';

const finding = (id: string, severity: Finding['severity'] = 'high', area: Finding['area'] = 'functional'): Finding => ({
  id,
  area,
  severity,
  title: id,
  summary: id,
  source: 'test',
});

const results = (findings: Finding[], score: number | null = 80, areas: Results['areas'] = []) => ({ findings, score, areas });

describe('rules', () => {
  it('drops findings of disabled checks and overrides severities', async () => {
    const catalog = await loadCatalog();
    const out = applyRules(
      [finding('crawl.slow:/a', 'medium'), finding('crawl.server-error:/b', 'critical'), finding('wiring.orphan-call:GET /x')],
      catalog,
      { 'crawl.slow': { severity: 'low' }, 'crawl.server-error': { enabled: false } },
    );
    expect(out.map((f) => [f.id, f.severity])).toEqual([
      ['crawl.slow:/a', 'low'],
      ['wiring.orphan-call:GET /x', 'high'],
    ]);
  });

  it('reads parameters with defaults and validates them', async () => {
    const catalog = await loadCatalog();
    expect(ruleNumber(catalog, {}, 'crawl.slow', 'thresholdMs')).toBe(3000);
    expect(ruleNumber(catalog, { 'crawl.slow': { params: { thresholdMs: 1500 } } }, 'crawl.slow', 'thresholdMs')).toBe(1500);
    expect(validateRules(catalog, { 'crawl.slow': { params: { thresholdMs: 1 } } })[0]).toMatch(/between 500 and 60000/);
    expect(validateRules(catalog, { 'crawl.slow': { params: { thresholdMs: 'fast' } } })[0]).toMatch(/must be a number/);
    expect(validateRules(catalog, { 'crawl.slow': { params: { nope: 1 } } })[0]).toMatch(/unknown setting/);
    expect(validateRules(catalog, { 'no.such-check': {} })[0]).toMatch(/Unknown check/);
    expect(validateRules(catalog, { 'crawl.slow': { enabled: false, params: { thresholdMs: 5000 } } })).toEqual([]);
  });
});

describe('quality gate', () => {
  it('passes a clean run and fails on any condition', () => {
    expect(evaluateGate(DEFAULT_GATE, results([finding('a', 'medium')])).status).toBe('passed');
    const failed = evaluateGate(DEFAULT_GATE, results([finding('a', 'critical')], 90));
    expect(failed.status).toBe('failed');
    expect(failed.conditions.find((c) => c.metric === 'critical')).toMatchObject({ actual: 1, failed: true });
    expect(evaluateGate(DEFAULT_GATE, results([], 40)).status).toBe('failed');
  });

  it('does not fail on metrics that were not measured, and ignores info for "issues"', () => {
    const gate = { conditions: [{ metric: 'performance' as const, op: 'lt' as const, value: 70 }, { metric: 'issues' as const, op: 'gt' as const, value: 0 }] };
    const r = evaluateGate(gate, results([finding('a', 'info')], 80, [{ area: 'performance', score: null, status: 'not-run', findings: 0 }]));
    expect(r.status).toBe('passed');
    expect(r.conditions.map((c) => c.actual)).toEqual([null, 0]);
    expect(evaluateGate(gate, results([], 80, [{ area: 'performance', score: 50, status: 'ran', findings: 2 }])).status).toBe('failed');
  });
});
