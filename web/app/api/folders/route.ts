import { HttpError, handle, json } from '@/lib/http';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';

/** Folder names for the folder picker (browsers can't share real paths). Never file contents. */
export function GET(req: Request) {
  return handle(async () => {
    const { engine } = await tea();
    try {
      return json(await engine.listFolders(new URL(req.url).searchParams.get('path') ?? undefined));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  });
}
