import { definePlugin, type Route } from '../../core/index.js';
import { lineOf } from '../context.js';
import { apiRoute, scan } from './servers.js';

/**
 * Route discovery for backends outside JavaScript and Python: Go, Rust, the JVM (Spring, JAX-RS,
 * Micronaut, Ktor), ASP.NET Core, PHP (Laravel, Symfony, Slim), Elixir (Phoenix), Ruby (Sinatra) and
 * Swift (Vapor). Each one reads route declarations from source; nothing is run.
 */

const METHOD = (m: string) => {
  const u = m.toUpperCase();
  return u === 'ANY' || u === 'ALL' || u === 'MATCH' ? 'ANY' : u;
};
const join = (...parts: string[]) => `/${parts.map((p) => p.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;

/** Gin, Echo, Fiber, chi, Gorilla mux and net/http (including Go 1.22 "GET /path" patterns). */
export const goServers = definePlugin({
  name: 'go-servers',
  activatesOn: ['go-nethttp', 'gin', 'echo', 'fiber', 'chi', 'gorilla'],
  discover: (ctx) =>
    scan(ctx, /\.go$/, (text, file) => {
      const out: Route[] = [];
      // Route groups: v1 := r.Group("/v1"), api := app.Group("/api").
      const groups = new Map<string, string>();
      for (const m of text.matchAll(/(\w+)\s*:?=\s*(\w+)\.Group\(\s*"([^"]*)"/g)) groups.set(m[1]!, join(groups.get(m[2]!) ?? '', m[3]!));
      const verbs = /\b(\w+)\.(GET|POST|PUT|PATCH|DELETE|Any|Get|Post|Put|Patch|Delete|All)\(\s*"(\/[^"]*)"/g;
      for (const m of text.matchAll(verbs)) {
        if (m[1] === 'http' || m[1] === 'client') continue; // http.Get("...") is a client call
        out.push(apiRoute(join(groups.get(m[1]!) ?? '', m[3]!), METHOD(m[2]!), file, lineOf(text, m.index!), 'go-servers'));
      }
      // net/http and gorilla: HandleFunc("GET /x", h), HandleFunc("/x", h).Methods("POST").
      for (const m of text.matchAll(/\.Handle(?:Func)?\(\s*"(?:(GET|POST|PUT|PATCH|DELETE)\s+)?(\/[^"]*)"[^\n]*?(?:\.Methods\(([^)]*)\))?/g)) {
        const listed = [...(m[3] ?? '').matchAll(/"(\w+)"/g)].map((x) => x[1]!.toUpperCase());
        const methods = m[1] ? [m[1]] : listed.length ? listed : ['ANY'];
        for (const method of methods) out.push(apiRoute(m[2]!.replace(/\{\$\}$/, ''), method, file, lineOf(text, m.index!), 'go-servers'));
      }
      return out;
    }),
});

/** Axum and Actix `.route("/x", get(h).post(h))`, Actix and Rocket attributes `#[get("/x")]`. */
export const rustServers = definePlugin({
  name: 'rust-servers',
  activatesOn: ['axum', 'actix', 'rocket'],
  discover: (ctx) =>
    scan(ctx, /\.rs$/, (text, file) => {
      const out: Route[] = [];
      for (const m of text.matchAll(/\.route\(\s*"(\/[^"]*)"\s*,([^;]{0,400}?)\)\s*(?=\.route|\.nest|\.layer|\.with_state|;|\.merge|\n\s*\n)/g)) {
        const methods = [...new Set([...m[2]!.matchAll(/\b(get|post|put|patch|delete|any)\s*\(/g)].map((x) => METHOD(x[1]!)))];
        for (const method of methods.length ? methods : ['ANY']) out.push(apiRoute(m[1]!, method, file, lineOf(text, m.index!), 'rust-servers'));
      }
      for (const m of text.matchAll(/#\[(get|post|put|patch|delete)\(\s*"(\/[^"]*)"/g)) {
        out.push(apiRoute(m[2]!.replace(/<([^>]+)>/g, ':$1'), METHOD(m[1]!), file, lineOf(text, m.index!), 'rust-servers'));
      }
      return out;
    }),
});

/** The prefix on a class: @RequestMapping("/api"), @Path("/api"), @Controller("/api"), [Route("api/x")]. */
function classPrefix(text: string, re: RegExp): string {
  const classAt = text.search(/\bclass\s+\w+/);
  const m = re.exec(classAt >= 0 ? text.slice(0, classAt) : text);
  return m?.[1] ?? '';
}

/** Spring (@GetMapping), JAX-RS / Quarkus (@GET + @Path), Micronaut (@Get) and Ktor (get("/x") { }). */
export const jvmServers = definePlugin({
  name: 'jvm-servers',
  activatesOn: ['spring', 'jaxrs', 'ktor'],
  discover: (ctx) =>
    scan(ctx, /\.(java|kt)$/, (text, file) => {
      const out: Route[] = [];
      const add = (path: string, method: string, at: number) => out.push(apiRoute(path, method, file, lineOf(text, at), 'jvm-servers'));
      const str = String.raw`\(\s*(?:(?:value|path)\s*=\s*)?\[?\s*"([^"]*)"`;

      const spring = classPrefix(text, new RegExp(String.raw`@RequestMapping` + str));
      for (const m of text.matchAll(new RegExp(String.raw`@(Get|Post|Put|Patch|Delete)Mapping(?:` + str + String.raw`)?`, 'g'))) add(join(spring, m[2] ?? ''), METHOD(m[1]!), m.index!);
      for (const m of text.matchAll(new RegExp(String.raw`@RequestMapping` + str + String.raw`[^)]*?method\s*=\s*(?:\{\s*)?RequestMethod\.(\w+)`, 'g'))) {
        if (m.index! > text.search(/\bclass\s+\w+/)) add(join(spring, m[1]!), METHOD(m[2]!), m.index!);
      }

      const jaxrs = classPrefix(text, /@Path\(\s*"([^"]*)"/);
      for (const m of text.matchAll(/@(GET|POST|PUT|PATCH|DELETE)\b(?![\w(])/g)) {
        // The method's own @Path sits among its annotations: after the previous member, before its signature.
        const behind = text.slice(Math.max(0, m.index! - 300), m.index!);
        const ahead = text.slice(m.index!, m.index! + 300);
        const sig = ahead.search(/\b(public|private|protected|fun|suspend)\b/);
        const annotations = behind.slice(Math.max(behind.lastIndexOf(';'), behind.lastIndexOf('}'), behind.lastIndexOf('{')) + 1) + (sig >= 0 ? ahead.slice(0, sig) : ahead);
        add(join(jaxrs, /@Path\(\s*"([^"]*)"/.exec(annotations)?.[1] ?? ''), m[1]!, m.index!);
      }

      const micronaut = classPrefix(text, /@Controller\(\s*"([^"]*)"/);
      if (micronaut || /io\.micronaut/.test(text)) {
        for (const m of text.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:value\s*=\s*)?"([^"]*)"\s*\)/g)) add(join(micronaut, m[2]!), METHOD(m[1]!), m.index!);
      }

      if (/io\.ktor/.test(text)) {
        // Ktor: route("/api") { get("/users") { } } — nested route() prefixes by brace depth.
        const stack: { prefix: string; depth: number }[] = [];
        let depth = 0;
        const tokens = /\broute\(\s*"([^"]*)"\s*\)\s*\{|\b(get|post|put|patch|delete)\(\s*"([^"]*)"\s*\)\s*\{|\{|\}/g;
        for (const m of text.matchAll(tokens)) {
          if (m[0] === '}') {
            depth--;
            while (stack.length && stack.at(-1)!.depth > depth) stack.pop();
            continue;
          }
          const prefix = join(...stack.map((s) => s.prefix));
          if (m[1] !== undefined) stack.push({ prefix: m[1], depth: depth + 1 });
          else if (m[2]) add(join(prefix, m[3]!), METHOD(m[2]), m.index!);
          depth++;
        }
      }
      return out;
    }),
});

/** ASP.NET Core minimal APIs (app.MapGet("/x")) and controllers ([Route] + [HttpGet]). */
export const aspnet = definePlugin({
  name: 'aspnet',
  activatesOn: ['aspnet'],
  discover: (ctx) =>
    scan(ctx, /\.cs$/, (text, file) => {
      const out: Route[] = [];
      const groups = new Map<string, string>();
      for (const m of text.matchAll(/(\w+)\s*=\s*(\w+)\.MapGroup\(\s*"([^"]*)"/g)) groups.set(m[1]!, join(groups.get(m[2]!) ?? '', m[3]!));
      for (const m of text.matchAll(/\b(\w+)\.Map(Get|Post|Put|Patch|Delete|Methods)\(\s*"([^"]*)"/g)) {
        out.push(apiRoute(join(groups.get(m[1]!) ?? '', m[3]!), m[2] === 'Methods' ? 'ANY' : METHOD(m[2]!), file, lineOf(text, m.index!), 'aspnet'));
      }
      const controller = /class\s+(\w+?)Controller\b/.exec(text)?.[1];
      if (controller) {
        const prefix = classPrefix(text, /\[Route\(\s*"([^"]*)"\s*\)\]/).replace(/\[controller\]/gi, controller.toLowerCase());
        for (const m of text.matchAll(/\[Http(Get|Post|Put|Patch|Delete)(?:\(\s*"([^"]*)"\s*\))?\]/g)) {
          const sub = m[2] ?? '';
          out.push(apiRoute(sub.startsWith('/') || sub.startsWith('~') ? sub.replace(/^~/, '') : join(prefix, sub), METHOD(m[1]!), file, lineOf(text, m.index!), 'aspnet'));
        }
      }
      return out;
    }),
});

/** Laravel routes/*.php, Symfony #[Route] attributes and Slim $app->get(). */
export const phpServers = definePlugin({
  name: 'php-servers',
  activatesOn: ['laravel', 'symfony', 'slim'],
  discover: (ctx) =>
    scan(ctx, /\.php$/, (text, file) => {
      const out: Route[] = [];
      const add = (path: string, method: string, at: number) => out.push(apiRoute(path, method, file, lineOf(text, at), 'php-servers'));
      // Laravel: routes in routes/api.php are served under /api.
      const base = /(^|\/)routes\/api\.php$/.test(file) ? '/api' : '';
      for (const m of text.matchAll(/Route::(get|post|put|patch|delete|any|match)\(\s*(?:\[[^\]]*\]\s*,\s*)?['"]([^'"]*)['"]/g)) add(join(base, m[2]!), METHOD(m[1]!), m.index!);
      for (const m of text.matchAll(/Route::(api)?[Rr]esources?\(\s*['"]([^'"]+)['"]/g)) {
        const p = join(base, m[2]!);
        const methods: [string, string][] = [['GET', p], ['POST', p], ['GET', `${p}/{id}`], ['PUT', `${p}/{id}`], ['PATCH', `${p}/{id}`], ['DELETE', `${p}/{id}`]];
        for (const [method, path] of methods) add(path, method, m.index!);
      }
      // Symfony: #[Route('/x', methods: ['GET'])], with a class-level #[Route('/api')] prefix.
      const prefix = classPrefix(text, /#\[Route\(\s*['"]([^'"]*)['"]/);
      const classAt = text.search(/\bclass\s+\w+/);
      for (const m of text.matchAll(/#\[Route\(\s*['"]([^'"]*)['"]([^\]]*)\]/g)) {
        if (m.index! < classAt) continue;
        const methods = [...(/methods\s*:\s*\[([^\]]*)/.exec(m[2]!)?.[1] ?? '').matchAll(/['"](\w+)['"]/g)].map((x) => METHOD(x[1]!));
        for (const method of methods.length ? methods : ['ANY']) add(join(prefix, m[1]!), method, m.index!);
      }
      // Slim: $app->get('/x', ...), $group->post('/y', ...).
      for (const m of text.matchAll(/\$\w+->(get|post|put|patch|delete|any)\(\s*['"](\/[^'"]*)['"]/g)) add(m[2]!, METHOD(m[1]!), m.index!);
      return out;
    }),
});

/** Phoenix router.ex: scope "/api" do ... get "/users", UserController, :index ... end. */
export const phoenix = definePlugin({
  name: 'phoenix',
  activatesOn: ['phoenix'],
  discover: (ctx) =>
    scan(ctx, /(^|\/)router\.ex$/, (text, file) => {
      const out: Route[] = [];
      const stack: string[] = [];
      for (const [i, line] of text.split('\n').entries()) {
        const scope = /^\s*scope\s+"([^"]*)"/.exec(line);
        const verb = /^\s*(get|post|put|patch|delete|live)\s+"([^"]*)"/.exec(line);
        const resources = /^\s*resources\s+"([^"]*)"/.exec(line);
        const prefix = join(...stack);
        if (verb) {
          // Outside an /api scope, GET and LiveView routes are pages.
          const r = apiRoute(join(prefix, verb[2]!), verb[1] === 'live' ? 'GET' : verb[1]!, file, i + 1, 'phoenix');
          const page = !prefix.startsWith('/api') && (verb[1] === 'get' || verb[1] === 'live');
          out.push(page ? { ...r, kind: 'page' } : r);
        }
        if (resources) {
          const p = join(prefix, resources[1]!);
          for (const [method, path] of [['GET', p], ['POST', p], ['GET', `${p}/:id`], ['PUT', `${p}/:id`], ['PATCH', `${p}/:id`], ['DELETE', `${p}/:id`]] as const) {
            out.push(apiRoute(path, method, file, i + 1, 'phoenix'));
          }
        }
        if (/\bdo\s*$/.test(line)) stack.push(scope ? scope[1]! : '');
        else if (/^\s*end\s*$/.test(line)) stack.pop();
      }
      return out;
    }),
});

/** Sinatra: get '/x' do ... end. */
export const sinatra = definePlugin({
  name: 'sinatra',
  activatesOn: ['sinatra'],
  discover: (ctx) =>
    scan(ctx, /\.rb$/, (text, file) => {
      const out: Route[] = [];
      for (const m of text.matchAll(/^\s*(get|post|put|patch|delete)\s*\(?\s*['"](\/[^'"]*)['"]/gm)) out.push(apiRoute(m[2]!, m[1]!, file, lineOf(text, m.index!), 'sinatra'));
      return out;
    }),
});

/** Vapor: app.get("users", ":id") { req in ... }. */
export const vapor = definePlugin({
  name: 'vapor',
  activatesOn: ['vapor'],
  discover: (ctx) =>
    scan(ctx, /\.swift$/, (text, file) => {
      const out: Route[] = [];
      for (const m of text.matchAll(/\b(?:app|routes|router|\w+Group)\.(get|post|put|patch|delete)\(((?:\s*"[^"]*"\s*,?)+)/g)) {
        const parts = [...m[2]!.matchAll(/"([^"]*)"/g)].map((x) => x[1]!);
        out.push(apiRoute(join(...parts), METHOD(m[1]!), file, lineOf(text, m.index!), 'vapor'));
      }
      return out;
    }),
});
