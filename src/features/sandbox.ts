import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import {
  classifyUrl,
  log,
  mask,
  masker,
  normalisePath,
  renderFixPrompt,
  untrustedBlock,
  type Catalog,
  type Finding,
  type PageVisit,
  type Route,
  type Scope,
} from '../core/index.js';

/**
 * Sandbox tests: the part of feature QA that changes data. TEA fills in each form it found with
 * made-up test data and submits it, then tries the API routes directly without signing in. This
 * only ever runs against an app on your own computer (localhost), only when you turn it on, and
 * never fills in payment, file or identity fields or presses delete, cancel or sign-out.
 */

export interface FormTest {
  page: string;
  action: string;
  method: string;
  kind: 'valid' | 'invalid-email';
  result: 'pass' | 'fail' | 'skip';
  detail: string;
  status?: number;
  findings: string[];
}

export interface ApiTest {
  path: string;
  status?: number;
  private: boolean;
  result: 'pass' | 'fail' | 'skip';
  detail: string;
  findings: string[];
}

export interface SandboxResult {
  forms: FormTest[];
  apis: ApiTest[];
  findings: Finding[];
}

export class SandboxError extends Error {}

/** Sandbox tests write data, so they only run on a local app. */
export function assertSandboxAllowed(url: string): void {
  if (classifyUrl(url) !== 'local') {
    throw new SandboxError(
      `Sandbox tests submit forms with test data, so they only run on an app on your own computer (localhost). ${new URL(url).host} isn't local. Run your app locally, or turn sandbox tests off.`,
    );
  }
}

/** Fields TEA never fills: payment, bank, identity and file fields. */
const NEVER_FILL = /card|cc-|ccnum|cvc|cvv|csc|expir|iban|routing|account.?num|sort.?code|ssn|social.?security|passport|national.?id|tax.?id/i;
/** Forms and buttons TEA never submits. */
const DESTRUCTIVE = /delete|remove|destroy|erase|log ?out|sign ?out|unsubscribe|cancel|deactivate|close account|wipe|reset all|drop/i;
/** API paths TEA never calls directly: their GET often does something (log out, send, run a job). */
const SIDE_EFFECT_PATH = /(^|[/_-])(log-?out|sign-?out|delete|remove|destroy|cron|jobs?|webhooks?|callback|oauth|unsubscribe|verify|confirm|send|trigger|run|sync|import|seed|migrate|reset|revalidate|purge|export|ai|llm|chat|completions?|generate|describe|summari[sz]e)([/_.-]|$)/i;
/** API paths that should not answer people who aren't signed in. */
const PRIVATE_PATH = /(^|\/)(admin|users?|orders?|accounts?|me|profile|billing|invoices?|payments?|customers?|settings|private|internal|dashboard|members?|subscriptions?|messages?|notifications?)(\/|$)/i;

interface FieldInfo {
  tag: string;
  type: string;
  name: string;
  hint: string;
}

const rand = () => randomBytes(4).toString('hex');

function testValue(f: FieldInfo, password: string, email: string): string | undefined {
  const h = `${f.name} ${f.hint}`.toLowerCase();
  if (f.type === 'email' || /e-?mail/.test(h)) return email;
  if (f.type === 'password' || /password|passcode/.test(h)) return password;
  if (f.type === 'number' || f.type === 'range') return '1';
  if (f.type === 'tel' || /phone|mobile/.test(h)) return '5550100';
  if (f.type === 'url' || /website|url/.test(h)) return 'https://example.com';
  if (f.type === 'date') return '2026-01-15';
  if (f.type === 'datetime-local') return '2026-01-15T10:00';
  if (f.type === 'time') return '10:00';
  if (f.type === 'month') return '2026-01';
  if (f.type === 'color') return '#336699';
  if (/name/.test(h)) return 'Tea Tester';
  if (/zip|postal/.test(h)) return '10001';
  if (/city/.test(h)) return 'Testville';
  if (f.tag === 'textarea') return 'This is a test message from TEA.';
  return 'TEA test';
}

async function fieldsOf(form: Locator): Promise<FieldInfo[]> {
  return form.locator('input, textarea, select').evaluateAll((els) =>
    els.map((el) => {
      const i = el as HTMLInputElement;
      const id = i.id;
      const label = id ? document.querySelector(`label[for="${CSS.escape(id)}"]`)?.textContent : i.closest('label')?.textContent;
      return {
        tag: el.tagName.toLowerCase(),
        type: el.tagName === 'INPUT' ? i.type : el.tagName.toLowerCase(),
        name: i.name || id || '',
        hint: [label, i.placeholder, i.getAttribute('aria-label'), i.autocomplete].filter(Boolean).join(' '),
      };
    }),
  );
}

