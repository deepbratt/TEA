'use client';

import Link from 'next/link';

/** Shown when a page can't load, most often because tea.config.yaml has a mistake in it. */
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card empty" role="alert">
      <h1 className="empty-title">TEA couldn&apos;t load this page</h1>
      <p className="help">
        The config file may have a mistake in it. Open the config file to see what&apos;s wrong, or check the terminal running TEA.
      </p>
      <p className="actions">
        <Link className="btn btn-primary" href="/config">
          Open the config file
        </Link>
        <button type="button" className="btn" onClick={reset}>
          Try again
        </button>
      </p>
    </section>
  );
}
