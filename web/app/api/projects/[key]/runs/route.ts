import { HttpError, handle, json } from '@/lib/http';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ key: string }> };

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { key } = await params;
    return json({ runs: await (await tea()).services.runs.list(key) });
  });
}

/** Start an analysis of the project. Answers right away; follow it with the events stream. */
export function POST(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { key } = await params;
    const { services } = await tea();
    const project = await services.workspace.project(key);
    if (!project) throw new HttpError(404, 'No such project.');
    return json({ run: await services.runs.start(project) }, 202);
  });
}
