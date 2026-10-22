export const dynamic = 'force-dynamic';

// BUG (server error): assumes a session always exists, so signed-out visitors get a 500.
async function getSession(): Promise<{ user: { name: string } } | null> {
  return null;
}

export default async function Account() {
  const session = await getSession();
  return (
    <section>
      <h1>Account</h1>
      <p>Signed in as {session!.user.name}</p>
    </section>
  );
}
