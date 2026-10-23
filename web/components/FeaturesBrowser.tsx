'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { api, errorText } from '@/lib/api';
import type { Engine } from '@/lib/tea';
import { ScoreRing } from './Art';
import { Toast } from './Toast';

type Feature = Engine.Feature;
type Status = Engine.FeatureStatus;

export interface IssueRef {
  title: string;
  severity: string;
}

const STATUS: Record<Status, { label: string; help: string }> = {
  works: { label: 'Works', help: 'TEA tested it and everything passed.' },
  broken: { label: 'Broken', help: 'A page, call or form of it fails.' },
  partial: { label: 'Partly works', help: 'It works, with smaller issues, or the docs claim more than is built.' },
  missing: { label: 'Claimed but missing', help: 'The docs say it is built; the code says otherwise.' },
  'not-built-yet': { label: 'Not built yet', help: 'The docs say it is planned. That is fine.' },
  untested: { label: 'Not tested yet', help: 'Found in the code, but nothing ran against it yet.' },
};
const ORDER: Status[] = ['broken', 'missing', 'partial', 'works', 'untested', 'not-built-yet'];
const MARK = { pass: '✓', fail: '✕', skip: '–' } as const;
const KIND = { static: 'Code', live: 'Live', sandbox: 'Sandbox', docs: 'Docs' } as const;

const coverageTone = (n: number | null) => (n === null ? undefined : n >= 80 ? 'great' : n >= 60 ? 'good' : n >= 40 ? 'meh' : 'bad');

