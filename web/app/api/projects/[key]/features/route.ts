import { HttpError, handle, json, readBody } from '@/lib/http';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ key: string }> };

/** Hide features ("not a feature") or show them again. Body: { hide: string[] }. */
export function PUT(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { key } = await params;
    const body = await readBody(req);
    if (!Array.isArray(body.hide) || body.hide.some((k) => typeof k !== 'string')) throw new HttpError(400, 'Send the feature keys to hide as a list.');
    const hide = [...new Set((body.hide as string[]).map((k) => k.trim()).filter(Boolean))];
    await (await tea()).services.workspace.update((ws) => {
      const project = ws.projects.find((p) => p.key === key);
      if (!project) throw new HttpError(404, 'No such project.');
      if (hide.length) project.features = { hide };
      else delete project.features;
    });
    return json({ hide });
  });
}
