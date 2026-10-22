'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { SEVERITY_ORDER } from '@/lib/format';
import { CATEGORY_NAMES, RULE_PRESETS, SEVERITY_WORDS } from '@/lib/presets';
import { Toast } from './Toast';

export interface RuleRow {
  id: string;
  title: string;
  description: string;
  category: string;
  planned: boolean;
  defaultSeverity: string;
  enabled: boolean;
  severity: string;
  params: { name: string; description: string; default: unknown; value: unknown; min?: number; max?: number }[];
}

type RuleSetting = { enabled?: boolean; severity?: string; params?: Record<string, number | string | boolean> };

/** Every check back on its defaults. */
const defaults = (rows: RuleRow[]) => rows.map((r) => ({ ...r, enabled: true, severity: r.defaultSeverity, params: r.params.map((p) => ({ ...p, value: p.default })) }));

/** The quality profile: turn checks on or off, change how serious they are, tune thresholds. */
export function RulesEditor({ rows }: { rows: RuleRow[] }) {
  const router = useRouter();
  const [saved, setSaved] = useState(rows);
  const [state, setState] = useState(rows);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState<{ message: string; problems: string[] } | null>(null);
  const dirty = JSON.stringify(state) !== JSON.stringify(saved);

  const update = (id: string, patch: Partial<RuleRow>) => setState((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const setParam = (id: string, name: string, value: unknown) =>
    setState((all) => all.map((r) => (r.id === id ? { ...r, params: r.params.map((p) => (p.name === name ? { ...p, value } : p)) } : r)));

  const applyPreset = (id: string) => {
    const preset = RULE_PRESETS.find((p) => p.id === id)!;
    setState(
      defaults(state).map((r) => {
        const o = preset.value[r.id];
        if (!o) return r;
        return {
          ...r,
          enabled: o.enabled ?? true,
          severity: o.severity ?? r.severity,
          params: r.params.map((p) => (o.params?.[p.name] !== undefined ? { ...p, value: o.params[p.name] } : p)),
        };
      }),
    );
  };
  const activePreset = RULE_PRESETS.find((p) => {
    const expected = defaults(state).map((r) => {
      const o = p.value[r.id];
      return { id: r.id, enabled: o?.enabled ?? true, severity: o?.severity ?? r.defaultSeverity, params: r.params.map((x) => o?.params?.[x.name] ?? x.default) };
    });
    const now = state.map((r) => ({ id: r.id, enabled: r.enabled, severity: r.severity, params: r.params.map((x) => x.value) }));
    return JSON.stringify(expected) === JSON.stringify(now);
  })?.id;

  const groups = useMemo(() => {
    const q = filter.toLowerCase();
    const map = new Map<string, RuleRow[]>();
    for (const r of state) {
      if (q && !`${r.id} ${r.title} ${r.description}`.toLowerCase().includes(q)) continue;
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
    setError(null);
    try {
      await api('/api/rules', { method: 'PUT', body: { rules } });
      setSaved(state);
      setToast('Saved to the config file. The next analysis uses these rules.');
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="card" aria-labelledby="presets-title">
        <h2 id="presets-title" className="section-title">
          Quick setup
        </h2>
        <p className="help">Pick how picky TEA should be. You can still change any check below.</p>
        <div className="preset-grid" role="radiogroup" aria-label="Rule presets">
          {RULE_PRESETS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={activePreset === p.id} className="preset" onClick={() => applyPreset(p.id)}>
              <span className="preset-emoji" aria-hidden="true">
                {p.emoji}
              </span>
              <span className="preset-name">{p.name}</span>
              <span className="preset-desc">{p.description}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="card toolbar sticky-bar">
        <label className="grow">
          <span className="visually-hidden">Filter checks</span>
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a check, e.g. slow, links, API" />
        </label>
        <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => setState(defaults(state))}>
          Reset all to defaults
        </button>
        <button type="button" className="btn" disabled={!dirty || busy} onClick={() => setState(saved)}>
          Undo changes
        </button>
        <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>
          {busy ? 'Saving…' : dirty ? 'Save rules' : 'Saved'}
        </button>
      </div>
      {error && (
        <div className="error" role="alert">
          <p>{error.message}</p>
          {error.problems.length ? (
            <ul>
              {error.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {groups.map(([category, list]) => {
        const meta = CATEGORY_NAMES[category] ?? { name: category, emoji: '•' };
        const allOn = list.every((r) => r.enabled);
        return (
          <section key={category} className="card rules" aria-labelledby={`cat-${category}`}>
            <div className="rules-head">
              <h2 id={`cat-${category}`} className="section-title">
                <span aria-hidden="true">{meta.emoji}</span> {meta.name} <span className="count">{list.filter((r) => r.enabled).length}/{list.length} on</span>
              </h2>
              <label className="switch-label">
                <input
                  type="checkbox"
                  className="switch"
                  checked={allOn}
                  onChange={(e) => setState((all) => all.map((r) => (r.category === category ? { ...r, enabled: e.target.checked } : r)))}
                />
                <span>All {meta.name.toLowerCase()} checks</span>
              </label>
            </div>
            <ul className="rule-list">
              {list.map((r) => (
                <li key={r.id} className={`rule${r.enabled ? '' : ' off'}`}>
                  <input
                    type="checkbox"
                    className="switch"
                    checked={r.enabled}
                    onChange={(e) => update(r.id, { enabled: e.target.checked })}
                    aria-label={`Check: ${r.title}`}
                  />
                  <div className="rule-main">
                    <p className="rule-title">
                      {r.title} {r.planned && <span className="tag tag-soon">Coming soon</span>}
                    </p>
                    <p className="rule-desc">{r.description}</p>
                    <p className="mono help small">{r.id}</p>
                    {r.params.map((p) => (
                      <label key={p.name} className="param">
                        <span>{p.description}</span>
                        <input
                          type="number"
                          min={p.min}
                          max={p.max}
                          value={String(p.value)}
                          disabled={!r.enabled}
                          onChange={(e) => setParam(r.id, p.name, e.target.value === '' ? p.default : Number(e.target.value))}
                        />
                      </label>
                    ))}
                  </div>
                  <label className="rule-sev">
                    <span className="sev-label">How serious</span>
                    <select value={r.severity} disabled={!r.enabled} onChange={(e) => update(r.id, { severity: e.target.value })} aria-label={`How serious: ${r.title}`}>
                      {SEVERITY_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {SEVERITY_WORDS[s]}
                          {s === r.defaultSeverity ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </>
  );
}
