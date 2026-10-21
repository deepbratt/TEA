'use client';

import { useEffect, useState } from 'react';

type Stats = { visitors: number };

export function DashboardWidgets() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [wishlist, setWishlist] = useState<string[]>([]);

  useEffect(() => {
    // BUG (duplicate API calls): the same endpoint is fetched three times on one page.
    fetch('/api/stats').then((r) => r.json()).then(setStats);
    fetch('/api/stats').then((r) => r.json()).then(setStats);
    fetch('/api/stats').then((r) => r.json()).then(setStats);
    // BUG (UI calls a route that doesn't exist): there is no /api/wishlist.
    fetch('/api/wishlist')
      .then((r) => (r.ok ? r.json() : []))
      .then(setWishlist)
      .catch(() => setWishlist([]));
  }, []);

  return (
    <div style={{ marginTop: 16 }}>
      <p>Visitors today: {stats?.visitors ?? '…'}</p>
      <p>Saved teas: {wishlist.length}</p>
      {/* BUG (dead click): "Export" does nothing. The docs say CSV export is done. */}
      <button type="button" onClick={() => console.log('export clicked')}>
        Export
      </button>
    </div>
  );
}
