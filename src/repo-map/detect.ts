import type { RepoContext, StackDetection, StackKind } from '../core/index.js';

interface StackRule {
  id: string;
  name: string;
  kind: StackKind;
  /** Any of these dependency names. */
  deps?: string[];
  /** Any file whose relative path matches. */
  files?: RegExp[];
}

/**
 * Generic stack detection. Adding a stack is one entry here; plugins add route discovery
 * and checks on top for the stacks that need it.
 */
const STACK_RULES: StackRule[] = [
  // Frameworks
  { id: 'nextjs', name: 'Next.js', kind: 'framework', deps: ['next'], files: [/(^|\/)next\.config\.(js|mjs|ts|cjs)$/] },
  { id: 'remix', name: 'Remix / React Router', kind: 'framework', deps: ['@remix-run/react', '@react-router/dev'] },
  { id: 'nuxt', name: 'Nuxt', kind: 'framework', deps: ['nuxt'], files: [/(^|\/)nuxt\.config\.(js|ts|mjs)$/] },
  { id: 'sveltekit', name: 'SvelteKit', kind: 'framework', deps: ['@sveltejs/kit'], files: [/(^|\/)svelte\.config\.(js|ts)$/] },
  { id: 'astro', name: 'Astro', kind: 'framework', deps: ['astro'], files: [/(^|\/)astro\.config\.(mjs|ts|js)$/] },
  { id: 'angular', name: 'Angular', kind: 'framework', deps: ['@angular/core'], files: [/(^|\/)angular\.json$/] },
  { id: 'vite', name: 'Vite', kind: 'framework', deps: ['vite'], files: [/(^|\/)vite\.config\.(js|ts|mjs)$/] },
  { id: 'react', name: 'React', kind: 'framework', deps: ['react'] },
  { id: 'vue', name: 'Vue', kind: 'framework', deps: ['vue'] },
  { id: 'svelte', name: 'Svelte', kind: 'framework', deps: ['svelte'] },
  { id: 'solid', name: 'SolidJS', kind: 'framework', deps: ['solid-js'] },
  { id: 'qwik', name: 'Qwik', kind: 'framework', deps: ['@builder.io/qwik'] },
  { id: 'preact', name: 'Preact', kind: 'framework', deps: ['preact'] },
  { id: 'gatsby', name: 'Gatsby', kind: 'framework', deps: ['gatsby'] },
  { id: 'ember', name: 'Ember', kind: 'framework', deps: ['ember-source'] },
  { id: 'htmx', name: 'htmx', kind: 'framework', deps: ['htmx.org'] },
  { id: 'blazor', name: 'Blazor', kind: 'framework', deps: ['microsoft.aspnetcore.components.webassembly'], files: [/\.razor$/] },
  { id: 'static-html', name: 'Static HTML', kind: 'framework', files: [/^(public\/|src\/|docs\/)?index\.html$/] },
  // Backends
  { id: 'express', name: 'Express', kind: 'backend', deps: ['express'] },
  { id: 'nestjs', name: 'NestJS', kind: 'backend', deps: ['@nestjs/core'] },
  { id: 'fastify', name: 'Fastify', kind: 'backend', deps: ['fastify'] },
  { id: 'hono', name: 'Hono', kind: 'backend', deps: ['hono'] },
  { id: 'fastapi', name: 'FastAPI', kind: 'backend', deps: ['fastapi'] },
  { id: 'flask', name: 'Flask', kind: 'backend', deps: ['flask'] },
  { id: 'django', name: 'Django', kind: 'backend', deps: ['django'], files: [/(^|\/)manage\.py$/] },
  { id: 'rails', name: 'Ruby on Rails', kind: 'backend', deps: ['rails'], files: [/(^|\/)config\/routes\.rb$/] },
  { id: 'laravel', name: 'Laravel', kind: 'backend', deps: ['laravel/framework'], files: [/(^|\/)artisan$/] },
  { id: 'python-asgi', name: 'Starlette / Sanic / Litestar / Quart', kind: 'backend', deps: ['starlette', 'sanic', 'litestar', 'quart', 'aiohttp'] },
  { id: 'koa', name: 'Koa', kind: 'backend', deps: ['koa', '@koa/router', 'koa-router'] },
  { id: 'elysia', name: 'Elysia', kind: 'backend', deps: ['elysia'] },
  { id: 'trpc', name: 'tRPC', kind: 'backend', deps: ['@trpc/server'] },
  { id: 'sinatra', name: 'Sinatra', kind: 'backend', deps: ['sinatra'] },
  { id: 'symfony', name: 'Symfony', kind: 'backend', deps: ['symfony/framework-bundle', 'symfony/routing'] },
  { id: 'slim', name: 'Slim', kind: 'backend', deps: ['slim/slim'] },
  { id: 'go-nethttp', name: 'Go net/http', kind: 'backend', files: [/(^|\/)go\.mod$/] },
  { id: 'gin', name: 'Gin', kind: 'backend', deps: ['github.com/gin-gonic/gin'] },
  { id: 'echo', name: 'Echo', kind: 'backend', deps: ['github.com/labstack/echo/v4', 'github.com/labstack/echo'] },
  { id: 'fiber', name: 'Fiber', kind: 'backend', deps: ['github.com/gofiber/fiber/v2', 'github.com/gofiber/fiber/v3'] },
  { id: 'chi', name: 'chi', kind: 'backend', deps: ['github.com/go-chi/chi/v5', 'github.com/go-chi/chi'] },
  { id: 'gorilla', name: 'Gorilla mux', kind: 'backend', deps: ['github.com/gorilla/mux'] },
  { id: 'axum', name: 'Axum', kind: 'backend', deps: ['axum'] },
  { id: 'actix', name: 'Actix Web', kind: 'backend', deps: ['actix-web'] },
  { id: 'rocket', name: 'Rocket', kind: 'backend', deps: ['rocket'] },
  { id: 'spring', name: 'Spring Boot', kind: 'backend', deps: ['spring-boot-starter-web', 'spring-boot-starter-webflux', 'spring-boot-starter'] },
  { id: 'jaxrs', name: 'JAX-RS / Quarkus / Micronaut', kind: 'backend', deps: ['quarkus-resteasy', 'quarkus-rest', 'jakarta.ws.rs-api', 'jersey-server', 'micronaut-http-server-netty'] },
  { id: 'ktor', name: 'Ktor', kind: 'backend', deps: ['ktor-server-core', 'ktor-server-netty', 'ktor-server-core-jvm'] },
  { id: 'aspnet', name: 'ASP.NET Core', kind: 'backend', files: [/(^|\/)Program\.cs$/, /(^|\/)Startup\.cs$/] },
  { id: 'phoenix', name: 'Phoenix', kind: 'backend', deps: ['phoenix'] },
  { id: 'vapor', name: 'Vapor', kind: 'backend', deps: ['vapor'] },
  // Data
  { id: 'supabase', name: 'Supabase', kind: 'database', deps: ['@supabase/supabase-js', '@supabase/ssr', 'supabase'], files: [/(^|\/)supabase\/config\.toml$/] },
  { id: 'firebase', name: 'Firebase', kind: 'database', deps: ['firebase', 'firebase-admin', '@react-native-firebase/app', 'firebase_admin'], files: [/(^|\/)firebase\.json$/, /(^|\/)firestore\.rules$/] },
  { id: 'prisma', name: 'Prisma', kind: 'database', deps: ['prisma', '@prisma/client'], files: [/(^|\/)schema\.prisma$/] },
  { id: 'drizzle', name: 'Drizzle ORM', kind: 'database', deps: ['drizzle-orm'] },
  { id: 'mongodb', name: 'MongoDB', kind: 'database', deps: ['mongodb', 'mongoose', 'pymongo', 'motor', 'go.mongodb.org/mongo-driver', 'mongodb.driver'] },
  { id: 'postgres', name: 'Postgres', kind: 'database', deps: ['pg', 'postgres', '@neondatabase/serverless', 'psycopg2', 'psycopg2-binary', 'psycopg', '@vercel/postgres', 'github.com/jackc/pgx/v5', 'github.com/lib/pq', 'postgresql', 'npgsql', 'postgrex'] },
  { id: 'mysql', name: 'MySQL', kind: 'database', deps: ['mysql', 'mysql2', 'pymysql', 'mysqlclient', 'github.com/go-sql-driver/mysql', 'mysql-connector-j'] },
  { id: 'sqlite', name: 'SQLite', kind: 'database', deps: ['better-sqlite3', 'sqlite3', 'rusqlite', 'github.com/mattn/go-sqlite3'] },
  { id: 'sqlalchemy', name: 'SQLAlchemy', kind: 'database', deps: ['sqlalchemy', 'sqlmodel'] },
  { id: 'gorm', name: 'GORM', kind: 'database', deps: ['gorm.io/gorm'] },
  { id: 'diesel', name: 'Diesel / SeaORM / SQLx', kind: 'database', deps: ['diesel', 'sea-orm', 'sqlx'] },
  { id: 'efcore', name: 'Entity Framework Core', kind: 'database', deps: ['microsoft.entityframeworkcore'] },
  { id: 'jpa', name: 'JPA / Hibernate', kind: 'database', deps: ['spring-boot-starter-data-jpa', 'hibernate-core'] },
  { id: 'ecto', name: 'Ecto', kind: 'database', deps: ['ecto', 'ecto_sql'] },
  { id: 'redis', name: 'Redis', kind: 'database', deps: ['redis', 'ioredis', 'github.com/redis/go-redis/v9'] },
  { id: 'convex', name: 'Convex', kind: 'database', deps: ['convex'] },
  // Auth
  { id: 'nextauth', name: 'NextAuth / Auth.js', kind: 'auth', deps: ['next-auth', '@auth/core'] },
  { id: 'clerk', name: 'Clerk', kind: 'auth', deps: ['@clerk/nextjs', '@clerk/clerk-react', '@clerk/clerk-expo', '@clerk/express'] },
  { id: 'auth0', name: 'Auth0', kind: 'auth', deps: ['@auth0/nextjs-auth0', '@auth0/auth0-react', 'auth0'] },
  { id: 'better-auth', name: 'Better Auth', kind: 'auth', deps: ['better-auth'] },
  { id: 'lucia', name: 'Lucia', kind: 'auth', deps: ['lucia'] },
  { id: 'passport', name: 'Passport', kind: 'auth', deps: ['passport'] },
  { id: 'devise', name: 'Devise', kind: 'auth', deps: ['devise'] },
  // Payments
  { id: 'stripe', name: 'Stripe', kind: 'payments', deps: ['stripe', '@stripe/stripe-js', '@stripe/react-stripe-js', '@stripe/stripe-react-native'] },
  { id: 'revenuecat', name: 'RevenueCat', kind: 'payments', deps: ['react-native-purchases', '@revenuecat/purchases-js', 'react-native-purchases-ui'] },
  { id: 'lemonsqueezy', name: 'Lemon Squeezy', kind: 'payments', deps: ['@lemonsqueezy/lemonsqueezy.js'] },
  { id: 'paddle', name: 'Paddle', kind: 'payments', deps: ['@paddle/paddle-js', '@paddle/paddle-node-sdk'] },
  // Mobile
  { id: 'expo', name: 'Expo', kind: 'mobile', deps: ['expo'], files: [/(^|\/)app\.json$/, /(^|\/)eas\.json$/] },
  { id: 'react-native', name: 'React Native', kind: 'mobile', deps: ['react-native'] },
  { id: 'capacitor', name: 'Capacitor', kind: 'mobile', deps: ['@capacitor/core'] },
  { id: 'flutter', name: 'Flutter', kind: 'mobile', deps: ['flutter'] },
  { id: 'ios', name: 'iOS (Swift)', kind: 'mobile', files: [/\.xcodeproj\//, /(^|\/)Info\.plist$/] },
  { id: 'android', name: 'Android', kind: 'mobile', files: [/(^|\/)AndroidManifest\.xml$/] },
  { id: 'ionic', name: 'Ionic', kind: 'mobile', deps: ['@ionic/core', '@ionic/react', '@ionic/angular', '@ionic/vue'] },
  { id: 'electron', name: 'Electron', kind: 'mobile', deps: ['electron'] },
  { id: 'tauri', name: 'Tauri', kind: 'mobile', deps: ['@tauri-apps/api', 'tauri'] },
  // AI
  { id: 'openai', name: 'OpenAI', kind: 'ai', deps: ['openai', '@ai-sdk/openai'] },
  { id: 'anthropic', name: 'Anthropic', kind: 'ai', deps: ['@anthropic-ai/sdk', 'anthropic', '@ai-sdk/anthropic'] },
  { id: 'gemini', name: 'Google Gemini', kind: 'ai', deps: ['@google/generative-ai', '@google/genai', 'google-generativeai'] },
  { id: 'vercel-ai', name: 'Vercel AI SDK', kind: 'ai', deps: ['ai'] },
  // Hosting
  { id: 'vercel', name: 'Vercel', kind: 'hosting', files: [/(^|\/)vercel\.json$/] },
  { id: 'netlify', name: 'Netlify', kind: 'hosting', files: [/(^|\/)netlify\.toml$/] },
  { id: 'railway', name: 'Railway', kind: 'hosting', files: [/(^|\/)railway\.(json|toml)$/] },
  { id: 'fly', name: 'Fly.io', kind: 'hosting', files: [/(^|\/)fly\.toml$/] },
  { id: 'render', name: 'Render', kind: 'hosting', files: [/(^|\/)render\.yaml$/] },
  { id: 'docker', name: 'Docker', kind: 'hosting', files: [/(^|\/)Dockerfile$/, /(^|\/)docker-compose\.ya?ml$/] },
  // AI builders (how it was made)
  { id: 'lovable', name: 'Lovable', kind: 'builder', deps: ['lovable-tagger'] },
  { id: 'bolt', name: 'Bolt', kind: 'builder', files: [/^\.bolt\//] },
  { id: 'replit', name: 'Replit', kind: 'builder', files: [/^\.replit$/, /^replit\.nix$/] },
  { id: 'cursor', name: 'Cursor', kind: 'builder', files: [/^\.cursorrules$/, /^\.cursor\//] },
  { id: 'windsurf', name: 'Windsurf', kind: 'builder', files: [/^\.windsurfrules$/, /^\.windsurf\//] },
  { id: 'claude-code', name: 'Claude Code', kind: 'builder', files: [/^CLAUDE\.md$/, /^\.claude\//] },
  { id: 'v0', name: 'v0', kind: 'builder', files: [/^\.v0\//] },
  // Languages
  { id: 'typescript', name: 'TypeScript', kind: 'language', deps: ['typescript'], files: [/(^|\/)tsconfig\.json$/] },
  { id: 'javascript', name: 'JavaScript', kind: 'language', files: [/(^|\/)package\.json$/] },
  { id: 'python', name: 'Python', kind: 'language', files: [/\.py$/] },
  { id: 'ruby', name: 'Ruby', kind: 'language', files: [/(^|\/)Gemfile$/] },
  { id: 'go', name: 'Go', kind: 'language', files: [/(^|\/)go\.mod$/] },
  { id: 'rust', name: 'Rust', kind: 'language', files: [/(^|\/)Cargo\.toml$/] },
  { id: 'java', name: 'Java', kind: 'language', files: [/\.java$/] },
  { id: 'kotlin', name: 'Kotlin', kind: 'language', files: [/\.kt$/] },
  { id: 'csharp', name: 'C#', kind: 'language', files: [/\.cs$/] },
  { id: 'php', name: 'PHP', kind: 'language', files: [/(^|\/)composer\.json$/, /\.php$/] },
  { id: 'elixir', name: 'Elixir', kind: 'language', files: [/(^|\/)mix\.exs$/] },
  { id: 'dart', name: 'Dart', kind: 'language', files: [/(^|\/)pubspec\.yaml$/] },
  { id: 'swift', name: 'Swift', kind: 'language', files: [/\.swift$/] },
  { id: 'scala', name: 'Scala', kind: 'language', files: [/(^|\/)build\.sbt$/] },
];

export function detectStack(ctx: RepoContext, rules: StackRule[] = STACK_RULES): StackDetection[] {
  const out: StackDetection[] = [];
  for (const rule of rules) {
    const evidence: string[] = [];
    for (const d of rule.deps ?? []) if (ctx.deps.has(d)) evidence.push(`dependency "${d}"`);
    for (const re of rule.files ?? []) {
      const hit = ctx.files.find((f) => re.test(f));
      if (hit) evidence.push(`file ${hit}`);
    }
    if (evidence.length === 0) continue;
    const viaDep = evidence.some((e) => e.startsWith('dependency'));
    out.push({
      id: rule.id,
      name: rule.name,
      kind: rule.kind,
      confidence: viaDep && evidence.length > 1 ? 'high' : viaDep || rule.kind === 'builder' || rule.kind === 'hosting' ? 'medium' : 'low',
      evidence,
    });
  }
  return out;
}
