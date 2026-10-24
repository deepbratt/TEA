import { normalisePath, type Discovery, type Route } from '../core/index.js';
import type { WiringSides } from '../repo-map/index.js';
import { matchClaim, type MatchContext } from './claims.js';
import type { CodeIndex } from './code.js';
import { parseClaims } from './docs.js';
import type { Claim, Feature } from './types.js';
import { singular, slugify, titleCase, words } from './words.js';

/**
 * Step 1 of feature QA: list every feature before testing any of them. A feature is a part of the
 * app a person would name: "Sign up", "Checkout", "Order history". TEA builds them from the code
 * (pages, the API routes and calls behind them, forms, data models, services) and adds what the
 * docs claim, so "the docs say it's built but it isn't" shows up as its own feature.
 */

const ALIASES: Record<string, string> = {
  signin: 'login', 'sign-in': 'login', 'log-in': 'login', logon: 'login',
  register: 'signup', registration: 'signup', 'sign-up': 'signup', join: 'signup', 'create-account': 'signup',
  signout: 'logout', 'sign-out': 'logout', 'log-out': 'logout',
  'forgot-password': 'password-reset', 'reset-password': 'password-reset', 'password-reset': 'password-reset', 'forgot': 'password-reset',
  me: 'account', profile: 'account', settings: 'account',
  plans: 'pricing', plan: 'pricing', subscribe: 'pricing', subscription: 'pricing',
};

const NAMES: Record<string, string> = {
  home: 'Home page', login: 'Log in', signup: 'Sign up', logout: 'Log out', 'password-reset': 'Password reset',
  account: 'Account', checkout: 'Checkout', cart: 'Cart', pricing: 'Pricing and plans', dashboard: 'Dashboard',
  admin: 'Admin', ai: 'AI features', api: 'API', search: 'Search',
};

/** Path segments that never name a feature on their own. */
const SKIP_SEGMENT = /^(api|v\d+|rest|graphql|trpc|_next|static|public|internal|app|\(.*\)|@.*)$/i;
const PARAM_SEGMENT = /^(\[.*\]|:.+|\{.*\}|<.*>|\*+|\$.*)$/;

/** The feature a route belongs to, from its first meaningful path segment. */
export function featureKey(path: string): string {
  const segs = normalisePath(path).split('/').filter(Boolean);
  const seg = segs.find((s) => !SKIP_SEGMENT.test(s) && !PARAM_SEGMENT.test(s));
  if (!seg) return segs.length && segs[0]!.toLowerCase() === 'api' ? 'api' : 'home';
  const lower = seg.toLowerCase().replace(/_/g, '-');
  if (ALIASES[lower]) return ALIASES[lower];
  return lower.split('-').map(singular).join('-');
}

function featureName(key: string, path?: string): string {
  if (NAMES[key]) return NAMES[key];
  const seg = path ? normalisePath(path).split('/').filter(Boolean).find((s) => !SKIP_SEGMENT.test(s) && !PARAM_SEGMENT.test(s)) : undefined;
  return titleCase((seg ?? key).replace(/[-_]+/g, ' '));
}

const dirOf = (f: string) => (f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '');

export interface InventoryInput {
  discovery: Discovery;
  wiring?: WiringSides;
  index?: CodeIndex;
}

function emptyFeature(key: string, name: string, origin: Feature['origin']): Feature {
  return { key, name, origin, pages: [], endpoints: [], calls: [], forms: [], files: [], models: [], integrations: [], claims: [], checks: [], status: 'untested', findings: [] };
}

const push = (xs: string[], x: string | undefined) => {
  if (x && !xs.includes(x)) xs.push(x);
};

/** Which page feature owns a source file: the page's own folder (deepest wins), never shared folders. */
function ownerOf(file: string, pages: { key: string; route: Route }[]): string | undefined {
  let best: { key: string; depth: number } | undefined;
  for (const { key, route } of pages) {
    if (!route.file) continue;
    if (route.file === file) return key;
    const dir = dirOf(route.file);
    const siblings = pages.filter((p) => p.route.file && dirOf(p.route.file) === dir && p.key !== key).length;
    const isRoot = normalisePath(route.path) === '/';
    // Pages that share one folder (src/pages/Foo.tsx, src/pages/Bar.tsx) only own their own file.
    if (siblings > 0) continue;
    const inside = isRoot ? dirOf(file) === dir : file === dir || file.startsWith(`${dir}/`);
    if (inside && (!best || dir.length > best.depth)) best = { key, depth: dir.length };
  }
  return best?.key;
}

