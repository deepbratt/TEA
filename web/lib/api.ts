// Browser-side calls to the Workbench API, with the server's error message (and problems) kept.
// In the website demo there is no server: calls are answered from recorded data.
import { demoApi } from './demo';
import { DEMO } from './mode';

export class ApiError extends Error {
  constructor(message: string, readonly problems: string[] = []) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (DEMO) return (await demoApi(path, init.method ?? 'GET')) as T;
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: 'no-store',
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; problems?: string[] };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status}).`, data.problems ?? []);
  return data as T;
}

export function errorText(err: unknown): { message: string; problems: string[] } {
  if (err instanceof ApiError) return { message: err.message, problems: err.problems };
  return { message: (err as Error).message ?? String(err), problems: [] };
}
