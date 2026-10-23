'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ProjectTabs({ projectKey }: { projectKey: string }) {
  const path = usePathname();
  const base = `/projects/${projectKey}`;
  const tabs = [
    { href: base, label: 'Overview' },
    { href: `${base}/features`, label: 'Features' },
    { href: `${base}/issues`, label: 'Issues' },
    { href: `${base}/settings`, label: 'Settings' },
  ];
  return (
    <nav aria-label="Project" className="subnav">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
