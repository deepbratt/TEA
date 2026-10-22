// BUG (duplicated component): a near copy of ProductCard.tsx.
type Props = { name: string; price: number; origin: string };

export function ProductTile({ name, price, origin }: Props) {
  const dollars = (price / 100).toFixed(2);
  return (
    <div style={{ border: '1px solid #e2d3bd', borderRadius: 12, padding: 16, background: '#fffaf2' }}>
      <h3 style={{ margin: '0 0 4px' }}>{name}</h3>
      <p style={{ margin: 0, color: '#7a6a5c' }}>Grown in {origin}</p>
      <p style={{ margin: '8px 0 0', fontWeight: 700 }}>${dollars}</p>
    </div>
  );
}
