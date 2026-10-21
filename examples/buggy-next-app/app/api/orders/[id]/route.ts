import { db } from '../../../../lib/db';

export const dynamic = 'force-dynamic';

// BUG (IDOR): no auth and no ownership check. Change the id to read anyone's order.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const order = await db.order.findUnique({ where: { id } });
  return order ? Response.json(order) : Response.json({ error: 'not found' }, { status: 404 });
}
