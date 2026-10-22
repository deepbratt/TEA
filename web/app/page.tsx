import Link from 'next/link';
import { GateBadge, ScoreBadge, SeverityCounts } from '@/components/Badges';
import { when } from '@/lib/format';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const { services } = await tea();
  const { data } = await services.workspace.read();
  const rows = await Promise.all(data.projects.map(async (p) => ({ project: p, last: await services.runs.latest(p.key) })));
  const running = services.runs.running;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="help">Each project is an app: a live URL, its code folders, or both. Saved in {services.workspace.file}.</p>
        </div>
        <Link className="btn btn-primary" href="/projects/new">
          Add project
        </Link>
      </div>

      {rows.length === 0 ? (
        <section className="card empty">
          <img src="/cup.svg" alt="" width={96} height={96} />
          <h2 className="empty-title">No projects yet</h2>
          <p className="help">Add your app's frontend and backend folders, a URL where it runs, or both. TEA checks every page, every API call and the wiring between them.</p>
          <Link className="btn btn-primary" href="/projects/new">
            Add your first project
          </Link>
        </section>
      ) : (
        <ul className="project-list">
          {rows.map(({ project, last }) => (
            <li key={project.key} className="card project-row">
              <div className="project-main">
                <h2>
                  <Link href={`/projects/${project.key}`}>{project.name}</Link>
                </h2>
                <p className="help">
                  {[project.url, ...project.sources.map((s) => `${s.name} · ${s.role}`)].filter(Boolean).join('  ·  ')}
                </p>
              </div>
              <div className="project-status">
                {running?.project === project.key ? (
                  <span className="status running">Analysing…</span>
                ) : last ? (
                  <>
                    <GateBadge status={last.gate?.status} />
                    <ScoreBadge score={last.score} tone={last.verdict?.tone} />
                    <SeverityCounts counts={last.counts} />
                    <span className="when">{last.status === 'failed' ? 'Last analysis failed' : `Analysed ${when(last.finishedAt)}`}</span>
                  </>
                ) : (
                  <span className="when">Not analysed yet</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
