export const dynamic = 'force-dynamic';

// BUG (M1): reads store offerings that were never configured, so this throws and returns 500.
export async function GET() {
  const offerings = (globalThis as Record<string, any>).__storeOfferings;
  return Response.json(offerings.current.packages);
}
