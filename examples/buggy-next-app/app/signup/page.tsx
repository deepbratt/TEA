export default function Signup() {
  return (
    <section>
      <h1>Join Leaf & Kettle</h1>
      {/* BUG (weak validation): email is a plain text field and nothing checks it. */}
      <form action="/api/signup" method="post">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="text" />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" />
        <button type="submit">Create account</button>
      </form>
    </section>
  );
}
