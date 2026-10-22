// Server-only access to the TEA engine and the workspace service.
//
// The engine runs unbundled, straight from the built dist/ folder: it locates its check catalog,
// design tokens and Playwright relative to its own files, which bundling would break.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type * as Engine from '../../dist/index.js';

export type { Engine };
export type EngineModule = typeof Engine;

interface Tea {
  engine: EngineModule;
  services: Engine.Services;
}

const cache = globalThis as unknown as { __tea?: Promise<Tea> };

export const teaRoot = () => process.env.TEA_ROOT ?? join(process.cwd(), '..');
export const workspaceFile = () => process.env.TEA_WORKSPACE ?? join(teaRoot(), 'tea.config.yaml');

export function tea(): Promise<Tea> {
  cache.__tea ??= (async () => {
    const url = pathToFileURL(join(teaRoot(), 'dist', 'index.js')).href;
    const engine = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url)) as EngineModule;
    const services = await engine.createServices({ workspaceFile: workspaceFile() });
    return { engine, services };
  })().catch((err) => {
    cache.__tea = undefined; // let the next request retry, e.g. after fixing the config file
    throw err;
  });
  return cache.__tea;
}
