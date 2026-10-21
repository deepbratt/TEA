// In-memory stand-in for a Prisma client, so the example runs without a database.
// All names and data are made up.

type Row = Record<string, unknown> & { id: string };

function table<T extends Row>(rows: T[]) {
  return {
    async findMany(args: { where?: Partial<T>; take?: number } = {}): Promise<T[]> {
      const where = args.where ?? {};
      const out = rows.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
      return args.take ? out.slice(0, args.take) : out;
    },
    async findUnique(args: { where: { id: string } }): Promise<T | null> {
      return rows.find((r) => r.id === args.where.id) ?? null;
    },
    async create(args: { data: T }): Promise<T> {
      rows.push(args.data);
      return args.data;
    },
  };
}

export const db = {
  user: table([
    { id: 'u1', email: 'mira@example.com', name: 'Mira Example', role: 'customer' },
    { id: 'u2', email: 'theo@example.com', name: 'Theo Sample', role: 'customer' },
    { id: 'u3', email: 'admin@example.com', name: 'Shop Admin', role: 'admin' },
  ]),
  product: table([
    { id: 'p1', name: 'Misty Peak Oolong', price: 1400, origin: 'Made-up Mountains' },
    { id: 'p2', name: 'Lantern Green', price: 900, origin: 'Pretend Valley' },
    { id: 'p3', name: 'Ember Black', price: 1100, origin: 'Imaginary Hills' },
  ]),
  order: table([
    { id: 'o1', userId: 'u1', status: 'shipped', createdAt: '2026-09-01' },
    { id: 'o2', userId: 'u2', status: 'paid', createdAt: '2026-09-12' },
  ]),
  orderItem: table([
    { id: 'i1', orderId: 'o1', productId: 'p1', quantity: 2 },
    { id: 'i2', orderId: 'o2', productId: 'p3', quantity: 1 },
  ]),
  review: table<{ id: string; userId: string; body: string; rating: number }>([]),
  passwordReset: table<{ id: string; userId: string }>([]),
};