export function buildInventory(input: InventoryInput): Feature[] {
  const d = input.discovery;
  const byKey = new Map<string, Feature>();
  const get = (key: string, path?: string, suffix = '') => {
    let f = byKey.get(key);
    if (!f) byKey.set(key, (f = emptyFeature(key, featureName(key, path) + suffix, 'code')));
    return f;
  };

  // Pages first: they name the features people see.
  const pageRoutes = d.routes.filter((r) => r.kind === 'page' && r.plugin !== 'links');
  const pages = pageRoutes.map((route) => ({ key: featureKey(route.path), route }));
  for (const { key, route } of pages) {
    const f = get(key, route.path);
    push(f.pages, route.path);
    push(f.files, route.file);
  }

  // Calls and forms belong to the page whose folder they're in.
  for (const c of d.apiCalls) {
    const owner = ownerOf(c.file, pages);
    if (!owner) continue;
    const f = byKey.get(owner)!;
    push(f.calls, `${c.method} ${c.path}`);
    push(f.files, c.file);
  }
  for (const form of d.forms) {
    const file = form.location.replace(/:\d+$/, '');
    const owner = ownerOf(file, pages);
    if (owner) push(byKey.get(owner)!.forms, form.location);
  }

  // API routes: with the page of the same name, else with the one page that calls them, else their own.
  const apiRoutes = d.routes.filter((r) => r.kind === 'api' && r.plugin !== 'links');
  const apiGroups = new Map<string, Route[]>();
  for (const r of apiRoutes) apiGroups.set(featureKey(r.path), [...(apiGroups.get(featureKey(r.path)) ?? []), r]);
  for (const [key, routes] of apiGroups) {
    let target = byKey.get(key);
    if (!target) {
      const callers = new Set(
        [...byKey.values()].filter((f) => f.calls.some((c) => routes.some((r) => callServedBy(c, r)))).map((f) => f.key),
      );
      if (callers.size === 1) target = byKey.get([...callers][0]!);
    }
    target ??= get(key, routes[0]!.path, byKey.has(key) ? '' : ' (API)');
    for (const r of routes) {
      push(target.endpoints, `${r.methods?.length ? r.methods.join(',') : 'ANY'} ${r.path}`);
      push(target.files, r.file);
    }
  }

  // Data models by name: Order -> orders.
  for (const db of d.database) {
    for (const model of db.models) {
      const key = ALIASES[model.toLowerCase()] ?? singular(model.toLowerCase());
      const f = byKey.get(key);
      if (f) push(f.models, model);
    }
  }

  // Services: payments go with checkout or pricing, auth with sign-in.
  const attach = (names: string[], keys: string[], fallback: string) => {
    if (!names.length) return;
    const targets = keys.map((k) => byKey.get(k)).filter((f): f is Feature => !!f);
    if (!targets.length) targets.push(get(fallback));
    for (const t of targets) names.forEach((n) => push(t.integrations, n));
  };
  attach(d.payments, ['checkout', 'pricing', 'billing', 'cart'], 'payments');
  attach(d.stack.filter((s) => s.kind === 'auth').map((s) => s.name), ['login', 'signup'], 'login');

  const features = [...byKey.values()];
  if (input.index) addClaims(features, input);
  return features.sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
}

const order = (f: Feature) => (f.key === 'home' ? 0 : f.origin === 'docs' ? 2 : 1);

const sample = (p: string) => p.replace(/:param\b/g, 'tea-sample-id');
function callServedBy(call: string, r: Route): boolean {
  const path = call.slice(call.indexOf(' ') + 1);
  const re = new RegExp(`^${normalisePath(r.path).split('/').map((s) => (PARAM_SEGMENT.test(s) ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/')}/?$`, 'i');
  return re.test(sample(path));
}

/** Read the docs, check each claim, and give every claim a feature: an existing one, or its own. */
function addClaims(features: Feature[], input: InventoryInput): void {
  const index = input.index!;
  const d = input.discovery;
  const ctx: MatchContext = {
    routes: d.routes,
    calls: d.apiCalls,
    endpoints: input.wiring?.endpoints ?? d.routes,
    stack: d.stack,
    models: d.database.flatMap((x) => x.models),
    index,
  };
  for (const [file, text] of index.docs) {
    for (const raw of parseClaims(file, text)) {
      const claim = matchClaim(raw, ctx);
      const target = claimTarget(claim, features) ?? docsFeature(claim, features);
      target.claims.push(claim);
      if (target.origin === 'code') target.origin = 'both';
    }
  }
}

/** The code feature a claim is about: one whose route it names, or whose name it uses. */
function claimTarget(claim: Claim, features: Feature[]): Feature | undefined {
  const code = features.filter((f) => f.origin !== 'docs');
  for (const path of claim.found.filter((x) => /^(page|API) \//.test(x)).map((x) => x.slice(x.indexOf(' ') + 1))) {
    const f = code.find((x) => x.pages.includes(path) || x.endpoints.some((e) => e.endsWith(` ${path}`)));
    if (f) return f;
  }
  const ws = words(claim.text);
  let best: { f: Feature; at: number } | undefined;
  for (const f of code) {
    const keyWords = f.key.split('-');
    const at = ws.findIndex((w, i) => keyWords.every((k, j) => ws[i + j] === k));
    if (at >= 0 && (!best || at < best.at)) best = { f, at };
  }
  return best?.f;
}

/** A feature only the docs know about. Claims with the same key (CSV export in two docs) share it. */
function docsFeature(claim: Claim, features: Feature[]): Feature {
  const key = claim.missing[0]?.key.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() || slugify(claim.text);
  let f = features.find((x) => x.key === key && x.origin === 'docs');
  if (!f) {
    const head = claim.text
      .replace(/\([^)]*\)/g, '')
      .split(/[:.;]\s| - /)[0]!
      .replace(/\s+(at|on|in|from|via|under)\s+\/.*$/i, '')
      .replace(/[.,;:!\s]+$/, '')
      .trim();
    f = emptyFeature(key, titleCase(head.slice(0, 60)) || titleCase(key), 'docs');
    features.push(f);
  }
  return f;
}
