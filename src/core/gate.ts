import { z } from 'zod';
import { AREAS, SEVERITIES, type GateOutcome, type Results } from './types.js';

/**
 * The quality gate: a list of conditions. The gate fails when any condition is met, e.g.
 * "score lt 70" fails when the TEA Score is below 70, "critical gt 0" fails on any critical issue.
 */
export const GATE_METRICS = ['score', 'issues', ...SEVERITIES.filter((s) => s !== 'info'), ...AREAS, 'broken-features', 'feature-coverage'] as const;
export type GateMetric = (typeof GATE_METRICS)[number];

export const GateConditionSchema = z
  .object({
    metric: z.enum(GATE_METRICS),
    op: z.enum(['lt', 'gt']),
    value: z.number(),
  })
  .strict();

export const GateSchema = z.object({ conditions: z.array(GateConditionSchema).max(50) }).strict();

export type GateCondition = z.infer<typeof GateConditionSchema>;
export type Gate = z.infer<typeof GateSchema>;

export const DEFAULT_GATE: Gate = {
  conditions: [
    { metric: 'critical', op: 'gt', value: 0 },
    { metric: 'high', op: 'gt', value: 3 },
    { metric: 'score', op: 'lt', value: 60 },
  ],
};

export type GateResult = GateOutcome & { conditions: (GateCondition & { actual: number | null; failed: boolean })[] };

/** The measured value of a metric, or null when it wasn't measured (an area that didn't run). */
export function metricValue(results: Pick<Results, 'score' | 'areas' | 'findings' | 'features'>, metric: GateMetric): number | null {
  if (metric === 'score') return results.score;
  // Broken features: broken, or claimed in the docs but missing. Coverage: % of features seen working.
  if (metric === 'broken-features') return results.features ? results.features.summary.broken + results.features.summary.missing : null;
  if (metric === 'feature-coverage') return results.features?.summary.coverage ?? null;
  if (metric === 'issues') return results.findings.filter((f) => f.severity !== 'info').length;
  if ((SEVERITIES as readonly string[]).includes(metric)) return results.findings.filter((f) => f.severity === metric).length;
  return results.areas.find((a) => a.area === metric)?.score ?? null;
}

/** Conditions on metrics that weren't measured don't fail the gate. */
export function evaluateGate(gate: Gate, results: Pick<Results, 'score' | 'areas' | 'findings' | 'features'>): GateResult {
  const conditions = gate.conditions.map((c) => {
    const actual = metricValue(results, c.metric);
    const failed = actual !== null && (c.op === 'lt' ? actual < c.value : actual > c.value);
    return { ...c, actual, failed };
  });
  return { status: conditions.some((c) => c.failed) ? 'failed' : 'passed', conditions };
}

export function describeCondition(c: GateCondition): string {
  const what = c.metric === 'score' ? 'TEA Score' : c.metric === 'issues' ? 'Issues' : c.metric === 'broken-features' ? 'Broken features' : c.metric === 'feature-coverage' ? 'Feature coverage (%)' : AREAS.includes(c.metric as never) ? `${c.metric} score` : `${c.metric} issues`;
  return `${what} ${c.op === 'lt' ? 'is less than' : 'is greater than'} ${c.value}`;
}
