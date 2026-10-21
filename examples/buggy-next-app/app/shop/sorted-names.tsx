'use client';

// BUG (heavy import): pulls all of lodash into the browser bundle for one sort.
import _ from 'lodash';

export function SortedNames({ names }: { names: string[] }) {
  return <p style={{ color: '#7a6a5c' }}>All teas: {_.sortBy(names).join(', ')}</p>;
}
