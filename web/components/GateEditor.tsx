'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';

interface Condition {
  metric: string;
  op: 'lt' | 'gt';
  value: number;
}

/** The quality gate: conditions that fail it. Same idea as a SonarQube gate. */
export function GateEditor({ initial, metrics }: { initial: Condition[]; metrics: { id: string; label: string }[] }) {
  const router = useRouter();
  const [conditions, setConditions] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; problems?: string[] } | null>(null);
  const dirty = JSON.stringify(conditions) !== JSON.stringify(initial);

  const set = (i: number, patch: Partial<Condition>) => setConditions((all) => all.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api('/api/gate', { method: 'PUT', body: { conditions } });
      setMessage({ ok: true, text: 'Saved. Projects without their own gate use it from the next analysis.' });
      router.refresh();
    } catch (err) {
      const e = errorText(err);
      setMessage({ ok: false, text: e.message, problems: e.problems });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card" aria-labelledby="cond-title">
      <h2 id="cond-title" className="section-title">
        Fail the gate when…
      </h2>
      {conditions.length === 0 && <p className="help">No conditions: the gate always passes.</p>}
      <ol className="gate-rows">
        {conditions.map((c, i) => (
          <li key={i} className="field-row">
            <select aria-label={`Condition ${i + 1} metric`} value={c.metric} onChange={(e) => set(i, { metric: e.target.value })}>
              {metrics.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <select aria-label={`Condition ${i + 1} comparison`} value={c.op} onChange={(e) => set(i, { op: e.target.value as Condition['op'] })}>
              <option value="gt">is greater than</option>
              <option value="lt">is less than</option>
            </select>
            <input type="number" aria-label={`Condition ${i + 1} value`} value={c.value} onChange={(e) => set(i, { value: Number(e.target.value) })} />
            <button type="button" className="btn btn-quiet" onClick={() => setConditions((all) => all.filter((_, j) => j !== i))} aria-label={`Remove condition ${i + 1}`}>
              Remove
            </button>
          </li>
        ))}
      </ol>
      <p className="help small">Conditions on an area that didn't run (for example performance without a live URL) don't fail the gate.</p>
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
      <div className="form-actions">
        <button type="button" className="btn btn-quiet" onClick={() => setConditions((all) => [...all, { metric: 'high', op: 'gt', value: 0 }])}>
          Add condition
        </button>
        <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save gate'}
        </button>
      </div>
    </section>
  );
}