async function fill(form: Locator, fields: FieldInfo[], values: { password: string; email: string }): Promise<void> {
  const inputs = form.locator('input, textarea, select');
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i]!;
    const el = inputs.nth(i);
    if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(f.type)) continue;
    if (!(await el.isEditable().catch(() => false))) continue;
    try {
      if (f.type === 'checkbox') await el.check({ timeout: 2_000 });
      else if (f.type === 'radio') await el.check({ timeout: 2_000 }).catch(() => undefined);
      else if (f.tag === 'select') {
        const opts = await el.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
        if (opts[0]) await el.selectOption(opts[0], { timeout: 2_000 });
      } else {
        const v = testValue(f, values.password, values.email);
        if (v !== undefined) await el.fill(v, { timeout: 2_000 });
      }
    } catch {
      /* a field TEA can't fill: leave it, the submit shows what happens */
    }
  }
}

interface Submitted {
  /** Responses from the app after submitting, in order. */
  responses: { url: string; method: string; status: number }[];
  pageErrors: string[];
  /** The browser refused to send the form (a required or type=email field). */
  blocked: boolean;
}

async function submit(page: Page, form: Locator, origin: string): Promise<Submitted> {
  const responses: Submitted['responses'] = [];
  const pageErrors: string[] = [];
  const onResponse = (res: import('playwright').Response) => {
    const req = res.request();
    if (!res.url().startsWith(origin) || !['document', 'fetch', 'xhr'].includes(req.resourceType())) return;
    responses.push({ url: mask(res.url()), method: req.method(), status: res.status() });
  };
  const onError = (err: Error) => pageErrors.push(mask(err.message).slice(0, 300));
  page.on('response', onResponse);
  page.on('pageerror', onError);
  try {
    const button = form.locator('button[type="submit"], input[type="submit"], button:not([type])').first();
    if (await button.count()) await button.click({ timeout: 5_000, noWaitAfter: true }).catch(() => undefined);
    else await form.evaluate((f) => (f as HTMLFormElement).requestSubmit()).catch(() => undefined);
    await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => undefined);
    await page.waitForTimeout(400);
  } finally {
    page.off('response', onResponse);
    page.off('pageerror', onError);
  }
  const blocked = !responses.length && (await form.evaluate((f) => !(f as HTMLFormElement).checkValidity()).catch(() => false));
  return { responses, pageErrors, blocked };
}

export interface SandboxOptions {
  url: string;
  pages: PageVisit[];
  routes: Route[];
  scope: Scope;
  outDir: string;
  catalog: Catalog;
  timeoutMs?: number;
  screenshots?: boolean;
  /** Injected for tests; otherwise Chromium is launched. */
  browser?: Browser;
}

const fileRef = (r?: Route) => (r?.file ? `${r.file}${r.line && r.line > 1 ? `:${r.line}` : ''}` : undefined);

