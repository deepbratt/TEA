import { HttpError, handle, json, readBody } from '@/lib/http';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';

/** Your own rules, plus the ready-made templates the Rules page offers. */
export function GET() {
  return handle(async () => {
    const { engine, services } = await tea();
    const { data } = await services.workspace.read();
    return json({ rules: data.customRules, templates: engine.CUSTOM_RULE_TEMPLATES });
  });
}

/** Replace the customRules section of the config file. */
export function PUT(req: Request) {
  return handle(async () => {
    const { rules } = await readBody<{ rules?: unknown }>(req);
    if (!Array.isArray(rules)) throw new HttpError(400, 'Send the list of rules.');
    const { engine, services } = await tea();
    const parsed = rules.map((r) => engine.CustomRuleSchema.parse(r));
    await services.workspace.update((ws) => {
      ws.customRules = parsed;
    });
    return json({ saved: true });
  });
}
