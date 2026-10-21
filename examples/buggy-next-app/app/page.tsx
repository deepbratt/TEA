export const metadata = {
  title: 'Leaf & Kettle: small-batch tea',
  // BUG (noindex on the home page): left over from a staging deploy, hides the shop from search.
  robots: { index: false, follow: false },
  // BUG (broken Open Graph image): this file does not exist.
  openGraph: { title: 'Leaf & Kettle', images: ['/og-missing.png'] },
};

export default function Home() {
  return (
    <section>
      {/* BUG (missing image + accessibility): the logo file doesn't exist and has no alt text. */}
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img src="/logo-final-v2.png" width={120} height={40} />
      <h1>Small-batch tea, delivered monthly</h1>
      {/* BUG (unoptimised image): a ~3 MB hero image with no width, height or lazy loading. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/hero.png" alt="Steaming cup of tea" style={{ maxWidth: '100%' }} />
      {/* BUG (accessibility): low-contrast text. */}
      <p style={{ color: '#d8d2ca' }}>Free shipping on orders over $30. Cancel the Tea Club anytime.</p>
      <a href="/shop">Browse teas</a>
    </section>
  );
}
