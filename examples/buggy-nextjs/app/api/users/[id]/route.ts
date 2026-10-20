export const dynamic = 'force-dynamic';

const users: Record<string, { id: string; email: string; plan: string }> = {
  '1': { id: '1', email: 'founder@example.com', plan: 'pro' },
  '2': { id: '2', email: 'customer@example.com', plan: 'free' },
};

// BUG (M3): no auth check. Anyone can read any user by changing the id (IDOR).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = users[id];
  return user ? Response.json(user) : Response.json({ error: 'not found' }, { status: 404 });
}