export async function sandboxTests(o: SandboxOptions): Promise<SandboxResult> {
  assertSandboxAllowed(o.url);
  const origin = new URL(o.url).origin;
  const out: SandboxResult = { forms: [], apis: [], findings: [] };
  const entry = (id: string) => o.catalog.get(id);
  const password = `Tea-${rand()}-Aa1!`;
  masker.add(password);
  const shotDir = join(o.outDir, 'screenshots');
  if (o.screenshots !== false) await mkdir(shotDir, { recursive: true });

  const ownBrowser = !o.browser;
  const browser = o.browser ?? (await chromium.launch());
  const context = await browser.newContext({ serviceWorkers: 'block' });
  // Writes may only go to the local app. Page navigations never leave it; nothing at all goes to skipped routes.
  await context.route('**/*', async (route) => {
    const req = route.request();
    const url = req.url();
    const local = url.startsWith(origin);
    if (local && o.scope.isSkipped(url)) return route.abort('blockedbyclient');
    if (!local && (req.method() !== 'GET' || req.isNavigationRequest())) return route.abort('blockedbyclient');
    return route.continue();
  });

  try {
    // Forms, from the pages the crawl visited. One test per form (by page, method and action).
    const seen = new Set<string>();
    let shot = 0;
    for (const visit of o.pages) {
      if (visit.error || (visit.status ?? 200) >= 400 || !visit.url.startsWith(origin)) continue;
      for (let i = 0; i < visit.forms.length; i++) {
        const info = visit.forms[i]!;
        const action = info.action ? normalisePath(new URL(info.action, visit.url).pathname) : normalisePath(new URL(visit.url).pathname);
        const method = (info.method ?? 'GET').toUpperCase();
        const key = `${visit.path} ${method} ${action}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const base = { page: normalisePath(visit.path.split('?')[0]!), action: `${method} ${action}`, method, findings: [] as string[] };
        if (info.action && !new URL(info.action, visit.url).href.startsWith(origin)) {
          out.forms.push({ ...base, kind: 'valid', result: 'skip', detail: 'It sends to another site: TEA only submits forms to your local app.' });
          continue;
        }
        const labels = info.fields.map((f) => `${f.name ?? ''} ${f.label ?? ''} ${f.type ?? ''}`).join(' ');
        if (NEVER_FILL.test(labels) || info.fields.some((f) => f.type === 'file')) {
          out.forms.push({ ...base, kind: 'valid', result: 'skip', detail: 'It has payment, identity or file fields. TEA never fills those in: test this form by hand with your provider’s test details.' });
          continue;
        }
        if (DESTRUCTIVE.test(action)) {
          out.forms.push({ ...base, kind: 'valid', result: 'skip', detail: 'It looks like it deletes, cancels or signs out. TEA never submits those.' });
          continue;
        }

        const email = `tea-test+${rand()}@example.com`;
        const page = await context.newPage();
        try {
          await page.goto(visit.url, { waitUntil: 'load', timeout: o.timeoutMs ?? 30_000 });
          await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
          const form = page.locator('form').nth(i);
          if (!(await form.count())) {
            out.forms.push({ ...base, kind: 'valid', result: 'skip', detail: 'TEA could not find the form again on the page.' });
            continue;
          }
          const buttonText = (await form.locator('button, input[type="submit"]').allInnerTexts().catch(() => [])).join(' ');
          if (DESTRUCTIVE.test(buttonText)) {
            out.forms.push({ ...base, kind: 'valid', result: 'skip', detail: 'Its button deletes, cancels or signs out. TEA never presses those.' });
            continue;
          }
          const fields = await fieldsOf(form);
          await fill(form, fields, { password, email });
          log.debug(`Sandbox: submitting the form on ${visit.path}`);
          const r = await submit(page, form, origin);
          const valid = judgeValid(r, action);
          const test: FormTest = { ...base, kind: 'valid', ...valid };
          if (test.result === 'fail') {
            let screenshot: string | undefined;
            if (o.screenshots !== false) {
              const file = `sandbox-${String(shot++).padStart(2, '0')}.png`;
              await page.screenshot({ path: join(shotDir, file), fullPage: true, timeout: 10_000 }).then(() => (screenshot = `screenshots/${file}`), () => undefined);
            }
            const id = `features.form-fails:${base.page}:${base.action}`;
            const e = entry('features.form-fails');
            const formRoute = o.routes.find((x) => x.kind === 'page' && normalisePath(x.path) === base.page);
            out.findings.push({
              id,
              area: 'functional',
              severity: e?.severity ?? 'high',
              title: `Submitting the form on ${base.page} fails`,
              summary: `TEA filled in the form on ${base.page} with valid test data and submitted it. ${test.detail} Anyone who uses this form gets the same.`,
              steps: [`Open ${base.page} on your local app.`, 'Fill in the form with valid details and submit it.', test.detail],
              evidence: { url: mask(visit.url), screenshot, file: formRoute?.file, details: r.responses.slice(0, 6).map((x) => `${x.method} ${x.url} -> ${x.status}`).concat(r.pageErrors.slice(0, 3)) },
              fix: renderFixPrompt(e, { route: `${base.page} (${base.action})`, file: fileRef(formRoute), evidence: untrustedBlock([...r.responses.map((x) => `${x.method} ${x.url} -> ${x.status}`), ...r.pageErrors]) }),
              source: 'sandbox',
            });
            test.findings.push(id);
          }
          out.forms.push(test);

          // Invalid email: only worth testing when the valid submit got through.
          const emailField = fields.findIndex((f) => f.type === 'email' || /e-?mail/i.test(`${f.name} ${f.hint}`));
          if (emailField < 0) continue;
          if (test.result !== 'pass') {
            out.forms.push({ ...base, kind: 'invalid-email', result: 'skip', detail: 'Skipped: the form fails with valid data, so fix that first.', findings: [] });
            continue;
          }
          await page.goto(visit.url, { waitUntil: 'load', timeout: o.timeoutMs ?? 30_000 });
          await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
          const again = page.locator('form').nth(i);
          await fill(again, fields, { password, email: 'not-an-email' });
          const bad = await submit(page, again, origin);
          const inv = judgeInvalid(bad, action);
          const invTest: FormTest = { ...base, kind: 'invalid-email', ...inv, findings: [] };
          if (inv.result === 'fail') {
            const field = fields[emailField]!.name || 'email';
            const id = `features.form-accepts-invalid:${base.page}:${field}`;
            const e = entry('features.form-accepts-invalid');
            const formRoute = o.routes.find((x) => x.kind === 'page' && normalisePath(x.path) === base.page);
            out.findings.push({
              id,
              area: 'functional',
              severity: e?.severity ?? 'medium',
              title: `The form on ${base.page} accepts "not-an-email" as an email`,
              summary: `TEA typed "not-an-email" into the ${field} field on ${base.page} and the app accepted it (${inv.status}). Bad addresses get saved, and emails to them never arrive.`,
              steps: [`Open ${base.page}.`, `Type "not-an-email" into the ${field} field and fill in the rest.`, `Submit: the app answers ${inv.status} instead of showing an error.`],
              evidence: { url: mask(visit.url), file: formRoute?.file },
              fix: renderFixPrompt(e, { route: base.page, file: fileRef(formRoute), evidence: untrustedBlock([`field: ${field}`, `answer: ${inv.status}`]) }),
              source: 'sandbox',
            });
            invTest.findings.push(id);
          }
          out.forms.push(invTest);
        } catch (err) {
          out.forms.push({ ...base, kind: 'valid', result: 'skip', detail: `TEA could not test it: ${mask((err as Error).message.split('\n')[0]!)}` });
        } finally {
          await page.close();
        }
      }
    }
  } finally {
    await context.close();
    if (ownBrowser) await browser.close();
  }

  // API routes, called directly without signing in: GET only, never ones that look like they do something.
  for (const r of o.routes) {
    if (r.kind !== 'api' || r.dynamic || r.plugin === 'links') continue;
    if (!r.methods?.some((m) => m === 'GET' || m === 'ANY')) continue;
    const path = normalisePath(r.path);
    const isPrivate = PRIVATE_PATH.test(path);
    if (SIDE_EFFECT_PATH.test(path)) {
      out.apis.push({ path, private: isPrivate, result: 'skip', detail: 'Its name says it does something (sends, runs, exports...). TEA never calls those directly.', findings: [] });
      continue;
    }
    const url = new URL(path, origin).href;
    if (!o.scope.isAllowed(url) || o.scope.isSkipped(url)) continue;
    if (o.pages.some((v) => v.failedRequests.some((f) => safePath(f.url) === path))) {
      out.apis.push({ path, private: isPrivate, result: 'skip', detail: 'Already tested while opening the pages that call it.', findings: [] });
      continue;
    }
    let status: number | undefined;
    let body = '';
    try {
      const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(o.timeoutMs ?? 30_000), headers: { accept: 'application/json' } });
      status = res.status;
      body = (await res.text()).slice(0, 4_000);
    } catch (err) {
      out.apis.push({ path, private: isPrivate, result: 'skip', detail: `No answer: ${mask((err as Error).message)}`, findings: [] });
      continue;
    }
    const test: ApiTest = { path, status, private: isPrivate, result: 'pass', detail: `Answered ${status}.`, findings: [] };
    if (status >= 500) {
      test.result = 'fail';
      test.detail = `It answers ${status}: a server error.`;
      const id = `features.api-error:${path}`;
      const e = entry('features.api-error');
      out.findings.push({
        id,
        area: 'api',
        severity: e?.severity ?? 'high',
        title: `${path} answers with a server error (${status})`,
        summary: `TEA called GET ${path} on your local app and it answered ${status}. Whatever uses it can't work.`,
        steps: [`Start your app locally.`, `Open ${url}: it answers ${status}.`],
        evidence: { url: mask(url), file: r.file, line: r.line },
        fix: renderFixPrompt(e, { route: `GET ${path}`, file: fileRef(r), evidence: untrustedBlock([`GET ${path} -> ${status}`, body.slice(0, 200)]) }),
        source: 'sandbox',
      });
      test.findings.push(id);
    } else if (isPrivate && status >= 200 && status < 300 && looksLikeData(body)) {
      test.result = 'fail';
      test.detail = `It answers ${status} with data to someone who isn't signed in.`;
      const id = `features.api-open:${path}`;
      const e = entry('features.api-open');
      out.findings.push({
        id,
        area: 'security',
        severity: e?.severity ?? 'high',
        title: `${path} hands out data without a sign-in`,
        summary: `TEA called GET ${path} without signing in, and your app answered ${status} with data. From its name, this should be private: anyone on the internet could read it.`,
        steps: ['Open a private browser window (signed out).', `Open ${url}: data comes back instead of "please sign in" (401).`],
        evidence: { url: mask(url), file: r.file, line: r.line },
        fix: renderFixPrompt(e, { route: `GET ${path}`, file: fileRef(r), evidence: untrustedBlock([`GET ${path} (signed out) -> ${status}`]) }),
        source: 'sandbox',
      });
      test.findings.push(id);
    } else if (isPrivate && (status === 401 || status === 403)) {
      test.detail = `It refuses people who aren't signed in (${status}).`;
    }
    out.apis.push(test);
  }
  return out;
}

