import { db } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

// BUG (no auth check on an admin route): returns every user's email and role to anyone.
export async function GET() {
  return Response.json({ users: await db.user.findMany() });
}
