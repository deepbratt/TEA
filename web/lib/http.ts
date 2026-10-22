// Helpers for the Workbench's API route handlers: JSON in, JSON out, errors with a clear message.
import { tea } from './tea';

const MAX_BODY = 64 * 1024;

export class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly problems: string[] = []) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
}

export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  if (!/^application\/json\b/i.test(req.headers.get('content-type') ?? '')) throw new HttpError(415, 'Send JSON.');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Request too large.');
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

/** Run a handler and turn known errors into responses (unknown ones are logged, not leaked). */
export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    const { engine } = await tea().catch(() => ({ engine: undefined }));
    if (err instanceof HttpError) return json({ error: err.message, problems: err.problems }, err.status);
    if (engine && err instanceof engine.WorkspaceError) return json({ error: engine.mask(err.message), problems: err.problems.map(engine.mask) }, 400);
    if (engine && err instanceof engine.RunBusyError) return json({ error: err.message }, 409);
    // Schema validation (rules, gate, custom rules): say what's wrong in plain words.
    if (err instanceof Error && err.name === 'ZodError' && Array.isArray((err as { issues?: unknown }).issues)) {
      const issues = (err as unknown as { issues: { path: (string | number)[]; message: string }[] }).issues;
      return json({ error: 'Some settings are not valid.', problems: issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`) }, 400);
    }
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    process.stderr.write(`[tea] API error: ${engine ? engine.mask(detail) : detail}
`);
    return json({ error: 'Something went wrong. Check the terminal running TEA.' }, 500);
  }
}
