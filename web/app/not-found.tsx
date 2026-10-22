import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="card empty">
      <h1 className="empty-title">Not found</h1>
      <p className="help">That project or page doesn&apos;t exist. It may have been removed from the config file.</p>
      <Link className="btn" href="/">
        Back to projects
      </Link>
    </section>
  );
}
