'use client';

// BUG (hydration error): renders a different value on the server and in the browser.
export function FreshnessBadge() {
  const minutes = Math.floor(Math.random() * 60);
  return <span style={{ fontSize: 12, color: '#7a6a5c' }}>Packed {minutes} minutes ago</span>;
}
