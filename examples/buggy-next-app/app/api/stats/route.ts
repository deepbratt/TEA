export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ visitors: 42 });
}