/** Every feature TEA found, its test plan and what happened. People can hide what isn't a feature. */
export function FeaturesBrowser(props: {
  projectKey: string;
  features: Feature[];
  hidden: string[];
  issues: Record<string, IssueRef>;
  docs: string[];
  sandbox: boolean;
  sandboxOn: boolean;
  tested: boolean;
}) {
  const [hidden, setHidden] = useState(props.hidden);
  const [status, setStatus] = useState<Status | ''>('');
  const [q, setQ] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const clearToast = useCallback(() => setToast(''), []);

  const visible = useMemo(() => props.features.filter((f) => !hidden.includes(f.key)), [props.features, hidden]);
  const counts = useMemo(() => Object.fromEntries(ORDER.map((s) => [s, visible.filter((f) => f.status === s).length])) as Record<Status, number>, [visible]);
  const exist = visible.length - counts['not-built-yet'];
  const coverage = props.tested && exist > 0 ? Math.round((counts.works / exist) * 100) : null;
  const shown = visible
    .filter((f) => (!status || f.status === status) && (!q || `${f.name} ${f.pages.join(' ')} ${f.endpoints.join(' ')}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const hiddenFeatures = props.features.filter((f) => hidden.includes(f.key));

  const saveHidden = async (next: string[], message: string) => {
    const before = hidden;
    setHidden(next);
    setError('');
    try {
      await api(`/api/projects/${props.projectKey}/features`, { method: 'PUT', body: { hide: next } });
      setToast(message);
    } catch (err) {
      setHidden(before);
      setError(errorText(err).message);
    }
  };

  const issueHref = (id: string) => `/projects/${props.projectKey}/issues?q=${encodeURIComponent(props.issues[id]?.title ?? id)}`;

  return (
    <div className="stack-l features-page">
      <section className="card feature-summary" aria-labelledby="fs-title">
        <div className="measure">
          <ScoreRing score={coverage} tone={coverageTone(coverage)} name="Feature coverage" unit="%" />
          <span>
            <span id="fs-title">Feature coverage</span>
            <br />
            <small>{coverage === null ? 'Give TEA a URL to test features live' : `${counts.works} of ${exist} features work`}</small>
          </span>
        </div>
        <ul className="status-filters" aria-label="Filter by status">
          <li>
            <button type="button" className="status-chip" aria-pressed={status === ''} onClick={() => setStatus('')}>
              <b>{visible.length}</b> All
            </button>
          </li>
          {ORDER.filter((s) => counts[s] > 0).map((s) => (
            <li key={s}>
              <button type="button" className={`status-chip st-${s}`} aria-pressed={status === s} onClick={() => setStatus(status === s ? '' : s)} title={STATUS[s].help}>
                <b>{counts[s]}</b> {STATUS[s].label}
              </button>
            </li>
          ))}
        </ul>
        <p className="help small">
          {props.docs.length ? (
            <>
              Claims checked from <span className="mono">{props.docs.join(', ')}</span>.{' '}
            </>
          ) : (
            'No agent docs found (CLAUDE.md, AGENTS.md, .cursorrules, README, TODO): add one and TEA checks what it claims. '
          )}
          {props.sandbox ? (
            'Sandbox tests ran: forms were submitted with test data.'
          ) : (
            <>
              Forms weren&apos;t submitted.{' '}
              {props.sandboxOn ? 'Sandbox tests are on: they run in the next analysis.' : <Link href={`/projects/${props.projectKey}/settings`}>Turn on sandbox tests</Link>}{' '}
              {props.sandboxOn ? '' : 'to test them (local apps only).'}
            </>
          )}
        </p>
      </section>

      <form className="card filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <label className="grow">
          Find a feature
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="checkout, /api/orders…" />
        </label>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="help">No features match.</p>
      ) : (
        <ul className="feature-list">
          {shown.map((f) => {
            const ran = f.checks.filter((c) => c.result !== 'skip');
            const passed = ran.filter((c) => c.result === 'pass').length;
            return (
              <li key={f.key}>
                <details className={`feature-card st-${f.status}`}>
                  <summary>
                    <span className={`feature-status st-${f.status}`}>{STATUS[f.status].label}</span>
                    <span className="feature-name">{f.name}</span>
                    {f.origin === 'docs' ? <span className="tag">Only in the docs</span> : f.claims.length === 0 && props.docs.length ? <span className="tag">Not in your docs</span> : null}
                    <span className="feature-count">
                      {ran.length ? `${passed}/${ran.length} checks passed` : `${f.checks.length} checks planned`}
                    </span>
                  </summary>
                  <div className="feature-body">
                    <dl className="feature-made">
                      {f.pages.length > 0 && <Made term="Pages" items={f.pages} />}
                      {f.endpoints.length > 0 && <Made term="API" items={f.endpoints} />}
                      {f.calls.length > 0 && <Made term="Calls" items={f.calls} />}
                      {f.models.length > 0 && <Made term="Data" items={f.models} />}
                      {f.integrations.length > 0 && <Made term="Uses" items={f.integrations} />}
                    </dl>
                    {f.checks.length > 0 && (
                      <ol className="plan" aria-label={`Test plan for ${f.name}`}>
                        {f.checks.map((c) => (
                          <li key={c.id} className={`plan-step r-${c.result}`}>
                            <span className="plan-mark" aria-label={c.result === 'pass' ? 'Passed' : c.result === 'fail' ? 'Failed' : 'Not run'}>
                              {MARK[c.result]}
                            </span>
                            <div>
                              <p className="plan-gwt">
                                <span className="tag">{KIND[c.kind]}</span> {c.given && <><b>Given</b> {c.given}, </>}
                                <b>when</b> {c.when}, <b>then</b> {c.then}.
                              </p>
                              {c.detail && <p className="plan-detail">{c.detail}</p>}
                              {c.findings && c.findings.length > 0 && (
                                <p className="plan-issues">
                                  {c.findings.map((id) => (
                                    <Link key={id} href={issueHref(id)} className="link">
                                      {props.issues[id]?.title ?? id}
                                    </Link>
                                  ))}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                    <div className="feature-actions">
                      <button type="button" className="btn btn-small btn-quiet" onClick={() => saveHidden([...hidden, f.key], `Hid “${f.name}”. It won't be counted.`)}>
                        Not a feature: hide it
                      </button>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}

      {hiddenFeatures.length > 0 && (
        <details className="card hidden-features">
          <summary>Hidden ({hiddenFeatures.length})</summary>
          <ul>
            {hiddenFeatures.map((f) => (
              <li key={f.key}>
                <span>{f.name}</span>
                <button type="button" className="btn btn-small" onClick={() => saveHidden(hidden.filter((k) => k !== f.key), `“${f.name}” is back.`)}>
                  Show again
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {toast && <Toast message={toast} onDone={clearToast} />}
    </div>
  );
}

function Made({ term, items }: { term: string; items: string[] }) {
  return (
    <div>
      <dt>{term}</dt>
      <dd>
        {items.map((i) => (
          <code key={i}>{i}</code>
        ))}
      </dd>
    </div>
  );
}
