import { HttpError, handle, json, readBody } from '@/lib/http';
import { tea } from '@/lib/tea';

export const dynamic = 'force-dynamic';

export function GET() {
  return handle(async () => {
    const { engine, services } = await tea();
    return json({ file: services.workspace.file, text: await services.workspace.text(), defaultText: engine.defaultWorkspaceText() });
  });
}

/** Save the config file as edited by hand. It's validated first; comments are kept as written. */
export function PUT(req: Request) {
  return handle(async () => {
    const { text } = await readBody<{ text?: unknown }>(req);
    if (typeof text !== 'string') throw new HttpError(400, 'Send the file text.');
    await (await tea()).services.workspace.replaceText(text);
    return json({ saved: true });
  });
}
