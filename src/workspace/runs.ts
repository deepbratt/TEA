import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { mask, masker, onLog, scoreVerdict, type GateOutcome, type LogEvent, type Results } from '../core/index.js';
import { run, UsageError } from '../cli/run.js';
import type { Project, Workspace } from './config.js';

/**
 * Analyses of workspace projects: one at a time, streamed as log events, and recorded under
 * <runsDir>/<project key>/<run id>/ (the full report, run.json and events.json).
 */

export interface RunRecord {
  id: string;
  project: string;
  status: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt?: string;
  score?: number | null;
  verdict?: { label: string; tone: string };
  gate?: GateOutcome;
  counts?: Record<string, number>;
  summary?: string;
  target?: string;
  error?: string;
}

type Listener = (e: { type: 'log'; event: LogEvent } | { type: 'done'; run: RunRecord }) => void;

const MAX_EVENTS = 2_000;
const RUN_ID = /^[\w-]+$/;

export class RunBusyError extends Error {}

export class RunManager {
  readonly dir: string;
  private active?: { record: RunRecord; events: LogEvent[]; listeners: Set<Listener> };

  constructor(private workspace: Workspace, runsDir?: string) {
    this.dir = resolve(runsDir ?? join(workspace.dir, '.tea', 'runs'));
  }

  get running(): RunRecord | undefined {
    return this.active?.record;
  }

  runDir(project: string, id: string): string {
    if (!RUN_ID.test(project) || !RUN_ID.test(id)) throw new Error('Bad run id.');
    return join(this.dir, project, id);
  }

  /** Start analysing a project. Resolves as soon as the run is recorded; the work continues. */
  async start(project: Project): Promise<RunRecord> {
    if (this.active) throw new RunBusyError('An analysis is already running. Wait for it to finish.');
    const { data } = await this.workspace.read();
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`;
    const record: RunRecord = { id, project: project.key, status: 'running', startedAt: new Date().toISOString(), target: describe(project) };
    const dir = this.runDir(project.key, id);
    await mkdir(dir, { recursive: true });
    const events: LogEvent[] = [];
    const listeners = new Set<Listener>();
    this.active = { record, events, listeners };
    const unsubscribe = onLog((event) => {
      if (events.length < MAX_EVENTS) events.push(event);
      for (const l of listeners) l({ type: 'log', event });
    });
    await this.save(dir, record);

    void (async () => {
      try {
        const outcome = await run({
          url: project.url,
          sources: this.workspace.sourcesOf(project),
          out: dir,
          maxPages: project.maxPages,
          skip: project.skip,
          rules: data.rules,
          gate: project.gate ?? data.gate,
          failOn: 'none',
          // The Workbench never starts apps from their dev scripts: give it a URL to test live.
          start: false,
        });
        Object.assign(record, summarise(outcome.results), { status: 'done' });
      } catch (err) {
        record.status = 'failed';
        record.error = mask(err instanceof UsageError ? err.message : `TEA crashed: ${(err as Error).message}`);
        const event: LogEvent = { kind: 'error', message: record.error, at: new Date().toISOString() };
        events.push(event);
        for (const l of listeners) l({ type: 'log', event });
      } finally {
        unsubscribe();
        record.finishedAt = new Date().toISOString();
        await this.save(dir, record, events).catch(() => undefined);
        this.active = undefined;
        for (const l of listeners) l({ type: 'done', run: this.public(record) });
      }
    })();
    return this.public(record);
  }

  /** Follow the running analysis: replays its log so far, then streams. Returns an unsubscribe. */
  follow(id: string, listener: Listener): (() => void) | null {
    if (!this.active || this.active.record.id !== id) return null;
    for (const event of this.active.events) listener({ type: 'log', event });
    this.active.listeners.add(listener);
    return () => this.active?.listeners.delete(listener);
  }

  async list(project: string): Promise<RunRecord[]> {
    const dir = join(this.dir, project);
    if (!RUN_ID.test(project) || !existsSync(dir)) return this.active?.record.project === project ? [this.public(this.active.record)] : [];
    const out: RunRecord[] = [];
    for (const id of (await readdir(dir)).sort().reverse().slice(0, 100)) {
      const r = await this.get(project, id);
      if (r) out.push(r);
    }
    return out;
  }

  async latest(project: string): Promise<RunRecord | undefined> {
    return (await this.list(project)).find((r) => r.status !== 'running') ?? undefined;
  }

  async get(project: string, id: string): Promise<RunRecord | undefined> {
    if (this.active?.record.id === id) return this.public(this.active.record);
    const file = join(this.runDir(project, id), 'run.json');
    if (!existsSync(file)) return undefined;
    try {
      const r = JSON.parse(await readFile(file, 'utf8')) as RunRecord;
      // A run still marked running belongs to a server that stopped mid-run.
      return r.status === 'running' ? { ...r, status: 'failed', error: 'Interrupted: TEA stopped during this analysis.' } : r;
    } catch {
      return undefined;
    }
  }

  async events(project: string, id: string): Promise<LogEvent[]> {
    if (this.active?.record.id === id) return [...this.active.events];
    const file = join(this.runDir(project, id), 'events.json');
    return existsSync(file) ? (JSON.parse(await readFile(file, 'utf8')) as LogEvent[]) : [];
  }

  async results(project: string, id: string): Promise<Results | undefined> {
    const file = join(this.runDir(project, id), 'results.json');
    return existsSync(file) ? (JSON.parse(await readFile(file, 'utf8')) as Results) : undefined;
  }

  private public(r: RunRecord): RunRecord {
    return masker.maskDeep({ ...r });
  }

  private async save(dir: string, record: RunRecord, events?: LogEvent[]): Promise<void> {
    await writeFile(join(dir, 'run.json'), JSON.stringify(this.public(record), null, 2));
    if (events) await writeFile(join(dir, 'events.json'), JSON.stringify(events));
  }
}

function describe(p: Project): string {
  return [p.url, ...p.sources.map((s) => `${s.name} (${s.role})`)].filter(Boolean).join(' + ');
}

function summarise(results?: Results): Partial<RunRecord> {
  if (!results) return {};
  const counts: Record<string, number> = {};
  for (const f of results.findings) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return { score: results.score, verdict: scoreVerdict(results.score), gate: results.gate, counts, summary: results.summary };
}
