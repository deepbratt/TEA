import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { HttpError, handle } from '@/lib/http';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ key: string; id: string; path: string[] }> };

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

/** A file from an analysis' report folder: the HTML report, its screenshots, results.json. */
export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => {
    const { key, id, path } = await params;
    const { engine, services } = await tea();
    const file = engine.resolveInside(services.runs.runDir(key, id), path.join('/'));
    const type = file ? TYPES[extname(file).toLowerCase()] : undefined;
    if (!file || !type || !existsSync(file) || !statSync(file).isFile()) throw new HttpError(404, 'Not found.');
    const headers: Record<string, string> = { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
    // The report is static: its own inline styles and copy-button script, and same-origin images.
    if (type.startsWith('text/html')) headers['content-security-policy'] = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'";
    return new Response(new Uint8Array(await readFile(file)), { headers });
  });
}
