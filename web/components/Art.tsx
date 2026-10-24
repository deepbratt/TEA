'use client';

// Illustrations and motion for the Workbench. Pure SVG + CSS (no images to load, no libraries),
// coloured from the theme tokens, and still for people who prefer reduced motion.
import { useId } from 'react';

/** A tea cup. `level` (0-100) fills it; `brewing` makes the tea swirl and the steam rise faster. */
export function BrewCup({ level = 70, brewing = false, size = 96, tone }: { level?: number; brewing?: boolean; size?: number; tone?: string }) {
  const fill = Math.max(0, Math.min(100, level));
  const top = 58 + (1 - fill / 100) * 44; // liquid surface y, inside the cup body (y 58..102)
  const clip = `cup-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <svg className={`brew-cup${brewing ? ' brewing' : ''}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <path d="M24 50h64v22a32 32 0 0 1-64 0z" />
        </clipPath>
      </defs>
      <g className="steam">
        <path d="M42 40q-8-9 0-18q8-9 0-18" />
        <path d="M58 40q-8-9 0-18q8-9 0-18" />
        <path d="M74 40q-8-9 0-18q8-9 0-18" />
      </g>
      <g clipPath={`url(#${clip})`}>
        <rect className="tea" x="18" y={top} width="76" height="70" style={tone ? { fill: `var(--tea-${tone})` } : undefined} />
        <path className="wave" d={`M10 ${top} q10 -5 20 0t20 0t20 0t20 0t20 0v8h-100z`} style={tone ? { fill: `var(--tea-${tone})` } : undefined} />
      </g>
      <path className="cup-line" d="M24 50h64v22a32 32 0 0 1-64 0z" />
      <path className="cup-line" d="M88 58a12 12 0 0 1 0 24" />
      <path className="cup-line" d="M14 110h84" />
    </svg>
  );
}

/** The TEA Score as a ring that fills when it appears. */
export function ScoreRing({ score, tone, label, name = 'TEA Score', unit = '' }: { score: number | null; tone?: string; label?: string; name?: string; unit?: string }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const value = score ?? 0;
  return (
    <div className="score-ring" role="img" aria-label={score === null ? `No ${name} yet` : `${name} ${score}${unit || ' out of 100'}${label ? `, ${label}` : ''}`}>
      <svg width="92" height="92" viewBox="0 0 80 80" aria-hidden="true">
        <circle className="ring-bg" cx="40" cy="40" r={r} />
        <circle
          className="ring-value"
          cx="40"
          cy="40"
          r={r}
          style={{ strokeDasharray: c, ['--ring-to' as string]: c * (1 - value / 100), stroke: tone ? `var(--tea-${tone})` : undefined }}
        />
      </svg>
      <span className="ring-number">
        {score ?? '–'}
        {score !== null && unit ? <small>{unit}</small> : null}
      </span>
    </div>
  );
}

/** Empty-state illustrations. */
export function EmptyArt({ kind }: { kind: 'projects' | 'issues' | 'clear' | 'rules' }) {
  if (kind === 'clear') {
    return (
      <svg className="art art-clear" width="140" height="120" viewBox="0 0 140 120" aria-hidden="true">
        <path className="art-fill" d="M70 10l40 14v30c0 26-18 44-40 54C48 98 30 80 30 54V24z" />
        <path className="art-line" d="M70 10l40 14v30c0 26-18 44-40 54C48 98 30 80 30 54V24z" />
        <path className="art-check" d="M52 58l12 12 24-26" />
        <g className="sparkles">
          <path d="M18 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" />
          <path d="M120 78l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" />
        </g>
      </svg>
    );
  }
  if (kind === 'rules') {
    return (
      <svg className="art art-rules" width="140" height="110" viewBox="0 0 140 110" aria-hidden="true">
        <rect className="art-fill" x="20" y="14" width="100" height="82" rx="10" />
        <rect className="art-line" x="20" y="14" width="100" height="82" rx="10" />
        {[34, 56, 78].map((y, i) => (
          <g key={y} className={`toggle t${i}`}>
            <rect className="track" x="34" y={y - 7} width="26" height="14" rx="7" />
            <circle className="knob" cx="41" cy={y} r="5" />
            <rect className="art-muted" x="68" y={y - 3} width="40" height="6" rx="3" />
          </g>
        ))}
      </svg>
    );
  }
  // projects / issues: a browser window being inspected.
  return (
    <svg className="art art-inspect" width="160" height="120" viewBox="0 0 160 120" aria-hidden="true">
      <rect className="art-fill" x="14" y="14" width="112" height="82" rx="8" />
      <rect className="art-line" x="14" y="14" width="112" height="82" rx="8" />
      <path className="art-line" d="M14 30h112" />
      <circle className="dot" cx="24" cy="22" r="2.5" />
      <circle className="dot" cx="32" cy="22" r="2.5" />
      <circle className="dot" cx="40" cy="22" r="2.5" />
      <rect className="art-muted code1" x="26" y="42" width="54" height="6" rx="3" />
      <rect className="art-muted code2" x="26" y="56" width="74" height="6" rx="3" />
      <rect className="art-accent code3" x="26" y="70" width="40" height="6" rx="3" />
      <g className="lens">
        <circle className="art-line lens-glass" cx="112" cy="78" r="20" />
        <path className="art-line" d="M126 92l18 18" strokeWidth="6" />
      </g>
    </svg>
  );
}
