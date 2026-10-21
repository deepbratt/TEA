/**
 * The single page of the local TEA UI. Self-contained: inline CSS and JS, no external requests.
 * Dynamic values are always inserted with textContent, never as HTML.
 */
export function renderPage(opts: { version: string }): string {
  const version = opts.version.replace(/[^\w.-]/g, '');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TEA: Test Everything Automatically</title>
<style>
:root{--bg:#faf6ef;--panel:#fff;--ink:#2b1d12;--muted:#7a6a5c;--line:#eadfce;--brand:#b5651d;--brand-2:#e8a33d;--crit:#c0262d;--high:#e0662b;--med:#d9a21b;--low:#3b7fc4;--ok:#2f8f4e;--code:#f3ece1}
@media (prefers-color-scheme:dark){:root{--bg:#17110c;--panel:#221911;--ink:#f4ebe0;--muted:#b3a291;--line:#3a2c20;--code:#2c2117}}
[hidden]{display:none!important}*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
header{display:flex;align-items:center;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);background:var(--panel)}
.logo{font-weight:900;font-size:22px;letter-spacing:.06em}.logo span{color:var(--brand)}.tag{color:var(--muted);font-size:14px}.ver{margin-left:auto;font-size:12px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:2px 10px}
main{display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);gap:16px;padding:16px;max-width:1400px;margin:0 auto}main>*{min-width:0}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px}
h2{font-size:15px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
label{display:block;font-weight:600;margin:12px 0 4px}.hint{font-weight:400;color:var(--muted);font-size:13px}
input[type=text],input[type=url],input[type=number],textarea{width:100%;font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:9px 11px}
input:focus,textarea:focus{outline:2px solid var(--brand-2);outline-offset:1px}
textarea{min-height:64px;font-family:ui-monospace,Consolas,monospace;font-size:13px}
.check{display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-weight:400}.check input{margin-top:4px}
details{margin-top:10px}summary{cursor:pointer;color:var(--muted)}
button.go{margin-top:16px;width:100%;font:inherit;font-weight:800;font-size:16px;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-2));border:0;border-radius:12px;padding:12px;cursor:pointer}
button.go:disabled{opacity:.55;cursor:progress}
.note{font-size:12px;color:var(--muted);margin-top:12px}
.err{color:var(--crit);font-weight:600;margin-top:10px;min-height:1em}
.history{list-style:none;padding:0;margin:0}.history li{display:flex;gap:10px;align-items:center;padding:8px;border-radius:10px;cursor:pointer}
.history li:hover,.history li.active{background:var(--code)}.history .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.history .d{font-size:12px;color:var(--muted)}
.badge{min-width:42px;text-align:center;font-weight:800;border-radius:8px;padding:2px 6px;background:var(--code)}
.b-great{background:var(--ok);color:#fff}.b-good{background:var(--brand-2);color:#2b1d12}.b-meh{background:var(--med);color:#2b1d12}.b-bad{background:var(--crit);color:#fff}
.empty{display:grid;place-items:center;text-align:center;min-height:420px;color:var(--muted)}
.cup{font-size:56px;position:relative}.steam{position:absolute;left:50%;top:-18px;width:6px;height:18px;border-radius:6px;background:var(--muted);opacity:0;animation:rise 2.4s infinite}
.steam:nth-child(2){margin-left:-14px;animation-delay:.8s}.steam:nth-child(3){margin-left:12px;animation-delay:1.6s}
@keyframes rise{0%{transform:translateY(8px);opacity:0}40%{opacity:.6}100%{transform:translateY(-16px);opacity:0}}
.status{display:flex;align-items:center;gap:10px;flex-wrap:wrap}#target{overflow-wrap:anywhere}.pill{font-weight:700;border-radius:999px;padding:3px 12px;background:var(--code)}
.pill.running{background:var(--brand-2);color:#2b1d12}.pill.done{background:var(--ok);color:#fff}.pill.failed{background:var(--crit);color:#fff}
.dots::after{content:"";animation:dots 1.4s steps(4) infinite}@keyframes dots{0%{content:""}25%{content:"."}50%{content:".."}75%{content:"..."}}
.log{margin-top:12px;max-height:280px;overflow:auto;background:var(--code);border-radius:10px;padding:10px;font:12.5px/1.6 ui-monospace,Consolas,monospace}
.log div{white-space:pre-wrap;word-break:break-word}.log .warn{color:var(--high)}.log .error{color:var(--crit)}.log .debug{color:var(--muted)}.log .step{font-weight:700}
.result{display:flex;gap:20px;align-items:center;margin-top:12px;flex-wrap:wrap}.ring{width:120px;height:120px}
.ring circle{fill:none;stroke-width:12}.ring .bg{stroke:var(--line)}.ring .fg{stroke-linecap:round;transition:stroke-dasharray 1.2s ease-out}
.ring text{font:800 32px system-ui;fill:var(--ink);text-anchor:middle}.summary{flex:1;min-width:240px}
.counts{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}.counts span{font-size:13px;border:1px solid var(--line);border-radius:999px;padding:1px 10px}
.links{display:flex;gap:8px;flex-wrap:wrap}.links a{color:var(--brand);font-weight:600}
iframe{width:100%;height:900px;border:1px solid var(--line);border-radius:12px;margin-top:16px;background:#fff}
@media (max-width:860px){main{grid-template-columns:minmax(0,1fr)}header{flex-wrap:wrap}}
</style></head>
<body>
<header><div class="logo">☕ <span>TEA</span></div><div class="tag">Test Everything Automatically. Spill the TEA on your app.</div><div class="ver">v${version} · local</div></header>
<main>
  <div>
    <form class="card" id="form" autocomplete="off">
      <h2>Test an app</h2>
      <label for="url">Live URL <span class="hint">(read-only: TEA only opens pages)</span></label>
      <input id="url" type="url" placeholder="https://your-app.com or http://localhost:3000">
      <label for="repo">Repo folder <span class="hint">(optional, points issues at files)</span></label>
      <input id="repo" type="text" placeholder="C:\\code\\my-app or ./my-app">
      <label class="check"><input id="start" type="checkbox"><span>No URL? Start my app with its own dev script.<br><span class="hint">This runs code from the repo on this computer. Only tick it if you trust the repo. TEA never installs dependencies.</span></span></label>
      <details><summary>More options</summary>
        <label for="maxPages">Most pages to visit</label>
        <input id="maxPages" type="number" min="1" max="500" value="50">
        <label for="skip">Routes to never visit <span class="hint">(one per line, e.g. /admin/**)</span></label>
        <textarea id="skip" placeholder="/logout&#10;/admin/**"></textarea>
      </details>
      <button class="go" id="go" type="submit">☕ Spill the TEA</button>
      <div class="err" id="formErr" role="alert"></div>
      <p class="note">Only test apps you own or are allowed to test. TEA's score is not a security guarantee, audit or certification.</p>
    </form>
    <div class="card" style="margin-top:16px"><h2>Past runs</h2><ul class="history" id="history"></ul><p class="note" id="noHistory">No runs yet.</p></div>
  </div>
  <section class="card" id="panel" aria-live="polite">
    <div class="empty" id="empty"><div><div class="cup"><span class="steam"></span><span class="steam"></span><span class="steam"></span>☕</div><p><b>Your TEA report will appear here.</b><br>Enter a URL and/or a repo folder, then press Spill the TEA.</p></div></div>
    <div id="run" hidden>
      <div class="status"><span class="pill" id="pill"></span><b id="target"></b><span class="hint" id="progress"></span></div>
      <div class="result" id="result" hidden>
        <svg class="ring" viewBox="0 0 120 120" role="img" aria-label="TEA score"><circle class="bg" cx="60" cy="60" r="50"/><circle class="fg" id="ringFg" cx="60" cy="60" r="50" stroke-dasharray="0 315" transform="rotate(-90 60 60)"/><text id="scoreText" x="60" y="71">–</text></svg>
        <div class="summary"><div id="verdict" style="font-weight:800;font-size:18px"></div><div class="counts" id="counts"></div><p id="summary" style="margin:6px 0"></p>
          <div class="links" id="links"></div></div>
      </div>
      <div class="err" id="runErr"></div>
      <details id="logBox" open><summary>What TEA is doing</summary><div class="log" id="log"></div></details>
      <iframe id="report" title="TEA report" hidden></iframe>
    </div>
  </section>
</main>
<script>
(function(){
  var $ = function(id){ return document.getElementById(id); };
  var current = null, source = null;
  function verdict(s){ if(s===null||s===undefined) return ['Not brewed yet','']; if(s>=90) return ['Piping hot','b-great']; if(s>=75) return ['A good brew','b-good']; if(s>=50) return ['Lukewarm','b-meh']; return ['Spilled','b-bad']; }
  function ringColor(s){ return s>=90?'var(--ok)':s>=75?'var(--brand-2)':s>=50?'var(--med)':'var(--crit)'; }
  function targetOf(r){ var i=r.input||{}; return [i.url,i.repo].filter(Boolean).join(' + '); }
  function api(path, opts){ return fetch(path, Object.assign({ credentials:'same-origin', headers:{'content-type':'application/json'} }, opts||{})).then(function(res){ return res.json().then(function(body){ if(!res.ok) throw new Error(body.error||('HTTP '+res.status)); return body; }); }); }
  function addLog(e){ var d=document.createElement('div'); d.className=e.kind; d.textContent=(e.kind==='step'?'☕ ':e.kind==='warn'?'! ':e.kind==='error'?'x ':'')+e.message; var box=$('log'); box.appendChild(d); while(box.childNodes.length>400) box.removeChild(box.firstChild); box.scrollTop=box.scrollHeight;
    if(/^Visiting /.test(e.message)){ visited++; $('progress').textContent=visited+' page(s) visited'; } }
  var visited=0;
  function showRun(r){
    current=r; $('empty').hidden=true; $('run').hidden=false; $('target').textContent=targetOf(r);
    var p=$('pill'); p.className='pill '+r.status; p.textContent=r.status==='running'?'Brewing':r.status==='done'?'Done':'Failed'; p.classList.toggle('dots', r.status==='running');
    $('runErr').textContent=r.error||'';
    var done=r.status==='done'; $('result').hidden=!done; $('report').hidden=!done;
    if(done){
      var s=r.score, v=verdict(s); $('scoreText').textContent=(s===null||s===undefined)?'–':String(s); $('verdict').textContent="Here's the TEA: "+((s===null||s===undefined)?'no score yet':s+'/100')+' · '+v[0];
      var fg=$('ringFg'); fg.style.stroke=ringColor(s||0); requestAnimationFrame(function(){ fg.setAttribute('stroke-dasharray', String(((s||0)/100)*314.16)+' 315'); });
      var c=$('counts'); c.textContent=''; ['critical','high','medium','low'].forEach(function(k){ var n=(r.counts||{})[k]||0; var sp=document.createElement('span'); sp.textContent=n+' '+k; c.appendChild(sp); });
      $('summary').textContent=(r.summary||'').replace(/^Here's the TEA on your app: [^.]*\\.\\s*/, '');
      var l=$('links'); l.textContent=''; [['Open full report','report.html'],['report.md','report.md'],['results.json','results.json'],['feature-map.md','feature-map.md']].forEach(function(x){ var a=document.createElement('a'); a.href='/runs/'+encodeURIComponent(r.id)+'/'+x[1]; a.target='_blank'; a.rel='noopener'; a.textContent=x[0]; l.appendChild(a); });
      $('report').src='/runs/'+encodeURIComponent(r.id)+'/report.html';
    }
    markActive();
  }
  function follow(id){
    if(source){ source.close(); source=null; }
    $('log').textContent=''; visited=0; $('progress').textContent='';
    source=new EventSource('/api/runs/'+encodeURIComponent(id)+'/events');
    source.addEventListener('log', function(ev){ addLog(JSON.parse(ev.data)); });
    source.addEventListener('done', function(ev){ source.close(); source=null; var r=JSON.parse(ev.data); showRun(r); setBusy(false); loadHistory(); });
  }
  function setBusy(b){ $('go').disabled=b; $('go').textContent=b?'Brewing…':'☕ Spill the TEA'; }
  function markActive(){ Array.prototype.forEach.call($('history').children, function(li){ li.classList.toggle('active', !!current && li.dataset.id===current.id); }); }
  function loadHistory(){ return api('/api/runs').then(function(d){
    var ul=$('history'); ul.textContent=''; $('noHistory').hidden=d.runs.length>0;
    d.runs.forEach(function(r){ var li=document.createElement('li'); li.dataset.id=r.id; li.tabIndex=0;
      var b=document.createElement('span'); var v=verdict(r.score); b.className='badge '+(r.status==='done'?v[1]:''); b.textContent=r.status==='running'?'…':r.status==='failed'?'✕':(r.score===null||r.score===undefined?'–':String(r.score));
      var t=document.createElement('span'); t.className='t'; t.textContent=targetOf(r);
      var dt=document.createElement('span'); dt.className='d'; dt.textContent=new Date(r.startedAt).toLocaleString();
      li.appendChild(b); li.appendChild(t); li.appendChild(dt);
      var open=function(){ api('/api/runs/'+encodeURIComponent(r.id)).then(function(full){ showRun(full); $('log').textContent=''; visited=0; (full.events||[]).forEach(addLog); if(full.status==='running') follow(full.id); }); };
      li.addEventListener('click', open); li.addEventListener('keydown', function(e){ if(e.key==='Enter') open(); });
      ul.appendChild(li); });
    markActive(); return d; }); }
  $('form').addEventListener('submit', function(e){
    e.preventDefault(); $('formErr').textContent='';
    var body={ url:$('url').value, repo:$('repo').value, start:$('start').checked, maxPages:Number($('maxPages').value)||50, skip:$('skip').value.split('\\n').map(function(s){return s.trim();}).filter(Boolean) };
    setBusy(true);
    api('/api/runs', { method:'POST', body:JSON.stringify(body) }).then(function(r){ showRun(r); follow(r.id); loadHistory(); }).catch(function(err){ setBusy(false); $('formErr').textContent=err.message; });
  });
  loadHistory().then(function(d){ var running=d.runs.filter(function(r){ return r.status==='running'; })[0]; if(running){ setBusy(true); showRun(running); follow(running.id); } }).catch(function(err){ $('formErr').textContent=err.message; });
})();
</script>
</body></html>`;
}
