// App shell: routing, catalog, dataset pages, download builder, download queue.

const App = (() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = { get(k, d) { try { return JSON.parse(localStorage.getItem('cs.' + k)) ?? d; } catch { return d; } }, set(k, v) { try { localStorage.setItem('cs.' + k, JSON.stringify(v)); } catch {} } };

  const ACCESS = {
    direct: { label: 'Direct download', icon: 'bolt' },
    open: { label: 'Open portal', icon: 'open_in_new' },
    login: { label: 'Free login', icon: 'key' },
  };
  const KIND_ICON = { Projection: 'trending_up', Baseline: 'calendar_month', Observation: 'satellite_alt', Reanalysis: 'cyclone', Index: 'speed' };
  const SYN = { rain: 'precipitation', rainfall: 'precipitation', future: 'projection', scenarios: 'scenario', temp: 'temperature', heat: 'temperature', drought: 'drought', gcm: 'cmip6', rcp: 'cordex' };

  const state = { field: 'climate', kind: 'All', access: 'All', q: '', builders: {} };
  const app = { server: false, view: 'catalog' };

  // ---------- utils ----------
  function fmtBytes(b) {
    if (!b) return '—';
    const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return `${b.toFixed(b < 10 && i ? 1 : 0)} ${u[i]}`;
  }
  let toastTimer;
  function toast(msg, ms = 4000, action) {
    const s = $('snackbar');
    s.innerHTML = `<span>${esc(msg)}</span>` + (action ? `<button>${esc(action.label)}</button>` : '');
    if (action) s.querySelector('button').onclick = () => { s.classList.remove('show'); action.fn(); };
    s.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => s.classList.remove('show'), ms);
  }
  function dialog(title, html, buttons = [{ label: 'Close' }]) {
    const sc = $('scrim');
    sc.innerHTML = `<div class="dialog" role="dialog" aria-modal="true"><h2>${esc(title)}</h2><div>${html}</div><div class="btn-wrap">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'filled' : 'text'}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    sc.hidden = false;
    const close = () => { sc.hidden = true; sc.innerHTML = ''; };
    sc.onclick = e => { if (e.target === sc) close(); const b = e.target.closest('[data-i]'); if (b) { const fn = buttons[+b.dataset.i].fn; close(); fn && fn(); } };
    return sc.querySelector('.dialog');
  }
  async function copy(text, what = 'Copied') { try { await navigator.clipboard.writeText(text); toast(what); } catch { toast('Copy failed — select and copy manually'); } }
  function saveFile(text, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
  const fileName = url => decodeURIComponent(url.split('?')[0].split('/').pop());
  const fileIcon = n => /\.zip$/i.test(n) ? 'folder_zip' : /\.tiff?(\.gz)?$/i.test(n) ? 'image' : /\.nc(\.gz)?$/i.test(n) ? 'deployed_code' : /\.csv$/i.test(n) ? 'table' : 'draft';
  const previewable = n => /\.(tiff?|tif\.gz|zip)$/i.test(n);

  // ---------- routing ----------
  function go(view) { if (location.hash !== '#/' + view) history.pushState(null, '', '#/' + view); route(); }
  function route() {
    const [, view = 'catalog', id] = location.hash.split('/');
    const v = view === 'dataset' ? 'dataset' : ['catalog', 'downloads', 'visualize', 'about'].includes(view) ? view : 'catalog';
    app.view = v;
    document.querySelectorAll('.view').forEach(s => s.classList.toggle('active', s.id === 'view-' + v));
    document.querySelectorAll('.rail a').forEach(a => a.classList.toggle('active', a.dataset.view === (v === 'dataset' ? 'catalog' : v)));
    if (v === 'dataset') renderDataset(id);
    if (v === 'catalog') renderCatalog();
    if (v === 'downloads') pollJobs();
    if (v === 'visualize') Viz.show();
    if (v !== 'visualize') window.scrollTo(0, 0);
  }

  // ---------- catalog ----------
  function renderChips() {
    $('fieldChips').innerHTML = FIELDS.map(f => `<button class="chip big ${f.id === state.field ? 'on' : ''}" ${f.ready ? '' : 'disabled title="Coming soon"'} data-field="${f.id}"><span class="ms">${f.icon}</span>${f.name}${f.ready ? '' : ' <span class="soon">soon</span>'}</button>`).join('');
    const kinds = ['All', ...new Set(CATALOG.filter(d => d.field === state.field).map(d => d.kind))];
    $('kindChips').innerHTML = kinds.map(k => `<button class="chip ${k === state.kind ? 'on' : ''}" data-kind="${k}">${k === 'All' ? 'All types' : k + (k === 'Index' ? 'es' : 's')}</button>`).join('');
    $('accessChips').innerHTML = ['All', 'direct', 'open', 'login'].map(a => `<button class="chip ${a === state.access ? 'on' : ''}" data-access="${a}">${a === 'All' ? 'Any access' : `<span class="ms">${ACCESS[a].icon}</span>${ACCESS[a].label}`}</button>`).join('');
  }
  function matches(d) {
    if (d.field !== state.field) return false;
    if (state.kind !== 'All' && d.kind !== state.kind) return false;
    if (state.access !== 'All' && d.access !== state.access) return false;
    if (!state.q) return true;
    const hay = [d.title, d.summary, d.description, d.provider, d.kind, d.format, d.period, d.coverage, ...(d.tags || [])].join(' ').toLowerCase();
    return state.q.toLowerCase().split(/\s+/).filter(Boolean).every(t => hay.includes(t) || (SYN[t] && hay.includes(SYN[t])) || hay.includes(t.replace(/[-.]/g, '')));
  }
  function renderCatalog() {
    renderChips();
    const list = CATALOG.filter(matches);
    const order = { direct: 0, open: 1, login: 2 };
    list.sort((a, b) => (a.kind === 'Projection' ? 0 : 1) - (b.kind === 'Projection' ? 0 : 1) || order[a.access] - order[b.access]);
    $('resultCount').textContent = `${list.length} dataset${list.length === 1 ? '' : 's'}${state.q ? ` matching “${state.q}”` : ''}`;
    $('cards').innerHTML = list.length ? list.map(d => `
      <a class="card" href="#/dataset/${d.id}">
        <div class="card-top">
          <span class="kind"><span class="ms">${KIND_ICON[d.kind] || 'dataset'}</span>${d.kind}</span>
          <span class="access ${d.access}"><span class="ms">${ACCESS[d.access].icon}</span>${ACCESS[d.access].label}</span>
        </div>
        <h3>${esc(d.title)}</h3>
        <p>${esc(d.summary)}</p>
        <div class="meta">
          <span><span class="ms">grid_on</span>${esc(d.resolution)}</span>
          <span><span class="ms">date_range</span>${esc(d.period)}</span>
          <span><span class="ms">description</span>${esc(d.format)}</span>
        </div>
      </a>`).join('') : `<div class="empty" style="grid-column:1/-1"><span class="ms">search_off</span>No datasets match. Try “precipitation”, “SSP”, “daily” or clear the filters.</div>`;
  }

  // ---------- dataset page ----------
  function builderState(d) {
    if (!state.builders[d.id]) {
      const p = {};
      d.builder.params.forEach(x => { p[x.id] = Array.isArray(x.default) ? [...x.default] : x.default; });
      state.builders[d.id] = p;
    }
    return state.builders[d.id];
  }
  const visibleParams = (d, p) => d.builder.params.filter(x => !x.when || x.when(p));
  function combos(d, p) {
    let out = [{}];
    for (const x of visibleParams(d, p)) {
      let vals;
      if (x.type === 'multi') vals = p[x.id];
      else if (x.type === 'years') { if (d.builder.resolve) continue; vals = Array.from({ length: Math.max(0, p.years[1] - p.years[0] + 1) }, (_, i) => p.years[0] + i); }
      else vals = [p[x.id]];
      const key = x.type === 'years' ? 'year' : x.id;
      out = out.flatMap(o => vals.map(v => ({ ...o, [key]: v })));
    }
    return out;
  }

  function renderDataset(id) {
    const d = CATALOG.find(x => x.id === id);
    const page = $('datasetPage');
    if (!d) { page.innerHTML = `<div class="empty"><span class="ms">help</span>Dataset not found. <a href="#/catalog">Back to catalog</a></div>`; return; }
    const guide = d.steps && GUIDES[d.steps];
    page.innerHTML = `
      <button class="btn text back" onclick="history.length > 1 ? history.back() : location.hash='#/catalog'"><span class="ms">arrow_back</span>Catalog</button>
      <div class="ds-head">
        <h1>${esc(d.title)}</h1>
        <span class="access ${d.access}" style="margin:8px 0 0"><span class="ms">${ACCESS[d.access].icon}</span>${ACCESS[d.access].label}</span>
      </div>
      <p class="ds-provider">${esc(d.provider)}</p>
      <div class="facts">
        <span class="fact"><span class="ms">${KIND_ICON[d.kind]}</span>${d.kind}</span>
        <span class="fact"><span class="ms">grid_on</span>${esc(d.resolution)}</span>
        <span class="fact"><span class="ms">public</span>${esc(d.coverage)}</span>
        <span class="fact"><span class="ms">date_range</span>${esc(d.period)}</span>
        <span class="fact"><span class="ms">description</span>${esc(d.format)}</span>
      </div>
      <div class="ds-grid">
        <div>
          ${d.builder ? `<div class="panel"><h2><span class="ms">tune</span>Get data</h2><div id="builder"></div></div>` : ''}
          ${guide ? `<div class="panel"><h2><span class="ms">checklist</span>${esc(guide.title)}</h2>
            ${d.access === 'login' ? `<div class="callout warn"><span class="ms">key</span><div>This source needs a <b>free account</b>. Central Station never handles your password — follow these steps on the publisher's site.</div></div>` : ''}
            <ol class="steps">${guide.steps.map(([t, s]) => `<li><b class="t">${t}</b><div class="d">${s}</div></li>`).join('')}</ol>
            <a class="btn filled" href="${d.homepage}" target="_blank" rel="noopener"><span class="ms">open_in_new</span>Open website</a>
          </div>` : ''}
          ${d.cdsBuilder ? `<div class="panel"><h2><span class="ms">code</span>API request generator</h2><div id="cdsGen"></div></div>` : ''}
        </div>
        <div>
          <div class="panel">
            <h2><span class="ms">info</span>About</h2>
            <p style="margin-top:0">${esc(d.description)}</p>
            <dl class="kv">
              <dt>Licence</dt><dd><a href="${d.licenseUrl}" target="_blank" rel="noopener">${esc(d.license)}</a></dd>
              <dt>Source</dt><dd><a href="${d.homepage}" target="_blank" rel="noopener">${esc(new URL(d.homepage).hostname)}</a></dd>
            </dl>
            <div class="tags">${(d.tags || []).map(t => `<button class="tag" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          </div>
          <div class="panel">
            <h2><span class="ms">format_quote</span>Cite</h2>
            <div class="cite">${esc(d.citation)}</div>
            <button class="btn text small" id="citeBtn" style="margin-top:8px"><span class="ms">content_copy</span>Copy citation</button>
          </div>
        </div>
      </div>`;
    $('citeBtn').onclick = () => copy(d.citation, 'Citation copied');
    page.querySelectorAll('[data-tag]').forEach(b => b.onclick = () => { $('search').value = b.dataset.tag; state.q = b.dataset.tag; state.kind = 'All'; state.access = 'All'; go('catalog'); });
    if (d.builder) renderBuilder(d);
    if (d.cdsBuilder) renderCdsGen(d);
  }

  function renderBuilder(d) {
    const p = builderState(d), el = $('builder');
    el.innerHTML = visibleParams(d, p).map(x => {
      if (x.type === 'select') return `<div class="param"><div class="param-label">${x.label}</div><div class="chip-row" data-sel="${x.id}">${x.options.map(o => `<button data-v="${esc(o.value)}" class="chip ${p[x.id] === o.value ? 'on' : ''}">${esc(o.label)}</button>`).join('')}</div></div>`;
      if (x.type === 'multi') return `<div class="param"><div class="param-label">${x.label}<span class="count">${p[x.id].length}/${x.options.length}</span>${x.options.length > 2 ? `<button class="mini" data-all="${x.id}">All</button><button class="mini" data-none="${x.id}">Clear</button>` : ''}</div><div class="chip-row" data-p="${x.id}">${x.options.map(o => `<button class="chip ${p[x.id].includes(o.value) ? 'on' : ''}" data-v="${esc(o.value)}">${esc(o.label)}</button>`).join('')}</div></div>`;
      if (x.type === 'years') return `<div class="param"><div class="param-label">${x.label}<span class="count">${x.min}–${x.max}</span></div><div class="years"><input type="number" min="${x.min}" max="${x.max}" value="${p.years[0]}" data-y="0" aria-label="From year"><span class="muted">to</span><input type="number" min="${x.min}" max="${x.max}" value="${p.years[1]}" data-y="1" aria-label="To year"></div></div>`;
      return '';
    }).join('') + `<div id="fileArea"></div>`;

    el.querySelectorAll('[data-sel]').forEach(s => s.onclick = e => { const b = e.target.closest('button'); if (!b) return; p[s.dataset.sel] = b.dataset.v; renderBuilder(d); });
    el.querySelectorAll('.chip-row[data-p]').forEach(s => s.onclick = e => {
      const b = e.target.closest('button'); if (!b) return;
      const arr = p[s.dataset.p], v = b.dataset.v, i = arr.indexOf(v);
      i >= 0 ? arr.splice(i, 1) : arr.push(v);
      renderBuilder(d);
    });
    el.querySelectorAll('[data-all]').forEach(b => b.onclick = () => { p[b.dataset.all] = d.builder.params.find(x => x.id === b.dataset.all).options.map(o => o.value); renderBuilder(d); });
    el.querySelectorAll('[data-none]').forEach(b => b.onclick = () => { p[b.dataset.none] = []; renderBuilder(d); });
    el.querySelectorAll('[data-y]').forEach(inp => inp.onchange = () => {
      const x = d.builder.params.find(q => q.type === 'years');
      let v = Math.round(+inp.value); v = Math.max(x.min, Math.min(x.max, v || x.min));
      p.years[+inp.dataset.y] = v;
      if (p.years[0] > p.years[1]) p.years[inp.dataset.y === '0' ? 1 : 0] = v;
      renderBuilder(d);
    });
    renderFiles(d, p);
  }

  let resolveToken = 0, resolveTimer;
  async function renderFiles(d, p) {
    const area = $('fileArea');
    const cs = combos(d, p);
    if (!cs.length || visibleParams(d, p).some(x => x.type === 'multi' && !p[x.id].length)) {
      area.innerHTML = `<div class="summary-bar"><span class="muted">Pick at least one option in each group.</span></div>`; return;
    }
    if (d.builder.resolve) {
      const t = ++resolveToken;
      area.innerHTML = `<div class="summary-bar"><div class="spinner" style="width:20px;height:20px;border-width:3px"></div><span>Finding files on the NASA archive…</span></div>`;
      clearTimeout(resolveTimer);
      resolveTimer = setTimeout(async () => {
        try {
          const items = await d.builder.resolve(cs, p.years);
          if (t === resolveToken) showFiles(d, p, items);
        } catch (e) { if (t === resolveToken) area.innerHTML = `<div class="summary-bar"><span class="ms" style="color:var(--error)">error</span>Couldn't read the archive listing: ${esc(e.message)}</div>`; }
      }, 500);
      return;
    }
    showFiles(d, p, cs.map(c => ({ url: d.builder.url(c), combo: c })));
  }

  function showFiles(d, p, items) {
    const area = $('fileArea');
    const files = items.filter(i => i.url), errs = items.filter(i => i.error);
    const sized = files.filter(f => f.size).length === files.length;
    const total = files.reduce((a, f) => a + (f.size || 0), 0);
    const SHOW = 40;
    area.innerHTML = `
      <div class="summary-bar">
        <span class="ms" style="color:var(--primary)">inventory_2</span>
        <span class="big" id="fileSummary">${files.length} file${files.length === 1 ? '' : 's'}${sized ? ' · ' + fmtBytes(total) : ''}</span>
        <span class="spacer"></span>
        <div class="menu-wrap">
          <button class="btn outlined small" id="scriptBtn"><span class="ms">terminal</span>Script<span class="ms">arrow_drop_down</span></button>
          <div class="menu" id="scriptMenu" hidden>
            <button data-s="ps1"><span class="ms">terminal</span><div>PowerShell script<small>Windows · resumes interrupted files</small></div></button>
            <button data-s="sh"><span class="ms">terminal</span><div>Bash / wget script<small>macOS, Linux, WSL, Git Bash</small></div></button>
            <button data-s="txt"><span class="ms">list</span><div>URL list (.txt)<small>For aria2c, wget -i, download managers</small></div></button>
            <button data-s="copy"><span class="ms">content_copy</span><div>Copy all links</div></button>
          </div>
        </div>
        <button class="btn filled small" id="dlAllBtn"><span class="ms">download</span>Download ${files.length > 1 ? 'all' : ''}</button>
      </div>
      <div class="file-list">
        ${files.slice(0, SHOW).map((f, i) => {
          const n = fileName(f.url);
          return `<div class="file-row" data-i="${i}">
            <span class="ms ftype">${fileIcon(n)}</span>
            <span class="fname" title="${esc(f.url)}">${esc(n)}</span>
            <span class="fsize" data-size="${i}">${f.size ? fmtBytes(f.size) : ''}</span>
            ${d.preview && previewable(n) ? `<button class="icon-btn sm" data-act="preview" title="Preview on map"><span class="ms">map</span></button>` : ''}
            <button class="icon-btn sm" data-act="copy" title="Copy link"><span class="ms">link</span></button>
            <a class="icon-btn sm" href="${esc(f.url)}" title="Download in browser" target="_blank" rel="noopener"><span class="ms">download</span></a>
          </div>`;
        }).join('')}
        ${files.length > SHOW ? `<div class="more-row">+ ${files.length - SHOW} more files — all are included in “Download all” and scripts.</div>` : ''}
        ${errs.map(e => `<div class="file-row err"><span class="ms">error</span>${esc(e.error)}</div>`).join('')}
      </div>
      <p class="muted small" style="margin:10px 2px 0">Licence: ${esc(d.license)}. Files come straight from ${esc(new URL(files[0]?.url || d.homepage).hostname)}.</p>`;

    area.querySelector('.file-list').onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const f = files[+b.closest('.file-row').dataset.i];
      if (b.dataset.act === 'copy') copy(f.url, 'Link copied');
      if (b.dataset.act === 'preview') Viz.loadUrl(f.url, { title: fileName(f.url), units: d.builder.units?.(f.combo || {}), bands: d.builder.bands?.(f.combo || {}) });
    };
    const menu = $('scriptMenu');
    $('scriptBtn').onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
    document.addEventListener('click', () => { menu.hidden = true; }, { once: true });
    menu.onclick = e => { const b = e.target.closest('[data-s]'); if (b) exportScript(d, files.map(f => f.url), b.dataset.s); };
    $('dlAllBtn').onclick = () => downloadAll(d, files.map(f => f.url));

    // file sizes via the local helper
    if (app.server && !sized) {
      const tok = resolveToken;
      files.slice(0, Math.min(SHOW, 24)).forEach(async (f, i) => {
        try {
          const r = await (await fetch('/api/head?url=' + encodeURIComponent(f.url))).json();
          const cell = document.querySelector(`[data-size="${i}"]`);
          if (!cell || tok !== resolveToken) return;
          if (r.ok) { f.size = r.size; cell.textContent = fmtBytes(r.size); } else { cell.textContent = 'not found'; cell.classList.add('bad'); }
          if (files.length <= 24 && files.every(x => x.size)) $('fileSummary').textContent = `${files.length} file${files.length === 1 ? '' : 's'} · ${fmtBytes(files.reduce((a, x) => a + x.size, 0))}`;
        } catch {}
      });
    }
  }

  function exportScript(d, urls, kind) {
    const stamp = `# Central Station — ${d.title}\n# Source: ${d.homepage}\n# Licence: ${d.license}\n# Cite: ${d.citation}\n`;
    if (kind === 'copy') return copy(urls.join('\n'), `${urls.length} links copied`);
    if (kind === 'txt') return saveFile(urls.join('\n') + '\n', `${d.id}-urls.txt`);
    if (kind === 'ps1') return saveFile(`${stamp}# Run:  powershell -ExecutionPolicy Bypass -File .\\get-${d.id}.ps1\n
$root = if ($PSScriptRoot) { $PSScriptRoot } else { $PWD.Path }
$dest = Join-Path $root "downloads\\${d.id}"
New-Item -ItemType Directory -Force -Path $dest | Out-Null
$urls = @(
${urls.map(u => `  "${u}"`).join(',\n')}
)
$i = 0
foreach ($u in $urls) {
  $i++
  $f = Join-Path $dest ([IO.Path]::GetFileName(([uri]$u).AbsolutePath))
  Write-Host "[$i/$($urls.Count)] $u"
  curl.exe --fail --location --retry 3 --continue-at - --output "$f" "$u"
}
Write-Host "Done -> $dest"
`, `get-${d.id}.ps1`);
    if (kind === 'sh') return saveFile(`#!/usr/bin/env bash\n${stamp}# Run:  bash get-${d.id}.sh\nset -e\nmkdir -p "downloads/${d.id}" && cd "downloads/${d.id}"\ncat > urls.txt <<'EOF'\n${urls.join('\n')}\nEOF\nif command -v aria2c >/dev/null; then aria2c -c -x 4 -j 2 -i urls.txt; else wget -c -i urls.txt; fi\necho "Done -> $(pwd)"\n`, `get-${d.id}.sh`);
  }

  async function downloadAll(d, urls) {
    if (!app.server) {
      if (urls.length <= 5) {
        urls.forEach((u, i) => setTimeout(() => { const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; a.click(); }, i * 800));
        return toast('Started in your browser. For bigger batches, run the local helper or use a script.', 6000);
      }
      return dialog('Download ' + urls.length + ' files', `<p>Browsers can't download large batches reliably. Pick one:</p>
        <ol class="bullets"><li><b>Start the local helper</b> for one-click downloads with progress and resume:<pre>node server.js</pre>then open <code>http://localhost:8787</code>.</li>
        <li><b>Use a script</b> — PowerShell or Bash, from the <b>Script</b> menu.</li></ol>`, [{ label: 'Get PowerShell script', primary: true, fn: () => exportScript(d, urls, 'ps1') }, { label: 'Close' }]);
    }
    const r = await (await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: urls.map(url => ({ url, folder: d.id })) }) })).json();
    toast(r.added ? `${r.added} file${r.added === 1 ? '' : 's'} added to downloads` : 'Those files are already queued or downloaded', 5000, { label: 'View', fn: () => go('downloads') });
    pollJobs();
  }

  // ---------- CDS request generator ----------
  const REGIONS = { World: null, Africa: [38, -20, -36, 52], 'East Africa': [16, 28, -12, 52], 'West Africa': [25, -20, 3, 16], Europe: [72, -25, 34, 45], 'South Asia': [38, 60, 5, 98], 'South America': [13, -82, -56, -34], 'North America': [72, -168, 14, -52], Australia: [-9, 112, -45, 155] };
  function renderCdsGen(d) {
    const el = $('cdsGen');
    const isCmip = d.cdsBuilder === 'cmip6';
    const g = state.builders['cds-' + d.id] ||= isCmip
      ? { dataset: 'projections-cmip6', vars: ['near_surface_air_temperature'], exp: 'ssp2_4_5', model: 'mpi_esm1_2_hr', res: 'monthly', y0: 2041, y1: 2060, months: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'], region: 'World', area: null }
      : { dataset: 'reanalysis-era5-single-levels-monthly-means', vars: ['2m_temperature', 'total_precipitation'], y0: 2020, y1: 2024, months: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'], region: 'World', area: null, fmt: 'netcdf' };
    const chips = (key, list) => `<div class="chip-row">${list.map(([v, l]) => `<button class="chip ${g[key].includes(v) ? 'on' : ''}" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const seg = (key, list) => `<div class="seg">${list.map(([v, l]) => `<button class="${g[key] === v ? 'on' : ''}" data-s="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const MON = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'].map((m, i) => [m, new Date(2000, i).toLocaleString('en', { month: 'short' })]);
    el.innerHTML = (isCmip ? `
      <div class="param"><div class="param-label">Temporal resolution</div>${seg('res', [['monthly', 'Monthly'], ['daily', 'Daily']])}</div>
      <div class="param"><div class="param-label">Experiment</div>${seg('exp', [['historical', 'Historical'], ['ssp1_2_6', 'SSP1-2.6'], ['ssp2_4_5', 'SSP2-4.5'], ['ssp3_7_0', 'SSP3-7.0'], ['ssp5_8_5', 'SSP5-8.5']])}</div>
      <div class="param"><div class="param-label">Variable</div>${chips('vars', [['near_surface_air_temperature', 'Air temperature'], ['daily_maximum_near_surface_air_temperature', 'Max temperature'], ['daily_minimum_near_surface_air_temperature', 'Min temperature'], ['precipitation', 'Precipitation'], ['near_surface_wind_speed', 'Wind speed'], ['near_surface_relative_humidity', 'Relative humidity'], ['sea_surface_temperature', 'Sea surface temp']])}</div>
      <div class="param"><div class="param-label">Model</div><select class="field" data-sel="model">${['access_cm2', 'canesm5', 'cesm2', 'cnrm_cm6_1', 'ec_earth3', 'gfdl_esm4', 'hadgem3_gc31_ll', 'inm_cm5_0', 'ipsl_cm6a_lr', 'miroc6', 'mpi_esm1_2_hr', 'mri_esm2_0', 'noresm2_mm', 'ukesm1_0_ll'].map(m => `<option ${g.model === m ? 'selected' : ''} value="${m}">${m}</option>`).join('')}</select></div>`
      : `
      <div class="param"><div class="param-label">Dataset</div>${seg('dataset', [['reanalysis-era5-single-levels-monthly-means', 'ERA5 monthly'], ['reanalysis-era5-single-levels', 'ERA5 hourly'], ['reanalysis-era5-land-monthly-means', 'ERA5-Land monthly'], ['reanalysis-era5-land', 'ERA5-Land hourly']])}</div>
      <div class="param"><div class="param-label">Variables</div>${chips('vars', [['2m_temperature', '2 m temperature'], ['total_precipitation', 'Total precipitation'], ['2m_dewpoint_temperature', 'Dewpoint'], ['10m_u_component_of_wind', 'Wind u (10 m)'], ['10m_v_component_of_wind', 'Wind v (10 m)'], ['surface_pressure', 'Surface pressure'], ['surface_solar_radiation_downwards', 'Solar radiation'], ['potential_evaporation', 'Potential evaporation'], ['volumetric_soil_water_layer_1', 'Soil moisture L1'], ['snow_depth', 'Snow depth'], ['skin_temperature', 'Skin temperature']])}</div>`) + `
      <div class="param"><div class="param-label">Years</div><div class="years"><input type="number" data-n="y0" value="${g.y0}" min="1940" max="2100"><span class="muted">to</span><input type="number" data-n="y1" value="${g.y1}" min="1940" max="2100"></div></div>
      <div class="param"><div class="param-label">Months<button class="mini" data-allm>All</button></div>${chips('months', MON)}</div>
      <div class="param"><div class="param-label">Area</div><div class="chip-row">${Object.keys(REGIONS).map(r => `<button class="chip ${g.region === r ? 'on' : ''}" data-r="${r}">${r}</button>`).join('')}</div>
        <div class="years" style="margin-top:8px">${['N', 'W', 'S', 'E'].map((l, i) => `<input type="number" step="any" placeholder="${l}" data-a="${i}" value="${g.area ? g.area[i] : ''}" aria-label="${l}">`).join('')}</div></div>
      <textarea class="code" id="cdsCode" readonly spellcheck="false"></textarea>
      <div class="btn-wrap" style="margin-top:8px"><button class="btn tonal small" id="cdsCopy"><span class="ms">content_copy</span>Copy</button><button class="btn text small" id="cdsSave"><span class="ms">download</span>Save .py</button></div>`;
    const code = buildCds(g);
    $('cdsCode').value = code;
    $('cdsCopy').onclick = () => copy(code, 'Script copied');
    $('cdsSave').onclick = () => saveFile(code, `get_${d.id}.py`);
    el.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { const a = g[b.dataset.k], i = a.indexOf(b.dataset.v); i >= 0 ? a.splice(i, 1) : a.push(b.dataset.v); a.sort(); renderCdsGen(d); });
    el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { g[b.dataset.s] = b.dataset.v; renderCdsGen(d); });
    el.querySelectorAll('[data-sel]').forEach(s => s.onchange = () => { g[s.dataset.sel] = s.value; renderCdsGen(d); });
    el.querySelectorAll('[data-n]').forEach(i => i.onchange = () => { g[i.dataset.n] = Math.round(+i.value); renderCdsGen(d); });
    el.querySelector('[data-allm]').onclick = () => { g.months = MON.map(m => m[0]); renderCdsGen(d); };
    el.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { g.region = b.dataset.r; g.area = REGIONS[b.dataset.r] && [...REGIONS[b.dataset.r]]; renderCdsGen(d); });
    el.querySelectorAll('[data-a]').forEach(i => i.onchange = () => {
      const v = [...el.querySelectorAll('[data-a]')].map(x => parseFloat(x.value));
      g.area = v.every(isFinite) ? v : null; g.region = g.area ? 'Custom' : 'World'; renderCdsGen(d);
    });
  }
  function buildCds(g) {
    const years = []; for (let y = Math.min(g.y0, g.y1); y <= Math.max(g.y0, g.y1); y++) years.push(String(y));
    const L = a => '[' + a.map(x => `"${x}"`).join(', ') + ']';
    const req = [];
    let dataset = g.dataset;
    if (dataset === 'projections-cmip6') {
      req.push(`"temporal_resolution": "${g.res}"`, `"experiment": "${g.exp}"`, `"variable": "${g.vars[0] || 'near_surface_air_temperature'}"`, `"model": "${g.model}"`, `"year": ${L(years)}`, `"month": ${L(g.months)}`);
      if (g.res === 'daily') req.push(`"day": ${L(Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')))}`);
    } else {
      const monthly = dataset.includes('monthly');
      if (!dataset.includes('land') || monthly) req.push(`"product_type": ["${monthly ? 'monthly_averaged_reanalysis' : 'reanalysis'}"]`);
      req.push(`"variable": ${L(g.vars)}`, `"year": ${L(years)}`, `"month": ${L(g.months)}`);
      if (monthly) req.push(`"time": ["00:00"]`);
      else req.push(`"day": ${L(Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')))}`, `"time": ${L(Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00'))}`);
      req.push(`"data_format": "netcdf"`, `"download_format": "unarchived"`);
    }
    if (g.area) req.push(`"area": [${g.area.join(', ')}]  # N, W, S, E`);
    const multiVar = dataset === 'projections-cmip6' && g.vars.length > 1;
    const body = `request = {\n    ${req.join(',\n    ')}\n}`;
    return `# Generated by Central Station
# 1) Free account: https://cds.climate.copernicus.eu  (accept the dataset licence on its Download tab)
# 2) Put your API key in ~/.cdsapirc   3) pip install "cdsapi>=0.7.4"
import cdsapi

client = cdsapi.Client()
dataset = "${dataset}"
${multiVar
  ? `for variable in ${L(g.vars)}:\n    ${body.replace(/\n/g, '\n    ').replace(/"variable": "[^"]+"/, '"variable": variable')}\n    client.retrieve(dataset, request).download(f"{dataset}_{variable}.zip")`
  : `${body}\nclient.retrieve(dataset, request).download()`}
${!dataset.includes('monthly') && dataset !== 'projections-cmip6' ? '\n# Tip: hourly requests for many years are large — loop over years if the CDS reports the request is too big.' : ''}`;
  }

  // ---------- downloads (local helper) ----------
  let jobs = [], pollTimer;
  async function pollJobs() {
    clearTimeout(pollTimer);
    if (!app.server) { renderJobs(); return; }
    try { jobs = await (await fetch('/api/jobs')).json(); } catch { jobs = []; }
    renderJobs();
    const active = jobs.some(j => j.status === 'queued' || j.status === 'downloading');
    if (active || app.view === 'downloads') pollTimer = setTimeout(pollJobs, active ? 1000 : 4000);
  }
  function renderJobs() {
    const n = jobs.filter(j => j.status === 'queued' || j.status === 'downloading').length;
    $('dlBadge').hidden = !n; $('dlBadge').textContent = n;
    if (app.view !== 'downloads') return;
    const el = $('jobList');
    if (!app.server) { el.innerHTML = `<div class="empty"><span class="ms">cloud_off</span><b>Local helper not running</b><p>One-click downloads need it. In this folder run</p><pre style="display:inline-block">node server.js</pre><p>then open <a href="http://localhost:8787">localhost:8787</a>. Scripts in each dataset's <b>Script</b> menu work without it.</p></div>`; return; }
    if (!jobs.length) { el.innerHTML = `<div class="empty"><span class="ms">download</span>No downloads yet. Open a dataset in the <a href="#/catalog">catalog</a> and press <b>Download</b>.</div>`; return; }
    const ICON = { queued: 'schedule', downloading: 'downloading', done: 'check_circle', error: 'error', cancelled: 'cancel' };
    el.innerHTML = jobs.slice().reverse().map(j => {
      const pct = j.total ? Math.min(100, (j.received / j.total) * 100) : 0;
      const sub = j.status === 'downloading' ? `${fmtBytes(j.received)}${j.total ? ' of ' + fmtBytes(j.total) + ` · ${pct.toFixed(0)}%` : ''}`
        : j.status === 'done' ? `${fmtBytes(j.total || j.received)} · ${j.rel}` : j.status === 'error' ? j.error : j.status === 'queued' ? 'Waiting…' : 'Cancelled';
      return `<div class="job" data-id="${j.id}">
        <span class="ms st ${j.status}" style="grid-row:1 / span 2">${ICON[j.status]}</span>
        <div class="nm" title="${esc(j.url)}">${esc(j.name)}</div>
        <div class="ja">
          ${j.status === 'done' && previewable(j.name) ? `<button class="icon-btn sm" data-a="viz" title="Visualize"><span class="ms">map</span></button>` : ''}
          ${['error', 'cancelled'].includes(j.status) ? `<button class="icon-btn sm" data-a="retry" title="Retry / resume"><span class="ms">refresh</span></button>` : ''}
          ${['queued', 'downloading'].includes(j.status) ? `<button class="icon-btn sm" data-a="cancel" title="Cancel"><span class="ms">close</span></button>` : `<button class="icon-btn sm" data-a="remove" title="Remove from list"><span class="ms">delete_sweep</span></button>`}
        </div>
        ${j.status === 'downloading' ? `<div class="bar ${j.total ? '' : 'indet'}"><i style="width:${pct}%"></i></div>` : `<div class="sub">${esc(sub)}</div>`}
        ${j.status === 'downloading' ? `<div class="sub" style="grid-column:2">${esc(sub)}</div>` : ''}
      </div>`;
    }).join('');
  }

  // ---------- server status ----------
  async function checkServer() {
    try { const r = await (await fetch('/api/ping', { cache: 'no-store' })).json(); app.server = !!r.ok; if (r.downloads) $('dlPath').innerHTML = `Saved to <code>${esc(r.downloads)}</code>`; } catch { app.server = false; }
    const c = $('serverChip');
    c.className = 'status-chip ' + (app.server ? 'on' : 'off');
    c.querySelector('.label').textContent = app.server ? 'Local helper on' : 'Offline mode';
    c.title = app.server ? 'One-click downloads and map streaming are enabled' : 'Run "node server.js" for one-click downloads and map previews';
    c.style.cursor = app.server ? 'default' : 'pointer';
    c.onclick = app.server ? null : () => dialog('Turn on the local helper', `<p>The helper is a tiny Node.js server (no installs) that saves files into the <code>downloads</code> folder with progress and resume, and lets the map stream remote GeoTIFFs.</p><pre>cd "${esc(decodeURIComponent(location.pathname.replace(/\/[^/]*$/, '').replace(/^\//, '')) || '.')}"\nnode server.js</pre><p>Then open <a href="http://localhost:8787">http://localhost:8787</a>.</p>`);
    pollJobs();
  }

  // ---------- theme ----------
  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    const dark = t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
    $('themeBtn').querySelector('.ms').textContent = dark ? 'light_mode' : 'dark_mode';
    Viz.setBasemap();
  }

  // ---------- init ----------
  function init() {
    applyTheme(store.get('theme', null));
    $('themeBtn').onclick = () => {
      const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      const t = dark ? 'light' : 'dark'; store.set('theme', t); applyTheme(t);
    };
    $('fieldChips').onclick = e => { const b = e.target.closest('[data-field]'); if (b && !b.disabled) { state.field = b.dataset.field; renderCatalog(); } };
    $('kindChips').onclick = e => { const b = e.target.closest('[data-kind]'); if (b) { state.kind = b.dataset.kind; renderCatalog(); } };
    $('accessChips').onclick = e => { const b = e.target.closest('[data-access]'); if (b) { state.access = b.dataset.access; renderCatalog(); } };
    $('search').oninput = e => { state.q = e.target.value.trim(); if (app.view !== 'catalog') go('catalog'); else renderCatalog(); };
    document.addEventListener('keydown', e => {
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('search').focus(); }
      if (e.key === 'Escape') { $('scrim').hidden = true; }
    });
    $('menuBtn').onclick = () => go('catalog');
    $('openFolderBtn').onclick = async () => { if (!app.server) return toast('Start the local helper first'); await fetch('/api/open-folder'); };
    $('clearDoneBtn').onclick = async () => { for (const j of jobs.filter(j => ['done', 'cancelled'].includes(j.status))) await fetch(`/api/jobs/${j.id}/remove`, { method: 'POST' }); pollJobs(); };
    $('jobList').onclick = async e => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const id = b.closest('.job').dataset.id, j = jobs.find(x => x.id === id);
      if (b.dataset.a === 'viz') { const ds = CATALOG.find(d => d.id === j.folder); return Viz.loadUrl('/' + j.rel, { title: j.name }); }
      await fetch(`/api/jobs/${id}/${b.dataset.a}`, { method: 'POST' }); pollJobs();
    };
    Viz.init();
    window.addEventListener('hashchange', route);
    route();
    checkServer();
  }

  Object.assign(app, { go, toast, fmtBytes, init });
  return app;
})();

App.init();
