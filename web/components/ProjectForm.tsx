'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { FolderPicker } from './FolderPicker';

type Role = 'frontend' | 'backend' | 'fullstack';
interface Source {
  name: string;
  path: string;
  role: Role;
}
export interface ProjectValues {
  key?: string;
  name: string;
  url?: string;
  sources: Source[];
  maxPages?: number;
  skip?: string[];
}

const ROLE_HELP: Record<Role, string> = {
  fullstack: 'Pages and API in one app (Next.js, Remix, SvelteKit…)',
  frontend: 'Only the UI: TEA reads the API calls it makes',
  backend: 'Only the API: TEA reads the endpoints it serves',
};

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop()?.replace(/[^A-Za-z0-9._-]/g, '-') ?? '';

/** Create or edit a project. Saving rewrites the projects section of tea.config.yaml. */
export function ProjectForm({ initial }: { initial?: ProjectValues }) {
  const router = useRouter();
  const editing = Boolean(initial?.key);
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [sources, setSources] = useState<Source[]>(initial?.sources ?? [{ name: '', path: '', role: 'fullstack' }]);
  const [maxPages, setMaxPages] = useState(initial?.maxPages ? String(initial.maxPages) : '');
  const [skip, setSkip] = useState((initial?.skip ?? []).join('\n'));
  const [picking, setPicking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; problems: string[] } | null>(null);

  const setSource = (i: number, patch: Partial<Source>) => setSources((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name,
      url,
      sources: sources.filter((s) => s.path.trim()).map((s) => ({ ...s, name: s.name.trim() || folderName(s.path) })),
      maxPages,
      skip: skip.split('\n'),
    };
    try {
      const { key } = editing
        ? await api<{ key: string }>(`/api/projects/${initial!.key}`, { method: 'PUT', body })
        : await api<{ key: string }>('/api/projects', { method: 'POST', body });
      router.push(`/projects/${key}`);
      router.refresh();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit} noValidate>
      <label htmlFor="p-name">Project name</label>
      <input id="p-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="My shop" />

      <fieldset>
        <legend>Code folders</legend>
        <p className="help">
          Add each part of the app. A separate frontend and backend? Add both, and TEA checks that every API call the frontend makes has a matching
          endpoint in the backend.
        </p>
        <ol className="sources">
          {sources.map((s, i) => (
            <li key={i} className="source">
              <div className="field-row">
                <input
                  type="text"
                  aria-label={`Folder ${i + 1} path`}
                  value={s.path}
                  onChange={(e) => setSource(i, { path: e.target.value })}
                  placeholder={'C:\\code\\my-app or ../my-app'}
                />
                <button type="button" className="btn" onClick={() => setPicking(i)}>
                  Browse…
                </button>
              </div>
              <div className="field-row">
                <input
                  type="text"
                  aria-label={`Folder ${i + 1} name`}
                  value={s.name}
                  onChange={(e) => setSource(i, { name: e.target.value })}
                  placeholder={folderName(s.path) || 'name, e.g. web or api'}
                />
                <select aria-label={`Folder ${i + 1} role`} value={s.role} onChange={(e) => setSource(i, { role: e.target.value as Role })}>
                  <option value="fullstack">Fullstack</option>
                  <option value="frontend">Frontend</option>
                  <option value="backend">Backend</option>
                </select>
                <button
                  type="button"
                  className="btn btn-quiet"
                  aria-label={`Remove folder ${i + 1}`}
                  onClick={() => setSources((all) => all.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </div>
              <p className="help small">{ROLE_HELP[s.role]}</p>
            </li>
          ))}
        </ol>
        {sources.length < 10 && (
          <button type="button" className="btn btn-quiet" onClick={() => setSources((all) => [...all, { name: '', path: '', role: all.length ? 'backend' : 'fullstack' }])}>
            Add another folder
          </button>
        )}
      </fieldset>

      <label htmlFor="p-url">
        Live URL <span className="optional">optional</span>
      </label>
      <input id="p-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:3000" />
      <p className="help">Where the app runs, so TEA can click through it. Only test apps you own or are allowed to test. Without a URL, TEA reads the code only.</p>

      <details className="options">
        <summary>More options</summary>
        <label htmlFor="p-max">Pages to visit at most</label>
        <input id="p-max" type="number" min={1} max={500} value={maxPages} onChange={(e) => setMaxPages(e.target.value)} placeholder="50" />
        <label htmlFor="p-skip">Paths to never visit (one per line)</label>
        <textarea id="p-skip" rows={3} value={skip} onChange={(e) => setSkip(e.target.value)} placeholder={'/admin\n/logout'} />
      </details>

      {error && (
        <div className="error" role="alert">
          <p>{error.message}</p>
          {error.problems.length > 0 && (
            <ul>
              {error.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Create project'}
        </button>
      </div>

      {picking !== null && (
        <FolderPicker
          start={sources[picking]?.path}
          onPick={(path) => setSource(picking, { path, name: sources[picking]?.name || folderName(path) })}
          onClose={() => setPicking(null)}
        />
      )}
    </form>
  );
}
