import { ProductCard } from '../../components/ProductCard';
import { ProductTile } from '../../components/ProductTile';
import { FreshnessBadge } from '../../components/FreshnessBadge';
import { SortedNames } from './sorted-names';
import { db } from '../../lib/db';

export const dynamic = 'force-dynamic';

export default async function Shop() {
  const products = await db.product.findMany();
  const [featured, ...rest] = products;
  return (
    <section>
      <h1>Shop</h1>
      <FreshnessBadge />
      {featured && <ProductTile name={featured.name as string} price={featured.price as number} origin={featured.origin as string} />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginTop: 12 }}>
        {rest.map((p) => (
          <ProductCard key={p.id} name={p.name as string} price={p.price as number} origin={p.origin as string} />
        ))}
      </div>
      <SortedNames names={products.map((p) => p.name as string)} />
    </section>
  );
}
