import { describe, expect, it } from 'vitest';
import { useTempDirs } from '../__tests__/temp.js';
import { scanRepo } from './index.js';

const repo = useTempDirs('scan');

const pkg = (deps: Record<string, string>) => JSON.stringify({ name: 'x', dependencies: deps });
const paths = (r: { routes: { path: string; kind: string }[] }, kind: string) =>
  r.routes.filter((x) => x.kind === kind).map((x) => x.path);

describe('scanRepo', () => {
  it('maps a Next.js app (app + pages router) with Supabase, Stripe and env vars', async () => {
    const root = await repo({
      'package.json': pkg({ next: '15', react: '19', '@supabase/supabase-js': '2', stripe: '17' }),
      'next.config.mjs': 'export default {}',
      'app/page.tsx': 'export default function P(){ return <a href="/pricing">x</a> }',
      'app/(marketing)/pricing/page.tsx': 'export default function P(){}',
      'app/blog/[slug]/page.tsx': 'export default function P(){}',
      'app/_components/x/page.tsx': 'not a route',
      'app/api/checkout/route.ts': 'export async function POST(){} export const GET = () => {}',
      'pages/api/legacy.ts': 'export default (req,res) => { if (req.method === "DELETE") {} }',
      'pages/about.tsx': 'export default function A(){}',
      'lib/supabase.ts': 'const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); s.from("invoices"); s.auth.signInWithOAuth()',
      'components/Signup.tsx': '<form action="/api/signup" method="post"><input name="email" type="email" required/><input name="password" type="password"/></form>',
      '.env.local': 'SECRET=should-never-be-read',
      '.env.example': 'STRIPE_SECRET_KEY=\nNEXT_PUBLIC_APP_URL=',
      'app/settings/page.tsx': 'fetch("/api/profile", { method: "PATCH" })',
    });
    const r = await scanRepo(root);
    expect(r.stack.map((s) => s.id)).toEqual(expect.arrayContaining(['nextjs', 'react', 'supabase', 'stripe']));
    expect(paths(r, 'page')).toEqual(expect.arrayContaining(['/', '/pricing', '/blog/[slug]', '/about', '/settings']));
    expect(paths(r, 'page')).not.toContain('/_components/x');
    const checkout = r.routes.find((x) => x.path === '/api/checkout')!;
    expect(checkout.methods).toEqual(['GET', 'POST']);
    expect(r.routes.find((x) => x.path === '/api/legacy')!.methods).toEqual(['DELETE']);
    expect(paths(r, 'api')).toContain('/api/profile');
    expect(r.routes.find((x) => x.path === '/blog/[slug]')!.dynamic).toBe(true);

    const env = Object.fromEntries(r.envVars.map((e) => [e.name, e.clientExposed]));
    expect(env).toMatchObject({ NEXT_PUBLIC_SUPABASE_URL: true, SUPABASE_SERVICE_ROLE_KEY: false, STRIPE_SECRET_KEY: false, NEXT_PUBLIC_APP_URL: true });
    expect(r.envFiles).toEqual(['.env.example', '.env.local']);
    expect(JSON.stringify(r)).not.toContain('should-never-be-read');

    expect(r.forms[0]!.fields.map((f) => f.name)).toEqual(['email', 'password']);
    expect(r.forms[0]!.fields[0]!.required).toBe(true);
    expect(r.database[0]!.models).toContain('invoices');
    expect(r.auth).toContain('Supabase Auth');
    expect(r.payments).toContain('Stripe');
    expect(r.notes.join(' ')).toMatch(/no webhook signature verification/);
    expect(r.activePlugins).toEqual(expect.arrayContaining(['nextjs', 'supabase', 'payments']));
    expect(r.activePlugins).not.toContain('spa-router');
  });

  it('maps a Lovable-style Vite + React Router SPA with Firebase', async () => {
    const root = await repo({
      'package.json': pkg({ vite: '5', react: '18', 'react-router-dom': '6', firebase: '10', 'lovable-tagger': '1' }),
      'src/App.tsx': `import { Routes, Route } from 'react-router-dom';
        <Routes><Route path="/" element={<Home/>}/><Route path="/dashboard" element={<D/>}/><Route path="/invoices/:id" element={<I/>}/><Route path="*" element={<NotFound/>}/></Routes>`,
      'src/auth.ts': 'import { GoogleAuthProvider, signInWithPopup } from "firebase/auth"; collection(db, "invoices")',
      'firestore.rules': 'rules_version = "2";',
    });
    const r = await scanRepo(root);
    expect(r.stack.map((s) => s.id)).toEqual(expect.arrayContaining(['vite', 'react', 'firebase', 'lovable']));
    expect(paths(r, 'page')).toEqual(['/', '/dashboard', '/invoices/:id']);
    expect(r.auth.join()).toContain('Firebase Auth (Google)');
    expect(r.notes.join(' ')).toMatch(/Authorized domains/);
    expect(r.database[0]).toMatchObject({ kind: 'firestore', models: ['invoices'] });
  });

  it('maps Express, FastAPI, Django and Rails routes', async () => {
    const root = await repo({
      'package.json': pkg({ express: '4' }),
      'server/index.js': "const app = express(); app.get('/api/users/:id', h); router.post('/api/login', h);",
      'requirements.txt': 'fastapi==0.110\ndjango>=5\n# comment',
      'api/main.py': 'router = APIRouter(prefix="/v1")\n@router.get("/items/{item_id}")\ndef f(): pass\n@app.post("/webhook")\ndef g(): pass',
      'web/urls.py': "urlpatterns = [path('accounts/', include('accounts.urls')), path('posts/<int:pk>/', v)]",
      'Gemfile': "gem 'rails', '~> 7'",
      'config/routes.rb': "Rails.application.routes.draw do\n  root 'home#index'\n  resources :invoices\n  post '/billing/webhook', to: 'billing#hook'\nend",
    });
    const r = await scanRepo(root);
    const api = paths(r, 'api');
    expect(api).toEqual(expect.arrayContaining(['/api/users/:id', '/api/login', '/v1/items/{item_id}', '/webhook', '/billing/webhook']));
    expect(r.routes.find((x) => x.path === '/api/users/:id')).toMatchObject({ file: 'server/index.js', line: 1, methods: ['GET'] });
    expect(paths(r, 'page')).toEqual(expect.arrayContaining(['/posts/<int:pk>', '/invoices', '/invoices/:id/edit', '/']));
    expect(paths(r, 'page')).not.toContain('/accounts');
    expect(r.stack.map((s) => s.id)).toEqual(expect.arrayContaining(['express', 'fastapi', 'django', 'rails', 'python', 'ruby']));
  });

  it('falls back to link literals for an unknown stack', async () => {
    const root = await repo({
      'index.html': '<a href="/pricing">Pricing</a><a href="/logo.png">x</a><form><input name="q"></form>',
      'js/app.js': 'window.location = "/x"; router.push("/login")',
      '.replit': 'run = "npm start"',
    });
    const r = await scanRepo(root);
    expect(paths(r, 'page')).toEqual(['/login', '/pricing']);
    expect(r.stack.map((s) => s.id)).toContain('replit');
    expect(r.auth.join()).toContain('/login');
  });

  it('runs third-party plugins', async () => {
    const root = await repo({ 'package.json': pkg({}), 'custom.flag': '' });
    const r = await scanRepo(root, {
      plugins: [
        {
          name: 'my-plugin',
          detect: (ctx) => (ctx.has('custom.flag') ? { id: 'custom', name: 'Custom', kind: 'framework', confidence: 'high', evidence: ['custom.flag'] } : null),
          discover: async () => ({ notes: ['hello from plugin'] }),
        },
      ],
    });
    expect(r.activePlugins).toContain('my-plugin');
    expect(r.stack.map((s) => s.id)).toContain('custom');
    expect(r.notes).toContain('hello from plugin');
  });
});
