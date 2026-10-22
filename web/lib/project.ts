import { notFound } from 'next/navigation';
import { tea } from './tea';

/** A project and its latest finished analysis (with full results), for the project pages. */
export async function loadProject(key: string) {
  const { engine, services } = await tea();
  const project = await services.workspace.project(key);
  if (!project) notFound();
  const runs = await services.runs.list(key);
  const last = runs.find((r) => r.status !== 'running');
  const results = last?.status === 'done' ? await services.runs.results(key, last.id) : undefined;
  const { data } = await services.workspace.read();
  return { engine, services, project, runs, last, results, gate: project.gate ?? data.gate, running: services.runs.running };
}
