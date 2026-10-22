import { SEVERITY_ORDER } from '@/lib/format';

export function GateBadge({ status }: { status?: 'passed' | 'failed' }) {
  if (!status) return <span className="gate gate-none">No gate result</span>;
  return <span className={`gate gate-${status}`}>{status === 'passed' ? 'Passed' : 'Failed'}</span>;
}

export function ScoreBadge({ score, tone }: { score?: number | null; tone?: string }) {
  if (score === undefined || score === null) return <span className="score-badge">–</span>;
  return (
    <span className={`score-badge tone-${tone ?? 'none'}`} title="TEA Score out of 100">
      {score}
    </span>
  );
}

/** Issue counts by severity; info items are suggestions, not issues, so they're left out. */
export function SeverityCounts({ counts, hrefFor }: { counts?: Record<string, number>; hrefFor?: (severity: string) => string }) {
  const shown = SEVERITY_ORDER.filter((s) => s !== 'info');
  return (
    <ul className="sev-counts" aria-label="Issues by severity">
      {shown.map((s) => {
        const n = counts?.[s] ?? 0;
        const body = (
          <>
            <b>{n}</b> {s}
          </>
        );
        return (
          <li key={s} className={`sev sev-${s}`}>
            {hrefFor && n > 0 ? <a href={hrefFor(s)}>{body}</a> : body}
          </li>
        );
      })}
    </ul>
  );
}
