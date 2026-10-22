import { HttpError, handle, json } from '@/lib/http';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';

/** Auto-detect a project from a folder: its apps, their roles and stacks, and local URLs to test. */
export function GET(req: Request) {
  return handle(async () => {
    const path = new URL(req.url).searchParams.get('path');
    if (!path) throw new HttpError(400, 'Choose a folder first.');
    const { engine } = await tea();
    try {
      return json(await engine.detectProject(path));
    } catch (err) {
      throw new HttpError(400, (err as Error).message);
    }
  });
}
