import { randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { log, mask, masker, onLog, SEVERITIES, type LogEvent, type Severity } from '../core/index.js';
import { run, UsageError, VERSION } from '../cli/run.js';
import { teaHome } from '../cli/notice.js';
import {
  cloneRepo,
  ghCliToken,
  GitHubClient,
  GitHubError,
  GITHUB_API,
  GITHUB_OAUTH,
  pollDeviceFlow,
  startDeviceFlow,
  validRepoRef,
  type DeviceCode,
} from '../github/index.js';
import { listFolders } from './folders.js';
import { renderPage } from './page.js';

/**
 * The local TEA UI: a small web app on 127.0.0.1 that does what `tea-qa run` does.
 * Only this machine can reach it, and every request needs the session token, so other
 * websites open in the browser can't start runs (CSRF) or read results (DNS rebinding).
 */

export interface UiOptions {
  port?: number;
  /** Where runs and their reports are stored. */
  runsDir?: string;
  /** Where GitHub repos are cloned (default: ~/.tea-qa/repos). */
  cloneDir?: string;
  /** OAuth App client id for "Sign in with GitHub" (device flow). Default: TEA_GITHUB_CLIENT_ID. */
  githubClientId?: string;
  /** For tests: GitHub endpoints and a stand-in for `gh auth token`. */
  githubApi?: string;
  githubOAuth?: string;
  gitBase?: string;
  ghToken?: () => Promise<string | null>;
}

export interface UiServer {
  url: string;
  /** The URL with the session token, to open in the browser. */
  openUrl: string;
  token: string;
  close(): Promise<void>;
}

export interface RunInput {
  url?: string;
  repo?: string;
  maxPages?: number;
  failOn?: Severity | 'none';
  start?: boolean;
  skip?: string[];
  /** Test a GitHub repo: TEA makes a shallow read-only clone and uses it as the repo. */
  github?: { owner: string; repo: string; branch?: string };
}

interface RunRecord {
  id: string;
  status: 'running' | 'done' | 'failed';
  input: RunInput;
  startedAt: string;
  finishedAt?: string;
  score?: number | null;
  counts?: Record<string, number>;
  summary?: string;
  error?: string;
  events: LogEvent[];
  dir: string;
}

const COOKIE = 'tea_ui';
const MAX_BODY = 32 * 1024;
const MAX_EVENTS = 2_000;
const SERVABLE: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function sameToken(a: string | undefined, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function cookieToken(req: IncomingMessage): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, v] = part.trim().split('=');
    if (k === COOKIE) return v;
  }
  return undefined;
}

function send(res: ServerResponse, status: number, body: string | Buffer, type = 'text/plain; charset=utf-8', extra: Record<string, string> = {}): void {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cross-origin-resource-policy': 'same-origin',
    ...extra,
  });
  res.end(body);
}

const json = (res: ServerResponse, status: number, data: unknown) => send(res, status, JSON.stringify(data), 'application/json; charset=utf-8');

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Send JSON.');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large.');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'Invalid JSON.');
  }
}

/** Only the fields the form sends, with types checked. */
export function parseRunInput(raw: unknown): RunInput {
  if (!raw || typeof raw !== 'object') throw new HttpError(400, 'Expected an object.');
  const r = raw as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' && (r[k] as string).trim() ? (r[k] as string).trim() : undefined);
  const input: RunInput = { url: str('url'), repo: str('repo') };
  if (r.github !== undefined && r.github !== null) {
    const g = r.github as Record<string, unknown>;
    const owner = typeof g.owner === 'string' ? g.owner : '';
    const repo = typeof g.repo === 'string' ? g.repo : '';
    const branch = typeof g.branch === 'string' && g.branch ? g.branch : undefined;
    if (!validRepoRef(owner, repo, branch)) throw new HttpError(400, 'Not a valid GitHub repository or branch.');
    if (input.repo) throw new HttpError(400, 'Choose a folder or a GitHub repo, not both.');
    input.github = { owner, repo, ...(branch ? { branch } : {}) };
  }
  if (!input.url && !input.repo && !input.github) throw new HttpError(400, 'Give TEA a URL, a repo folder or GitHub repo, or both.');
  if (r.maxPages !== undefined) {
    const n = Number(r.maxPages);
    if (!Number.isInteger(n) || n < 1 || n > 500) throw new HttpError(400, 'Max pages must be between 1 and 500.');
    input.maxPages = n;
  }
  if (r.failOn !== undefined) {
    if (![...SEVERITIES, 'none'].includes(r.failOn as string)) throw new HttpError(400, 'Unknown fail-on severity.');
    input.failOn = r.failOn as RunInput['failOn'];
  }
  input.start = r.start === true;
  if (r.skip !== undefined) {
    if (!Array.isArray(r.skip) || r.skip.some((s) => typeof s !== 'string') || r.skip.length > 50) throw new HttpError(400, 'Skip must be a list of routes.');
    input.skip = (r.skip as string[]).map((s) => s.trim()).filter(Boolean);
  }
  return input;
}

