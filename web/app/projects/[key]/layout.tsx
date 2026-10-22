import type { ReactNode } from 'react';
import { ProjectTabs } from '@/components/ProjectTabs';
import { tea } from '@/lib/tea';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const project = await (await tea()).services.workspace.project(key);
  return { title: project?.name ?? 'Project' };
}

export default async function ProjectLayout({ children, params }: { children: ReactNode; params: Promise<{ key: string }> }) {
  const { key } = await params;
  const project = await (await tea()).services.workspace.project(key);
  if (!project) notFound();
  return (
    <>
      <div className="page-head project-head">
        <div>
          <p className="crumb">
            <a href="/">Projects</a> /
          </p>
          <h1>{project.name}</h1>
        </div>
      </div>
      <ProjectTabs projectKey={key} />
      {children}
    </>
  );
}
