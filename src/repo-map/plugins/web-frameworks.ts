import { definePlugin, isDynamicPath, normalisePath, type RepoContext, type Route } from '../../core/index.js';
import { lineOf } from '../context.js';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

/** Directories that hold a project of the given framework (monorepo aware). */
function projectRoots(ctx: RepoContext, configRe: RegExp, dep: string): string[] {
  const roots = new Set<string>();
  for (const f of ctx.files) {
    const m = configRe.exec(f);
    if (m) roots.add(f.slice(0, f.length - m[0].length + (m[0].startsWith('/') ? 1 : 0)));
  }
  if (roots.size === 0 && ctx.deps.has(dep)) roots.add('');
  return [...roots];
}

/** Strip Next.js / SvelteKit route-only segments: (groups), @slots, (.)interceptors. */
function cleanSegments(segs: string[]): string[] {
  return segs.filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@'));
}

async function exportedMethods(ctx: RepoContext, file: string): Promise<string[]> {
  const text = await ctx.read(file);
  const found = HTTP_METHODS.filter((m) =>
    new RegExp(`export\\s+(async\\s+)?(function|const|let)\\s+${m}\\b|export\\s*\\{[^}]*\\b${m}\\b`).test(text),
  );
  return found.length ? found : ['GET'];
}

function route(path: string, kind: Route['kind'], file: string, plugin: string, methods?: string[]): Route {
  const p = normalisePath(path);
  return { path: p, kind, file, line: 1, dynamic: isDynamicPath(p), source: 'code', plugin, ...(methods ? { methods } : {}) };
}

export const nextjs = definePlugin({
  name: 'nextjs',
  activatesOn: ['nextjs'],
  async discover(ctx) {
    const routes: Route[] = [];
    for (const root of projectRoots(ctx, /(^|\/)next\.config\.(js|mjs|ts|cjs)$/, 'next')) {
      for (const base of [`${root}src/app/`, `${root}app/`]) {
        for (const f of ctx.find((f) => f.startsWith(base))) {
          const rel = f.slice(base.length);
          const m = /^(?:(.*)\/)?(page|route)\.(tsx|jsx|ts|js|mdx|md)$/.exec(rel);
          if (!m) continue;
          const segs = (m[1] ?? '').split('/').filter(Boolean);
          if (segs.some((s) => s.startsWith('_'))) continue; // private folders
          const path = '/' + cleanSegments(segs).join('/');
          if (m[2] === 'page') routes.push(route(path, 'page', f, 'nextjs'));
          else routes.push(route(path, 'api', f, 'nextjs', await exportedMethods(ctx, f)));
        }
      }
      for (const base of [`${root}src/pages/`, `${root}pages/`]) {
        for (const f of ctx.find((f) => f.startsWith(base))) {
          const m = /^(.*)\.(tsx|jsx|ts|js|mdx|md)$/.exec(f.slice(base.length));
          if (!m) continue;
          const segs = m[1]!.split('/');
          if (segs.some((s) => s.startsWith('_'))) continue; // _app, _document, _error
          if (segs[segs.length - 1] === 'index') segs.pop();
          const path = '/' + segs.join('/');
          const isApi = segs[0] === 'api';
          if (isApi) {
            const text = await ctx.read(f);
            const methods = HTTP_METHODS.filter((mm) => new RegExp(`method\\s*===?\\s*['"]${mm}['"]`).test(text));
            routes.push(route(path, 'api', f, 'nextjs', methods.length ? methods : undefined));
          } else {
            routes.push(route(path, 'page', f, 'nextjs'));
          }
        }
      }
    }
    return { routes };
  },
});

export const sveltekit = definePlugin({
  name: 'sveltekit',
  activatesOn: ['sveltekit'],
  async discover(ctx) {
    const routes: Route[] = [];
    for (const root of projectRoots(ctx, /(^|\/)svelte\.config\.(js|ts)$/, '@sveltejs/kit')) {
      const base = `${root}src/routes/`;
      for (const f of ctx.find((f) => f.startsWith(base))) {
        const m = /^(?:(.*)\/)?\+(page\.svelte|server\.(ts|js))$/.exec(f.slice(base.length));
        if (!m) continue;
        const path = '/' + cleanSegments((m[1] ?? '').split('/').filter(Boolean)).join('/');
        if (m[2] === 'page.svelte') routes.push(route(path, 'page', f, 'sveltekit'));
        else routes.push(route(path, 'api', f, 'sveltekit', await exportedMethods(ctx, f)));
      }
    }
    return { routes };
  },
});

