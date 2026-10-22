'use client';

import { useEffect, useState } from 'react';

type Order = { id: string; status: string; createdAt: string };

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  useEffect(() => {
    fetch('/api/orders?userId=u-signed-out')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []));
  }, []);
  return (
    <section>
      <h1>Your orders</h1>
      {/* BUG (no empty state): with no orders the page shows an empty list and no message. */}
      <ul>
        {orders.map((o) => (
          <li key={o.id}>
            <a href={`/api/orders/${o.id}`}>{o.id}</a>: {o.status} ({o.createdAt})
          </li>
        ))}
      </ul>
    </section>
  );
}
