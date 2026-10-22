import { HttpError, handle } from '@/lib/http';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';
type Ctx = { params: Promise<{ key: string; id: string }> };

/** Live progress of an analysis as server-sent events: "log" lines, then one "done". */
export function GET(req: Request, { params }: Ctx) {
  return handle(async () => {
    const { key, id } = await params;
    const { runs } = (await tea()).services;
    if (!(await runs.get(key, id))) throw new HttpError(404, 'No such analysis.');
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        const stop = runs.follow(id, (e) => {
          if (e.type === 'log') send('log', e.event);
          else {
            send('done', e.run);
            controller.close();
          }
        });
        if (stop) {
          req.signal.addEventListener('abort', () => stop());
          return;
        }
        // Finished already: replay its log, then say it's done.
        for (const e of await runs.events(key, id)) send('log', e);
        send('done', await runs.get(key, id));
        controller.close();
      },
    });
    return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' } });
  });
}
