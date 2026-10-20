import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  AREAS,
  Scope,
  buildAppMap,
  classifyUrl,
  exceedsThreshold,
  loadConfig,
  log,
  masker,
  overallScore,
  scoreAreas,
  sortFindings,
  type Area,
  type Finding,
  type PageVisit,
  type Results,
  type Severity,
  type TeaConfig,
  type TeaPlugin,
} from '@tea-qa/core';
import { scanRepo, type ScanResult } from '@tea-qa/scanner';
import { crawl, crawlFindings } from '@tea-qa/browser-agent';
import { AREA_LABEL, plainSummary, topFindings, writeReport } from '@tea-qa/report';
import { planLocalStart, startLocalApp, type LocalApp } from './local.js';

export interface RunOptions {
  target?: string;
  repo?: string;
  url?: string;
  out?: string;
  config?: string;
  maxPages?: number;
  failOn?: Severity | 'none';
  ai?: boolean;
  dryRun?: boolean;
  screenshots?: boolean;
  start?: boolean;
  skip?: string[];
  allow?: string[];
  login?: string;
}

export class UsageError extends Error {}

export const VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  } catch {
    return '0.0.0';
  }
})();

/** `tea-qa run <x>`: a URL means --url, an existing folder means --repo. */
export function resolveTarget(o: Pick<RunOptions, 'target' | 'repo' | 'url'>, cwd = process.cwd()): { repo?: string; url?: string } {
  let { repo, url } = o;
  if (o.target) {
    if (/^https?:\/\//i.test(o.target)) url ??= o.target;
    else if (existsSync(resolve(cwd, o.target)) && statSync(resolve(cwd, o.target)).isDirectory()) repo ??= o.target;
    else if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(o.target)) url ??= `https://${o.target}`;
    else throw new UsageError(`"${o.target}" is not a URL or an existing folder.`);
  }
  if (url) {
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      throw new UsageError(`Not a valid http(s) URL: ${url}`);
    }
  }
  if (repo && !existsSync(resolve(cwd, repo))) throw new UsageError(`Repo folder not found: ${repo}`);
  return { repo: repo ? resolve(cwd, repo) : undefined, url };
}

async function loadPlugins(names: string[], repo?: string): Promise<TeaPlugin[]> {
  const out: TeaPlugin[] = [];
  for (const name of names) {
    const spec = name.startsWith('.') && repo ? pathToFileURL(resolve(repo, name)).href : name;
    const mod = await import(spec);
    const plugin = (mod.default ?? mod.plugin) as TeaPlugin;
    if (!plugin?.name) throw new UsageError(`Plugin "${name}" does not export a TEA plugin (default export with a name).`);
    out.push(plugin);
  }
  return out;
}

export interface RunOutcome {
  results?: Results;
  exitCode: number;
  reportDir?: string;
}

