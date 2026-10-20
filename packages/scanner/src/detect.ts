import type { RepoContext, StackDetection, StackKind } from '@tea-qa/core';

export interface StackRule {
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
export const STACK_RULES: StackRule[] = [
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
  // Backends
  { id: 'express', name: 'Express', kind: 'backend', deps: ['express'] },
  { id: 'nestjs', name: 'NestJS', kind: 'backend', deps: ['@nestjs/core'] },
  { id: 'fastify', name: 'Fastify', kind: 'backend', deps: ['fastify'] },
  { id: 'hono', name: 'Hono', kind: 'backend', deps: ['hono'] },
  { id: 'fastapi', name: 'FastAPI', kind: 'backend', deps: ['fastapi'] },
  { id: 'flask', name: 'Flask', kind: 'backend', deps: ['flask'] },
  { id: 'django', name: 'Django', kind: 'backend', deps: ['django'], files: [/(^|\/)manage\.py$/] },
  { id: 'rails', name: 'Ruby on Rails', kind: 'backend', deps: ['rails'], files: [/(^|\/)config\/routes\.rb$/] },
  { id: 'laravel', name: 'Laravel', kind: 'backend', files: [/(^|\/)artisan$/] },
  // Data
  { id: 'supabase', name: 'Supabase', kind: 'database', deps: ['@supabase/supabase-js', '@supabase/ssr', 'supabase'], files: [/(^|\/)supabase\/config\.toml$/] },
  { id: 'firebase', name: 'Firebase', kind: 'database', deps: ['firebase', 'firebase-admin', '@react-native-firebase/app', 'firebase_admin'], files: [/(^|\/)firebase\.json$/, /(^|\/)firestore\.rules$/] },
  { id: 'prisma', name: 'Prisma', kind: 'database', deps: ['prisma', '@prisma/client'], files: [/(^|\/)schema\.prisma$/] },
  { id: 'drizzle', name: 'Drizzle ORM', kind: 'database', deps: ['drizzle-orm'] },
  { id: 'mongodb', name: 'MongoDB', kind: 'database', deps: ['mongodb', 'mongoose', 'pymongo'] },
  { id: 'postgres', name: 'Postgres', kind: 'database', deps: ['pg', 'postgres', '@neondatabase/serverless', 'psycopg2', 'psycopg2-binary', 'psycopg', '@vercel/postgres'] },
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
  { id: 'flutter', name: 'Flutter', kind: 'mobile', files: [/(^|\/)pubspec\.yaml$/] },
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
  { id: 'python', name: 'Python', kind: 'language', files: [/\.py$/] },
  { id: 'ruby', name: 'Ruby', kind: 'language', files: [/(^|\/)Gemfile$/] },
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
