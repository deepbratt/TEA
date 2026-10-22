import { DashboardWidgets } from './widgets';

export const dynamic = 'force-dynamic';

// BUG (slow page): an unindexed "query" makes this page take over 3 seconds.
async function loadRecentOrders() {
  await new Promise((r) => setTimeout(r, 3500));
  return [{ id: 'o1', total: 2800 }];
}

// BUG (static section): these numbers are hard-coded and never come from the database.
const stats = [
  { label: 'Orders this month', value: 128 },
  { label: 'Revenue', value: '$4,210' },
  { label: 'Tea Club members', value: 57 },
];

export default async function Dashboard() {
  const recent = await loadRecentOrders();
  return (
    <section>
      <h1>Dashboard</h1>
      <div style={{ display: 'flex', gap: 12 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ border: '1px solid #e2d3bd', borderRadius: 12, padding: 12 }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{s.value}</div>
            <div>{s.label}</div>
          </div>
        ))}
      </div>
      <p>{recent.length} recent order(s)</p>
      <DashboardWidgets />
    </section>
  );
}
