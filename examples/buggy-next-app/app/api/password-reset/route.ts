import { db } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const form = await req.formData();
  const email = String(form.get('email') ?? '');
  const [user] = await db.user.findMany({ where: { email } });
  if (user) {
    // BUG (reset token never expires): predictable token, no expiry, never marked as used.
    const token = `${user.id}-${Date.now()}`;
    await db.passwordReset.create({ data: { id: token, userId: user.id } });
  }
  // BUG (no rate limit): anyone can trigger unlimited reset emails.
  return Response.json({ ok: true });
}
