import { describeTea } from '../../../../lib/llm';

export const dynamic = 'force-dynamic';

// BUG (AI endpoint with no limits): no auth, no per-user rate or spend limit, no max length.
// CLAUDE.md claims 10 per user per day.
export async function POST(req: Request) {
  const { name } = await req.json();
  return Response.json({ description: await describeTea(String(name)) });
}
