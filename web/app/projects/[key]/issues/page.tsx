import { live } from '@/lib/live';
import { Suspense } from 'react';
import { EmptyArt } from '@/components/Art';
import { IssuesBrowser, type IssueView } from '@/components/IssuesBrowser';
import { SEVERITY_ORDER } from '@/lib/format';
import { loadProject } from '@/lib/project';

export default async function IssuesPage({ params }: { params: Promise<{ key: string }> }) {
  await live();
  const { key } = await params;
  const { engine, results } = await loadProject(key);
  if (!results) {
    return (
      <section className="card empty small-empty">
        <EmptyArt kind="issues" />
        <h2 className="empty-title">No issues to show yet</h2>
        <p className="help">Run an analysis from the Overview tab first.</p>
      </section>
    );
  }
  const rank = (s: string) => SEVERITY_ORDER.indexOf(s as (typeof SEVERITY_ORDER)[number]);
  const issues: IssueView[] = [...results.findings]
    .sort((a, b) => rank(a.severity) - rank(b.severity))
    .map((f) => ({
      id: f.id,
      area: f.area,
      severity: f.severity,
      title: f.title,
      summary: f.summary,
      check: f.id.split(':')[0]!,
      where: f.evidence?.file ? `${f.evidence.file}${f.evidence.line ? `:${f.evidence.line}` : ''}` : f.evidence?.url,
      steps: f.steps,
      details: f.evidence?.details,
      fix: f.fix,
    }));
  if (!issues.length) {
    return (
      <section className="card empty small-empty">
        <EmptyArt kind="clear" />
        <h2 className="empty-title">All clear</h2>
        <p className="help">The last analysis found nothing to fix. Nice brew.</p>
      </section>
    );
  }
  return (
    <Suspense>
      <IssuesBrowser issues={issues} areaLabels={engine.AREA_LABEL} />
    </Suspense>
  );
}