const safePath = (u: string) => {
  try {
    return normalisePath(new URL(u).pathname);
  } catch {
    return '';
  }
};

/** Non-empty JSON or a long body: real data, not "{}" or "[]". */
function looksLikeData(body: string): boolean {
  const t = body.trim();
  if (!t || t === '{}' || t === '[]' || t === 'null') return false;
  try {
    const j = JSON.parse(t);
    if (Array.isArray(j)) return j.length > 0;
    return typeof j === 'object' && j !== null && Object.keys(j).length > 0 && !('error' in j);
  } catch {
    return false;
  }
}

function judgeValid(r: Submitted, action: string): Pick<FormTest, 'result' | 'detail' | 'status'> {
  if (r.pageErrors.length) return { result: 'fail', detail: `The page crashed: ${r.pageErrors[0]}` };
  const server = r.responses.find((x) => x.status >= 500);
  if (server) return { result: 'fail', status: server.status, detail: `The app answered ${server.status}: a server error.` };
  const sent = r.responses.find((x) => new URL(x.url).pathname.replace(/\/$/, '') === action.replace(/\/$/, '') && x.method !== 'GET') ?? r.responses.find((x) => x.method !== 'GET');
  if (sent && (sent.status === 404 || sent.status === 405)) {
    return { result: 'fail', status: sent.status, detail: `It sends to ${action}, which answers ${sent.status}${sent.status === 404 ? ' (not found)' : ' (method not allowed)'}: the form goes nowhere.` };
  }
  if (r.blocked) return { result: 'skip', detail: "The browser wouldn't send TEA's test data (a field needs a special format). Test it by hand." };
  if (!r.responses.length) return { result: 'skip', detail: "Nothing was sent to the app. If this form should save something, it doesn't." };
  const last = sent ?? r.responses[r.responses.length - 1]!;
  return { result: 'pass', status: last.status, detail: `Submitted; the app answered ${last.status}.` };
}

function judgeInvalid(r: Submitted, action: string): Pick<FormTest, 'result' | 'detail' | 'status'> {
  if (r.blocked) return { result: 'pass', detail: 'The browser refuses it before sending (a type="email" field).' };
  const sent = r.responses.find((x) => new URL(x.url).pathname.replace(/\/$/, '') === action.replace(/\/$/, '') && x.method !== 'GET') ?? r.responses.find((x) => x.method !== 'GET');
  if (!sent) return { result: 'pass', detail: 'Nothing was sent: the page stopped it.' };
  if (sent.status >= 400 && sent.status < 500) return { result: 'pass', status: sent.status, detail: `The app refuses it (${sent.status}).` };
  if (sent.status >= 500) return { result: 'skip', status: sent.status, detail: `The app answered ${sent.status}, so TEA can't tell whether it checks emails.` };
  return { result: 'fail', status: sent.status, detail: `The app accepted "not-an-email" (${sent.status}).` };
}
