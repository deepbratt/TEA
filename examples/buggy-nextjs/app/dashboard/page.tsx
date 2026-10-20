export const dynamic = 'force-dynamic';

// BUG (M1): a slow "query" makes this page take over 3 seconds.
async function loadQuotes() {
  await new Promise((r) => setTimeout(r, 3500));
  return [{ id: 'q1', customer: 'Smith Plumbing', total: 420 }];
}

export default async function Dashboard() {
  const quotes = await loadQuotes();
  return (
    <section>
      <h1>Your quotes</h1>
      <ul>
        {quotes.map((q) => (
          <li key={q.id}>
            {q.customer}: ${q.total}
          </li>
        ))}
      </ul>
    </section>
  );
}
