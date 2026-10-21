import type { ReactNode } from 'react';

export const metadata = {
  title: 'Leaf & Kettle: small-batch tea',
  description: 'A made-up tea shop that TEA tests end to end.',
};

const link = { color: '#2b1d12', textDecoration: 'none' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 0, background: '#faf6ef', color: '#2b1d12' }}>
        <nav style={{ display: 'flex', gap: 16, padding: 16, borderBottom: '1px solid #e2d3bd', flexWrap: 'wrap' }}>
          <a style={link} href="/">Home</a>
          <a style={link} href="/shop">Shop</a>
          <a style={link} href="/pricing">Tea Club</a>
          <a style={link} href="/orders">Orders</a>
          <a style={link} href="/dashboard">Dashboard</a>
          {/* BUG (broken link): /blog was never built. */}
          <a style={link} href="/blog">Blog</a>
          <a style={link} href="/about">About</a>
          {/* BUG (server error): /account crashes for signed-out visitors. */}
          <a style={link} href="/account">Account</a>
          <a style={link} href="/login">Log in</a>
          <a style={link} href="/signup">Sign up</a>
        </nav>
        <main style={{ padding: 16, maxWidth: 960, margin: '0 auto' }}>{children}</main>
        <footer style={{ padding: 16, borderTop: '1px solid #e2d3bd' }}>
          <a style={link} href="/privacy">Privacy</a> · {/* BUG (broken link): there is no Terms page. */}
          <a style={link} href="/terms">Terms</a> · <a style={link} href="/checkout">Checkout</a>
        </footer>
      </body>
    </html>
  );
}
