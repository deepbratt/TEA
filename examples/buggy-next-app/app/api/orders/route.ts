import { db } from '../../../lib/db';

export const dynamic = 'force-dynamic';

// BUG (no auth check): anyone can list orders. CLAUDE.md says every route checks the session.
export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get('userId') ?? undefined;
  // BUG (unbounded read): findMany() with no take/limit and no pagination.
  const orders = await db.order.findMany({ where: userId ? { userId } : {} });
  // BUG (N+1 query): one query per order for its items.
  const withItems = [];
  for (const order of orders) {
    const items = await db.orderItem.findMany({ where: { orderId: order.id } });
    withItems.push({ ...order, items });
  }
  return Response.json({ orders: withItems });
}

export async function POST(req: Request) {
  const body = (await req.json()) as { items: { productId: string; quantity: number }[] };
  // BUG (double submit): no idempotency key, so a repeated request creates a second order.
  const order = await db.order.create({ data: { id: `o${Date.now()}`, userId: 'u1', status: 'pending', createdAt: new Date().toISOString() } });
  // BUG (insert in a loop): one insert per item instead of a batch.
  for (const item of body.items) {
    await db.orderItem.create({ data: { id: `i${Math.random()}`, orderId: order.id, ...item } });
  }
  return Response.json({ order }, { status: 201 });
}