export const nuxt = definePlugin({
  name: 'nuxt',
  activatesOn: ['nuxt'],
  async discover(ctx) {
    const routes: Route[] = [];
    for (const root of projectRoots(ctx, /(^|\/)nuxt\.config\.(js|ts|mjs)$/, 'nuxt')) {
      for (const f of ctx.find((f) => f.startsWith(`${root}pages/`) && f.endsWith('.vue'))) {
        const segs = f.slice(`${root}pages/`.length, -4).split('/');
        if (segs[segs.length - 1] === 'index') segs.pop();
        routes.push(route('/' + segs.join('/'), 'page', f, 'nuxt'));
      }
      for (const f of ctx.find((f) => f.startsWith(`${root}server/api/`) && /\.(ts|js)$/.test(f))) {
        const m = /^(.*?)(?:\.(get|post|put|patch|delete))?\.(ts|js)$/.exec(f.slice(`${root}server/api/`.length))!;
        const segs = m[1]!.split('/');
        if (segs[segs.length - 1] === 'index') segs.pop();
        routes.push(route('/api/' + segs.join('/'), 'api', f, 'nuxt', m[2] ? [m[2].toUpperCase()] : undefined));
      }
    }
    return { routes };
  },
});

export const astro = definePlugin({
  name: 'astro',
  activatesOn: ['astro'],
  async discover(ctx) {
    const routes: Route[] = [];
    for (const root of projectRoots(ctx, /(^|\/)astro\.config\.(mjs|ts|js)$/, 'astro')) {
      const base = `${root}src/pages/`;
      for (const f of ctx.find((f) => f.startsWith(base))) {
        const m = /^(.*)\.(astro|md|mdx|ts|js)$/.exec(f.slice(base.length));
        if (!m) continue;
        const segs = m[1]!.split('/');
        if (segs[segs.length - 1] === 'index') segs.pop();
        const isEndpoint = m[2] === 'ts' || m[2] === 'js';
        routes.push(route('/' + segs.join('/'), isEndpoint ? 'api' : 'page', f, 'astro', isEndpoint ? await exportedMethods(ctx, f) : undefined));
      }
    }
    return { routes };
  },
});

/** Remix / React Router v7 flat-file routes in app/routes. */
export const remix = definePlugin({
  name: 'remix',
  activatesOn: ['remix'],
  async discover(ctx) {
    const routes: Route[] = [];
    for (const f of ctx.find((f) => /(^|\/)app\/routes\/[^/]+\.(tsx|jsx|ts|js)$/.test(f))) {
      const name = f.split('/').pop()!.replace(/\.(tsx|jsx|ts|js)$/, '');
      const segs = name
        .split('.')
        .filter((s) => s !== '_index' && !s.startsWith('_'))
        .map((s) => (s === '$' ? '*' : s.startsWith('$') ? `:${s.slice(1)}` : s.replace(/_$/, '')));
      const text = await ctx.read(f);
      const hasUi = /export\s+default/.test(text);
      routes.push(route('/' + segs.join('/'), hasUi ? 'page' : 'api', f, 'remix'));
    }
    return { routes };
  },
});

/** Client-side routers (React Router, Vue Router, Angular) used by Lovable/Bolt/v0 style SPAs. */
export const spaRouter = definePlugin({
  name: 'spa-router',
  activatesOn: ['react', 'vue', 'angular'],
  async discover(ctx) {
    const routes: Route[] = [];
    const files = ctx.find((f) => /\.(m?[jt]sx?|vue)$/.test(f) && !f.includes('/node_modules/'));
    for (const f of files) {
      const text = await ctx.read(f);
      if (!/react-router|vue-router|@angular\/router|@tanstack\/react-router|wouter/.test(text)) continue;
      const patterns = [/<Route\b[^>]*?\bpath\s*=\s*["'`]([^"'`]*)["'`]/g, /\bpath\s*:\s*["'`]([^"'`]*)["'`]/g];
      for (const re of patterns) {
        for (const m of text.matchAll(re)) {
          const p = m[1]!;
          if (p === '' || p === '*' || p === '**' || /^https?:/.test(p)) continue;
          routes.push({ ...route(p, 'page', f, 'spa-router'), line: lineOf(text, m.index!) });
        }
      }
    }
    return { routes };
  },
});
