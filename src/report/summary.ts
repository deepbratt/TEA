import { countBySeverity, sortFindings, type Area, type Finding } from '../core/index.js';

export const AREA_LABEL: Record<Area, string> = {
  functional: 'Functional',
  api: 'API',
  security: 'Security',
  performance: 'Performance',
  accessibility: 'Accessibility',
  load: 'Load',
  code: 'Code quality',
};

/** A one-word verdict for the score, in TEA voice. */
export function scoreVerdict(score: number | null): { label: string; tone: 'great' | 'good' | 'meh' | 'bad' | 'none' } {
  if (score === null) return { label: 'Not brewed yet', tone: 'none' };
  if (score >= 90) return { label: 'Piping hot', tone: 'great' };
  if (score >= 75) return { label: 'A good brew', tone: 'good' };
  if (score >= 50) return { label: 'Lukewarm', tone: 'meh' };
  return { label: 'Spilled', tone: 'bad' };
}

export function topFindings(findings: Finding[], n = 5): Finding[] {
  return sortFindings(findings.filter((f) => f.severity !== 'info')).slice(0, n);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Plain English for a non-technical founder. No jargon, no AI needed. */
export function plainSummary(input: {
  score: number | null;
  findings: Finding[];
  pagesChecked: number;
  stack: string[];
  ranLabels: string[];
  notRunLabels: string[];
}): string {
  const { score, findings } = input;
  const c = countBySeverity(findings);
  const lines: string[] = [];
  lines.push(score === null ? "Here's the TEA on your app: no score yet." : `Here's the TEA on your app: ${score}/100 (${scoreVerdict(score).label}).`);

  const what: string[] = [];
  if (input.pagesChecked) what.push(`opened ${plural(input.pagesChecked, 'page')} in your running app`);
  if (input.stack.length) what.push(`read your code (${input.stack.slice(0, 5).join(', ')})`);
  if (what.length) lines.push(`TEA ${what.join(' and ')}.`);

  const serious = c.critical + c.high;
  if (input.ranLabels.length === 0) {
    lines.push('No checks could run because TEA had no live app to open. Pass your app URL with --url, or install its dependencies so TEA can start it.');
  } else if (findings.length === 0) {
    lines.push('It found no problems in what it checked.');
  } else {
    const parts = (['critical', 'high', 'medium', 'low'] as const).filter((s) => c[s]).map((s) => `${c[s]} ${s}`);
    lines.push(`It found ${plural(findings.length - c.info, 'issue')}: ${parts.join(', ')}.`);
    const top = topFindings(findings, 1)[0];
    if (top) lines.push(`${serious ? 'Fix this first' : 'Start with'}: ${top.title}.`);
    if (c.critical) lines.push('Critical issues can lose you users, money or data. Fix them before you launch.');
  }
  if (input.notRunLabels.length) {
    lines.push(`Not checked in this run: ${input.notRunLabels.join(', ')}. Those checks are coming in later TEA versions.`);
  }
  return lines.join(' ');
}


/** The summary without its "Here's the TEA..." headline sentence, for places that show the headline separately. */
export function summaryBody(summary: string): string {
  return summary.replace(/^Here's the TEA on your app: [^.]*\.\s*/, '');
}
