import { HttpError, handle, json, readBody } from '@/lib/http';
import { projectInput } from '@/lib/project-input';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';

export function GET() {
  return handle(async () => {
    const { services } = await tea();
    return json({ projects: (await services.workspace.read()).data.projects });
  });
}

export function POST(req: Request) {
  return handle(async () => {
    const { engine, services } = await tea();
    const input = projectInput(await readBody(req));
    let key = '';
    await services.workspace.update((ws) => {
      key = engine.keyFromName(input.name, ws.projects.map((p) => p.key));
      ws.projects.push({ ...input, key });
    });
    if (!key) throw new HttpError(500, 'The project was not saved.');
    return json({ key }, 201);
  });
}
