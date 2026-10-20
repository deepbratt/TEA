import { definePlugin, type DatabaseInfo } from '@tea-qa/core';
import { isSource } from '../context.js';

const uniq = (xs: string[]) => [...new Set(xs)].sort();

export const prisma = definePlugin({
  name: 'prisma',
  activatesOn: ['prisma'],
  async discover(ctx) {
    const database: DatabaseInfo[] = [];
    for (const file of ctx.find((f) => f.endsWith('schema.prisma') || /(^|\/)prisma\/schema\/.*\.prisma$/.test(f))) {
      const text = await ctx.read(file);
      const provider = /provider\s*=\s*"(postgresql|mysql|sqlite|mongodb|sqlserver|cockroachdb)"/.exec(text)?.[1] ?? 'sql';
      database.push({ kind: `prisma (${provider})`, models: uniq([...text.matchAll(/^\s*model\s+(\w+)\s*\{/gm)].map((m) => m[1]!)), file });
    }
    return { database };
  },
});

export const supabase = definePlugin({
  name: 'supabase',
  activatesOn: ['supabase'],
  async discover(ctx) {
    const tables: string[] = [];
    let rlsStatements = 0;
    const migrations = ctx.find((f) => /(^|\/)supabase\/migrations\/.*\.sql$/.test(f));
    for (const f of migrations) {
      const text = await ctx.read(f);
      for (const m of text.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?(\w+)"?/gi)) tables.push(m[1]!);
      rlsStatements += [...text.matchAll(/enable\s+row\s+level\s+security/gi)].length;
    }
    const fromCalls: string[] = [];
    let usesAuth = false;
    for (const f of ctx.find(isSource)) {
      const text = await ctx.read(f);
      if (!/supabase/i.test(text)) continue;
      for (const m of text.matchAll(/\.from\(\s*["'`](\w+)["'`]\s*\)/g)) fromCalls.push(m[1]!);
      if (/\.auth\.(signIn|signUp|getUser|getSession|signInWithOAuth|signInWithOtp)/.test(text)) usesAuth = true;
    }
    const models = uniq([...tables, ...fromCalls]);
    const notes = [];
    if (migrations.length) notes.push(`Supabase: ${migrations.length} migration file(s), ${rlsStatements} "enable row level security" statement(s) for ${uniq(tables).length} table(s).`);
    else if (models.length) notes.push('Supabase: no migrations in repo, so RLS policies can only be checked against the live project.');
    return {
      database: models.length || migrations.length ? [{ kind: 'supabase (postgres)', models }] : [],
      auth: usesAuth ? ['Supabase Auth'] : [],
      notes,
    };
  },
});

export const firebase = definePlugin({
  name: 'firebase',
  activatesOn: ['firebase'],
  async discover(ctx) {
    const collections: string[] = [];
    const providers = new Set<string>();
    for (const f of ctx.find(isSource)) {
      const text = await ctx.read(f);
      if (!/firebase|firestore/i.test(text)) continue;
      for (const m of text.matchAll(/collection\(\s*\w+\s*,\s*["'`](\w+)["'`]/g)) collections.push(m[1]!);
      for (const m of text.matchAll(/\.collection\(\s*["'`](\w+)["'`]/g)) collections.push(m[1]!);
      if (/GoogleAuthProvider|signInWithPopup|signInWithRedirect|GoogleSignin/.test(text)) providers.add('Google');
      if (/AppleAuthProvider|OAuthProvider\(\s*["']apple\.com/.test(text)) providers.add('Apple');
      if (/signInWithEmailAndPassword|createUserWithEmailAndPassword/.test(text)) providers.add('email/password');
    }
    const rules = ctx.find((f) => /(^|\/)(firestore|database|storage)\.rules(\.json)?$/.test(f));
    const notes = rules.length
      ? [`Firebase security rules in repo: ${rules.join(', ')}.`]
      : ['Firebase: no security rules file in repo, so rules can only be checked against the live project.'];
    if (providers.has('Google')) {
      notes.push('Firebase Google sign-in is used: the live domain must be in Firebase Auth "Authorized domains" or sign-in fails outside localhost.');
    }
    return {
      database: collections.length || rules.length ? [{ kind: 'firestore', models: uniq(collections) }] : [],
      auth: providers.size ? [`Firebase Auth (${[...providers].join(', ')})`] : [],
      notes,
    };
  },
});

/** Generic SQL / ORM schema sources that aren't tied to one backend-as-a-service. */
export const schemas = definePlugin({
  name: 'schemas',
  activatesOn: 'always',
  async discover(ctx) {
    const database: DatabaseInfo[] = [];
    const sql = ctx.find((f) => f.endsWith('.sql') && !f.includes('supabase/migrations/'));
    const sqlTables: string[] = [];
    for (const f of sql) {
      for (const m of (await ctx.read(f)).matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:\w+\.)?["`]?(\w+)["`]?/gi)) sqlTables.push(m[1]!);
    }
    if (sqlTables.length) database.push({ kind: 'sql migrations', models: uniq(sqlTables) });
    const djangoModels: string[] = [];
    for (const f of ctx.find((f) => /(^|\/)models(\.py|\/[^/]+\.py)$/.test(f))) {
      for (const m of (await ctx.read(f)).matchAll(/^class\s+(\w+)\(.*models\.Model.*\)/gm)) djangoModels.push(m[1]!);
    }
    if (djangoModels.length) database.push({ kind: 'django orm', models: uniq(djangoModels) });
    for (const f of ctx.find((f) => /(^|\/)db\/schema\.rb$/.test(f))) {
      const models = [...(await ctx.read(f)).matchAll(/create_table\s+"(\w+)"/g)].map((m) => m[1]!);
      if (models.length) database.push({ kind: 'rails activerecord', models: uniq(models), file: f });
    }
    const mongoose: string[] = [];
    const drizzle: string[] = [];
    for (const f of ctx.find((f) => isSource(f) && /\.(m?[jt]s)$/.test(f))) {
      const text = await ctx.read(f);
      for (const m of text.matchAll(/mongoose\.model\(\s*["'`](\w+)["'`]/g)) mongoose.push(m[1]!);
      for (const m of text.matchAll(/\b(?:pgTable|sqliteTable|mysqlTable)\(\s*["'`](\w+)["'`]/g)) drizzle.push(m[1]!);
    }
    if (mongoose.length) database.push({ kind: 'mongoose', models: uniq(mongoose) });
    if (drizzle.length) database.push({ kind: 'drizzle', models: uniq(drizzle) });
    return { database };
  },
});

export const payments = definePlugin({
  name: 'payments',
  activatesOn: ['stripe', 'revenuecat', 'lemonsqueezy', 'paddle'],
  async discover(ctx) {
    const found: string[] = [];
    const notes: string[] = [];
    for (const f of ctx.find(isSource)) {
      const text = await ctx.read(f);
      if (/stripe\.webhooks\.constructEvent|constructEventAsync/.test(text)) found.push(`Stripe webhook signature verification (${f})`);
      if (/checkout\.sessions\.create|redirectToCheckout/.test(text)) found.push(`Stripe Checkout (${f})`);
      if (/Purchases\.(configure|getOfferings|purchasePackage)/.test(text)) found.push(`RevenueCat purchases (${f})`);
      if (/billingPortal\.sessions\.create/.test(text)) found.push(`Stripe customer portal (${f})`);
    }
    if (ctx.deps.has('stripe') && !found.some((p) => p.startsWith('Stripe webhook'))) {
      notes.push('Stripe is a dependency but no webhook signature verification (constructEvent) was found.');
    }
    return { payments: uniq(found), notes };
  },
});
