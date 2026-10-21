'use client';

import { useState } from 'react';
import { chargeCard } from '../../lib/stripe-client';
import { cartTotal } from '../../lib/cart';

export default function Checkout() {
  const [message, setMessage] = useState('');
  const total = cartTotal([{ productId: 'p1', price: 1400, quantity: 2 }]);

  async function placeOrder(e: React.FormEvent) {
    e.preventDefault();
    // BUG (double submit): the button is never disabled and the API has no idempotency key,
    // so a double click creates two orders.
    const res = await fetch('/api/orders', { method: 'POST', body: JSON.stringify({ items: [{ productId: 'p1', quantity: 2 }] }) });
    await chargeCard(total);
    setMessage(res.ok ? 'Order placed!' : 'Something went wrong');
  }

  return (
    <section>
      <h1>Checkout</h1>
      <p>Total: ${(total / 100).toFixed(2)}</p>
      <form onSubmit={placeOrder}>
        <input name="card" placeholder="4242 4242 4242 4242" />
        <button type="submit">Pay now</button>
        {/* BUG (accessibility): an icon-only button with no accessible name. */}
        <button type="button">✕</button>
      </form>
      <p>{message}</p>
    </section>
  );
}
