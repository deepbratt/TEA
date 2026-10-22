import { pbkdf2Sync } from 'node:crypto';

export const dynamic = 'force-dynamic';

// BUG (slow sync work in the request): blocks the server for every caller instead of
// running as a background job.
export function GET() {
  let digest = '';
  for (let i = 0; i < 20; i++) digest = pbkdf2Sync(`report-${i}`, 'salt', 20_000, 32, 'sha256').toString('hex');
  return Response.json({ ready: true, digest });
}
