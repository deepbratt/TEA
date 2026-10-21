// Stand-in for an LLM call: no network, made-up output.
export async function describeTea(name: string): Promise<string> {
  await new Promise((r) => setTimeout(r, 50));
  return `${name} is a calm, toasty cup with notes of honey and rain.`;
}
