'use client';

import { useEffect, useState } from 'react';

type Plan = { id: string; name: string; price: number };

// BUG (M1): the plans API fails, so the paywall shows no plans and nobody can pay.
// The page itself "works", which is why clicking through by hand never caught it.
export default function Pricing() {
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => {
    fetch('/api/plans')
      .then((r) => (r.ok ? r.json() : []))
      .then(setPlans)
      .catch(() => setPlans([]));
  }, []);
  return (
    <section>
      <h1>Pricing</h1>
      {plans.length === 0 ? <p>No plans available.</p> : plans.map((p) => <div key={p.id}>{p.name}: ${p.price}/mo</div>)}
    </section>
  );
}
