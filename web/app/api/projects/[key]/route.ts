import { HttpError, handle, json, readBody } from '@/lib/http';
import { projectInput } from '@/lib/project-input';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ key: string }> };

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { key } = await params;
    const project = await (await tea()).services.workspace.project(key);
    if (!project) throw new HttpError(404, 'No such project.');
    return json({ project });
  });
}

export function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { key } = await params;
    const input = projectInput(await readBody(req));
    await (await tea()).services.workspace.update((ws) => {
      const i = ws.projects.findIndex((p) => p.key === key);
      if (i < 0) throw new HttpError(404, 'No such project.');
      // This form doesn't edit a project's own gate override or its hidden features, so keep them.
      const { gate, features } = ws.projects[i]!;
      ws.projects[i] = { ...input, key, ...(gate ? { gate } : {}), ...(features ? { features } : {}) };
    });
    return json({ key });
  });
}

export function DELETE(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { key } = await params;
    await (await tea()).services.workspace.update((ws) => {
      const before = ws.projects.length;
      ws.projects = ws.projects.filter((p) => p.key !== key);
      if (ws.projects.length === before) throw new HttpError(404, 'No such project.');
    });
    return json({ deleted: key });
  });
}
