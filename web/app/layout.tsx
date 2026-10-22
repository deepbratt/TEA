import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Nav } from '@/components/Nav';
import '../../theme/tea.css';
import './app.css';

export const metadata: Metadata = {
  title: { default: 'TEA Workbench', template: '%s · TEA Workbench' },
  description: 'Test Everything Automatically: projects, issues, rules and the quality gate for your apps.',
  icons: { icon: '/cup.svg' },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="top">
          <a className="brand" href="/">
            <img src="/cup.svg" alt="" width={28} height={28} />
            <b>TEA</b>
            <span>Workbench</span>
          </a>
          <Nav />
        </header>
        <main id="main" className="page" tabIndex={-1}>
          {children}
        </main>
      </body>
    </html>
  );
}
