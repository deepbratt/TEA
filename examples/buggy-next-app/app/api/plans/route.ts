export const dynamic = 'force-dynamic';

// BUG (paywall API fails): reads store offerings that were never configured, so it throws a 500.
export async function GET() {
  const offerings = (globalThis as Record<string, any>).__storeOfferings;
  return Response.json(offerings.current.packages);
}
