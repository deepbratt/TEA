import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import {
  AREAS,
  Scope,
  buildAppMap,
  classifyUrl,
  exceedsThreshold,
  loadConfig,
  parseConfig,
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
} from '../core/index.js';
import { scanRepo, type ScanResult } from '../repo-map/index.js';
import { crawl, crawlFindings } from '../scanner/index.js';
import { AREA_LABEL, plainSummary, topFindings, writeReport } from '../report/index.js';
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
  /** Honour targets, allowlist, repo path and plugins from a tea.yaml TEA found on its own. */
  trustRepoConfig?: boolean;
}

export class UsageError extends Error {}

export const VERSION: string = (() => {
  try {
    return JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')).version;
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

/**
 * Plugins are code. TEA only imports them when the user vouched for the config: it was passed
 * with --config, or --trust-repo-config was given. A tea.yaml that merely sits in a scanned
 * repo could otherwise make TEA run anything. Relative paths must stay inside the config's folder.
 */
export async function loadPlugins(names: string[], o: { baseDir: string; trusted: boolean }): Promise<{ plugins: TeaPlugin[]; ignored: string[] }> {
  if (!names.length) return { plugins: [], ignored: [] };
  if (!o.trusted) return { plugins: [], ignored: names };
  const base = realpathSync(o.baseDir);
  const plugins: TeaPlugin[] = [];
  for (const name of names) {
    let spec = name;
    if (isAbsolute(name)) throw new UsageError(`Plugin path must be relative to the config file, not absolute: ${name}`);
    if (name.startsWith('.')) {
      const file = resolve(base, name);
      const real = existsSync(file) ? realpathSync(file) : file;
      const rel = relative(base, real);
      if (rel.startsWith('..') || isAbsolute(rel)) throw new UsageError(`Plugin path leaves the config folder: ${name}`);
      spec = pathToFileURL(real).href;
    }
    log.step(`Loading plugin ${name}`);
    const mod = await import(spec);
    const plugin = (mod.default ?? mod.plugin) as TeaPlugin;
    if (!plugin?.name) throw new UsageError(`Plugin "${name}" does not export a TEA plugin (default export with a name).`);
    plugins.push(plugin);
  }
  return { plugins, ignored: [] };
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

  const preNotes: string[] = [];
  let login: { email: string; password: string } | undefined;
  if (opts.login) {
    const i = opts.login.indexOf(':');
    if (i < 1) throw new UsageError('--login must look like email:password');
    login = { email: opts.login.slice(0, i), password: opts.login.slice(i + 1) };
    masker.add(login.password);
  }

  // A tea.yaml TEA found on its own (not passed with --config) may come from the repo being
  // scanned, which is untrusted. Only a safe subset applies: it can't add targets, hosts or
  // plugins, and it can't weaken the run (fail threshold, slow-page limit, LLM, load).
  const configTrusted = !!opts.config || !!opts.trustRepoConfig;
  const untrusted = !!configFile && !configTrusted;
  if (untrusted) {
    const ignored = restrictUntrustedConfig(config);
    if (ignored.length) {
      const msg = `Ignored ${ignored.join(', ')} from ${configFile}: a tea.yaml found in the folder being tested can't add targets, hosts or plugins, or weaken checks. Pass --config ${configFile} or --trust-repo-config if it's yours.`;
      log.warn(msg);
      preNotes.push(msg);
    }
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

  const notes: string[] = [...preNotes];

  // 1. Discover from code.
  let scan: ScanResult | undefined;
  if (repo) {
    log.step(`Reading your code in ${repo}`);
    const loaded = await loadPlugins(effective.plugins, {
      baseDir: configFile ? dirname(configFile) : repo,
      trusted: configTrusted,
    });
    scan = await scanRepo(repo, { plugins: loaded.plugins });
    const stack = scan.stack.filter((s) => s.kind !== 'language').map((s) => s.name);
    log.info(`  Stack: ${stack.join(', ') || 'unknown'}`);
    log.info(`  Found ${scan.routes.filter((r) => r.kind === 'page').length} pages, ${scan.routes.filter((r) => r.kind === 'api').length} API endpoints, ${scan.forms.length} forms`);
  }

  // Code-only: starting the app runs code from the repo, so it needs the user's consent.
  let local: LocalApp | undefined;
  if (!url && repo && opts.start !== false) {
    const plan = planLocalStart(repo);
    if (!plan.ok) {
      notes.push(`TEA did not start the app locally: ${plan.reason}.`);
      log.warn(`Not starting the app locally: ${plan.reason}.`);
    } else if (opts.start === true || (await confirmStart(plan.command, repo))) {
      try {
        local = await startLocalApp(repo, plan);
        url = local.url;
      } catch (err) {
        notes.push((err as Error).message);
        log.warn((err as Error).message);
      }
    } else {
      const msg = `TEA did not start the app: that runs "${plan.command}" from your repo. Pass --start to allow it, or pass --url.`;
      notes.push(msg);
      log.warn(msg);
    }
  }

  // 2. Discover from the live UI.
  let pages: PageVisit[] = [];
  const findings: Finding[] = [];
  const ran = new Set<Area>();
  try {
    if (url) {
      await assertReachable(url);
      const kind = classifyUrl(url);
      log.step(`Opening ${url} in a real browser (${kind}, read-only, up to ${maxPages} pages)`);
      // Runs on the final URL (given, from config, or the locally started app). An untrusted
      // skip list may not hide the page TEA was asked to test.
      let skip = effective.skip;
      if (untrusted) {
        const start = new URL(url).pathname;
        const kept = config.skip.filter((g) => !new Scope({ urls: [url!], skip: [g] }).isSkipped(start));
        if (kept.length < config.skip.length) notes.push(`Ignored skip patterns from ${configFile} that cover the start page.`);
        skip = [...kept, ...(opts.skip ?? [])];
      }
      const scope = new Scope({ urls: [url, ...effective.urls], allowlist: effective.allowlist, skip });
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
      const redirected = pages.filter((p) => p.redirectedOutOfScope);
      if (redirected.length) notes.push(`${redirected.length} page(s) redirected outside the hosts TEA may test and were discarded: ${redirected.map((p) => p.path).join(', ')}.`);
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

/** One GET before crawling, so "your app isn't running" is one clear error, not a page of findings. */
async function assertReachable(url: string): Promise<void> {
  try {
    await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    const cause = ((err as { cause?: { code?: string } }).cause?.code ?? (err as Error).name) || 'network error';
    throw new UsageError(`TEA could not reach ${url} (${cause}). Is the app running, and is the URL right?`);
  }
}

/** Ask before running the repo's own code. Non-interactive runs (CI) need --start instead. */
async function confirmStart(command: string, repo: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY || process.env.CI) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`To test your app TEA needs to start it with "${command}" in ${repo}.
This runs code from that repo on your computer. Only say yes if you trust it. Start it? [y/N] `);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Reduce an untrusted tea.yaml to its safe subset, in place: skip list, accounts and viewport
 * apply; limits may only go down from the defaults; everything else resets. Returns what changed.
 */
export function restrictUntrustedConfig(c: TeaConfig): string[] {
  const d = parseConfig({});
  const ignored: string[] = [];
  if (c.urls.length) ignored.push('urls');
  if (c.allowlist.length) ignored.push('allowlist');
  if (c.repo) ignored.push('repo');
  if (c.plugins.length) ignored.push('plugins');
  if (c.failOn !== d.failOn) ignored.push('failOn');
  if (JSON.stringify(c.llm) !== JSON.stringify(d.llm)) ignored.push('llm');
  if (JSON.stringify(c.load) !== JSON.stringify(d.load)) ignored.push('load');
  const lower = (k: 'maxPages' | 'timeoutMs' | 'slowPageMs') => {
    if (c.crawl[k] > d.crawl[k]) ignored.push(`crawl.${k}`);
    return Math.min(c.crawl[k], d.crawl[k]);
  };
  Object.assign(c, {
    urls: [],
    allowlist: [],
    repo: undefined,
    plugins: [],
    failOn: d.failOn,
    llm: d.llm,
    load: d.load,
    crawl: { ...c.crawl, maxPages: lower('maxPages'), timeoutMs: lower('timeoutMs'), slowPageMs: lower('slowPageMs') },
  });
  return ignored;
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
    log.info(`  ${n++}. ${plan.ok ? `Ask before starting the app locally with "${plan.command}" (or start it straight away with --start)` : `Not start the app locally: ${plan.reason}`}`);
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