export async function run(opts: RunOptions): Promise<RunOutcome> {
  const startedAt = new Date().toISOString();
  masker.addFromEnv();
  const target = resolveTarget(opts);
  const { config, file: configFile } = await loadConfig({ path: opts.config, repo: target.repo });
  for (const a of config.accounts) masker.add(a.password);

  let login: { email: string; password: string } | undefined;
  if (opts.login) {
    const i = opts.login.indexOf(':');
    if (i < 1) throw new UsageError('--login must look like email:password');
    login = { email: opts.login.slice(0, i), password: opts.login.slice(i + 1) };
    masker.add(login.password);
  }

  let url = target.url ?? config.urls[0];
  const repo = target.repo ?? (config.repo ? resolve(configFile ? resolve(configFile, '..') : process.cwd(), config.repo) : undefined);
  if (!url && !repo) throw new UsageError('Give TEA something to test: a URL, a repo folder, or both.\n  npx tea-qa run https://your-app.com\n  npx tea-qa run ./your-app');

  const outDir = resolve(opts.out ?? 'tea-report');
  const maxPages = opts.maxPages ?? config.crawl.maxPages;
  const failOn = (opts.failOn ?? config.failOn) as Severity | 'none';
  const effective: TeaConfig = { ...config, skip: [...config.skip, ...(opts.skip ?? [])], allowlist: [...config.allowlist, ...(opts.allow ?? [])] };

  log.info(`\nTEA ${VERSION} · Test Everything Automatically`);
  if (configFile) log.info(`Using ${configFile}`);

  if (opts.dryRun) {
    printDryRun({ url, repo, maxPages, outDir, config: effective, login: !!login, ai: opts.ai !== false });
    return { exitCode: 0 };
  }

  // 1. Discover from code.
  let scan: ScanResult | undefined;
  if (repo) {
    log.step(`Reading your code in ${repo}`);
    scan = await scanRepo(repo, { plugins: await loadPlugins(effective.plugins, repo) });
    const stack = scan.stack.filter((s) => s.kind !== 'language').map((s) => s.name);
    log.info(`  Stack: ${stack.join(', ') || 'unknown'}`);
    log.info(`  Found ${scan.routes.filter((r) => r.kind === 'page').length} pages, ${scan.routes.filter((r) => r.kind === 'api').length} API endpoints, ${scan.forms.length} forms`);
  }

  // Code-only: start the app locally if TEA safely can.
  let local: LocalApp | undefined;
  const notes: string[] = [];
  if (!url && repo && opts.start !== false) {
    const plan = planLocalStart(repo);
    if (plan.ok) {
      try {
        local = await startLocalApp(repo, plan);
        url = local.url;
      } catch (err) {
        notes.push((err as Error).message);
        log.warn((err as Error).message);
      }
    } else {
      notes.push(`TEA did not start the app locally: ${plan.reason}.`);
      log.warn(`Not starting the app locally: ${plan.reason}.`);
    }
  }

  // 2. Discover from the live UI.
  let pages: PageVisit[] = [];
  const findings: Finding[] = [];
  const ran = new Set<Area>();
  try {
    if (url) {
      const kind = classifyUrl(url);
      log.step(`Opening ${url} in a real browser (${kind}, read-only, up to ${maxPages} pages)`);
      const scope = new Scope({ urls: [url, ...effective.urls], allowlist: effective.allowlist, skip: effective.skip });
      const seedPaths = (scan?.routes ?? []).filter((r) => r.kind === 'page' && !r.dynamic).map((r) => r.path);
      const result = await crawl({
        startUrl: url,
        seedPaths,
        scope,
        maxPages,
        timeoutMs: effective.crawl.timeoutMs,
        viewport: effective.crawl.viewport,
        outDir,
        screenshots: opts.screenshots !== false,
      });
      pages = result.pages;
      log.info(`  Visited ${pages.length} pages${result.unvisited.length ? ` (${result.unvisited.length} more not visited: raise --max-pages)` : ''}`);
      if (result.unvisited.length) notes.push(`${result.unvisited.length} in-scope page(s) were not visited because of the ${maxPages}-page limit.`);
      if (result.external.length) notes.push(`${result.external.length} link(s) to other sites were not opened (only the hosts you listed are tested).`);
      findings.push(...crawlFindings(pages, { routes: scan?.routes, slowPageMs: effective.crawl.slowPageMs, baseUrl: url }));
      ran.add('functional').add('performance');
    }
  } finally {
    await local?.stop();
  }
  if (login) notes.push('A --login was given. Signed-in journeys arrive with the UI agent in the next TEA version; this run stayed signed out.');

  // 3. Score and report.
  const areas = scoreAreas(findings, ran);
  const score = overallScore(areas, findings);
  const notRun = AREAS.filter((a) => !ran.has(a));
  const sorted = sortFindings(findings);
  const appMap = buildAppMap({ discovery: scan, pages, target: { url, repo }, startUrl: url });
  appMap.notes.push(...notes);
  const results: Results = {
    tool: { name: 'tea-qa', version: VERSION },
    startedAt,
    finishedAt: new Date().toISOString(),
    target: { url: target.url ?? (local ? undefined : url), repo },
    score,
    areas,
    findings: sorted,
    summary: plainSummary({
      score,
      findings: sorted,
      pagesChecked: pages.length,
      stack: (scan?.stack ?? []).filter((s) => !['language', 'builder'].includes(s.kind)).map((s) => s.name),
      ranLabels: [...ran].map((a) => AREA_LABEL[a]),
      notRunLabels: notRun.map((a) => AREA_LABEL[a]),
    }),
    ran: [...ran],
    notRun,
  };
  if (local) results.target.url = `${url} (started locally)`;

  const written = await writeReport(outDir, results, appMap);
  printSummary(results, outDir);
  const failed = exceedsThreshold(sorted, failOn);
  if (failed) log.warn(`Failing because there are ${failOn} (or worse) issues. Use --fail-on none to always exit 0.`);
  return { results, exitCode: failed ? 1 : 0, reportDir: written.dir };
}

function printSummary(r: Results, outDir: string): void {
  log.info('');
  log.info(r.summary);
  const top = topFindings(r.findings);
  if (top.length) {
    log.info('\nTop issues:');
    top.forEach((f, i) => log.info(`  ${i + 1}. [${f.severity}] ${f.title}${f.evidence?.file ? `  (${f.evidence.file})` : ''}`));
  }
  log.info(`\nFull report: ${resolve(outDir, 'report.html')}`);
}

function printDryRun(p: { url?: string; repo?: string; maxPages: number; outDir: string; config: TeaConfig; login: boolean; ai: boolean }): void {
  log.info('\nDry run: nothing will be opened or changed. This is what TEA would do:\n');
  let n = 1;
  if (p.repo) log.info(`  ${n++}. Read the code in ${p.repo} (read-only; never installs or runs anything from it unless it needs to start the app)`);
  if (!p.url && p.repo) {
    const plan = planLocalStart(p.repo);
    log.info(`  ${n++}. ${plan.ok ? `Start the app locally with "${plan.command}"` : `Not start the app locally: ${plan.reason}`}`);
  }
  if (p.url) {
    log.info(`  ${n++}. Open ${p.url} (${classifyUrl(p.url)}) in headless Chromium and visit up to ${p.maxPages} pages, GET requests only`);
    const hosts = new Scope({ urls: [p.url, ...p.config.urls], allowlist: p.config.allowlist }).hosts;
    log.info(`     Allowed hosts: ${[...hosts].join(', ')}${p.config.skip.length ? `; skipping ${p.config.skip.join(', ')}` : ''}`);
  }
  log.info(`  ${n++}. Write the report to ${p.outDir}`);
  log.info('\nNot in this version yet: AI test plan and UI agent, API, security, accessibility, load and mobile checks.');
  log.info(`Estimated cost: $0.00 (${p.ai ? 'no AI steps run in this version' : '--no-ai'}; no load test).`);
}
