import { AREAS, type Area, type AreaScore, type Finding, type Severity } from './types.js';

export const SEVERITY_PENALTY: Record<Severity, number> = {
  critical: 25,
  high: 12,
  medium: 5,
  low: 2,
  info: 0,
};

/** How much each area counts toward the overall TEA score (only areas that ran count). */
export const AREA_WEIGHT: Record<Area, number> = {
  functional: 25,
  security: 25,
  api: 15,
  code: 10,
  performance: 10,
  accessibility: 10,
  load: 5,
};

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.area.localeCompare(b.area) || a.id.localeCompare(b.id),
  );
}

export function scoreAreas(findings: Finding[], ranAreas: Iterable<Area>): AreaScore[] {
  const ran = new Set(ranAreas);
  return AREAS.map((area) => {
    const mine = findings.filter((f) => f.area === area);
    if (!ran.has(area)) return { area, score: null, status: 'not-run' as const, findings: mine.length };
    const penalty = mine.reduce((sum, f) => sum + SEVERITY_PENALTY[f.severity], 0);
    return { area, score: Math.max(0, 100 - penalty), status: 'ran' as const, findings: mine.length };
  });
}

/** Any critical issue caps the overall score: a launch-blocker can't hide behind good areas. */
export const CRITICAL_CAP = 49;

export function overallScore(areas: AreaScore[], findings: Finding[] = []): number | null {
  let total = 0;
  let weight = 0;
  for (const a of areas) {
    if (a.score === null) continue;
    total += a.score * AREA_WEIGHT[a.area];
    weight += AREA_WEIGHT[a.area];
  }
  if (weight === 0) return null;
  const score = Math.round(total / weight);
  return findings.some((f) => f.severity === 'critical') ? Math.min(score, CRITICAL_CAP) : score;
}

/** True when any finding is at or above the threshold severity. */
export function exceedsThreshold(findings: Finding[], failOn: Severity | 'none'): boolean {
  if (failOn === 'none') return false;
  return findings.some((f) => SEVERITY_ORDER[f.severity] <= SEVERITY_ORDER[failOn]);
}

export function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const out: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) out[f.severity]++;
  return out;
}

export type VerdictTone = 'great' | 'good' | 'meh' | 'bad' | 'none';

/** A one-word verdict for the score, in TEA voice. */
export function scoreVerdict(score: number | null): { label: string; tone: VerdictTone } {
  if (score === null) return { label: 'Not brewed yet', tone: 'none' };
  if (score >= 90) return { label: 'Piping hot', tone: 'great' };
  if (score >= 75) return { label: 'A good brew', tone: 'good' };
  if (score >= 50) return { label: 'Lukewarm', tone: 'meh' };
  return { label: 'Spilled', tone: 'bad' };
}
