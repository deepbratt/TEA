'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { FolderPicker } from './FolderPicker';

type Role = 'auto' | 'frontend' | 'backend' | 'fullstack';
interface Source {
  name: string;
  path: string;
  role: Role;
  /** What TEA found in the folder (shown, not saved). */
  found?: { role: Exclude<Role, 'auto'>; stack: string[] };
}
export interface ProjectValues {
  key?: string;
  name: string;
  url?: string;
  sources: Source[];
  maxPages?: number;
  skip?: string[];
  sandbox?: boolean;
}
interface Detected {
  name: string;
  sources: { name: string; path: string; role: Exclude<Role, 'auto'>; stack: string[] }[];
  urls: { url: string; reachable: boolean; source: string }[];
}

const ROLE_HELP: Record<Role, string> = {
  auto: 'TEA decides from the code',
  fullstack: 'Pages and API in one app (Next.js, Rails, Django, Laravel…)',
  frontend: 'Only the UI: TEA reads the API calls it makes',
  backend: 'Only the API: TEA reads the endpoints it serves',
};

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).pop()?.replace(/[^A-Za-z0-9._-]/g, '-') ?? '';
const detect = (path: string) => api<Detected>(`/api/detect?path=${encodeURIComponent(path)}`);

/** Create or edit a project. Saving rewrites the projects section of tea.config.yaml. */
export function ProjectForm({ initial }: { initial?: ProjectValues }) {
  const router = useRouter();
  const editing = Boolean(initial?.key);
  const [name, setName] = useState(initial?.name ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [sources, setSources] = useState<Source[]>(initial?.sources ?? []);
  const [maxPages, setMaxPages] = useState(initial?.maxPages ? String(initial.maxPages) : '');
  const [skip, setSkip] = useState((initial?.skip ?? []).join('\n'));
  const [sandbox, setSandbox] = useState(Boolean(initial?.sandbox));
  const [picking, setPicking] = useState<number | 'project' | null>(null);
  const [urls, setUrls] = useState<Detected['urls']>([]);
  const [detecting, setDetecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; problems: string[] } | null>(null);

  const setSource = (i: number, patch: Partial<Source>) => setSources((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  /** Fill the whole project from one folder: its apps, their roles and where it runs. */
  const detectProject = async (path: string) => {
    setDetecting(true);
    setError(null);
    try {
      const d = await detect(path);
      setSources(d.sources.map((s) => ({ name: s.name, path: s.path, role: 'auto', found: { role: s.role, stack: s.stack } })));
      setName((n) => n || d.name);
      setUrls(d.urls);
      const live = d.urls.find((u) => u.reachable);
      if (live) setUrl((u) => u || live.url);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setDetecting(false);
    }
  };

  /** One folder: show what TEA finds in it. */
  const detectSource = async (i: number, path: string) => {
    try {
      const d = await detect(path);
      const s = d.sources.length === 1 ? d.sources[0] : undefined;
      if (s) setSource(i, { found: { role: s.role, stack: s.stack } });
      if (!url && d.urls.length) setUrls(d.urls);
    } catch {
      /* the path is checked again on save */
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      name,
      url,
      sources: sources.filter((s) => s.path.trim()).map((s) => ({ name: s.name.trim() || folderName(s.path), path: s.path, role: s.role })),
      maxPages,
      skip: skip.split('\n'),
      sandbox,
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
      {!editing && (
        <div className="detect">
          <div>
            <p className="detect-title">Start from your app&apos;s folder</p>
            <p className="help">TEA finds the apps inside it (a monorepo&apos;s frontend and backend too), their languages and frameworks, and where the app runs.</p>
          </div>
          <button type="button" className="btn btn-primary" onClick={() => setPicking('project')} disabled={detecting}>
            {detecting ? 'Detecting…' : 'Choose folder and detect'}
          </button>
        </div>
      )}

      <label htmlFor="p-name">Project name</label>
      <input id="p-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="My shop" />

      <fieldset>
        <legend>Code folders</legend>
        <p className="help">
          Every part of the app, in any language. With a separate frontend and backend, TEA checks that every API call the frontend makes has a matching
          endpoint in the backend.
        </p>
        {sources.length > 0 && (
          <ol className="sources">
            {sources.map((s, i) => (
              <li key={i} className="source">
                <div className="field-row">
                  <input
                    type="text"
                    aria-label={`Folder ${i + 1} path`}
                    value={s.path}
                    onChange={(e) => setSource(i, { path: e.target.value, found: undefined })}
                    onBlur={(e) => e.target.value.trim() && !s.found && void detectSource(i, e.target.value.trim())}
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
                    <option value="auto">Auto-detect{s.found ? ` (${s.found.role})` : ''}</option>
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
                {s.found?.stack.length ? (
                  <ul className="stack-chips" aria-label={`Detected in folder ${i + 1}`}>
                    {s.found.stack.slice(0, 8).map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="help small">{ROLE_HELP[s.role]}</p>
                )}
              </li>
            ))}
          </ol>
        )}
        {sources.length < 10 && (
          <button type="button" className="btn btn-quiet" onClick={() => setSources((all) => [...all, { name: '', path: '', role: 'auto' }])}>
            {sources.length ? 'Add another folder' : 'Add a folder by hand'}
          </button>
        )}
      </fieldset>

      <label htmlFor="p-url">
        Live URL <span className="optional">optional</span>
      </label>
      <input id="p-url" type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="http://localhost:3000" />
      {urls.length > 0 && (
        <div className="suggest" aria-label="Suggested URLs">
          {urls.map((u) => (
            <button key={u.url} type="button" className="chip" onClick={() => setUrl(u.url)} aria-pressed={url === u.url}>
              {u.url} <small>{u.reachable ? '· running now' : `· ${u.source}, not running`}</small>
            </button>
          ))}
        </div>
      )}
      <p className="help">
        Where the app runs, so TEA can click through it. Start your app as usual, then pick its address. Only test apps you own or are allowed to test. Without
        a URL, TEA reads the code only.
      </p>

      <details className="options">
        <summary>More options</summary>
        <label htmlFor="p-max">Pages to visit at most</label>
        <input id="p-max" type="number" min={1} max={500} value={maxPages} onChange={(e) => setMaxPages(e.target.value)} placeholder="50" />
        <label htmlFor="p-skip">Paths to never visit (one per line)</label>
        <textarea id="p-skip" rows={3} value={skip} onChange={(e) => setSkip(e.target.value)} placeholder={'/admin\n/logout'} />
        <label className="check-row sandbox-row">
          <input type="checkbox" className="switch" checked={sandbox} onChange={(e) => setSandbox(e.target.checked)} />
          <span>
            <b>Sandbox tests</b>: submit each form with made-up test data and call the API without signing in
          </span>
        </label>
        <p className="help small">
          This writes test data, so it only works when the URL is on this computer (localhost). Use test keys in your app (Stripe test mode and so on). TEA never
          fills in card, bank or file fields, and never presses delete, cancel or sign out.
        </p>
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
          start={typeof picking === 'number' ? sources[picking]?.path : undefined}
          onPick={(path) => {
            if (picking === 'project') return void detectProject(path);
            setSource(picking, { path, name: sources[picking]?.name || folderName(path), found: undefined });
            void detectSource(picking, path);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </form>
  );
}
