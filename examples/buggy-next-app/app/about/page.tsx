'use client';

import { useEffect, useState } from 'react';

// BUG (blank without JavaScript): everything renders client-side, so search engines and
// link previews see an empty page.
export default function About() {
  const [story, setStory] = useState<string | null>(null);
  useEffect(() => {
    setStory('Leaf & Kettle started at a kitchen table with three tins of tea and a very old kettle.');
    // BUG (leftover debugging, and a crash on missing data).
    console.error('Failed to load team members: undefined');
    setTimeout(() => {
      const team = (window as unknown as Record<string, any>).__team;
      document.title = `About (${team.length} people)`;
    }, 0);
  }, []);
  if (!story) return null;
  return (
    <section>
      <h1>About Leaf & Kettle</h1>
      <p>{story}</p>
    </section>
  );
}
