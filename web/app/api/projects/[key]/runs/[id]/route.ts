import { HttpError, handle, json } from '@/lib/http';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ key: string; id: string }> };

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { key, id } = await params;
    const run = await (await tea()).services.runs.get(key, id);
    if (!run) throw new HttpError(404, 'No such analysis.');
    return json({ run });
  });
}