/** Everything the UI stores or sends is masked: URLs can carry credentials, errors can quote keys. */
function publicRun(r: RunRecord) {
  return masker.maskDeep({ id: r.id, status: r.status, input: r.input, startedAt: r.startedAt, finishedAt: r.finishedAt, score: r.score, counts: r.counts, summary: r.summary, error: r.error });
}

async function loadHistory(runsDir: string): Promise<RunRecord[]> {
  if (!existsSync(runsDir)) return [];
  const out: RunRecord[] = [];
  for (const id of (await readdir(runsDir)).sort().reverse().slice(0, 50)) {
    const metaFile = join(runsDir, id, 'run.json');
    if (!existsSync(metaFile)) continue;
    try {
      const meta = JSON.parse(await readFile(metaFile, 'utf8'));
      const eventsFile = join(runsDir, id, 'events.json');
      const events = existsSync(eventsFile) ? (JSON.parse(await readFile(eventsFile, 'utf8')) as LogEvent[]) : [];
      // A run still marked running was interrupted when the UI stopped.
      const status = meta.status === 'running' ? 'failed' : meta.status;
      out.push({ ...meta, status, error: status === 'failed' && !meta.error ? 'Interrupted: the UI stopped during this run.' : meta.error, events, dir: join(runsDir, id) });
    } catch {
      /* skip unreadable runs */
    }
  }
  return out;
}

