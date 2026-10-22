'use client';

// BUG (hydration error): renders different text on the server and in the browser.
export function FreshnessBadge() {
  const when = typeof window === 'undefined' ? 'this morning' : 'just now';
  return <span style={{ fontSize: 12, color: '#7a6a5c' }}>Packed {when}</span>;
}
