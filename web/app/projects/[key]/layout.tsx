import { live } from '@/lib/live';
import type { ReactNode } from 'react';
import { ProjectTabs } from '@/components/ProjectTabs';
import { tea } from '@/lib/tea';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { DEMO } from '@/lib/mode';

/**
 * The demo is static: one set of pages per project in the recorded workspace. Locally there are
 * no static params at all, so project pages render on every request.
 */
export const generateStaticParams = DEMO
  ? async () => {
      const { data } = await (await tea()).services.workspace.read();
      return data.projects.map((p) => ({ key: p.key }));
    }
  : undefined;

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  await live();
  const { key } = await params;
  const project = await (await tea()).services.workspace.project(key);
  return { title: project?.name ?? 'Project' };
}

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ key: string }> }) {
  await live();
  const { key } = await params;
  const project = await (await tea()).services.workspace.project(key);
  if (!project) notFound();
  return (
    <>
      <div className="page-head project-head">
        <div>
          <p className="crumb">
            <Link href="/">Projects</Link> /
          </p>
          <h1>{project.name}</h1>
        </div>
      </div>
      <ProjectTabs projectKey={key} />
      {children}
    </>
  );
}
