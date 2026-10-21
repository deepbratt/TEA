// Calls to TEA's local server. The session cookie travels automatically (same origin).

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty or non-JSON body */
  }
  if (!res.ok) throw new Error((data && data.error) || `TEA's server answered ${res.status}.`);
  return data;
}

export const post = (path, body = {}) => api(path, { method: 'POST', body });

/** Follow a run's live events. Returns a function that stops listening. */
export function followRun(id, { onLog, onDone }) {
  const source = new EventSource(`/api/runs/${encodeURIComponent(id)}/events`);
  source.addEventListener('log', (ev) => onLog(JSON.parse(ev.data)));
  source.addEventListener('done', (ev) => {
    source.close();
    onDone(JSON.parse(ev.data));
  });
  return () => source.close();
}
