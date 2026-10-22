'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { SEVERITY_ORDER } from '@/lib/format';

export interface RuleRow {
  id: string;
  title: string;
  category: string;
  pack: 'free' | 'pro';
  locked: boolean;
  defaultSeverity: string;
  enabled: boolean;
  severity: string;
  params: { name: string; description: string; default: unknown; value: unknown; min?: number; max?: number }[];
}

type RuleSetting = { enabled?: boolean; severity?: string; params?: Record<string, number | string | boolean> };

/** The quality profile: turn checks on or off, change severities and thresholds. */
export function RulesEditor({ rows }: { rows: RuleRow[] }) {
  const router = useRouter();
  const [state, setState] = useState(rows);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; problems?: string[] } | null>(null);
  const dirty = JSON.stringify(state) !== JSON.stringify(rows);

  const update = (id: string, patch: Partial<RuleRow>) => setState((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const setParam = (id: string, name: string, value: unknown) =>
    setState((all) => all.map((r) => (r.id === id ? { ...r, params: r.params.map((p) => (p.name === name ? { ...p, value } : p)) } : r)));

  const groups = useMemo(() => {
    const q = filter.toLowerCase();
    const map = new Map<string, RuleRow[]>();
    for (const r of state) {
      if (q && !`${r.id} ${r.title}`.toLowerCase().includes(q)) continue;
      map.set(r.category, [...(map.get(r.category) ?? []), r]);
    }
    return [...map.entries()];
  }, [state, filter]);

  const save = async () => {
    // Only what differs from each check's defaults goes in the file.
    const rules: Record<string, RuleSetting> = {};
    for (const r of state) {
      const s: RuleSetting = {};
      if (!r.enabled) s.enabled = false;
      if (r.severity !== r.defaultSeverity) s.severity = r.severity;
      const params = Object.fromEntries(r.params.filter((p) => p.value !== p.default).map((p) => [p.name, p.value as number]));
      if (Object.keys(params).length) s.params = params;
      if (Object.keys(s).length) rules[r.id] = s;
    }
    setBusy(true);
    setMessage(null);
    try {
      await api('/api/rules', { method: 'PUT', body: { rules } });
      setMessage({ ok: true, text: 'Saved to the config file. The next analysis uses these rules.' });
      router.refresh();
    } catch (err) {
      const e = errorText(err);
      setMessage({ ok: false, text: e.message, problems: e.problems });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card toolbar">
        <label className="grow">
          <span className="visually-hidden">Filter checks</span>
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter checks" />
        </label>
        <button type="button" className="btn" disabled={!dirty || busy} onClick={() => setState(rows)}>
          Undo changes
        </button>
        <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save rules'}
        </button>
      </div>
      {message && (
        <div className={message.ok ? 'notice' : 'error'} role={message.ok ? 'status' : 'alert'}>
          <p>{message.text}</p>
          {message.problems?.length ? (
            <ul>
              {message.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
      {groups.map(([category, list]) => (
        <section key={category} className="card rules" aria-labelledby={`cat-${category}`}>
          <h2 id={`cat-${category}`} className="section-title cap">
            {category}
          </h2>
          <ul className="rule-list">
            {list.map((r) => (
              <li key={r.id} className={`rule${r.enabled ? '' : ' off'}`}>
                <label className="switch">
                  <input type="checkbox" checked={r.enabled} disabled={r.locked} onChange={(e) => update(r.id, { enabled: e.target.checked })} />
                  <span className="visually-hidden">Enable {r.title}</span>
                </label>
                <div className="rule-main">
                  <p className="rule-title">
                    {r.title} {r.pack === 'pro' && <span className="tag">Pro{r.locked ? ' · needs a licensed pack' : ''}</span>}
                  </p>
                  <p className="mono help small">{r.id}</p>
                  {r.params.map((p) => (
                    <label key={p.name} className="param">
                      <span>{p.description}</span>
                      <input
                        type="number"
                        min={p.min}
                        max={p.max}
                        value={String(p.value)}
                        disabled={r.locked || !r.enabled}
                        onChange={(e) => setParam(r.id, p.name, e.target.value === '' ? p.default : Number(e.target.value))}
                      />
                    </label>
                  ))}
                </div>
                <label className="rule-sev">
                  <span className="visually-hidden">Severity of {r.title}</span>
                  <select value={r.severity} disabled={r.locked || !r.enabled} onChange={(e) => update(r.id, { severity: e.target.value })}>
                    {SEVERITY_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {s}
                        {s === r.defaultSeverity ? ' (default)' : ''}
                      </option>
                    ))}
                  </select>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
