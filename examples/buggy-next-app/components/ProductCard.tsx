// BUG (duplicated component): ProductTile.tsx is a near copy of this file.
type Props = { name: string; price: number; origin: string };

export function ProductCard({ name, price, origin }: Props) {
  const dollars = (price / 100).toFixed(2);
  return (
    <div style={{ border: '1px solid #e2d3bd', borderRadius: 12, padding: 16, background: '#fffaf2' }}>
      <h3 style={{ margin: '0 0 4px' }}>{name}</h3>
      <p style={{ margin: 0, color: '#7a6a5c' }}>From {origin}</p>
      <p style={{ margin: '8px 0 0', fontWeight: 700 }}>${dollars}</p>
    </div>
  );
}
