import { handle, json, readBody } from '@/lib/http';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';

export function GET() {
  return handle(async () => {
    const { services } = await tea();
    return json({ gate: (await services.workspace.read()).data.gate });
  });
}

export function PUT(req: Request) {
  return handle(async () => {
    const body = await readBody(req);
    const { engine, services } = await tea();
    const gate = engine.GateSchema.parse(body);
    await services.workspace.update((ws) => {
      ws.gate = gate;
    });
    return json({ saved: true });
  });
}
