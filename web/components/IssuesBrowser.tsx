'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';
import { SEVERITY_ORDER, plural } from '@/lib/format';
import { CopyButton } from './CopyButton';

export interface IssueView {
  id: string;
  area: string;
  severity: string;
  title: string;
  summary: string;
  check: string;
  where?: string;
  steps?: string[];
  details?: string[];
  fix?: string;
}

/** Every finding of the latest analysis, filterable like an issue tracker. Filters live in the URL. */
export function IssuesBrowser({ issues, areaLabels }: { issues: IssueView[]; areaLabels: Record<string, string> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const severity = params.get('severity') ?? '';
  const area = params.get('area') ?? '';
  const check = params.get('check') ?? '';
  const q = params.get('q') ?? '';

  const set = (name: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    router.replace(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  };

  const checks = useMemo(() => [...new Set(issues.map((i) => i.check))].sort(), [issues]);
  const areas = useMemo(() => [...new Set(issues.map((i) => i.area))], [issues]);
  const shown = issues.filter(
    (i) =>
      (!severity || i.severity === severity) &&
      (!area || i.area === area) &&
      (!check || i.check === check) &&
      (!q || `${i.title} ${i.summary} ${i.where ?? ''}`.toLowerCase().includes(q.toLowerCase())),
  );

  return (
    <>
      <form className="card filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label>
          Severity
          <select value={severity} onChange={(e) => set('severity', e.target.value)}>
            <option value="">All</option>
            {SEVERITY_ORDER.map((s) => (
              <option key={s} value={s}>
                {s} ({issues.filter((i) => i.severity === s).length})
              </option>
            ))}
          </select>
        </label>
        <label>
          Area
          <select value={area} onChange={(e) => set('area', e.target.value)}>
            <option value="">All</option>
            {areas.map((a) => (
              <option key={a} value={a}>
                {areaLabels[a] ?? a}
              </option>
            ))}
          </select>
        </label>
        <label>
          Check
          <select value={check} onChange={(e) => set('check', e.target.value)}>
            <option value="">All</option>
            {checks.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="grow">
          Search
          <input type="search" defaultValue={q} onChange={(e) => set('q', e.target.value)} placeholder="Title, page or file" />
        </label>
      </form>

      <p className="help" role="status">
        Showing {plural(shown.length, 'finding')} of {issues.length}.
      </p>

      <ul className="issues">
        {shown.map((i) => (
          <li key={i.id} className={`issue sev-${i.severity}`}>
            <div className="issue-head">
              <span className="issue-sev">{i.severity}</span>
              <span className="issue-title">{i.title}</span>
              <span className="tag">{areaLabels[i.area] ?? i.area}</span>
              <span className="tag mono">{i.check}</span>
            </div>
            {i.where && <p className="issue-where mono">{i.where}</p>}
            <p className="issue-summary">{i.summary}</p>
            {(i.steps?.length || i.details?.length || i.fix) && (
              <details className="issue-more">
                <summary>Details</summary>
                {i.steps?.length ? (
                  <>
                    <h3>How to see it</h3>
                    <ol>
                      {i.steps.map((s, n) => (
                        <li key={n}>{s}</li>
                      ))}
                    </ol>
                  </>
                ) : null}
                {i.details?.length ? (
                  <ul className="mono">
                    {i.details.map((d, n) => (
                      <li key={n}>{d}</li>
                    ))}
                  </ul>
                ) : null}
                {i.fix && (
                  <>
                    <h3>Fix prompt for your AI coding tool</h3>
                    <pre className="prompt">{i.fix}</pre>
                  </>
                )}
              </details>
            )}
            {i.fix && <CopyButton text={i.fix} />}
          </li>
        ))}
      </ul>
    </>
  );
}
