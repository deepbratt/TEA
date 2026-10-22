import { live } from '@/lib/live';
import { DeleteProject } from '@/components/DeleteProject';
import { ProjectForm } from '@/components/ProjectForm';
import { loadProject } from '@/lib/project';

export default async function ProjectSettings({ params }: { params: Promise<{ key: string }> }) {
  await live();
  const { key } = await params;
  const { project } = await loadProject(key);
  const { gate: _gate, ...values } = project;
  return (
    <div className="narrow stack-l">
      <ProjectForm initial={values} />
      <DeleteProject projectKey={key} name={project.name} />
    </div>
  );
}
