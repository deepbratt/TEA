export const dynamic = 'force-dynamic';

async function addToList(email: string): Promise<void> {
  if (!email) throw new Error('mailing list provider rejected the address');
}

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    await addToList(email);
    return Response.json({ ok: true });
  } catch {
    // BUG (200 on error, no logging): failures look like success and nothing is logged.
    return Response.json({ ok: false });
  }
}
