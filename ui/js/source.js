// Step 2 of the form: where the code is. A folder on this computer, or a GitHub repo.

import { api, post } from './api.js';
import { $, clear, el, onActivate, setError } from './dom.js';

const state = { tab: 'folder', repos: [], picked: null, deviceTimer: null };

/** What to send with a run: { repo } or { github }, or nothing. */
export function sourceInput() {
  if (state.tab === 'github') {
    return state.picked ? { github: { owner: state.picked.owner, repo: state.picked.name, branch: $('gh-branch').value } } : {};
  }
  const repo = $('repo').value.trim();
  return repo ? { repo } : {};
}

// Tabs, with arrow-key support (WAI-ARIA tabs pattern).
const TABS = [['tab-folder', 'pane-folder', 'folder'], ['tab-github', 'pane-github', 'github']];
function selectTab(name, focus = false) {
  state.tab = name;
  for (const [tabId, paneId, key] of TABS) {
    const on = key === name;
    $(tabId).setAttribute('aria-selected', String(on));
    $(tabId).tabIndex = on ? 0 : -1;
    $(paneId).hidden = !on;
    if (on && focus) $(tabId).focus();
  }
  if (name === 'github') refreshGitHub();
}

// URL suggestions from the repo's homepage and deployments.
function suggestUrls(urls) {
  const box = clear($('url-suggest'));
  for (const u of urls || []) {
    box.append(el('button', { type: 'button', class: 'chip', onclick: () => ($('url').value = u.url) }, `Use ${u.url} `, el('small', {}, `(${u.source})`)));
  }
}

async function refreshGitHub() {
  setError('gh-error');
  try {
    const s = await api('/api/github');
    $('gh-off').hidden = s.connected;
    $('gh-on').hidden = !s.connected;
    $('gh-device').disabled = !s.deviceFlow;
    $('gh-device-help').hidden = s.deviceFlow;
    if (s.connected) {
      $('gh-login').textContent = `@${s.login}`;
      if (!state.repos.length) await loadRepos();
    }
  } catch (err) {
    setError('gh-error', err.message);
  }
}

async function loadRepos() {
  renderRepos('Loading your repos…');
  const d = await api('/api/github/repos');
  state.repos = d.repos;
  renderRepos();
}

function renderRepos(placeholder) {
  const ul = clear($('gh-repos'));
  const q = $('gh-search').value.trim().toLowerCase();
  const shown = placeholder ? [] : state.repos.filter((r) => r.fullName.toLowerCase().includes(q)).slice(0, 100);
  for (const r of shown) {
    const selected = state.picked && state.picked.fullName === r.fullName;
    const li = el('li', { role: 'option', tabindex: 0, 'aria-selected': String(!!selected) }, el('span', { class: 'name' }, r.fullName), r.private ? el('span', { class: 'tag' }, 'private') : null);
    onActivate(li, () => pickRepo(r));
    ul.append(li);
  }
  if (!shown.length) ul.append(el('li', { class: 'placeholder' }, placeholder || (state.repos.length ? 'No repos match your search.' : 'No repos found for this account.')));
}

async function pickRepo(r) {
  state.picked = r;
  renderRepos();
  setError('gh-error');
  $('gh-picked').hidden = false;
  const select = clear($('gh-branch'));
  select.append(el('option', { value: r.defaultBranch }, `${r.defaultBranch} (default)`));
  try {
    const d = await api(`/api/github/repo?owner=${encodeURIComponent(r.owner)}&repo=${encodeURIComponent(r.name)}`);
    for (const b of d.branches.filter((b) => b !== r.defaultBranch)) select.append(el('option', { value: b }, b));
    suggestUrls(d.urls);
  } catch (err) {
    setError('gh-error', err.message);
  }
}

async function connect(body) {
  setError('gh-error');
  try {
    await post('/api/github/connect', body);
    state.repos = [];
    await refreshGitHub();
    return true;
  } catch (err) {
    setError('gh-error', err.message);
    return false;
  }
}

function pollDevice(seconds) {
  clearTimeout(state.deviceTimer);
  state.deviceTimer = setTimeout(async () => {
    try {
      const p = await post('/api/github/device', { action: 'poll' });
      if (p.status === 'done') {
        $('gh-device-box').hidden = true;
        state.repos = [];
        refreshGitHub();
      } else if (p.status === 'failed') {
        $('gh-device-state').textContent = p.reason;
      } else {
        pollDevice(p.interval || seconds);
      }
    } catch (err) {
      $('gh-device-state').textContent = err.message;
    }
  }, Math.max(5, seconds || 5) * 1000);
}

// Folder picker: TEA's own server lists folder names, because browsers can't share paths.
let pickerPath = '';
async function openFolder(path) {
  const list = clear($('pick-list'));
  try {
    const d = await api(`/api/folders${path ? `?path=${encodeURIComponent(path)}` : ''}`);
    pickerPath = d.path;
    $('pick-path').value = d.path;
    const roots = clear($('pick-roots'));
    for (const r of d.roots) roots.append(el('button', { type: 'button', class: 'chip', onclick: () => openFolder(r) }, r));
    if (d.parent) {
      const up = el('li', { tabindex: 0 }, el('span', { class: 'name' }, 'Up one folder'));
      onActivate(up, () => openFolder(d.parent));
      list.append(up);
    }
    for (const f of d.folders) {
      const li = el('li', { tabindex: 0 }, el('span', { class: 'name' }, f.name), f.looksLikeApp ? el('span', { class: 'tag' }, 'app') : null);
      onActivate(li, () => openFolder(f.path));
      list.append(li);
    }
    if (!d.folders.length) list.append(el('li', { class: 'placeholder' }, 'No folders in here.'));
  } catch (err) {
    list.append(el('li', { class: 'placeholder' }, err.message));
  }
}

export function initSource() {
  for (const [tabId, , key] of TABS) {
    $(tabId).addEventListener('click', () => selectTab(key));
    $(tabId).addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') selectTab(state.tab === 'folder' ? 'github' : 'folder', true);
    });
  }

  $('gh-cli').addEventListener('click', () => connect({ method: 'cli' }));
  $('gh-token-show').addEventListener('click', () => {
    $('gh-token-box').hidden = false;
    $('gh-token-show').setAttribute('aria-expanded', 'true');
    $('gh-token').focus();
  });
  $('gh-token-go').addEventListener('click', async () => {
    if (await connect({ method: 'token', token: $('gh-token').value })) $('gh-token').value = '';
  });
  $('gh-device').addEventListener('click', async () => {
    setError('gh-error');
    try {
      const d = await post('/api/github/device', { action: 'start' });
      $('gh-device-box').hidden = false;
      $('gh-code').textContent = d.userCode;
      $('gh-verify').href = d.verificationUri;
      $('gh-device-state').textContent = 'Waiting for you to approve…';
      pollDevice(d.interval);
    } catch (err) {
      setError('gh-error', err.message);
    }
  });
  $('gh-out').addEventListener('click', async () => {
    await post('/api/github/disconnect');
    Object.assign(state, { repos: [], picked: null });
    $('gh-picked').hidden = true;
    suggestUrls([]);
    refreshGitHub();
  });
  $('gh-search').addEventListener('input', () => renderRepos());

  $('browse').addEventListener('click', () => {
    $('picker').showModal();
    openFolder($('repo').value.trim());
  });
  $('pick-go').addEventListener('click', () => openFolder($('pick-path').value));
  $('pick-path').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      openFolder($('pick-path').value);
    }
  });
  $('pick-use').addEventListener('click', () => {
    $('repo').value = pickerPath;
    $('picker').close();
  });
}
