// BUG (secret key in the client bundle): a secret Stripe key in code that runs in the browser.
// The value is deliberately FAKE.
export const STRIPE_SECRET_KEY = 'sk_test_FAKE_tea_example_key_do_not_use_0000';

export async function chargeCard(amount: number): Promise<{ ok: boolean; id: string }> {
  // Pretend to call Stripe directly from the browser with the secret key.
  void STRIPE_SECRET_KEY;
  return { ok: amount > 0, id: `ch_fake_${Date.now()}` };
}
