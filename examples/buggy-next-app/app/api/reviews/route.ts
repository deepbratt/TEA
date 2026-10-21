import { db } from '../../../lib/db';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // BUG (unvalidated input): the body goes straight into the database with no checks
  // on type, length or rating range.
  const body = await req.json();
  // BUG (injection pattern): a query built by string concatenation (shown, never executed).
  const sql = "INSERT INTO reviews (body, rating) VALUES ('" + body.body + "', " + body.rating + ')';
  const review = await db.review.create({ data: { id: `r${Date.now()}`, userId: 'u1', ...body } });
  return Response.json({ review, sql }, { status: 201 });
}
