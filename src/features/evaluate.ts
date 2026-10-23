import { normalisePath, routePattern, type Finding, type PageVisit } from '../core/index.js';
import type { SandboxResult } from './sandbox.js';
import type { Feature, FeatureCheck, FeatureReport, FeatureStatus, FeatureSummary } from './types.js';

/**
 * Steps 2-4 of feature QA: each feature's test plan (Given / When / Then), filled in with what
 * happened. The plan comes from what the feature is made of: every page should load, every call
 * should reach a route that serves it, every form should work with good data and push back on bad
 * data, private APIs should refuse strangers, and what the docs claim should be in the code.
 */

export interface FeatureRunContext {
  /** The run's issues, after the rules were applied. */
  findings: Finding[];
  pages: PageVisit[];
  /** A live app was opened. */
  live: boolean;
  /** Frontend and backend code were both read, so calls could be checked against routes. */
  wiring: boolean;
  /** Sandbox results; undefined when sandbox tests were off. */
  sandbox?: SandboxResult;
  /** Feature keys the user hid ("not a feature"). */
  hidden?: string[];
  /** Docs TEA read. */
  docs?: string[];
}

const SERIOUS = new Set(['critical', 'high']);

/** The page a finding is about, from its id: "crawl.slow:/dashboard" -> "/dashboard". */
function findingPage(f: Finding): string | undefined {
  const loc = f.id.slice(f.id.indexOf(':') + 1);
  if (!loc.startsWith('/')) return undefined;
  return normalisePath(loc.split(':')[0]!.split('?')[0]!);
}

const pathOfCall = (call: string) => call.slice(call.indexOf(' ') + 1);
const onPage = (route: string, path: string) => normalisePath(route) === path || routePattern(route).test(path);

