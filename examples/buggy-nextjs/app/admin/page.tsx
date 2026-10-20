// BUG (M1 finds it, M3 flags it): an admin page that nothing links to and nothing protects.
export default function Admin() {
  return (
    <section>
      <h1>Admin</h1>
      <p>All customers and their quotes.</p>
    </section>
  );
}
