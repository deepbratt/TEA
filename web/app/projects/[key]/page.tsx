import Link from 'next/link';
import { GateBadge, ScoreBadge, SeverityCounts } from '@/components/Badges';
import { RunPanel } from '@/components/RunPanel';
import { duration, plural, when } from '@/lib/format';
import { loadProject } from '@/lib/project';

export const dynamic = 'force-dynamic';

export default async function ProjectOverview({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { engine, project, runs, last, results, gate, running } = await loadProject(key);
  const base = `/projects/${key}`;
  const files = (id: string, file: string) => `/api/projects/${key}/runs/${id}/files/${file}`;
  const conditions = last?.gate?.conditions ?? gate.conditions.map((c) => ({ ...c, actual: null, failed: false }));
  const issues = results?.findings.filter((f) => f.severity !== 'info').length ?? 0;
  const suggestions = results ? results.findings.length - issues : 0;

  return (
    <div className="overview">
      <section className="card gate-panel" aria-labelledby="gate-title">
        <div className="run-head">
          <h2 id="gate-title" className="section-title">
            Quality gate
          </h2>
          <GateBadge status={last?.gate?.status} />
        </div>
        <ul className="conditions">
          {conditions.map((c, i) => (
            <li key={i} className={c.failed ? 'failed' : undefined}>
              <span>{engine.describeCondition(c as Parameters<typeof engine.describeCondition>[0])}</span>
              <span className="actual">{c.actual === null ? (last ? 'not measured' : '–') : c.actual}</span>
            </li>
          ))}
        </ul>
        <p className="help small">
          The gate fails when any condition is met. {project.gate ? 'This project has its own gate (in the config file).' : <Link href="/gate">Edit the gate</Link>}
        </p>
      </section>

      <RunPanel projectKey={key} runningId={running?.project === key ? running.id : undefined} busyElsewhere={Boolean(running && running.project !== key)} />

      {last?.status === 'failed' && (
        <section className="card" role="alert">
          <h2 className="section-title">The last analysis failed</h2>
          <p>{last.error}</p>
        </section>
      )}

      {results && last && (
        <section className="card measures" aria-labelledby="measures-title">
          <div className="run-head">
            <h2 id="measures-title" className="section-title">
              Measures
            </h2>
            <span className="when">Analysed {when(last.finishedAt)}</span>
          </div>
          <div className="measure-top">
            <div className="measure">
              <ScoreBadge score={results.score} tone={last.verdict?.tone} />
              <span>
                TEA Score
                <br />
                <small>{last.verdict?.label}</small>
              </span>
            </div>
            <div className="measure">
              <Link className="measure-n" href={`${base}/issues`}>
                {issues}
              </Link>
              <span>
                Issues
                <br />
                <small>{plural(suggestions, 'suggestion')}</small>
              </span>
            </div>
            <SeverityCounts counts={last.counts} hrefFor={(s) => `${base}/issues?severity=${s}`} />
          </div>
          <p className="summary">{results.summary}</p>
          <ul className="areas">
            {results.areas.map((a) => (
              <li key={a.area} className={a.status === 'not-run' ? 'not-run' : undefined}>
                <span className="area-name">{engine.AREA_LABEL[a.area]}</span>
                {a.status === 'ran' ? (
                  <>
                    <meter min={0} max={100} low={50} high={75} optimum={100} value={a.score ?? 0} aria-label={`${engine.AREA_LABEL[a.area]} score`} />
                    <span className="area-score">{a.score}</span>
                    <Link href={`${base}/issues?area=${a.area}`} className="area-issues">
                      {plural(a.findings, 'finding')}
                    </Link>
                  </>
                ) : (
                  <span className="help small">Not run</span>
                )}
              </li>
            ))}
          </ul>
          <p className="actions">
            <a className="btn" href={files(last.id, 'report.html')} target="_blank" rel="noopener">
              Open full report
            </a>
            <a className="link" href={files(last.id, 'report.md')} target="_blank" rel="noopener">
              Markdown
            </a>
            <a className="link" href={files(last.id, 'results.json')} target="_blank" rel="noopener">
              results.json
            </a>
          </p>
        </section>
      )}

      {!last && !running && (
        <section className="card empty small-empty">
          <h2 className="empty-title">Not analysed yet</h2>
          <p className="help">Run an analysis to see the TEA Score, issues and the quality gate for {project.name}.</p>
        </section>
      )}

      {runs.length > 0 && (
        <section className="card history" aria-labelledby="history-title">
          <h2 id="history-title" className="section-title">
            History
          </h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Gate</th>
                  <th scope="col">Score</th>
                  <th scope="col">Issues</th>
                  <th scope="col">Took</th>
                  <th scope="col">
                    <span className="visually-hidden">Report</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 20).map((r) => (
                  <tr key={r.id}>
                    <td>{when(r.startedAt)}</td>
                    <td>{r.status === 'done' ? <GateBadge status={r.gate?.status} /> : <span className={`status ${r.status}`}>{r.status === 'running' ? 'Running' : 'Failed'}</span>}</td>
                    <td>{r.status === 'done' ? <ScoreBadge score={r.score} tone={r.verdict?.tone} /> : '–'}</td>
                    <td>{r.counts ? Object.entries(r.counts).filter(([s]) => s !== 'info').reduce((n, [, c]) => n + c, 0) : '–'}</td>
                    <td>{duration(r.startedAt, r.finishedAt)}</td>
                    <td>
                      {r.status === 'done' && (
                        <a href={files(r.id, 'report.html')} target="_blank" rel="noopener">
                          Report
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
