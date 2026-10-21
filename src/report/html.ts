import { readFileSync } from 'node:fs';
import { countBySeverity, scoreVerdict, sortFindings, type AppMap, type Finding, type Results, type Route } from '../core/index.js';
import { AREA_LABEL, summaryBody, topFindings } from './summary.js';

/** The same design tokens as the local UI, inlined so a report stays one self-contained file. */
const THEME_CSS = readFileSync(new URL('../../ui/theme.css', import.meta.url), 'utf8');

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Only relative screenshot paths or http(s) URLs may appear in src/href attributes. */
const safeHref = (s: string | undefined) => (s && (/^https?:\/\//i.test(s) || /^[\w./-]+$/.test(s)) ? esc(s) : '');

const loc = (f: Finding) => (f.evidence?.file ? `${f.evidence.file}${f.evidence.line && f.evidence.line > 1 ? `:${f.evidence.line}` : ''}` : '');

function ring(score: number | null): string {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : score / 100;
  return `<svg class="ring" viewBox="0 0 120 120" role="img" aria-label="TEA score ${score ?? 'not available'} out of 100">
    <circle cx="60" cy="60" r="${r}" class="ring-bg"/>
    <circle cx="60" cy="60" r="${r}" class="ring-fg" stroke-dasharray="${(c * pct).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 60 60)"/>
    <text x="60" y="58" class="ring-num">${score ?? '–'}</text><text x="60" y="80" class="ring-of">/ 100</text></svg>`;
}

function findingCard(f: Finding, i?: number): string {
  const shot = safeHref(f.evidence?.screenshot);
  return `<article class="issue sev-${f.severity}" id="${esc(f.id)}">
    <header><span class="badge sev-${f.severity}">${f.severity}</span><span class="area">${esc(AREA_LABEL[f.area])}</span>
      <h3>${i !== undefined ? `${i + 1}. ` : ''}${esc(f.title)}</h3></header>
    <div class="issue-body">
      <div>
        <p>${esc(f.summary)}</p>
        ${loc(f) ? `<p class="meta"><b>Where:</b> <code>${esc(loc(f))}</code></p>` : ''}
        ${f.evidence?.url ? `<p class="meta"><b>Page:</b> <a href="${safeHref(f.evidence.url)}">${esc(f.evidence.url)}</a></p>` : ''}
        ${f.steps?.length ? `<details><summary>Steps to reproduce</summary><ol>${f.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}
        ${f.evidence?.details?.length ? `<details><summary>Details</summary><ul class="mono">${f.evidence.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul></details>` : ''}
        ${f.fix ? `<div class="fix"><div class="fix-head"><b>Paste this into your AI tool</b><button type="button" class="copy">Copy</button></div><pre>${esc(f.fix)}</pre></div>` : ''}
      </div>
      ${shot ? `<a class="shot" href="${shot}"><img loading="lazy" src="${shot}" alt="Screenshot of ${esc(f.evidence?.url ?? '')}"></a>` : ''}
    </div>
  </article>`;
}

function routeStatus(r: Route): string {
  if (r.status === undefined) return `<span class="muted">${r.kind === 'api' ? 'not called yet' : r.dynamic ? 'needs data' : 'not visited'}</span>`;
  return r.status >= 400 ? `<span class="bad">✕ ${r.status}</span>` : `<span class="ok">✓ ${r.status}</span>`;
}

export function renderHtml(results: Results, appMap: AppMap): string {
  const v = scoreVerdict(results.score);
  const counts = countBySeverity(results.findings);
  const top = topFindings(results.findings);
  const rest = sortFindings(results.findings).filter((f) => !top.includes(f));
  const pages = appMap.routes.filter((r) => r.kind === 'page');
  const apis = appMap.routes.filter((r) => r.kind === 'api');
  const exposed = appMap.envVars.filter((e) => e.clientExposed);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TEA report: ${results.score ?? '–'}/100</title>
<style>
${THEME_CSS}
main{max-width:1080px;margin:0 auto;padding:24px 16px 64px}code,pre,.mono{font-family:var(--font-mono);font-size:13px}
main{max-width:1080px;margin:0 auto;padding:24px 16px 64px}a{color:var(--accent)}code,pre,.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:13px}
code{background:var(--tint);padding:1px 5px;border-radius:4px}
.hero{display:grid;grid-template-columns:auto 1fr;gap:28px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:24px}
.brand{font-weight:600;color:var(--accent);font-size:13px}.hero h1{margin:4px 0 8px;font:600 30px/1.2 var(--font-display)}h2{font-family:var(--font-display)}
.verdict{display:inline-block;font-weight:700;padding:2px 10px;border-radius:999px;background:var(--tint);margin-bottom:8px}
.ring{width:150px;height:150px}.ring-bg{fill:none;stroke:var(--line);stroke-width:12}.ring-fg{fill:none;stroke:var(--tea-good);stroke-width:12;stroke-linecap:round}
.tone-bad .ring-fg{stroke:var(--tea-bad)}.tone-meh .ring-fg{stroke:var(--tea-meh)}.tone-good .ring-fg{stroke:var(--tea-good)}.tone-great .ring-fg{stroke:var(--tea-great)}
.ring-num{font:600 38px var(--font-display);text-anchor:middle;fill:var(--ink)}.ring-of{font:500 13px var(--font-ui);text-anchor:middle;fill:var(--muted)}
.counts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.count{font-size:13px;padding:2px 10px;border-radius:999px;border:1px solid var(--line)}
h2{margin:36px 0 12px;font-size:20px}.areas{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
.area-card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px}.area-card .n{font-size:26px;font-weight:800}.area-card.not-run .n{font-size:14px;color:var(--muted);font-weight:600;padding:8px 0}
.area-card .l{color:var(--muted);font-size:13px}
.issue{background:var(--surface);border:1px solid var(--line);border-left:5px solid var(--info);border-radius:12px;padding:14px 16px;margin:10px 0}
.issue.sev-critical{border-left-color:var(--crit)}.issue.sev-high{border-left-color:var(--high)}.issue.sev-medium{border-left-color:var(--med)}.issue.sev-low{border-left-color:var(--low)}
.issue header{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.issue h3{flex-basis:100%;margin:4px 0 0;font-size:16px}
.badge{font-size:11.5px;font-weight:700;color:#fff;padding:2px 8px;border-radius:6px;background:var(--info)}
.badge.sev-critical{background:var(--crit)}.badge.sev-high{background:var(--high)}.badge.sev-medium{background:var(--med);color:#2b1d12}.badge.sev-low{background:var(--low)}
.area{font-size:12px;color:var(--muted)}.issue-body{display:grid;grid-template-columns:1fr 220px;gap:16px}.issue-body p{margin:8px 0}.meta{font-size:13px;color:var(--muted)}
.shot img{width:100%;max-height:200px;object-fit:cover;object-position:top;border:1px solid var(--line);border-radius:8px}
.fix{margin-top:10px;border:1px solid var(--line);border-radius:10px;overflow:hidden}.fix-head{display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:var(--tint);font-size:13px}
.fix pre{margin:0;padding:10px;white-space:pre-wrap;word-break:break-word}.copy{font:inherit;font-size:12px;border:1px solid var(--line);background:var(--surface);color:var(--ink);border-radius:6px;padding:2px 10px;cursor:pointer}
details{margin:6px 0}summary{cursor:pointer;color:var(--muted);font-size:13px}
table{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-size:14px}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12.5px;color:var(--muted)}
.table-wrap{overflow-x:auto}.ok{color:var(--ok);font-weight:600}.bad{color:var(--crit);font-weight:600}.muted{color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:13px}.chip small{color:var(--muted)}
.facts{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}.fact{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px}.fact b{display:block;font-size:13px;color:var(--muted);margin-bottom:4px}
.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}.gallery figure{margin:0;background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.gallery img{width:100%;height:140px;object-fit:cover;object-position:top;display:block}.gallery figcaption{padding:6px 10px;font-size:13px}
footer{margin-top:48px;color:var(--muted);font-size:13px;text-align:center}
@media (max-width:720px){.hero{grid-template-columns:1fr;text-align:center}.ring{margin:0 auto}.counts{justify-content:center}.issue-body{grid-template-columns:1fr}}
</style></head>
<body><main>
<section class="hero tone-${v.tone}">
  ${ring(results.score)}
  <div>
    <div class="brand">TEA, Test Everything Automatically</div>
    <h1>Here's the TEA on your app: ${results.score ?? '–'}/100</h1>
    <span class="verdict">${esc(v.label)}</span>
    <p>${esc(summaryBody(results.summary))}</p>
    <div class="counts">${(['critical', 'high', 'medium', 'low'] as const).map((s) => `<span class="count">${counts[s]} ${s}</span>`).join('')}</div>
    <p class="meta">Tested ${esc([results.target.url, results.target.repo].filter(Boolean).join(' + '))} on ${esc(new Date(results.startedAt).toUTCString())}</p>
  </div>
</section>

<h2>Scores by area</h2>
<div class="areas">${results.areas
    .map((a) => `<div class="area-card ${a.status}"><div class="l">${esc(AREA_LABEL[a.area])}</div><div class="n">${a.score ?? 'Not run yet'}</div>${a.status === 'ran' ? `<div class="l">${a.findings} issue${a.findings === 1 ? '' : 's'}</div>` : ''}</div>`)
    .join('')}</div>

${top.length ? `<h2>Fix these first</h2>${top.map((f, i) => findingCard(f, i)).join('')}` : '<h2>No issues found</h2><p>TEA found nothing wrong in what it checked.</p>'}
${rest.length ? `<h2>All other issues (${rest.length})</h2>${rest.map((f) => findingCard(f)).join('')}` : ''}

<h2>What TEA found in your app</h2>
<div class="chips">${appMap.stack.filter((s) => s.kind !== 'language').map((s) => `<span class="chip">${esc(s.name)} <small>${esc(s.kind)}</small></span>`).join('') || '<span class="muted">No repo scanned.</span>'}</div>
<div class="facts" style="margin-top:12px">
  <div class="fact"><b>Auth</b>${esc(appMap.auth.join('; ') || 'none detected')}</div>
  <div class="fact"><b>Payments</b>${esc(appMap.payments.join('; ') || 'none detected')}</div>
  <div class="fact"><b>Database</b>${esc(appMap.database.map((d) => `${d.kind}${d.models.length ? `: ${d.models.slice(0, 10).join(', ')}` : ''}`).join('; ') || 'none detected')}</div>
  <div class="fact"><b>Env vars</b>${appMap.envVars.length} used${exposed.length ? `; ${exposed.length} bundled into the browser: <code>${exposed.map((e) => esc(e.name)).join('</code> <code>')}</code>` : ''}</div>
  <div class="fact"><b>Forms</b>${appMap.forms.length}</div>
  <div class="fact"><b>Pages / API endpoints</b>${pages.length} / ${apis.length}</div>
</div>

${pages.length ? `<h2>Feature map: pages</h2><div class="table-wrap"><table><thead><tr><th>Route</th><th>Found in</th><th>Live status</th><th>Linked in UI</th><th>File</th></tr></thead><tbody>
${pages.map((r) => `<tr><td><code>${esc(r.path)}</code></td><td>${esc(r.source)}</td><td>${routeStatus(r)}</td><td>${r.reachableFromUi === undefined ? '' : r.reachableFromUi ? 'yes' : '<span class="muted">no</span>'}</td><td class="mono">${esc(r.file ?? '')}</td></tr>`).join('\n')}
</tbody></table></div>` : ''}
${apis.length ? `<h2>Feature map: API endpoints</h2><div class="table-wrap"><table><thead><tr><th>Endpoint</th><th>Methods</th><th>File</th></tr></thead><tbody>
${apis.map((r) => `<tr><td><code>${esc(r.path)}</code></td><td>${esc(r.methods?.join(', ') ?? '?')}</td><td class="mono">${esc(r.file ? `${r.file}${r.line && r.line > 1 ? `:${r.line}` : ''}` : '')}</td></tr>`).join('\n')}
</tbody></table></div>` : ''}
${appMap.notes.length ? `<h2>Notes</h2><ul>${appMap.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}

${appMap.pages.some((p) => p.screenshot) ? `<h2>Pages TEA visited (${appMap.pages.length})</h2><div class="gallery">${appMap.pages
    .filter((p) => p.screenshot)
    .map((p) => `<figure><a href="${safeHref(p.screenshot)}"><img loading="lazy" src="${safeHref(p.screenshot)}" alt="Screenshot of ${esc(p.path)}"></a><figcaption><code>${esc(p.path)}</code> ${p.status && p.status >= 400 ? `<span class="bad">${p.status}</span>` : `<span class="muted">${p.status ?? ''}${p.loadMs ? ` · ${(p.loadMs / 1000).toFixed(1)}s` : ''}</span>`}</figcaption></figure>`)
    .join('')}</div>` : ''}

<footer>Made with TEA ${esc(results.tool.version)}, the open-source QA tester: <a href="https://github.com/deepbratt/TEA">github.com/deepbratt/TEA</a></footer>
</main>
<script>
document.querySelectorAll('.copy').forEach(function(b){b.addEventListener('click',function(){var t=b.closest('.fix').querySelector('pre').textContent;
(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy'},1500)},function(){b.textContent='Select and copy'})})});
</script>
</body></html>`;
}
