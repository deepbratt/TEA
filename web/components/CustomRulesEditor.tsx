'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, errorText } from '@/lib/api';
import { SEVERITY_ORDER } from '@/lib/format';
import { SEVERITY_WORDS } from '@/lib/presets';
import { EmptyArt } from './Art';
import { Toast } from './Toast';

type RuleType = 'forbid-text' | 'require-text' | 'require-file' | 'require-route';
export interface CustomRule {
  id: string;
  title: string;
  description?: string;
  type: RuleType;
  severity: string;
  enabled: boolean;
  text?: string;
  regex?: boolean;
  files?: string;
  path?: string;
}

const TYPES: Record<RuleType, { emoji: string; label: string; help: string }> = {
  'forbid-text': { emoji: '🚫', label: 'The code must NOT contain…', help: 'Flags every file that contains the text, e.g. console.log( or a test key.' },
  'require-text': { emoji: '✅', label: 'The code MUST contain…', help: 'Flags the project when the text appears nowhere, e.g. a cookie banner.' },
  'require-file': { emoji: '📄', label: 'A file must exist', help: 'Flags the project when no file matches, e.g. .env.example or README*.' },
  'require-route': { emoji: '🧭', label: 'A page or endpoint must exist', help: 'Flags the project when the app has no such page, e.g. /privacy.' },
};

const blank = (): CustomRule => ({ id: '', title: '', type: 'forbid-text', severity: 'medium', enabled: true });
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'my-rule';

/** One line saying what a rule does, in plain words. */
function explain(r: CustomRule): string {
  switch (r.type) {
    case 'forbid-text':
      return `Code must not contain "${r.text}"${r.files ? ` (in ${r.files})` : ''}`;
    case 'require-text':
      return `Code must contain "${r.text}"${r.files ? ` (in ${r.files})` : ''}`;
    case 'require-file':
      return `A file matching ${r.files} must exist`;
    case 'require-route':
      return `The app must have ${r.path}`;
  }
}