export function evaluateFeatures(features: Feature[], ctx: FeatureRunContext): FeatureReport {
  const hidden = new Set(ctx.hidden ?? []);
  const shown = features.filter((f) => !hidden.has(f.key));
  // Hidden features are still tested and kept in the report (so they can be shown again), but not counted.
  const real = ctx.findings.filter((f) => f.severity !== 'info');
  const byId = new Map(ctx.findings.map((f) => [f.id, f]));

  for (const feature of features) {
    const checks: FeatureCheck[] = [];
    const linked = new Set<string>();
    const link = (ids: string[]) => ids.forEach((id) => linked.add(id));

    // Every page loads.
    for (const p of feature.pages) {
      const check: FeatureCheck = { id: `page:${p}`, kind: 'live', given: "a visitor who isn't signed in", when: `they open ${p}`, then: 'the page loads without errors', result: 'skip' };
      checks.push(check);
      if (!ctx.live) {
        check.detail = "TEA didn't open the app: give it the app's URL, or let it start the app.";
        continue;
      }
      const visits = ctx.pages.filter((v) => onPage(p, normalisePath(v.path.split('?')[0]!)));
      if (!visits.length) {
        check.detail = feature.pages.length && /[[:{*]/.test(p) ? 'It needs a real id: TEA tests it when a page links to one.' : "TEA didn't reach this page (nothing links to it, or the page limit was hit).";
        continue;
      }
      const ids = real.filter((f) => f.source !== 'features' && f.source !== 'sandbox' && visits.some((v) => findingPage(f) === normalisePath(v.path.split('?')[0]!))).map((f) => f.id);
      const bad = visits.find((v) => v.error || (v.status ?? 200) >= 400);
      if (ids.length || bad) {
        check.result = 'fail';
        check.findings = ids;
        link(ids);
        check.detail = bad ? `It answered ${bad.status ?? bad.error}.` : ids.map((id) => byId.get(id)!.title).slice(0, 3).join('; ');
      } else {
        const v = visits[0]!;
        check.result = 'pass';
        check.detail = `Loaded (${v.status ?? 'ok'})${v.loadMs ? ` in ${(v.loadMs / 1000).toFixed(1)}s` : ''}.`;
      }
    }

    // Every call reaches a route that serves it, and works live.
    for (const call of feature.calls) {
      const path = pathOfCall(call);
      const check: FeatureCheck = { id: `call:${call}`, kind: 'static', when: `the feature calls ${call}`, then: 'a backend route serves it, and it works', result: 'skip' };
      checks.push(check);
      const orphan = byId.get(`wiring.orphan-call:${call}`);
      const liveFail = real.filter((f) => f.id.startsWith('crawl.api-failure:') && f.id.endsWith(`:${path}`));
      if (orphan) {
        check.result = 'fail';
        check.findings = [orphan.id];
        check.detail = orphan.title;
      } else if (liveFail.length) {
        check.result = 'fail';
        check.findings = liveFail.map((f) => f.id);
        check.detail = liveFail[0]!.title;
      } else if (ctx.wiring) {
        check.result = 'pass';
        check.detail = 'A route in your backend serves it.';
      } else {
        check.detail = 'TEA needs the backend code too to check this (add the API folder to the project).';
      }
      link(check.findings ?? []);
    }

    // Every API route it serves is used by something.
    for (const e of feature.endpoints) {
      const path = pathOfCall(e);
      const unused = byId.get(`wiring.unused-endpoint:${path}`);
      const check: FeatureCheck = { id: `endpoint:${path}`, kind: 'static', when: `the app runs`, then: `something uses ${path}`, result: 'skip' };
      if (unused) {
        check.result = 'fail';
        check.findings = [unused.id];
        check.detail = 'Nothing in the frontend calls it: dead code, or a feature that was never wired up.';
        link([unused.id]);
      } else if (ctx.wiring) {
        check.result = 'pass';
        check.detail = 'The frontend calls it (or it is meant to be called from outside, like a webhook).';
      } else {
        check.detail = 'TEA needs the frontend code too to check this.';
      }
      checks.push(check);
    }

    // Forms work with good data and push back on bad data (sandbox).
    const formTests = ctx.sandbox?.forms.filter((t) => feature.pages.some((p) => onPage(p, t.page))) ?? [];
    for (const t of formTests) {
      const valid = t.kind === 'valid';
      checks.push({
        id: `form:${t.page}:${t.action}:${t.kind}`,
        kind: 'sandbox',
        given: `the form on ${t.page} (${t.action})`,
        when: valid ? 'someone fills it in with valid test data and submits it' : 'they type an invalid email ("not-an-email")',
        then: valid ? 'it goes through without an error' : 'the form says so instead of accepting it',
        result: t.result,
        detail: t.detail,
        findings: t.findings,
      });
      link(t.findings);
    }
    if (!ctx.sandbox && (feature.forms.length || feature.calls.some((c) => !c.startsWith('GET ')))) {
      checks.push({
        id: 'form:sandbox-off',
        kind: 'sandbox',
        when: 'someone submits its forms with valid and invalid data',
        then: 'good data is saved and bad data is refused',
        result: 'skip',
        detail: 'Turn on sandbox tests to submit forms with test data (local apps only).',
      });
    }

    // Private APIs refuse strangers; the rest answer without a server error (sandbox).
    const apiTests = ctx.sandbox?.apis.filter((t) => feature.endpoints.some((e) => onPage(pathOfCall(e), t.path))) ?? [];
    for (const t of apiTests) {
      checks.push({
        id: `api:${t.path}`,
        kind: 'sandbox',
        given: "someone who isn't signed in",
        when: `they call GET ${t.path} directly`,
        then: t.private ? 'it refuses them (401 or 403) or shows no data' : 'it answers without a server error',
        result: t.result,
        detail: t.detail,
        findings: t.findings,
      });
      link(t.findings);
    }
    if (!ctx.sandbox && feature.endpoints.some((e) => /^(GET|ANY)/.test(e) && !/[[:{]/.test(pathOfCall(e)))) {
      checks.push({
        id: 'api:sandbox-off',
        kind: 'sandbox',
        given: "someone who isn't signed in",
        when: 'they call its API directly',
        then: 'private data is refused and nothing crashes',
        result: 'skip',
        detail: 'Turn on sandbox tests to call its API (local apps only).',
      });
    }

    // What the docs claim is in the code.
    for (const c of feature.claims) {
      const check: FeatureCheck = { id: `claim:${c.file}:${c.line}`, kind: 'docs', given: `${c.file} says: "${c.text}"`, when: 'TEA looks for it in the code', then: "it's there", result: 'skip' };
      if (c.status === 'planned') {
        check.then = 'nothing (the docs say it is planned)';
        check.detail = 'Not built yet, and the docs say so. That is fine.';
        check.findings = ctx.findings.filter((f) => f.id.startsWith('features.not-built-yet:') && f.evidence?.file === c.file && f.evidence.line === c.line).map((f) => f.id);
      } else if (c.missing.length) {
        check.result = 'fail';
        check.detail = c.missing.map((m) => `${m.label}: ${m.why}`).join('; ');
        check.findings = c.missing.map((m) => `features.claimed-missing:${m.key}`).filter((id) => byId.has(id));
      } else if (c.verified) {
        check.result = 'pass';
        check.detail = `Found ${c.found.slice(0, 4).join(', ')}.`;
      } else {
        check.detail = "TEA couldn't check this one from the code: test it by hand.";
      }
      link(check.findings ?? []);
      checks.push(check);
    }

    // Anything else wrong in its files.
    const files = new Set(feature.files);
    const other = real.filter((f) => !linked.has(f.id) && f.evidence?.file && files.has(f.evidence.file) && f.source !== 'features');
    if (other.length) {
      checks.push({
        id: 'issues:other',
        kind: 'static',
        when: 'TEA checks its code',
        then: 'there are no other issues in its files',
        result: 'fail',
        detail: other.slice(0, 3).map((f) => f.title).join('; '),
        findings: other.map((f) => f.id),
      });
      link(other.map((f) => f.id));
    }

    feature.checks = checks;
    feature.findings = [...linked];
    feature.status = statusOf(feature, byId);
  }

  return { features, docs: ctx.docs ?? [], sandbox: !!ctx.sandbox, hidden: [...hidden], summary: summarise(shown, ctx.live || !!ctx.sandbox) };
}

function statusOf(f: Feature, byId: Map<string, Finding>): FeatureStatus {
  if (f.origin === 'docs') {
    if (f.claims.every((c) => c.status === 'planned')) return 'not-built-yet';
    if (f.checks.some((c) => c.result === 'fail')) return 'missing';
    return 'untested';
  }
  const fails = f.checks.filter((c) => c.result === 'fail');
  const serious = fails.some((c) => c.kind !== 'docs' && (!c.findings?.length || c.findings.some((id) => SERIOUS.has(byId.get(id)?.severity ?? 'high'))));
  if (serious) return 'broken';
  if (fails.length) return 'partial';
  if (f.checks.some((c) => (c.kind === 'live' || c.kind === 'sandbox') && c.result === 'pass')) return 'works';
  return 'untested';
}

function summarise(features: Feature[], tested: boolean): FeatureSummary {
  const n = (s: FeatureStatus) => features.filter((f) => f.status === s).length;
  const s: FeatureSummary = {
    total: features.length,
    works: n('works'),
    broken: n('broken'),
    partial: n('partial'),
    missing: n('missing'),
    notBuiltYet: n('not-built-yet'),
    untested: n('untested'),
    coverage: null,
  };
  const exist = s.total - s.notBuiltYet;
  if (tested && exist > 0) s.coverage = Math.round((s.works / exist) * 100);
  return s;
}
