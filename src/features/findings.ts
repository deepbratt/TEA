import { renderFixPrompt, untrustedBlock, type Catalog, type Finding } from '../core/index.js';
import type { Claim, Feature, MissingPart } from './types.js';
import { slugify } from './words.js';

const where = (c: Claim) => `${c.file}:${c.line}`;
const quote = (c: Claim) => `"${c.text}"`;

function title(part: MissingPart): string {
  if (part.key.startsWith('/')) return `The docs promise ${part.key}, but nothing serves it`;
  if (/^[a-z0-9]+$/.test(part.key) && part.label === part.key) return `The docs say the ${part.label} works, but its API doesn't exist`;
  return `The docs say ${part.label} is built, but it isn't in the code`;
}

/**
 * Issues from the docs check: one per thing the docs claim that isn't in the code (claims about the
 * same thing in several docs are one issue), and an info note for each thing the docs say is planned.
 * Doc text is untrusted: it only reaches fix prompts inside the labelled evidence block.
 */
export function claimFindings(features: Feature[], catalog: Catalog): Finding[] {
  const missingEntry = catalog.get('features.claimed-missing');
  const plannedEntry = catalog.get('features.not-built-yet');
  const out: Finding[] = [];

  const missing = new Map<string, { part: MissingPart; claims: Claim[] }>();
  const planned = new Map<string, Claim[]>();
  for (const f of features) {
    for (const c of f.claims) {
      if (c.status === 'planned') {
        const key = slugify(c.text);
        planned.set(key, [...(planned.get(key) ?? []), c]);
      }
      for (const part of c.missing) {
        const m = missing.get(part.key) ?? { part, claims: [] };
        m.claims.push(c);
        missing.set(part.key, m);
      }
    }
  }

  for (const [key, { part, claims }] of missing) {
    const files = [...new Set(claims.map((c) => c.file))];
    const first = claims[0]!;
    out.push({
      id: `features.claimed-missing:${key}`,
      area: 'functional',
      severity: missingEntry?.severity ?? 'high',
      title: title(part),
      summary: `${files.join(' and ')} ${files.length === 1 ? 'says' : 'say'} this is built: ${quote(first)}. But ${part.why}. You, your users and your AI coding agent are all working from docs that aren't true.`,
      steps: [...claims.slice(0, 4).map((c) => `Read ${where(c)}: ${quote(c)}`), `Look for it in the code: ${part.why}.`],
      evidence: { file: first.file, line: first.line, details: claims.map(where) },
      fix: renderFixPrompt(missingEntry, { route: part.label, file: where(first), evidence: untrustedBlock(claims.map((c) => `${where(c)}: ${c.text}`)) }),
      source: 'features',
    });
  }

  for (const [key, claims] of planned) {
    const first = claims[0]!;
    out.push({
      id: `features.not-built-yet:${key}`,
      area: 'functional',
      severity: plannedEntry?.severity ?? 'info',
      title: `Not built yet: ${first.text.replace(/\s*\([^)]*\)\s*$/, '')}`,
      summary: `${first.file} lists this as planned, so TEA doesn't count it as broken. It shows here so the plan and the app stay in step.`,
      steps: claims.map((c) => `Read ${where(c)}: ${quote(c)}`),
      evidence: { file: first.file, line: first.line },
      fix: renderFixPrompt(plannedEntry, { route: first.text, file: where(first), evidence: untrustedBlock(claims.map((c) => `${where(c)}: ${c.text}`)) }),
      source: 'features',
    });
  }
  return out;
}