/** Your own rules: add from a template or write one, switch on or off, edit, remove. */
export function CustomRulesEditor({ initial, templates }: { initial: CustomRule[]; templates: Omit<CustomRule, 'enabled'>[] }) {
  const router = useRouter();
  const [rules, setRules] = useState(initial);
  const [editing, setEditing] = useState<{ index: number | null; rule: CustomRule } | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState<{ message: string; problems: string[] } | null>(null);

  const persist = async (next: CustomRule[], message: string) => {
    setBusy(true);
    setError(null);
    try {
      await api('/api/custom-rules', { method: 'PUT', body: { rules: next } });
      setRules(next);
      setEditing(null);
      setToast(message);
      router.refresh();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const uniqueId = (base: string, except?: number) => {
    let id = slug(base);
    for (let n = 2; rules.some((r, i) => r.id === id && i !== except); n++) id = `${slug(base)}-${n}`;
    return id;
  };

  const addTemplate = (t: Omit<CustomRule, 'enabled'>) => void persist([...rules, { ...t, id: uniqueId(t.id), enabled: true }], `Added "${t.title}".`);
  const unusedTemplates = templates.filter((t) => !rules.some((r) => r.id === t.id || r.title === t.title));

  const saveEditing = () => {
    if (!editing) return;
    const r = { ...editing.rule, id: editing.rule.id || uniqueId(editing.rule.title, editing.index ?? undefined) };
    // Drop fields that don't belong to the chosen type, so the config file stays tidy.
    const clean: CustomRule = { id: r.id, title: r.title.trim(), type: r.type, severity: r.severity, enabled: r.enabled, ...(r.description ? { description: r.description } : {}) };
    if (r.type === 'forbid-text' || r.type === 'require-text') Object.assign(clean, { text: r.text, ...(r.regex ? { regex: true } : {}), ...(r.files ? { files: r.files } : {}) });
    if (r.type === 'require-file') clean.files = r.files;
    if (r.type === 'require-route') clean.path = r.path;
    const next = editing.index === null ? [...rules, clean] : rules.map((x, i) => (i === editing.index ? clean : x));
    void persist(next, editing.index === null ? `Added "${clean.title}".` : `Saved "${clean.title}".`);
  };

  const field = (patch: Partial<CustomRule>) => setEditing((e) => (e ? { ...e, rule: { ...e.rule, ...patch } } : e));

  return (
    <section className="card" aria-labelledby="custom-title">
      <div className="rules-head">
        <h2 id="custom-title" className="section-title">
          <span aria-hidden="true">🧩</span> Your own rules
        </h2>
        <button type="button" className="btn btn-primary" onClick={() => setEditing({ index: null, rule: blank() })} disabled={busy}>
          Write a rule
        </button>
      </div>
      <p className="help">Add checks that matter to you, no code needed. They&apos;re saved in the config file and run in every analysis.</p>

      {rules.length === 0 && !editing && (
        <div className="empty small-empty">
          <EmptyArt kind="rules" />
          <p className="help">No rules of your own yet. Start from one of the ideas below, or write your own.</p>
        </div>
      )}

      {rules.length > 0 && (
        <ul className="rule-list">
          {rules.map((r, i) => (
            <li key={r.id} className={`rule${r.enabled ? '' : ' off'}`}>
              <input
                type="checkbox"
                className="switch"
                checked={r.enabled}
                aria-label={`Your rule: ${r.title}`}
                onChange={(e) => void persist(rules.map((x, j) => (j === i ? { ...x, enabled: e.target.checked } : x)), e.target.checked ? `Turned on "${r.title}".` : `Turned off "${r.title}".`)}
              />
              <div className="rule-main">
                <p className="rule-title">
                  <span aria-hidden="true">{TYPES[r.type].emoji}</span> {r.title} <span className={`tag sev-tag sev-${r.severity}`}>{SEVERITY_WORDS[r.severity]}</span>
                </p>
                <p className="rule-desc">{explain(r)}</p>
              </div>
              <div className="rule-actions">
                <button type="button" className="btn btn-small" onClick={() => setEditing({ index: i, rule: { ...r } })}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  aria-label={`Remove ${r.title}`}
                  onClick={() => void persist(rules.filter((_, j) => j !== i), `Removed "${r.title}".`)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="rule-builder" role="group" aria-label={editing.index === null ? 'New rule' : 'Edit rule'}>
          <p className="builder-step">1. What should TEA check?</p>
          <div className="type-grid" role="radiogroup" aria-label="Rule type">
            {(Object.keys(TYPES) as RuleType[]).map((t) => (
              <button key={t} type="button" role="radio" aria-checked={editing.rule.type === t} className="preset" onClick={() => field({ type: t })}>
                <span className="preset-emoji" aria-hidden="true">
                  {TYPES[t].emoji}
                </span>
                <span className="preset-name">{TYPES[t].label}</span>
                <span className="preset-desc">{TYPES[t].help}</span>
              </button>
            ))}
          </div>

          <p className="builder-step">2. The details</p>
          {(editing.rule.type === 'forbid-text' || editing.rule.type === 'require-text') && (
            <>
              <label htmlFor="cr-text">Text to look for</label>
              <input id="cr-text" type="text" value={editing.rule.text ?? ''} onChange={(e) => field({ text: e.target.value })} placeholder="console.log(" />
              <label className="check-row">
                <input type="checkbox" checked={Boolean(editing.rule.regex)} onChange={(e) => field({ regex: e.target.checked })} /> It&apos;s a pattern (regular expression)
              </label>
              <label htmlFor="cr-files">
                Only in these files <span className="optional">optional</span>
              </label>
              <input id="cr-files" type="text" value={editing.rule.files ?? ''} onChange={(e) => field({ files: e.target.value || undefined })} placeholder="src/**/*.ts  (empty: all code)" />
            </>
          )}
          {editing.rule.type === 'require-file' && (
            <>
              <label htmlFor="cr-file">File name or pattern</label>
              <input id="cr-file" type="text" value={editing.rule.files ?? ''} onChange={(e) => field({ files: e.target.value })} placeholder=".env.example  or  README*" />
            </>
          )}
          {editing.rule.type === 'require-route' && (
            <>
              <label htmlFor="cr-path">Page or endpoint path</label>
              <input id="cr-path" type="text" value={editing.rule.path ?? ''} onChange={(e) => field({ path: e.target.value })} placeholder="/privacy" />
            </>
          )}

          <p className="builder-step">3. Name it</p>
          <div className="field-row">
            <input aria-label="Rule name" type="text" value={editing.rule.title} onChange={(e) => field({ title: e.target.value })} placeholder="No console.log in the code" />
            <select aria-label="How serious" value={editing.rule.severity} onChange={(e) => field({ severity: e.target.value })}>
              {SEVERITY_ORDER.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_WORDS[s]}
                </option>
              ))}
            </select>
          </div>
          <label htmlFor="cr-why">
            Why it matters <span className="optional">optional, shown in the issue</span>
          </label>
          <input id="cr-why" type="text" value={editing.rule.description ?? ''} onChange={(e) => field({ description: e.target.value || undefined })} />

          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={busy || editing.rule.title.trim().length < 3} onClick={saveEditing}>
              {busy ? 'Saving…' : 'Save rule'}
            </button>
          </div>
        </div>
      )}

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

      {unusedTemplates.length > 0 && (
        <>
          <p className="builder-step">Ideas: add with one click</p>
          <ul className="template-grid">
            {unusedTemplates.map((t) => (
              <li key={t.id}>
                <button type="button" className="template" onClick={() => addTemplate(t)} disabled={busy} aria-label={`Add rule: ${t.title}`}>
                  <span aria-hidden="true">{TYPES[t.type].emoji}</span>
                  <span className="template-title">{t.title}</span>
                  <span className="template-plus" aria-hidden="true">
                    +
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {toast && <Toast message={toast} onDone={() => setToast('')} />}
    </section>
  );
}
