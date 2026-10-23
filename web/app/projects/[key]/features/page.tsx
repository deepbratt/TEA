import { live } from '@/lib/live';
import Link from 'next/link';
import { EmptyArt } from '@/components/Art';
import { FeaturesBrowser, type IssueRef } from '@/components/FeaturesBrowser';
import { loadProject } from '@/lib/project';

export default async function FeaturesPage({ params }: { params: Promise<{ key: string }> }) {
  await live();
  const { key } = await params;
  const { project, results } = await loadProject(key);
  const report = results?.features;
  if (!report) {
    return (
      <section className="card empty small-empty">
        <EmptyArt kind="rules" />
        <h2 className="empty-title">No features listed yet</h2>
        <p className="help">
          Run an analysis from the <Link href={`/projects/${key}`}>Overview</Link> tab. TEA lists every feature in your code and in the docs your AI agent works
          from, then tests them one by one.
        </p>
      </section>
    );
  }
  const issues: Record<string, IssueRef> = Object.fromEntries(results.findings.map((f) => [f.id, { title: f.title, severity: f.severity }]));
  return (
    <FeaturesBrowser
      projectKey={key}
      features={report.features}
      hidden={project.features?.hide ?? []}
      issues={issues}
      docs={report.docs}
      sandbox={report.sandbox}
      sandboxOn={Boolean(project.sandbox)}
      tested={report.summary.coverage !== null}
    />
  );
}
