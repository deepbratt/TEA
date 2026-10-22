import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempDirs } from '../__tests__/temp.js';
import { loadCatalog } from '../core/index.js';
import { wiringFindings } from '../wiring/index.js';
import { detectProject, scanSources } from './index.js';

const dir = useTempDirs('project');

const monorepo = () =>
  dir({
    'package.json': JSON.stringify({ name: 'shop', private: true, workspaces: ['apps/*'] }),
    'apps/web/package.json': JSON.stringify({ name: 'web', dependencies: { react: '18', vite: '5' }, scripts: { dev: 'vite --port 5180' } }),
    'apps/web/src/api.ts': 'export const items = () => fetch(`${import.meta.env.VITE_API}/api/items`);\nexport const cart = () => fetch("/api/cart", { method: "POST" });',
    'apps/api/go.mod': 'module example.com/api\n\ngo 1.22\n\nrequire github.com/gin-gonic/gin v1.10.0\n',
    'apps/api/main.go': 'r := gin.Default()\nr.GET("/api/items", list)\nr.GET("/api/health", health)',
    'docs/README.md': '# docs',
  });

describe('detectProject', () => {
  it('splits a monorepo into its apps and tells frontend from backend', async () => {
    const root = await monorepo();
    const p = await detectProject(root, { probe: false });
    expect(p.sources.map((s) => [s.name, s.role])).toEqual([
      ['api', 'backend'],
      ['web', 'frontend'],
    ]);
    expect(p.sources.find((s) => s.name === 'api')!.stack).toEqual(expect.arrayContaining(['Gin', 'Go']));
    expect(p.sources.find((s) => s.name === 'web')!.stack).toEqual(expect.arrayContaining(['React', 'Vite']));
    // The app's own configured port comes first, then the stacks' default dev ports.
    expect(p.urls.map((u) => u.url)).toEqual(['http://localhost:5180', 'http://localhost:5173', 'http://localhost:8080']);
  });

  it('keeps a single app as one source', async () => {
    const root = await dir({ 'package.json': JSON.stringify({ dependencies: { next: '15', react: '19' } }), 'app/page.tsx': 'export default function P(){}', 'components/x/package.json': '{}' });
    const p = await detectProject(root, { probe: false });
    expect(p.sources).toHaveLength(1);
    expect(p.sources[0]).toMatchObject({ path: root, role: 'fullstack' });
  });

  it('wires a React frontend to a Go backend with roles left on auto', async () => {
    const root = await monorepo();
    const scan = await scanSources([
      { name: 'web', path: join(root, 'apps/web'), role: 'auto' },
      { name: 'api', path: join(root, 'apps/api'), role: 'auto' },
    ]);
    expect(scan.sources.map((s) => [s.name, s.role, s.detected])).toEqual([
      ['web', 'frontend', true],
      ['api', 'backend', true],
    ]);
    const ids = wiringFindings(scan.wiring, await loadCatalog()).map((f) => f.id);
    // /api/health is called from outside the app (monitoring), so it is never "unused".
    expect(ids).toEqual(['wiring.orphan-call:POST /api/cart']);
  });
});
