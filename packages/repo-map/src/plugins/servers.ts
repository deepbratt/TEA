import { definePlugin, isDynamicPath, normalisePath, type RepoContext, type Route } from '@tea-qa/core';
import { isSource, lineOf } from '../context.js';

function apiRoute(path: string, method: string, file: string, line: number, plugin: string): Route {
  const p = normalisePath(path);
  return { path: p, kind: 'api', methods: [method.toUpperCase()], file, line, dynamic: isDynamicPath(p), source: 'code', plugin };
}

async function scan(
  ctx: RepoContext,
  fileRe: RegExp,
  fn: (text: string, file: string) => Route[],
): Promise<{ routes: Route[] }> {
  const routes: Route[] = [];
  for (const f of ctx.find((f) => fileRe.test(f) && isSource(f))) {
    routes.push(...fn(await ctx.read(f), f));
  }
  return { routes };
}

/** Express, Fastify, Hono, Koa-router style: app.get('/path', ...). */
export const nodeServers = definePlugin({
  name: 'node-servers',
  activatesOn: ['express', 'fastify', 'hono'],
  discover: (ctx) =>
    scan(ctx, /\.(m?[jt]s|cjs)$/, (text, file) => {
      const out: Route[] = [];
      const re = /\b(?:app|router|server|api|fastify|routes|r)\s*\.\s*(get|post|put|patch|delete|all)\s*\(\s*["'`](\/[^"'`]*)["'`]/g;
      for (const m of text.matchAll(re)) {
        out.push(apiRoute(m[2]!, m[1] === 'all' ? 'ANY' : m[1]!, file, lineOf(text, m.index!), 'node-servers'));
      }
      return out;
    }),
});

/** NestJS controllers: @Controller('users') + @Get(':id'). */
export const nestjs = definePlugin({
  name: 'nestjs',
  activatesOn: ['nestjs'],
  discover: (ctx) =>
    scan(ctx, /\.controller\.ts$/, (text, file) => {
      const prefix = /@Controller\(\s*(?:["'`]([^"'`]*)["'`])?/.exec(text)?.[1] ?? '';
      const out: Route[] = [];
      for (const m of text.matchAll(/@(Get|Post|Put|Patch|Delete|All)\(\s*(?:["'`]([^"'`]*)["'`])?\s*\)/g)) {
        out.push(apiRoute(`/${prefix}/${m[2] ?? ''}`, m[1] === 'All' ? 'ANY' : m[1]!, file, lineOf(text, m.index!), 'nestjs'));
      }
      return out;
    }),
});

/** FastAPI and Flask decorators. */
export const pythonWeb = definePlugin({
  name: 'python-web',
  activatesOn: ['fastapi', 'flask'],
  discover: (ctx) =>
    scan(ctx, /\.py$/, (text, file) => {
      const out: Route[] = [];
      // router = APIRouter(prefix="/v1") applies only to @router.* decorators.
      const prefixes = new Map<string, string>();
      for (const m of text.matchAll(/(\w+)\s*=\s*APIRouter\([^)]*prefix\s*=\s*["']([^"']*)["']/g)) prefixes.set(m[1]!, m[2]!);
      for (const m of text.matchAll(/@(\w+)\.(get|post|put|patch|delete|api_route)\(\s*["']([^"']*)["']/g)) {
        const prefix = prefixes.get(m[1]!) ?? '';
        out.push(apiRoute(prefix + m[3]!, m[2] === 'api_route' ? 'ANY' : m[2]!, file, lineOf(text, m.index!), 'python-web'));
      }
      // Flask: @app.route('/x', methods=['GET', 'POST'])
      for (const m of text.matchAll(/@\w+\.route\(\s*["']([^"']*)["']([^)]*)\)/g)) {
        const methods = [...(m[2]!.matchAll(/["'](GET|POST|PUT|PATCH|DELETE)["']/gi))].map((x) => x[1]!.toUpperCase());
        const line = lineOf(text, m.index!);
        for (const method of methods.length ? methods : ['GET']) out.push(apiRoute(m[1]!, method, file, line, 'python-web'));
      }
      return out;
    }),
});

/** Django urls.py: path('posts/<int:id>/', view). Include() prefixes are not resolved yet. */
export const django = definePlugin({
  name: 'django',
  activatesOn: ['django'],
  discover: (ctx) =>
    scan(ctx, /(^|\/)urls\.py$/, (text, file) => {
      const out: Route[] = [];
      for (const m of text.matchAll(/\b(?:path|re_path)\(\s*r?["']([^"']*)["']\s*,\s*(include\()?/g)) {
        if (m[2]) continue; // include('app.urls'): child routes come from that file
        const p = m[1]!.replace(/^\^/, '').replace(/\$$/, '');
        out.push({ ...apiRoute(p, 'ANY', file, lineOf(text, m.index!), 'django'), kind: 'page', methods: undefined });
      }
      return out;
    }),
});

/** Rails config/routes.rb: verbs and resources. */
export const rails = definePlugin({
  name: 'rails',
  activatesOn: ['rails'],
  async discover(ctx) {
    const routes: Route[] = [];
    for (const file of ctx.find((f) => /(^|\/)config\/routes\.rb$/.test(f))) {
      const text = await ctx.read(file);
      for (const m of text.matchAll(/^\s*(get|post|put|patch|delete)\s+["']([^"']+)["']/gm)) {
        routes.push(apiRoute(m[2]!, m[1]!, file, lineOf(text, m.index!), 'rails'));
      }
      for (const m of text.matchAll(/^\s*resources?\s+:(\w+)/gm)) {
        const line = lineOf(text, m.index!);
        const base = `/${m[1]}`;
        const page = (p: string): Route => ({ ...apiRoute(p, 'GET', file, line, 'rails'), kind: 'page' });
        routes.push(page(base), page(`${base}/new`), page(`${base}/:id`), page(`${base}/:id/edit`));
      }
      if (/^\s*root\b/m.test(text)) routes.push({ ...apiRoute('/', 'GET', file, 1, 'rails'), kind: 'page' });
    }
    return { routes };
  },
});
