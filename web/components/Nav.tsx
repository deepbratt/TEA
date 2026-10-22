'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Projects', match: (p: string) => p === '/' || p.startsWith('/projects') },
  { href: '/rules', label: 'Rules', match: (p: string) => p.startsWith('/rules') },
  { href: '/gate', label: 'Quality gate', match: (p: string) => p.startsWith('/gate') },
  { href: '/config', label: 'Config file', match: (p: string) => p.startsWith('/config') },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="Main" className="nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={l.match(path) ? 'page' : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
