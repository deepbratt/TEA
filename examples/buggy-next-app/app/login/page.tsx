export default function Login() {
  return (
    <section>
      <h1>Log in</h1>
      <form action="/api/login" method="post">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" />
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" />
        <button type="submit">Log in</button>
      </form>
      <a href="/reset-password">Forgot your password?</a>
    </section>
  );
}
