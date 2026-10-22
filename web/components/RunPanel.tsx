'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { demoData } from '@/lib/demo';
import { DEMO } from '@/lib/mode';
import { BrewCup } from './Art';

interface LogEvent {
  kind: string;
  message: string;
  at: string;
}

/** Start an analysis and follow its log live (server-sent events). Refreshes the page when done. */
export function RunPanel({ projectKey, runningId, busyElsewhere }: { projectKey: string; runningId?: string; busyElsewhere?: boolean }) {
  const router = useRouter();
  const [runId, setRunId] = useState(runningId);
  const [log, setLog] = useState<LogEvent[]>([]);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const logEnd = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (!runId) return;
    setLog([]);
    if (DEMO) {
      // The website demo replays the recorded analysis; the page already shows its results.
      let cancelled = false;
      void demoData().then(async ({ events }) => {
        for (const e of events) {
          if (cancelled) return;
          setLog((all) => [...all, e]);
          await new Promise((r) => setTimeout(r, e.kind === 'step' ? 700 : 120));
        }
        if (!cancelled) setRunId(undefined);
      });
      return () => {
        cancelled = true;
      };
    }
    const source = new EventSource(`/api/projects/${projectKey}/runs/${runId}/events`);
    source.addEventListener('log', (e) => setLog((all) => [...all, JSON.parse((e as MessageEvent<string>).data) as LogEvent]));
    source.addEventListener('done', () => {
      source.close();
      setRunId(undefined);
      router.refresh();
    });
    source.onerror = () => {
      source.close();
      setRunId(undefined);
      router.refresh();
    };
    return () => source.close();
  }, [runId, projectKey, router]);

  useEffect(() => {
    logEnd.current?.scrollIntoView({ block: 'nearest' });
  }, [log.length]);

  const start = async () => {
    setError('');
    setStarting(true);
    try {
      const { run } = await api<{ run: { id: string } }>(`/api/projects/${projectKey}/runs`, { method: 'POST' });
      setRunId(run.id);
    } catch (err) {
      setError(errorText(err).message);
    } finally {
      setStarting(false);
    }
  };

  const steps = log.filter((e) => e.kind === 'step');
  const current = steps.at(-1)?.message;

  return (
    <section className="card run-panel" aria-labelledby="run-title">
      <div className="run-head">
        <h2 id="run-title" className="section-title">
          Analysis
        </h2>
        <button type="button" className="btn btn-primary" onClick={start} disabled={Boolean(runId) || starting || busyElsewhere}>
          {runId ? 'Analysing…' : starting ? 'Starting…' : 'Run analysis'}
        </button>
      </div>
      {busyElsewhere && !runId && <p className="help">Another project is being analysed. TEA runs one analysis at a time.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {runId && (
        <>
          <div className="brewing-row">
            <BrewCup size={56} level={60} brewing />
            <p className="status running" role="status" aria-live="polite">
              {current ?? 'Starting…'}
            </p>
          </div>
          <div className="progress" aria-hidden="true" />
        </>
      )}
      {log.length > 0 && (
        <details className="log-box" open={Boolean(runId)}>
          <summary>Log ({log.length} lines)</summary>
          <ol className="log">
            {log.map((e, i) => (
              <li key={i} className={e.kind}>
                {e.message}
              </li>
            ))}
            <li ref={logEnd} aria-hidden="true" />
          </ol>
        </details>
      )}
    </section>
  );
}
