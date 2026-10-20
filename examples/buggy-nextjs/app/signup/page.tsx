export default function Signup() {
  return (
    <section>
      <h1>Create your account</h1>
      {/* BUG (M2): email is a plain text field with no validation, and there is no double-submit guard. */}
      <form action="/api/signup" method="post">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="text" />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" />
        <button type="submit">Sign up</button>
      </form>
    </section>
  );
}