export async function startUi(opts: UiOptions = {}): Promise<UiServer> {
  const runsDir = resolve(opts.runsDir ?? join('tea-report', 'runs'));
  const token = randomBytes(24).toString('hex');
  const runs = new Map<string, RunRecord>();
  for (const r of await loadHistory(runsDir)) runs.set(r.id, r);
  const streams = new Map<string, Set<ServerResponse>>();
  let busy = false;
  let origin = '';

  // GitHub connection for this UI session: in memory only, never written to disk, always masked.
  const cacheDir = resolve(opts.cloneDir ?? join(teaHome(), 'repos'));
  const githubApi = opts.githubApi ?? GITHUB_API;
  const githubOAuth = opts.githubOAuth ?? GITHUB_OAUTH;
  const clientId = opts.githubClientId ?? process.env.TEA_GITHUB_CLIENT_ID ?? '';
  const github: { token?: string; login?: string; via?: 'cli' | 'device' | 'token'; device?: DeviceCode } = {};

  async function connectGitHub(token: string, via: 'cli' | 'device' | 'token'): Promise<void> {
    masker.add(token);
    const user = await new GitHubClient(token, githubApi).user();
    Object.assign(github, { token, login: user.login, via, device: undefined });
  }
  const gh = () => {
    if (!github.token) throw new HttpError(401, 'Connect GitHub first.');
    return new GitHubClient(github.token, githubApi);
  };

  const pushEvent = (record: RunRecord, e: LogEvent) => {
    if (record.events.length < MAX_EVENTS) record.events.push(e);
    for (const res of streams.get(record.id) ?? []) res.write(`event: log\ndata: ${JSON.stringify(e)}\n\n`);
  };
  const finishStreams = (record: RunRecord) => {
    for (const res of streams.get(record.id) ?? []) {
      res.write(`event: done\ndata: ${JSON.stringify(publicRun(record))}\n\n`);
      res.end();
    }
    streams.delete(record.id);
  };

  async function startRun(input: RunInput): Promise<RunRecord> {
    if (busy) throw new HttpError(409, 'A run is already in progress. Wait for it to finish.');
    const id = new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomBytes(3).toString('hex');
    const record: RunRecord = { id, status: 'running', input, startedAt: new Date().toISOString(), events: [], dir: join(runsDir, id) };
    await mkdir(record.dir, { recursive: true });
    runs.set(id, record);
    busy = true;
    const unsubscribe = onLog((e) => pushEvent(record, e));
    const save = () => writeFile(join(record.dir, 'run.json'), JSON.stringify(publicRun(record), null, 2));
    await save();
    void (async () => {
      try {
        let repo = input.repo;
        if (input.github) {
          const { owner, repo: name, branch } = input.github;
          log.step(`Cloning ${owner}/${name}${branch ? `@${branch}` : ''} from GitHub (shallow, read-only)`);
          repo = await cloneRepo({ owner, repo: name, branch, token: github.token, cacheDir, gitBase: opts.gitBase });
        }
        const outcome = await run({
          url: input.url,
          repo,
          out: record.dir,
          maxPages: input.maxPages,
          failOn: input.failOn ?? 'none',
          skip: input.skip,
          // Never prompt in the terminal: the form's checkbox is the consent.
          start: input.start === true ? true : false,
        });
        record.status = 'done';
        record.score = outcome.results?.score ?? null;
        record.summary = outcome.results?.summary;
        const counts: Record<string, number> = {};
        for (const f of outcome.results?.findings ?? []) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
        record.counts = counts;
      } catch (err) {
        record.status = 'failed';
        record.error = mask(err instanceof UsageError ? err.message : `TEA crashed: ${(err as Error).message}`);
        pushEvent(record, { kind: 'error', message: record.error, at: new Date().toISOString() });
      } finally {
        unsubscribe();
        busy = false;
        record.finishedAt = new Date().toISOString();
        await save().catch(() => undefined);
        await writeFile(join(record.dir, 'events.json'), JSON.stringify(record.events)).catch(() => undefined);
        finishStreams(record);
      }
    })();
    return record;
  }

  function serveRunFile(res: ServerResponse, record: RunRecord, rel: string): void {
    const file = resolve(record.dir, rel);
    const within = relative(record.dir, file);
    if (!within || within === '..' || within.startsWith(`..${sep}`) || isAbsolute(within)) throw new HttpError(404, 'Not found.');
    const type = SERVABLE[extname(file).toLowerCase()];
    if (!type || !existsSync(file) || !statSync(file).isFile()) throw new HttpError(404, 'Not found.');
    const extra: Record<string, string> =
      type.startsWith('text/html')
        ? {
            // The report is static: inline styles and its copy-button script only, same-origin images.
            'content-security-policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'self'",
            'x-frame-options': 'SAMEORIGIN',
          }
        : {};
    send(res, 200, readFileSync(file), type, extra);
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // DNS rebinding: only answer requests addressed to this server by its loopback name.
    const host = req.headers.host ?? '';
    if (!new Set([new URL(origin).host, `localhost:${new URL(origin).port}`]).has(host)) throw new HttpError(403, 'Wrong host.');
    const url = new URL(req.url ?? '/', origin);

    // Opening the printed link trades the token for a same-site cookie.
    if (req.method === 'GET' && url.pathname === '/' && url.searchParams.has('token')) {
      if (!sameToken(url.searchParams.get('token') ?? undefined, token)) throw new HttpError(401, 'Wrong token. Use the link TEA printed in your terminal.');
      res.writeHead(303, { location: '/', 'set-cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/`, 'cache-control': 'no-store' });
      res.end();
      return;
    }
    if (!sameToken(cookieToken(req), token) && !sameToken(req.headers['x-tea-token'] as string | undefined, token)) {
      throw new HttpError(401, 'Open the link TEA printed in your terminal (it includes a one-time token).');
    }
    if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== origin && req.headers.origin !== `http://localhost:${new URL(origin).port}`) {
      throw new HttpError(403, 'Cross-site request blocked.');
    }

    if (req.method === 'GET' && url.pathname === '/') {
      send(res, 200, renderPage({ version: VERSION }), 'text/html; charset=utf-8', {
        'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; frame-src 'self'; frame-ancestors 'none'",
        'x-frame-options': 'DENY',
      });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/runs') {
      json(res, 200, { busy, runs: [...runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).map(publicRun) });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/runs') {
      const record = await startRun(parseRunInput(await readJson(req)));
      json(res, 202, publicRun(record));
      return;
    }
    // Folder picker: folder names only, never file contents.
    if (req.method === 'GET' && url.pathname === '/api/folders') {
      try {
        json(res, 200, await listFolders(url.searchParams.get('path') ?? undefined));
      } catch (err) {
        throw new HttpError(400, (err as Error).message);
      }
      return;
    }

    // GitHub: connect (CLI login, device flow, or a pasted token), list repos, branches, live URLs.
    if (req.method === 'GET' && url.pathname === '/api/github') {
      json(res, 200, { connected: !!github.token, login: github.login, via: github.via, deviceFlow: !!clientId });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/github/connect') {
      const body = (await readJson(req)) as { method?: string; token?: string };
      if (body.method === 'cli') {
        const token = await (opts.ghToken ?? ghCliToken)();
        if (!token) throw new HttpError(400, 'No GitHub CLI login found. Install gh and run `gh auth login`, or use another option.');
        await connectGitHub(token, 'cli');
      } else if (body.method === 'token') {
        const token = typeof body.token === 'string' ? body.token.trim() : '';
        if (!/^[A-Za-z0-9_]{20,255}$/.test(token)) throw new HttpError(400, "That doesn't look like a GitHub token.");
        await connectGitHub(token, 'token');
      } else {
        throw new HttpError(400, 'Unknown connect method.');
      }
      json(res, 200, { connected: true, login: github.login, via: github.via });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/github/device') {
      if (!clientId) throw new HttpError(400, 'Sign in with GitHub needs TEA_GITHUB_CLIENT_ID (a GitHub OAuth App with device flow enabled).');
      const body = (await readJson(req)) as { action?: string };
      if (body.action === 'start') {
        github.device = await startDeviceFlow(clientId, githubOAuth);
        json(res, 200, { userCode: github.device.userCode, verificationUri: github.device.verificationUri, interval: github.device.interval });
        return;
      }
      if (!github.device) throw new HttpError(400, 'Start sign-in first.');
      if (Date.now() > github.device.expiresAt) throw new HttpError(400, 'The code expired. Start again.');
      const poll = await pollDeviceFlow(clientId, github.device.deviceCode, githubOAuth);
      if (poll.status === 'done') {
        await connectGitHub(poll.token, 'device');
        json(res, 200, { status: 'done', login: github.login });
      } else if (poll.status === 'failed') {
        github.device = undefined;
        json(res, 200, { status: 'failed', reason: poll.reason });
      } else {
        json(res, 200, { status: poll.status, interval: poll.status === 'slow_down' ? poll.interval : github.device.interval });
      }
      return;
    }
    if (req.method === 'POST' && url.pathname === '/api/github/disconnect') {
      for (const k of Object.keys(github)) delete (github as Record<string, unknown>)[k];
      json(res, 200, { connected: false });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/github/repos') {
      const page = Math.max(1, Math.min(20, Number(url.searchParams.get('page') ?? 1) || 1));
      json(res, 200, { repos: await gh().repos(page) });
      return;
    }
    if (req.method === 'GET' && url.pathname === '/api/github/repo') {
      const owner = url.searchParams.get('owner') ?? '';
      const repo = url.searchParams.get('repo') ?? '';
      if (!validRepoRef(owner, repo)) throw new HttpError(400, 'Not a valid repository name.');
      const client = gh();
      const [branches, urls] = await Promise.all([client.branches(owner, repo), client.liveUrls(owner, repo).catch(() => [])]);
      json(res, 200, { branches, urls });
      return;
    }

    const m = /^\/api\/runs\/([\w-]+)(\/events)?$/.exec(url.pathname);
    if (req.method === 'GET' && m) {
      const record = runs.get(m[1]!);
      if (!record) throw new HttpError(404, 'No such run.');
      if (!m[2]) {
        json(res, 200, { ...publicRun(record), events: record.events });
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-content-type-options': 'nosniff' });
      for (const e of record.events) res.write(`event: log\ndata: ${JSON.stringify(e)}\n\n`);
      if (record.status !== 'running') {
        res.write(`event: done\ndata: ${JSON.stringify(publicRun(record))}\n\n`);
        res.end();
        return;
      }
      if (!streams.has(record.id)) streams.set(record.id, new Set());
      streams.get(record.id)!.add(res);
      req.on('close', () => streams.get(record.id)?.delete(res));
      return;
    }
    const f = /^\/runs\/([\w-]+)\/(.+)$/.exec(url.pathname);
    if (req.method === 'GET' && f) {
      const record = runs.get(f[1]!);
      if (!record) throw new HttpError(404, 'No such run.');
      serveRunFile(res, record, decodeURIComponent(f[2]!));
      return;
    }
    throw new HttpError(404, 'Not found.');
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      const known = err instanceof HttpError || err instanceof GitHubError;
      // GitHub failures are the user's to fix (token, access), not a TEA crash.
      const status = err instanceof HttpError ? err.status : err instanceof GitHubError ? (err.status === 401 ? 401 : 502) : 500;
      if (status === 500) log.error(`UI error: ${(err as Error).message}`);
      if (!res.headersSent) json(res, status, { error: known ? mask((err as Error).message) : 'Something went wrong.' });
      else res.end();
    });
  });

  const listen = (port: number) =>
    new Promise<number>((ok, fail) => {
      server.once('error', fail);
      server.listen(port, '127.0.0.1', () => {
        server.off('error', fail);
        ok((server.address() as AddressInfo).port);
      });
    });
  let port: number;
  try {
    port = await listen(opts.port ?? 4747);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE' || opts.port === 0) throw err;
    port = await listen(0); // preferred port busy: take any free one
  }
  origin = `http://127.0.0.1:${port}`;

  return {
    url: origin,
    openUrl: `${origin}/?token=${token}`,
    token,
    close: () =>
      new Promise<void>((ok) => {
        for (const set of streams.values()) for (const res of set) res.end();
        server.closeAllConnections?.();
        server.close(() => ok());
      }),
  };
}
