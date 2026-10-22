import { describe, expect, it } from 'vitest';
import { useTempDirs } from '../__tests__/temp.js';
import { loadCatalog } from '../core/index.js';
import { scanSources } from '../repo-map/index.js';
import { wiringFindings } from './index.js';

const dir = useTempDirs('wiring');
const pkg = (deps: Record<string, string>) => JSON.stringify({ name: 'x', dependencies: deps });

async function frontendAndBackend() {
  const web = await dir({
    'package.json': pkg({ vite: '5', react: '18', 'react-router-dom': '6' }),
    'src/api.ts': [
      'const BASE = import.meta.env.VITE_API_URL;',
      'export const orders = () => fetch(`${BASE}/api/orders`);',
      'export const order = (id) => fetch(`${BASE}/api/orders/${id}`);',
      'export const save = (o) => fetch("/api/orders", { method: "POST", body: JSON.stringify(o) });',
      'export const wishlist = () => fetch("/api/wishlist");',
      'export const remove = (id) => axios.delete(`/api/orders/${id}`);',
    ].join('\n'),
  });
  const api = await dir({
    'package.json': pkg({ express: '4' }),
    'src/server.ts': [
      'const app = express();',
      'app.get("/api/orders", list);',
      'app.post("/api/orders", create);',
      'app.get("/api/orders/:id", show);',
      'app.get("/api/reports", reports);',
      'app.post("/api/webhooks/stripe", hook);',
    ].join('\n'),
  });
  return scanSources([
    { name: 'web', path: web, role: 'frontend' },
    { name: 'api', path: api, role: 'backend' },
  ]);
}

describe('scanSources', () => {
  it('merges a separate frontend and backend, prefixing files with the folder name', async () => {
    const r = await frontendAndBackend();
    expect(r.sources.map((s) => [s.name, s.role])).toEqual([
      ['web', 'frontend'],
      ['api', 'backend'],
    ]);
    expect(r.wiring.comparable).toBe(true);
    expect(r.wiring.calls.every((c) => c.file.startsWith('web/'))).toBe(true);
    expect(r.wiring.endpoints.every((e) => e.file?.startsWith('api/'))).toBe(true);
    expect(r.wiring.calls.map((c) => `${c.method} ${c.path}`)).toEqual(
      expect.arrayContaining(['GET /api/orders', 'GET /api/orders/:param', 'POST /api/orders', 'GET /api/wishlist', 'DELETE /api/orders/:param']),
    );
  });

  it('is not comparable with only a frontend', async () => {
    const web = await dir({ 'package.json': pkg({ react: '18' }), 'src/a.ts': 'fetch("/api/x")' });
    const r = await scanSources([{ name: 'web', path: web, role: 'frontend' }]);
    expect(r.wiring.comparable).toBe(false);
  });
});

describe('wiringFindings', () => {
  it('flags calls nothing serves, wrong methods, and endpoints nothing calls', async () => {
    const catalog = await loadCatalog();
    const findings = wiringFindings((await frontendAndBackend()).wiring, catalog);
    const ids = findings.map((f) => f.id).sort();
    expect(ids).toEqual(['wiring.orphan-call:DELETE /api/orders/:param', 'wiring.orphan-call:GET /api/wishlist', 'wiring.unused-endpoint:/api/reports']);

    const wishlist = findings.find((f) => f.id === 'wiring.orphan-call:GET /api/wishlist')!;
    expect(wishlist.severity).toBe('high');
    expect(wishlist.area).toBe('api');
    expect(wishlist.evidence?.file).toBe('web/src/api.ts');
    expect(wishlist.fix).toContain('/api/wishlist');

    const del = findings.find((f) => f.id.startsWith('wiring.orphan-call:DELETE'))!;
    expect(del.title).toMatch(/only handles GET/);
    expect(findings.find((f) => f.id.startsWith('wiring.unused-endpoint'))!.severity).toBe('info');
  });

  it('finds nothing when the sides are not comparable', async () => {
    const catalog = await loadCatalog();
    expect(wiringFindings({ calls: [{ path: '/api/x', method: 'GET', file: 'a.ts', line: 1, via: 'code' }], endpoints: [], comparable: false }, catalog)).toEqual([]);
  });
});
