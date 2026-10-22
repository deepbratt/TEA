// The website demo has no server. API calls from the pages are answered here, in the browser,
// from data recorded when the demo was built (public/demo-data.json). Writes "succeed" without
// saving anything, so every button can be tried.
import { asset } from './mode';

export interface DemoData {
  projectKey: string;
  latestRunId: string;
  /** Folder listings for the folder picker, by path. */
  folders: Record<string, unknown>;
  /** What "Choose folder and detect" finds. */
  detect: unknown;
  /** The log of the recorded analysis, replayed when "Run analysis" is pressed. */
  events: { kind: string; message: string; at: string }[];
}

let data: Promise<DemoData> | undefined;
export const demoData = () => (data ??= fetch(asset('/demo-data.json')).then((r) => r.json() as Promise<DemoData>));

export async function demoApi(path: string, method: string): Promise<unknown> {
  const d = await demoData();
  const url = new URL(path, 'http://demo');
  if (method === 'GET' && url.pathname === '/api/folders') {
    const p = url.searchParams.get('path');
    return d.folders[p ?? ''] ?? d.folders[''];
  }
  if (method === 'GET' && url.pathname === '/api/detect') return d.detect;
  if (method === 'POST' && /^\/api\/projects\/[^/]+\/runs$/.test(url.pathname)) return { run: { id: d.latestRunId } };
  if (method === 'POST' && url.pathname === '/api/projects') return { key: d.projectKey };
  if (method === 'PUT' && url.pathname.startsWith('/api/projects/')) return { key: d.projectKey };
  if (method === 'DELETE') return { deleted: d.projectKey };
  return { saved: true };
}
