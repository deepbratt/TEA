// The result panel: live progress, the score cup, the top issues and the log.

import { api, followRun } from './api.js';
import { $, clear, el } from './dom.js';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const TONES = ['tone-great', 'tone-good', 'tone-meh', 'tone-bad'];
let stopFollowing = null;
let visited = 0;

const runFile = (run, name) => `/runs/${encodeURIComponent(run.id)}/${name}`;

export function describeTarget(input = {}) {
  const code = input.github
    ? `github.com/${input.github.owner}/${input.github.repo}${input.github.branch ? `@${input.github.branch}` : ''}`
    : input.repo;
  return [input.url, code].filter(Boolean).join(' + ');
}

function addLog(e, live) {
  // The CLI's end-of-run summary duplicates what the result panel shows.
  if (e.kind === 'result') return;
  const log = $('log');
  const prefix = { warn: 'Warning: ', error: 'Error: ' }[e.kind] || '';
  log.append(el('li', { class: e.kind }, prefix + e.message));
  while (log.childElementCount > 500) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;
  if (e.message.startsWith('Visiting ')) {
    visited += 1;
    $('progress').textContent = `(${visited} page${visited === 1 ? '' : 's'} opened)`;
    if (live) $('status').textContent = `Testing your app: ${visited} page${visited === 1 ? '' : 's'} opened so far`;
  }
}

function fillCup(score, tone) {
  const tea = $('cup-tea');
  const cup = $('cup');
  cup.classList.remove(...TONES);
  if (tone) cup.classList.add(`tone-${tone}`);
  // The cup's inside runs from y=34 (brim) to y=92 (bottom): fill to the score's level.
  const level = Math.max(0, Math.min(100, score ?? 0)) / 100;
  const height = 58 * level;
  requestAnimationFrame(() => {
    tea.setAttribute('y', String(92 - height));
    tea.setAttribute('height', String(height));
  });
  $('cup-label').textContent = score === null || score === undefined ? 'No score yet' : `TEA score ${score} out of 100`;
}

async function showIssues(run) {
  const box = $('top-issues');
  const list = clear($('issues'));
  box.hidden = true;
  let results;
  try {
    const res = await fetch(runFile(run, 'results.json'), { credentials: 'same-origin' });
    if (!res.ok) return;
    results = await res.json();
  } catch {
    return;
  }
  const top = results.findings.filter((f) => f.severity !== 'info').slice(0, 5);
  for (const f of top) {
    const where = f.evidence && f.evidence.file ? `${f.evidence.file}${f.evidence.line > 1 ? `:${f.evidence.line}` : ''}` : f.evidence && f.evidence.url;
    const copy = f.fix
      ? el('button', {
          type: 'button',
          class: 'btn',
          onclick: async (e) => {
            const button = e.currentTarget;
            try {
              await navigator.clipboard.writeText(f.fix);
              button.textContent = 'Copied';
            } catch {
              button.textContent = 'Copy failed: open the full report';
            }
            setTimeout(() => (button.textContent = 'Copy fix prompt'), 2000);
          },
        }, 'Copy fix prompt')
      : null;
    list.append(
      el('li', { class: `issue sev-${f.severity}` },
        el('div', { class: 'issue-head' }, el('span', { class: 'issue-sev' }, f.severity), el('span', { class: 'issue-title' }, f.title)),
        where ? el('p', { class: 'issue-where' }, where) : null,
        el('p', { class: 'issue-summary' }, f.summary),
        copy),
    );
  }
  box.hidden = top.length === 0;
}

/** Render a run in the result panel. */
export function showRun(run) {
  $('empty').hidden = true;
  $('run').hidden = false;
  $('run-target').textContent = describeTarget(run.input);
  const running = run.status === 'running';
  const status = $('status');
  status.classList.toggle('running', running);
  status.textContent = running ? 'Testing your app…' : run.status === 'done' ? `Finished ${new Date(run.finishedAt || run.startedAt).toLocaleTimeString()}` : 'This run did not finish.';
  $('run-error').textContent = run.error || '';

  const done = run.status === 'done';
  $('verdict').hidden = !done;
  if (!done) {
    $('top-issues').hidden = true;
    return;
  }
  const v = run.verdict || { label: '', tone: 'none' };
  $('verdict').className = `verdict tone-${v.tone}`;
  $('score').textContent = run.score === null || run.score === undefined ? '–' : String(run.score);
  $('verdict-label').textContent = v.label;
  $('summary').textContent = (run.summary || '').replace(/^Here's the TEA on your app: [^.]*\.\s*/, '');
  const sev = clear($('severity'));
  for (const s of SEVERITIES) {
    const n = (run.counts || {})[s] || 0;
    sev.append(el('span', { class: `sev sev-${s}` }, el('b', {}, String(n)), ` ${s}`));
  }
  $('open-report').href = runFile(run, 'report.html');
  $('open-md').href = runFile(run, 'report.md');
  $('open-json').href = runFile(run, 'results.json');
  fillCup(run.score, v.tone);
  showIssues(run);
}

/** Show a run, replay its log, and follow it live if it's still running. */
export async function openRun(id, { onFinished } = {}) {
  if (stopFollowing) stopFollowing();
  stopFollowing = null;
  visited = 0;
  clear($('log'));
  $('progress').textContent = '';
  const run = await api(`/api/runs/${encodeURIComponent(id)}`);
  showRun(run);
  if (run.status !== 'running') {
    for (const e of run.events || []) addLog(e, false);
    return run;
  }
  $('log-box').open = true;
  stopFollowing = followRun(id, {
    onLog: (e) => addLog(e, true),
    onDone: (finished) => {
      stopFollowing = null;
      showRun(finished);
      $('result-panel').focus();
      if (onFinished) onFinished(finished);
    },
  });
  return run;
}
