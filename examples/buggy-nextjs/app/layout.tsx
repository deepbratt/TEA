import type { ReactNode } from 'react';

export const metadata = { title: 'TradeQuote: quotes for tradespeople' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0 }}>
        <nav style={{ display: 'flex', gap: 16, padding: 16, borderBottom: '1px solid #ddd' }}>
          <a href="/">Home</a>
          <a href="/pricing">Pricing</a>
          <a href="/dashboard">Dashboard</a>
          {/* BUG (M1): /blog was never built, so this link is broken. */}
          <a href="/blog">Blog</a>
          <a href="/about">About</a>
          {/* BUG (M1): the account page crashes with a 500 for signed-out visitors. */}
          <a href="/account">Account</a>
          <a href="/signup">Sign up</a>
        </nav>
        <main style={{ padding: 16 }}>{children}</main>
        <footer style={{ padding: 16, borderTop: '1px solid #ddd' }}>
          <a href="/privacy">Privacy</a> · {/* BUG (M1): there is no Terms page. */}
          <a href="/terms">Terms</a>
        </footer>
      </body>
    </html>
  );
}
