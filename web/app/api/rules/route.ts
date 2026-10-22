import { handle, json, readBody } from '@/lib/http';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';

export function GET() {
  return handle(async () => {
    const { engine, services } = await tea();
    const { data } = await services.workspace.read();
    return json({ rules: engine.rulesView(services.catalog, data.rules) });
  });
}

/** Replace the rules section of the config file. The page sends only what differs from defaults. */
export function PUT(req: Request) {
  return handle(async () => {
    const { rules } = await readBody<{ rules?: unknown }>(req);
    const { engine, services } = await tea();
    const parsed = engine.RulesSchema.parse(rules ?? {});
    await services.workspace.update((ws) => {
      ws.rules = parsed;
    });
    return json({ saved: true });
  });
}
