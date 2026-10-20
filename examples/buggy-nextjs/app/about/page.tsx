'use client';

import { useEffect } from 'react';

export default function About() {
  useEffect(() => {
    // BUG (M1): leftover debugging, plus a crash on missing data.
    console.error('Failed to load team members: undefined');
    setTimeout(() => {
      const team = (window as unknown as Record<string, any>).__team;
      document.title = `About (${team.length} people)`;
    }, 0);
  }, []);
  return (
    <section>
      <h1>About TradeQuote</h1>
      <p>Built by tradespeople, for tradespeople.</p>
    </section>
  );
}
