'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { api, errorText } from '@/lib/api';
import { Toast } from './Toast';

/** Edit tea.config.yaml as text: download it, import one, or start over. The server validates before writing. */
export function ConfigEditor({ initial, defaultText, fileName }: { initial: string; defaultText: string; fileName: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState<{ message: string; problems: string[] } | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const dirty = text !== saved;

  const save = async (value = text, message = 'Saved.') => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/config', { method: 'PUT', body: { text: value } });
      setSaved(value);
      setText(value);
      setToast(message);
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/yaml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 60_000) return setError({ message: 'That file is too big for a TEA config.', problems: [] });
    setText(await file.text());
    setToast(`Loaded ${file.name}. Check it, then press Save.`);
  };

  return (
    <section className="card">
      <div className="toolbar config-toolbar">
        <button type="button" className="btn" onClick={download}>
          ⬇ Download
        </button>
        <button type="button" className="btn" onClick={() => picker.current?.click()}>
          ⬆ Import a file…
        </button>
        <input ref={picker} type="file" accept=".yaml,.yml,text/yaml" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
        <button
          type="button"
          className="btn btn-quiet btn-danger"
          disabled={busy}
          onClick={() => window.confirm('Replace the whole config file with the defaults? Your projects, rules and gate will be removed.') && void save(defaultText, 'Reset to defaults.')}
        >
          Reset to defaults
        </button>
      </div>
      <label htmlFor="config-text" className="visually-hidden">
        Config file
      </label>
      <textarea id="config-text" className="config-text" spellCheck={false} rows={28} value={text} onChange={(e) => setText(e.target.value)} />
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
      <div className="form-actions">
        <button type="button" className="btn" disabled={!dirty || busy} onClick={() => setText(saved)}>
          Undo changes
        </button>
        <button type="button" className="btn btn-primary" disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save file'}
        </button>
      </div>
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </section>
  );
}
