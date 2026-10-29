// Map visualizer: GeoTIFF (incl. .tif.gz and .zip) → classified overlay with adjustable classes.

const RAMPS = {
  'Perceptual': {
    Viridis: ['#440154', '#482878', '#3e4a89', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'],
    Magma: ['#000004', '#1c1044', '#4f127b', '#812581', '#b5367a', '#e55964', '#fb8761', '#fec287', '#fcfdbf'],
    Inferno: ['#000004', '#1f0c48', '#550f6d', '#88226a', '#ba3655', '#e35933', '#f98c0a', '#f9c932', '#fcffa4'],
    Plasma: ['#0d0887', '#4c02a1', '#7e03a8', '#a92395', '#cc4778', '#e56b5d', '#f89441', '#fdc328', '#f0f921'],
    Cividis: ['#00224e', '#123570', '#3b496c', '#575d6d', '#707173', '#8a8779', '#a69d75', '#c4b56c', '#e4cf5b', '#fee838'],
    Turbo: ['#30123b', '#4662d7', '#36aaf9', '#1ae4b6', '#72fe5e', '#c8ef34', '#faba39', '#f66b19', '#ca2a04', '#7a0403'],
  },
  'Climate': {
    Temperature: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026'],
    Rainfall: ['#fffbe6', '#e5f5b8', '#a8ddb5', '#5fc2c0', '#2b8cbe', '#225ea8', '#3a2c8f', '#5a0f7a'],
    Drought: ['#730000', '#e60000', '#ffaa00', '#fcd37f', '#ffff00', '#ffffff', '#aaff55', '#00ffff', '#00aaff', '#0000ff', '#0000aa'],
    Anomaly: ['#053061', '#2166ac', '#4393c3', '#92c5de', '#d1e5f0', '#f7f7f7', '#fddbc7', '#f4a582', '#d6604d', '#b2182b', '#67001f'],
  },
  'Diverging': {
    Spectral: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'],
    RdYlBu: ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee090', '#ffffbf', '#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'],
    BrBG: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#f5f5f5', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30'],
    PuOr: ['#7f3b08', '#b35806', '#e08214', '#fdb863', '#fee0b6', '#f7f7f7', '#d8daeb', '#b2abd2', '#8073ac', '#542788', '#2d004b'],
  },
  'Sequential': {
    YlGnBu: ['#ffffd9', '#edf8b1', '#c7e9b4', '#7fcdbb', '#41b6c4', '#1d91c0', '#225ea8', '#253494', '#081d58'],
    YlOrRd: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#bd0026', '#800026'],
    Blues: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08519c', '#08306b'],
    Greens: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#006d2c', '#00441b'],
    Reds: ['#fff5f0', '#fee0d2', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#a50f15', '#67000d'],
    Greys: ['#ffffff', '#f0f0f0', '#d9d9d9', '#bdbdbd', '#969696', '#737373', '#525252', '#252525', '#000000'],
  },
};
const ALL_RAMPS = Object.assign({}, ...Object.values(RAMPS));

const Viz = (() => {
  const $ = id => document.getElementById(id);
  const MAX_W = 3600; // display grid width (0.1° for a global layer)
  let map, overlay, legendCtl, baseLayer;
  let layer = null;   // raster data
  let src = null;     // { tiff, zip, entries, bands }
  const st = { mode: 'classes', method: 'quantile', k: 7, kWant: 7, ramp: 'Viridis', reverse: false, min: null, max: null, breaks: [], colors: [], overrides: {}, opacity: 0.85 };
  let idxCache = null, counts = [];

  // ---------- helpers ----------
  const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const rgb2hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  function rampAt(stops, t) {
    t = Math.min(1, Math.max(0, t));
    const p = t * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(p)), f = p - i;
    const a = hex2rgb(stops[i]), b = hex2rgb(stops[i + 1]);
    return rgb2hex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
  }
  const rampStops = () => { const s = ALL_RAMPS[st.ramp] || ALL_RAMPS.Viridis; return st.reverse ? [...s].reverse() : s; };
  const gradientCss = stops => `linear-gradient(90deg, ${stops.join(',')})`;
  function decimals() {
    const r = Math.abs(st.max - st.min) / Math.max(1, st.k);
    if (!isFinite(r) || r === 0) return 2;
    return Math.min(6, Math.max(0, 2 - Math.floor(Math.log10(r))));
  }
  const fmt = v => (v == null || !isFinite(v) ? '–' : (+v.toFixed(decimals())).toLocaleString('en', { maximumFractionDigits: decimals() }));
  const round = v => +v.toFixed(decimals());
  const loading = (on, text) => { $('mapLoading').hidden = !on; if (text) $('loadingText').textContent = text; };

  // ---------- map ----------
  function initMap() {
    if (map) return;
    map = L.map('map', { zoomControl: true, worldCopyJump: true, minZoom: 1, attributionControl: true }).setView([10, 15], 2);
    map.createPane('labels'); map.getPane('labels').style.zIndex = 650; map.getPane('labels').style.pointerEvents = 'none';
    setBasemap();
    legendCtl = L.control({ position: 'bottomright' });
    legendCtl.onAdd = () => { const d = L.DomUtil.create('div', 'legend'); d.id = 'legend'; d.hidden = true; return d; };
    legendCtl.addTo(map);
    map.on('mousemove', onHover);
    map.on('mouseout', () => { $('readout').hidden = true; });
  }
  function setBasemap() {
    if (!map) return;
    const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    if (baseLayer) map.removeLayer(baseLayer);
    baseLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19, className: dark ? 'basemap dark' : 'basemap',
    }).addTo(map);
  }

  // ---------- loading ----------
  async function fetchBuffer(url, label) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} while fetching file`);
    const total = +res.headers.get('content-length') || 0;
    const reader = res.body.getReader();
    const chunks = []; let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      loading(true, `${label} ${App.fmtBytes(got)}${total ? ' of ' + App.fmtBytes(total) : ''}`);
    }
    return new Blob(chunks).arrayBuffer();
  }
  async function gunzip(buf) {
    const ds = new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')));
    return ds.arrayBuffer();
  }
  function resolveUrl(url) {
    if (/^https?:/i.test(url) && new URL(url).origin !== location.origin && App.server) return '/proxy?url=' + encodeURIComponent(url);
    return url;
  }

  async function loadUrl(url, opts = {}) {
    App.go('visualize');
    initMap();
    const name = decodeURIComponent(url.split('?')[0].split('/').pop());
    try {
      loading(true, 'Connecting…');
      const u = resolveUrl(url);
      if (/\.nc(\.gz)?$/i.test(name)) throw new Error('NetCDF preview isn’t supported in the browser yet — convert to GeoTIFF first (gdal_translate NETCDF:file.nc:var out.tif).');
      if (/\.zip$/i.test(name)) return await openZip(await fetchBuffer(u, 'Downloading'), name, opts);
      if (/\.gz$/i.test(name)) return await openTiff(await GeoTIFF.fromArrayBuffer(await gunzip(await fetchBuffer(u, 'Downloading'))), name.replace(/\.gz$/i, ''), opts);
      const tiff = await GeoTIFF.fromUrl(u, { allowFullFile: true, blockSize: 1 << 20, cacheSize: 96 });
      await openTiff(tiff, name, opts);
    } catch (e) {
      loading(false);
      const cors = /Failed to fetch|NetworkError/i.test(e.message) && !App.server;
      App.toast(cors ? 'This server blocks browser access. Start the local helper (node server.js) to preview it.' : e.message, 7000);
      console.error(e);
    }
  }
  async function loadFile(file) {
    App.go('visualize');
    initMap();
    try {
      loading(true, 'Reading file…');
      const buf = await file.arrayBuffer();
      if (/\.zip$/i.test(file.name)) return await openZip(buf, file.name, {});
      if (/\.gz$/i.test(file.name)) return await openTiff(await GeoTIFF.fromArrayBuffer(await gunzip(buf)), file.name.replace(/\.gz$/i, ''), {});
      if (/\.nc$/i.test(file.name)) throw new Error('NetCDF preview isn’t supported yet — convert to GeoTIFF first (gdal_translate NETCDF:file.nc:var out.tif).');
      await openTiff(await GeoTIFF.fromArrayBuffer(buf), file.name, {});
    } catch (e) { loading(false); App.toast(e.message, 7000); console.error(e); }
  }
  async function openZip(buf, name, opts) {
    loading(true, 'Opening archive…');
    const zip = await JSZip.loadAsync(buf);
    const entries = Object.keys(zip.files).filter(f => /\.tiff?$/i.test(f) && !zip.files[f].dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (!entries.length) throw new Error('No GeoTIFF found inside ' + name);
    src = { zip, entries, opts };
    $('zipSelect').innerHTML = entries.map((e, i) => `<option value="${i}">${e.split('/').pop()}</option>`).join('');
    $('zipPick').hidden = entries.length < 2;
    await openZipEntry(0);
  }
  async function openZipEntry(i) {
    loading(true, 'Extracting…');
    const e = src.entries[i];
    const ab = await src.zip.file(e).async('arraybuffer');
    const keep = src;
    await openTiff(await GeoTIFF.fromArrayBuffer(ab), e.split('/').pop(), { ...keep.opts, title: null }, true);
    src = { ...keep, tiff: src.tiff };
  }

  function gdalScaleOffset(img) {
    const xml = img.fileDirectory.GDALMetadata || '';
    const get = role => { const m = new RegExp(`<Item[^>]*role="${role}"[^>]*>([^<]+)<`).exec(xml); return m ? parseFloat(m[1]) : null; };
    return { scale: get('scale'), offset: get('offset') };
  }

  async function openTiff(tiff, name, opts = {}, fromZip = false) {
    const count = await tiff.getImageCount();
    const main = await tiff.getImage(0);
    const bands = main.getSamplesPerPixel();
    if (!fromZip) { src = { tiff, opts }; $('zipPick').hidden = true; } else src.tiff = tiff;
    src.tiff = tiff; src.main = main; src.count = count;
    const names = opts.bands && opts.bands.length === bands ? opts.bands : Array.from({ length: bands }, (_, i) => `Band ${i + 1}`);
    $('bandSelect').innerHTML = names.map((n, i) => `<option value="${i}">${i + 1} · ${n}</option>`).join('');
    $('bandPick').hidden = bands < 2;
    const so = gdalScaleOffset(main);
    const preset = opts.units === 'chelsa-temp' ? { scale: 0.1, offset: -273.15, unit: '°C' } : null;
    const scale = so.scale ?? preset?.scale ?? 1, offset = so.offset ?? preset?.offset ?? 0;
    $('scaleIn').value = scale; $('offsetIn').value = offset;
    $('unitLabel').value = preset?.unit || (scale === 0.1 && offset === -273.15 ? '°C' : '');
    syncPreset();
    $('nodataIn').value = main.getGDALNoData() ?? '';
    $('layerTitle').value = opts.title || name.replace(/\.(tiff?)$/i, '');
    st.overrides = {}; if (st.method === 'manual') st.method = 'quantile';
    await readBand(0, name);
  }

  async function readBand(band, name) {
    const main = src.main;
    const W = main.getWidth(), H = main.getHeight();
    const tw = Math.min(W, MAX_W), th = Math.max(1, Math.round(H * tw / W));
    let img = main;
    for (let i = 1; i < src.count; i++) {
      const o = await src.tiff.getImage(i);
      if ((o.fileDirectory.NewSubfileType || 0) & 4) continue; // mask
      if (o.getWidth() >= tw && o.getWidth() < img.getWidth()) img = o;
    }
    // Read in horizontal strips so huge rasters without overviews never need full-resolution memory.
    const iw = img.getWidth(), ih = img.getHeight();
    const big = iw * ih > 30e6;
    const raw = new Float32Array(tw * th);
    const stripOut = big ? Math.max(1, Math.floor((16e6 / iw) * (th / ih))) : th;
    for (let oy = 0; oy < th; oy += stripOut) {
      const oy1 = Math.min(th, oy + stripOut);
      loading(true, big ? `Streaming a large file without overviews… ${Math.round((oy / th) * 100)}%` : 'Reading pixels…');
      const win = [0, Math.round((oy * ih) / th), iw, Math.max(Math.round((oy * ih) / th) + 1, Math.round((oy1 * ih) / th))];
      const part = await img.readRasters({ samples: [band], window: win, width: tw, height: oy1 - oy, resampleMethod: 'nearest', interleave: false });
      raw.set(part[0], oy * tw);
    }
    const bbox = main.getBoundingBox();
    const keys = main.getGeoKeys() || {};
    const projected = keys.ProjectedCSTypeGeoKey && keys.ProjectedCSTypeGeoKey !== 4326;
    layer = { raw, gw: tw, gh: th, bbox, name, W, H, band, projected };
    $('layerMeta').innerHTML = `${W.toLocaleString()} × ${H.toLocaleString()} px · ${main.getSamplesPerPixel()} band(s) · showing ${tw.toLocaleString()} × ${th.toLocaleString()}${projected ? '<br><b style="color:var(--error)">Projected CRS — shown approximately; lat/lon rasters display best.</b>' : ''}`;
    computeValues(true);
    $('vizControls').hidden = false; $('vizEmpty').hidden = true;
    loading(false);
    const [w, s, e, n] = bbox;
    if (!projected) map.fitBounds([[Math.max(s, -80), w], [Math.min(n, 80), e]], { padding: [20, 20] });
  }

  function computeValues(resetRange) {
    if (!layer) return;
    const scale = parseFloat($('scaleIn').value) || 1, offset = parseFloat($('offsetIn').value) || 0;
    const ndIn = $('nodataIn').value.trim(), nd = ndIn === '' ? null : parseFloat(ndIn);
    const raw = layer.raw, n = raw.length, vals = new Float32Array(n);
    let mn = Infinity, mx = -Infinity, valid = 0, rmin = Infinity;
    for (let i = 0; i < n; i++) {
      const r = raw[i];
      if (r < rmin) rmin = r;
      if (r !== r || (nd !== null && (r === nd || Math.abs(r - nd) < 1e-6 * Math.abs(nd))) || r < -1e30 || r > 1e30) { vals[i] = NaN; continue; }
      const v = r * scale + offset; vals[i] = v; valid++;
      if (v < mn) mn = v; if (v > mx) mx = v;
    }
    // Unflagged sentinel no-data (e.g. CHIRPS -9999): detect once and retry.
    if (nd === null && [-9999, -99999, -999, -32768, -32767, -9999.9].includes(rmin)) { $('nodataIn').value = rmin; return computeValues(resetRange); }
    const step = Math.max(1, Math.floor(valid / 60000));
    const sample = []; let c = 0;
    for (let i = 0; i < n; i++) if (vals[i] === vals[i] && (c++ % step === 0)) sample.push(vals[i]);
    sample.sort((a, b) => a - b);
    Object.assign(layer, { vals, dmin: mn, dmax: mx, sample, valid });
    if (!valid) { App.toast('No valid pixels — check the no-data value.'); return; }
    if (resetRange || st.min == null) { st.min = mn; st.max = mx; }
    classify();
  }

  // ---------- classification ----------
  function classify() {
    if (!layer || !layer.valid) return;
    const { min, max } = st, k = st.method === 'manual' ? st.k : st.kWant, s = layer.sample.filter(v => v >= min && v <= max);
    let inner = [];
    if (st.method === 'equal') inner = range(1, k - 1).map(i => min + (i * (max - min)) / k);
    else if (st.method === 'quantile') inner = range(1, k - 1).map(i => s[Math.min(s.length - 1, Math.floor((i / k) * s.length))]);
    else if (st.method === 'jenks') inner = jenks(s, k);
    else if (st.method === 'pretty') inner = pretty(min, max, k);
    else if (st.method === 'stddev') {
      const mean = s.reduce((a, b) => a + b, 0) / s.length, sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
      inner = range(1, k - 1).map(i => mean + (i - k / 2) * sd);
    } else if (st.method === 'manual' && st.breaks.length === k + 1) inner = st.breaks.slice(1, -1);
    else inner = range(1, k - 1).map(i => min + (i * (max - min)) / k);
    if (st.method !== 'manual') inner = inner.map(round);
    inner = [...new Set(inner.filter(v => v > min && v < max))].sort((a, b) => a - b);
    st.k = inner.length + 1;
    st.breaks = [min, ...inner, max];
    makeColors();
    render();
  }
  const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i);
  function pretty(min, max, k) {
    const raw = (max - min) / k, mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
    const step = (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
    const out = []; for (let v = Math.ceil(min / step) * step; v < max; v += step) out.push(+v.toPrecision(12));
    return out;
  }
  function jenks(sorted, k) {
    let data = sorted;
    if (data.length > 1500) { const st2 = data.length / 1500; data = range(0, 1499).map(i => sorted[Math.floor(i * st2)]); }
    const n = data.length;
    if (n <= k) return data.slice(1);
    const lower = Array.from({ length: n + 1 }, () => new Int32Array(k + 1));
    const vari = Array.from({ length: n + 1 }, () => new Float64Array(k + 1).fill(Infinity));
    for (let j = 1; j <= k; j++) { lower[1][j] = 1; vari[1][j] = 0; }
    for (let l = 2; l <= n; l++) {
      let s1 = 0, s2 = 0, w = 0, v = 0;
      for (let m = 1; m <= l; m++) {
        const i3 = l - m + 1, val = data[i3 - 1];
        s2 += val * val; s1 += val; w++;
        v = s2 - (s1 * s1) / w;
        const i4 = i3 - 1;
        if (i4 !== 0) for (let j = 2; j <= k; j++) if (vari[l][j] >= v + vari[i4][j - 1]) { lower[l][j] = i3; vari[l][j] = v + vari[i4][j - 1]; }
      }
      lower[l][1] = 1; vari[l][1] = v;
    }
    const out = []; let kk = n;
    for (let j = k; j >= 2; j--) { const id = lower[kk][j] - 2; out.unshift(data[Math.max(0, id)]); kk = lower[kk][j] - 1; }
    return out;
  }
  function makeColors() {
    const stops = rampStops(), k = st.k;
    st.colors = range(0, k - 1).map(i => st.overrides[i] || rampAt(stops, k === 1 ? 0.5 : i / (k - 1)));
  }

  // ---------- rendering ----------
  function buildIndex() {
    const { vals } = layer, n = vals.length, idx = new Uint8Array(n);
    counts = new Array(st.k).fill(0);
    if (st.mode === 'classes') {
      const b = st.breaks.slice(1, -1);
      for (let i = 0; i < n; i++) {
        const v = vals[i];
        if (v !== v) { idx[i] = 255; continue; }
        let c = 0; while (c < b.length && v > b[c]) c++;
        idx[i] = c; counts[c]++;
      }
    } else {
      const lo = st.min, span = st.max - st.min || 1;
      for (let i = 0; i < n; i++) {
        const v = vals[i];
        idx[i] = v !== v ? 255 : Math.max(0, Math.min(254, Math.round(((v - lo) / span) * 254)));
      }
    }
    idxCache = idx;
  }
  function lut() {
    const L8 = new Uint8ClampedArray(256 * 4);
    if (st.mode === 'classes') st.colors.forEach((c, i) => { const [r, g, b] = hex2rgb(c); L8.set([r, g, b, 255], i * 4); });
    else { const s = rampStops(); for (let i = 0; i < 255; i++) { const [r, g, b] = hex2rgb(rampAt(s, i / 254)); L8.set([r, g, b, 255], i * 4); } }
    return L8;
  }
  // Equirectangular canvas of the classified raster (for exports)
  function flatCanvas() {
    const { gw, gh } = layer, cv = document.createElement('canvas'); cv.width = gw; cv.height = gh;
    const ctx = cv.getContext('2d'), im = ctx.createImageData(gw, gh), T = lut();
    for (let i = 0; i < idxCache.length; i++) { const c = idxCache[i] * 4; im.data[i * 4] = T[c]; im.data[i * 4 + 1] = T[c + 1]; im.data[i * 4 + 2] = T[c + 2]; im.data[i * 4 + 3] = idxCache[i] === 255 ? 0 : 255; }
    ctx.putImageData(im, 0, 0);
    return cv;
  }
  const merc = lat => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  let renderToken = 0;
  function render() {
    if (!layer) return;
    buildIndex();
    const { gw, gh, bbox: [w, s, e, n] } = layer;
    const T = lut();
    const top = Math.min(n, 85.0511), bot = Math.max(s, -85.0511);
    const yTop = merc(top), yBot = merc(bot);
    const ow = gw, oh = Math.max(1, Math.min(8192, Math.round(ow * (yTop - yBot) / (((e - w) * Math.PI) / 180))));
    const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh;
    const ctx = cv.getContext('2d'), im = ctx.createImageData(ow, oh), d = im.data;
    for (let y = 0; y < oh; y++) {
      const my = yTop - ((y + 0.5) / oh) * (yTop - yBot);
      const lat = (Math.atan(Math.sinh(my)) * 180) / Math.PI;
      const sr = Math.min(gh - 1, Math.max(0, Math.floor(((n - lat) / (n - s)) * gh)));
      const rowOff = sr * gw, o = y * ow * 4;
      for (let x = 0; x < ow; x++) {
        const id = idxCache[rowOff + x], c = id * 4, p = o + x * 4;
        if (id === 255) continue;
        d[p] = T[c]; d[p + 1] = T[c + 1]; d[p + 2] = T[c + 2]; d[p + 3] = 255;
      }
    }
    ctx.putImageData(im, 0, 0);
    const token = ++renderToken;
    cv.toBlob(blob => {
      if (token !== renderToken) return;
      const url = URL.createObjectURL(blob), bounds = [[bot, w], [top, e]];
      if (overlay) { URL.revokeObjectURL(overlay._url); overlay.setUrl(url); overlay.setBounds(L.latLngBounds(bounds)); }
      else overlay = L.imageOverlay(url, bounds, { opacity: st.opacity, className: 'raster-img' }).addTo(map);
      overlay._url = url;
    });
    drawUI();
  }

  // ---------- panel UI ----------
  function drawUI() {
    $('kOut').textContent = st.k;
    $('methodSelect').value = st.method;
    $('minIn').value = round(st.min); $('maxIn').value = round(st.max);
    $('rampSwatch').style.background = gradientCss(rampStops());
    $('rampName').textContent = st.ramp + (st.reverse ? ' (reversed)' : '');
    $('methodFld').style.display = $('countFld').style.display = st.mode === 'classes' ? '' : 'none';
    document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
    const total = counts.reduce((a, b) => a + b, 0) || 1, unit = $('unitLabel').value;
    if (st.mode === 'classes') {
      $('classTable').innerHTML = '<tr><td></td><td class="lbl">From</td><td class="lbl">To ≤</td><td class="pct">Area</td></tr>' + st.colors.map((c, i) => `
        <tr>
          <td><input type="color" value="${c}" data-ci="${i}" aria-label="Class ${i + 1} colour"></td>
          <td class="lbl">${i === 0 ? '≥ ' + fmt(st.breaks[0]) : '> ' + fmt(st.breaks[i])}</td>
          <td>${i < st.k - 1 ? `<input type="number" step="any" value="${round(st.breaks[i + 1])}" data-bi="${i + 1}" aria-label="Upper break of class ${i + 1}">` : `<span class="lbl">${fmt(st.breaks[i + 1])}</span>`}</td>
          <td class="pct">${((counts[i] / total) * 100).toFixed(1)}%</td>
        </tr>`).join('');
    } else $('classTable').innerHTML = '';
    drawHisto();
    const lg = $('legend');
    if (lg) {
      lg.hidden = false;
      const title = `<b>${esc($('layerTitle').value)}${unit ? ` <span class="muted">(${esc(unit)})</span>` : ''}</b>`;
      lg.innerHTML = st.mode === 'classes'
        ? title + st.colors.slice().reverse().map((c, ri) => { const i = st.k - 1 - ri; return `<div class="row"><span class="sw" style="background:${c}"></span>${classLabel(i)}</div>`; }).join('')
        : title + `<div class="grad" style="background:${gradientCss(rampStops())}"></div><div class="ends"><span>${fmt(st.min)}</span><span>${fmt(st.max)}</span></div>`;
    }
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function classLabel(i) {
    const b = st.breaks;
    if (st.k === 1) return `${fmt(b[0])} – ${fmt(b[1])}`;
    if (i === 0) return `≤ ${fmt(b[1])}`;
    if (i === st.k - 1) return `> ${fmt(b[i])}`;
    return `${fmt(b[i])} – ${fmt(b[i + 1])}`;
  }

  // histogram with draggable breaks
  let histoGeom = null, dragging = -1;
  function drawHisto() {
    const cv = $('histo'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height, pad = 8;
    ctx.clearRect(0, 0, W, H);
    if (!layer) return;
    const { min, max } = st, bins = 64, h = new Array(bins).fill(0), span = max - min || 1;
    for (const v of layer.sample) { if (v < min || v > max) continue; h[Math.min(bins - 1, Math.floor(((v - min) / span) * bins))]++; }
    const hm = Math.max(...h) || 1, bw = (W - pad * 2) / bins;
    const css = getComputedStyle(document.documentElement);
    const x = v => pad + ((v - min) / span) * (W - pad * 2);
    h.forEach((c, i) => {
      const mid = min + ((i + 0.5) / bins) * span;
      let col;
      if (st.mode === 'classes') { let ci = 0; while (ci < st.k - 1 && mid > st.breaks[ci + 1]) ci++; col = st.colors[ci]; }
      else col = rampAt(rampStops(), (i + 0.5) / bins);
      ctx.fillStyle = col;
      const bh = Math.max(c ? 2 : 0, (Math.sqrt(c / hm)) * (H - 24));
      ctx.fillRect(pad + i * bw + 0.5, H - 14 - bh, bw - 1, bh);
    });
    ctx.fillStyle = css.getPropertyValue('--on-surface-var'); ctx.font = '20px Roboto Flex, sans-serif';
    ctx.textAlign = 'left'; ctx.fillText(fmt(min), pad, H - 0); ctx.textAlign = 'right'; ctx.fillText(fmt(max), W - pad, H - 0);
    if (st.mode === 'classes') {
      ctx.strokeStyle = css.getPropertyValue('--on-surface'); ctx.lineWidth = 2;
      st.breaks.slice(1, -1).forEach(b => { const xx = x(b); ctx.beginPath(); ctx.moveTo(xx, 4); ctx.lineTo(xx, H - 14); ctx.stroke(); ctx.beginPath(); ctx.arc(xx, 6, 5, 0, 7); ctx.fill(); });
    }
    histoGeom = { x, inv: px => min + ((px - pad) / (W - pad * 2)) * span, W };
  }
  function histoPointer(ev) {
    const cv = $('histo'), r = cv.getBoundingClientRect();
    return ((ev.clientX - r.left) / r.width) * cv.width;
  }

  function onHover(e) {
    if (!layer) return;
    const { gw, gh, bbox: [w, s, ee, n], vals } = layer;
    let lng = ((e.latlng.lng + 180) % 360 + 360) % 360 - 180;
    const lat = e.latlng.lat;
    const c = Math.floor(((lng - w) / (ee - w)) * gw), r = Math.floor(((n - lat) / (n - s)) * gh);
    const ro = $('readout');
    if (c < 0 || r < 0 || c >= gw || r >= gh) { ro.hidden = true; return; }
    const v = vals[r * gw + c];
    ro.hidden = false;
    ro.textContent = `${lat.toFixed(3)}, ${lng.toFixed(3)}   ${v === v ? fmt(v) + ' ' + $('unitLabel').value : 'no data'}`;
  }

  // ---------- exports ----------
  function download(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
  const baseName = () => ($('layerTitle').value || 'layer').replace(/[^\w.-]+/g, '_');
  function exportPng() {
    const flat = flatCanvas(), W = Math.max(1200, Math.min(2400, flat.width)), H = Math.round(W * flat.height / flat.width);
    const legendRows = st.mode === 'classes' ? st.k : 2, LH = 60 + legendRows * 26;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H + LH + 60;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.fillStyle = '#1f1f1f'; ctx.font = '500 28px Roboto Flex, sans-serif'; ctx.fillText($('layerTitle').value, 20, 40);
    ctx.fillStyle = '#e9eef6'; ctx.fillRect(0, 60, W, H);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(flat, 0, 60, W, H);
    let y = H + 100; ctx.font = '18px Roboto Flex, sans-serif';
    ctx.fillStyle = '#1f1f1f'; ctx.fillText($('unitLabel').value || 'Value', 20, y); y += 14;
    if (st.mode === 'classes') st.colors.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(20, y, 30, 18); ctx.fillStyle = '#1f1f1f'; ctx.fillText(classLabel(i), 62, y + 15); y += 26; });
    else { const g = ctx.createLinearGradient(20, 0, 420, 0); rampStops().forEach((c, i, a) => g.addColorStop(i / (a.length - 1), c)); ctx.fillStyle = g; ctx.fillRect(20, y, 400, 18); ctx.fillStyle = '#1f1f1f'; ctx.fillText(fmt(st.min), 20, y + 40); ctx.textAlign = 'right'; ctx.fillText(fmt(st.max), 420, y + 40); ctx.textAlign = 'left'; }
    ctx.fillStyle = '#747775'; ctx.font = '14px Roboto Flex, sans-serif'; ctx.fillText('Made with Central Station · data © original publisher', 20, cv.height - 16);
    cv.toBlob(b => download(b, baseName() + '.png'));
  }
  async function exportGeo() {
    const flat = flatCanvas(), { gw, gh, bbox: [w, s, e, n] } = layer;
    const px = (e - w) / gw, py = (n - s) / gh;
    const zip = new JSZip(), b = baseName();
    zip.file(b + '.png', await new Promise(r => flat.toBlob(r)));
    zip.file(b + '.pgw', [px, 0, 0, -py, w + px / 2, n - py / 2].join('\n'));
    zip.file(b + '.prj', 'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]');
    zip.file(b + '_legend.csv', 'class,from,to,color,label\n' + st.colors.map((c, i) => `${i + 1},${st.breaks[i]},${st.breaks[i + 1]},${c},"${classLabel(i)}"`).join('\n'));
    download(await zip.generateAsync({ type: 'blob' }), b + '_georef.zip');
  }
  function exportQgis() {
    const lines = ['# QGIS Generated Color Map Export File', `INTERPOLATION:${st.mode === 'classes' ? 'DISCRETE' : 'INTERPOLATED'}`];
    if (st.mode === 'classes') st.colors.forEach((c, i) => { const [r, g, b] = hex2rgb(c); lines.push(`${i === st.k - 1 ? 'inf' : st.breaks[i + 1]},${r},${g},${b},255,${classLabel(i)}`); });
    else { const s = rampStops(); s.forEach((c, i) => { const [r, g, b] = hex2rgb(c); lines.push(`${st.min + (i / (s.length - 1)) * (st.max - st.min)},${r},${g},${b},255,`); }); }
    lines.push('');
    download(new Blob([lines.join('\n')], { type: 'text/plain' }), baseName() + '_qgis_colormap.txt');
    App.toast('In QGIS: Layer Properties → Symbology → Singleband pseudocolor → Load colour map from file. Remember: QGIS sees raw values, so apply the same scale first.', 8000);
  }
  function exportScheme() {
    const s = { mode: st.mode, method: st.method, k: st.k, ramp: st.ramp, reverse: st.reverse, min: st.min, max: st.max, breaks: st.breaks, colors: st.colors, unit: $('unitLabel').value, scale: +$('scaleIn').value, offset: +$('offsetIn').value };
    download(new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }), baseName() + '_scheme.json');
  }
  async function loadScheme(file) {
    const s = JSON.parse(await file.text());
    if (s.scale != null) $('scaleIn').value = s.scale; if (s.offset != null) $('offsetIn').value = s.offset; if (s.unit != null) $('unitLabel').value = s.unit;
    syncPreset();
    Object.assign(st, { mode: s.mode || 'classes', ramp: s.ramp || st.ramp, reverse: !!s.reverse, k: s.k || st.k, overrides: {} });
    if (layer) computeValues(false);
    if (s.min != null) { st.min = s.min; st.max = s.max; }
    if (Array.isArray(s.breaks) && s.breaks.length > 1) { st.method = 'manual'; st.breaks = s.breaks; st.k = st.kWant = s.breaks.length - 1; }
    if (Array.isArray(s.colors)) s.colors.forEach((c, i) => { st.overrides[i] = c; });
    classify();
    App.toast('Scheme loaded');
  }

  function syncPreset() {
    const v = `${+$('scaleIn').value},${+$('offsetIn').value},`;
    const opt = [...$('unitPreset').options].find(o => o.value.startsWith(v));
    $('unitPreset').value = opt ? opt.value : 'custom';
  }

  // ---------- wiring ----------
  function buildRampMenu() {
    const m = $('rampMenu');
    m.innerHTML = Object.entries(RAMPS).map(([g, rs]) => `<div class="grp">${g}</div>` + Object.entries(rs).map(([n, s]) => `<button data-ramp="${n}"><span class="ramp-swatch" style="background:${gradientCss(s)}"></span>${n}</button>`).join('')).join('');
    m.onclick = e => { const b = e.target.closest('[data-ramp]'); if (!b) return; st.ramp = b.dataset.ramp; st.overrides = {}; m.hidden = true; makeColors(); render(); };
  }
  function init() {
    buildRampMenu();
    const drop = $('drop');
    ['dragenter', 'dragover'].forEach(ev => document.addEventListener(ev, e => { if (App.view !== 'visualize') return; e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(ev => document.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
    document.addEventListener('drop', e => { const f = e.dataTransfer?.files?.[0]; if (f && App.view === 'visualize') loadFile(f); });
    $('fileInput').onchange = e => e.target.files[0] && loadFile(e.target.files[0]);
    $('urlBtn').onclick = () => $('urlInput').value.trim() && loadUrl($('urlInput').value.trim());
    $('urlInput').onkeydown = e => { if (e.key === 'Enter') $('urlBtn').click(); };
    $('bandSelect').onchange = async e => { loading(true, 'Reading band…'); await readBand(+e.target.value, layer?.name); };
    $('zipSelect').onchange = e => openZipEntry(+e.target.value);
    $('unitPreset').onchange = e => {
      if (e.target.value === 'custom') { $('unitSection').open = true; return; }
      const [sc, of, un] = e.target.value.split(',');
      $('scaleIn').value = sc; $('offsetIn').value = of; if (un) $('unitLabel').value = un;
      computeValues(true);
    };
    ['scaleIn', 'offsetIn', 'nodataIn'].forEach(id => $(id).addEventListener('change', () => { syncPreset(); computeValues(true); }));
    $('unitLabel').oninput = $('layerTitle').oninput = () => drawUI();
    $('modeSeg').onclick = e => { const b = e.target.closest('button'); if (!b) return; st.mode = b.dataset.mode; render(); };
    $('methodSelect').onchange = e => { st.method = e.target.value; classify(); };
    $('kMinus').onclick = () => { if (st.k > 2) { st.kWant = st.k - 1; if (st.method === 'manual') st.method = 'equal'; st.overrides = {}; classify(); } };
    $('kPlus').onclick = () => { if (st.k < 12) { st.kWant = st.k + 1; if (st.method === 'manual') st.method = 'equal'; st.overrides = {}; classify(); } };
    $('rampBtn').onclick = e => { e.stopPropagation(); $('rampMenu').hidden = !$('rampMenu').hidden; };
    document.addEventListener('click', e => { if (!e.target.closest('.ramp-row')) $('rampMenu').hidden = true; });
    $('reverseBtn').onclick = () => { st.reverse = !st.reverse; st.overrides = {}; makeColors(); render(); };
    $('minIn').onchange = $('maxIn').onchange = () => {
      const a = parseFloat($('minIn').value), b = parseFloat($('maxIn').value);
      if (isFinite(a) && isFinite(b) && a < b) { st.min = a; st.max = b; if (st.method === 'manual') st.method = 'equal'; classify(); }
    };
    $('resetRangeBtn').onclick = () => { if (!layer) return; st.min = layer.dmin; st.max = layer.dmax; if (st.method === 'manual') st.method = 'quantile'; classify(); };
    $('classTable').addEventListener('change', e => {
      const t = e.target;
      if (t.dataset.ci != null) { st.overrides[+t.dataset.ci] = t.value; makeColors(); render(); }
      if (t.dataset.bi != null) {
        const i = +t.dataset.bi, v = parseFloat(t.value);
        if (!isFinite(v)) return;
        st.breaks[i] = v; st.breaks = [st.breaks[0], ...st.breaks.slice(1, -1).sort((a, b) => a - b), st.breaks[st.breaks.length - 1]];
        st.method = 'manual'; render();
      }
    });
    $('classTable').addEventListener('input', e => { if (e.target.dataset.ci != null) { st.overrides[+e.target.dataset.ci] = e.target.value; makeColors(); drawHisto(); } });
    $('opacityIn').oninput = e => { st.opacity = +e.target.value; overlay?.setOpacity(st.opacity); };
    const hc = $('histo');
    hc.addEventListener('mousedown', e => {
      if (!histoGeom || st.mode !== 'classes') return;
      const px = histoPointer(e);
      let best = -1, bd = 14;
      st.breaks.forEach((b, i) => { if (i === 0 || i === st.breaks.length - 1) return; const d = Math.abs(histoGeom.x(b) - px); if (d < bd) { bd = d; best = i; } });
      dragging = best;
    });
    hc.addEventListener('mousemove', e => {
      if (!histoGeom || st.mode !== 'classes') return;
      const px = histoPointer(e);
      if (dragging < 0) { hc.style.cursor = st.breaks.some((b, i) => i && i < st.breaks.length - 1 && Math.abs(histoGeom.x(b) - px) < 14) ? 'ew-resize' : 'default'; return; }
      const lo = st.breaks[dragging - 1], hi = st.breaks[dragging + 1];
      st.breaks[dragging] = round(Math.min(hi - 1e-9, Math.max(lo + 1e-9, histoGeom.inv(px))));
      st.method = 'manual'; $('methodSelect').value = 'manual';
      drawHisto();
    });
    window.addEventListener('mouseup', () => { if (dragging >= 0) { dragging = -1; render(); } });
    $('exportPng').onclick = () => layer && exportPng();
    $('exportGeo').onclick = () => layer && exportGeo();
    $('exportQgis').onclick = () => layer && exportQgis();
    $('exportScheme').onclick = () => exportScheme();
    $('schemeIn').onchange = e => e.target.files[0] && loadScheme(e.target.files[0]);
  }

  return {
    init, loadUrl, loadFile, setBasemap,
    show() { initMap(); setTimeout(() => map.invalidateSize(), 50); },
  };
})();
