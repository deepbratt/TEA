import { db } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// BUG (no rate limit on login): unlimited password guesses. CLAUDE.md claims 5 per minute.
export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get('email') ?? '');
  const users = await db.user.findMany({ where: { email } });
  // Demo only: any password "works" for a known email.
  return users.length ? Response.json({ ok: true }) : Response.json({ error: 'Invalid email or password' }, { status: 401 });
}
