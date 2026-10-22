'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';

/** Edit tea.config.yaml as text. The server validates it before writing. */
export function ConfigEditor({ initial }: { initial: string }) {
  const router = useRouter();
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string; problems?: string[] } | null>(null);
  const dirty = text !== initial;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await api('/api/config', { method: 'PUT', body: { text } });
      setMessage({ ok: true, text: 'Saved.' });
      router.refresh();
    } catch (err) {
      const e = errorText(err);
      setMessage({ ok: false, text: e.message, problems: e.problems });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <label htmlFor="config-text" className="visually-hidden">
        Config file
      </label>
      <textarea id="config-text" className="config-text" spellCheck={false} rows={28} value={text} onChange={(e) => setText(e.target.value)} />
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
        <button type="button" className="btn" disabled={!dirty || busy} onClick={() => setText(initial)}>
          Undo changes
        </button>
        <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={save}>
          {busy ? 'Saving…' : 'Save file'}
        </button>
      </div>
    </section>
  );
}
