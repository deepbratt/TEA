// TEA local UI: wires the form, the source picker, past runs and the result panel.

import { api, post } from './js/api.js';
import { $, clear, el, formatWhen, onActivate, setError } from './js/dom.js';
import { describeTarget, openRun } from './js/run.js';
import { initSource, sourceInput } from './js/source.js';

let currentId = null;

function setBusy(busy) {
  const go = $('go');
  go.disabled = busy;
  go.textContent = busy ? 'Testing…' : 'Spill the TEA';
}

async function loadHistory() {
  const { runs } = await api('/api/runs');
  const ul = clear($('history'));
  $('history-empty').hidden = runs.length > 0;
  for (const r of runs) {
    const badgeText = r.status === 'running' ? 'Running' : r.status === 'failed' ? 'Failed' : r.score ?? '–';
    const toneClass = r.status === 'done' && r.verdict ? `tone-${r.verdict.tone}` : '';
    const li = el('li', { tabindex: 0, 'aria-current': String(r.id === currentId), 'aria-label': `${describeTarget(r.input)}, ${r.status === 'done' ? `score ${r.score ?? 'none'}` : r.status}` },
      el('span', { class: `badge ${toneClass}` }, String(badgeText)),
      el('span', { class: 'target' }, describeTarget(r.input)),
      el('span', { class: 'when' }, formatWhen(r.startedAt)));
    onActivate(li, () => show(r.id));
    ul.append(li);
  }
  return runs;
}

async function show(id) {
  currentId = id;
  const run = await openRun(id, { onFinished: () => { setBusy(false); loadHistory(); } });
  setBusy(run.status === 'running');
  loadHistory();
}

function readForm() {
  const url = $('url').value.trim();
  const skip = $('skip').value.split('\n').map((s) => s.trim()).filter(Boolean);
  return { url: url || undefined, start: $('start').checked, maxPages: Number($('max-pages').value) || 50, skip, ...sourceInput() };
}

function validate(input) {
  $('url').removeAttribute('aria-invalid');
  if (input.url) {
    try {
      const u = new URL(input.url);
      if (!/^https?:$/.test(u.protocol)) throw new Error();
    } catch {
      $('url').setAttribute('aria-invalid', 'true');
      $('url').focus();
      return 'Enter a full web address, like https://your-app.com.';
    }
  }
  if (!input.url && !input.repo && !input.github) return 'Add your app’s URL, or choose its code: a folder or a GitHub repo.';
  return '';
}

async function submit(e) {
  e.preventDefault();
  setError('form-error');
  const input = readForm();
  const problem = validate(input);
  if (problem) return setError('form-error', problem);
  setBusy(true);
  try {
    const run = await post('/api/runs', input);
    await show(run.id);
  } catch (err) {
    setBusy(false);
    setError('form-error', err.message);
  }
}

async function init() {
  initSource();
  $('form').addEventListener('submit', submit);
  try {
    const info = await api('/api/info');
    $('version').textContent = `Version ${info.version}, running on this computer`;
    const runs = await loadHistory();
    const running = runs.find((r) => r.status === 'running');
    if (running) await show(running.id);
  } catch (err) {
    setError('form-error', err.message);
  }
}

init();
