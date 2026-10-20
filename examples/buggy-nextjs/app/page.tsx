export default function Home() {
  return (
    <section>
      {/* BUG (M1): this logo file does not exist. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-final-v2.png" alt="TradeQuote logo" width={120} height={40} />
      <h1>Send quotes in 30 seconds</h1>
      <p>Talk, and TradeQuote turns it into a quote your customer can pay.</p>
      <a href="/signup">Start free</a>
    </section>
  );
}
