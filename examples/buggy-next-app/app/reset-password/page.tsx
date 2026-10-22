export default function ResetPassword() {
  return (
    <section>
      <h1>Reset your password</h1>
      <form action="/api/password-reset" method="post">
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" />
        <button type="submit">Send reset link</button>
      </form>
    </section>
  );
}
