// Central Station — tiny local server (no dependencies).
//  • serves the web app
//  • /proxy?url=…   streams allow-listed data hosts with CORS + Range (for map previews)
//  • /api/head?url= checks availability and size of a file
//  • /api/jobs      downloads queued files into ./downloads with resume + progress
// Run:  node server.js   then open http://localhost:8787

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 8787;
const ROOT = __dirname;
const DL_DIR = path.join(ROOT, 'downloads');

// Only public, open-data hosts from the catalog may be proxied or downloaded.
const ALLOWED_HOSTS = [
  'geodata.ucdavis.edu',
  'os.zhdk.cloud.switch.ch',
  'nex-gddp-cmip6.s3-us-west-2.amazonaws.com',
  'nex-gddp-cmip6.s3.us-west-2.amazonaws.com',
  'data.chc.ucsb.edu',
  'thredds.northwestknowledge.net',
  'data.giss.nasa.gov',
  'berkeley-earth-temperature.s3.us-west-1.amazonaws.com',
  'gml.noaa.gov',
  'www.ncei.noaa.gov',
  'noaadata.apps.nsidc.org',
  'psl.noaa.gov',
  'downloads.psl.noaa.gov',
];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.zip': 'application/zip',
  '.gz': 'application/gzip', '.nc': 'application/x-netcdf', '.csv': 'text/csv', '.txt': 'text/plain',
};

function allowed(u) {
  try {
    const p = new URL(u);
    return (p.protocol === 'https:' || p.protocol === 'http:') && ALLOWED_HOSTS.includes(p.hostname);
  } catch { return false; }
}

// Follow redirects (only to allowed hosts).
function request(method, url, headers = {}, hops = 0) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('Too many redirects'));
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(url, { method, headers: { 'User-Agent': 'CentralStation/1.0', ...headers } }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        if (!allowed(next)) return reject(new Error('Redirect to non-allowed host: ' + next));
        return resolve(request(method, next, headers, hops + 1));
      }
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(60000, () => req.destroy(new Error('Timeout')));
    req.end();
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

// ---------- download jobs ----------
const jobs = []; // {id, url, dest, rel, status, received, total, error}
let active = false;

function safeName(s) { return s.replace(/[^a-zA-Z0-9._-]/g, '_'); }

// List files already in ./downloads so the history survives restarts.
try {
  for (const folder of fs.readdirSync(DL_DIR)) {
    const dir = path.join(DL_DIR, folder);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.part')) continue;
      const size = fs.statSync(path.join(dir, name)).size;
      jobs.push({ id: Math.random().toString(36).slice(2, 10), url: '', folder, name, rel: `downloads/${folder}/${name}`, dest: path.join(dir, name), status: 'done', received: size, total: size });
    }
  }
} catch {}

async function runQueue() {
  if (active) return;
  active = true;
  let job;
  while ((job = jobs.find(j => j.status === 'queued'))) {
    job.status = 'downloading';
    try {
      fs.mkdirSync(path.dirname(job.dest), { recursive: true });
      const part = job.dest + '.part';
      const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
      const res = await request('GET', job.url, have ? { Range: `bytes=${have}-` } : {});
      if (res.statusCode >= 400) throw new Error('HTTP ' + res.statusCode);
      const resumed = res.statusCode === 206;
      job.received = resumed ? have : 0;
      const len = Number(res.headers['content-length'] || 0);
      job.total = len ? len + job.received : 0;
      const out = fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' });
      await new Promise((resolve, reject) => {
        res.on('data', c => { job.received += c.length; if (job.status === 'cancelled') res.destroy(); });
        res.on('error', reject);
        res.on('close', resolve);
        res.pipe(out);
      });
      await new Promise(r => out.close(r));
      if (job.status === 'cancelled') continue;
      if (job.total && job.received < job.total) throw new Error('Connection dropped — retry to resume');
      fs.renameSync(part, job.dest);
      job.status = 'done';
    } catch (e) {
      if (job.status !== 'cancelled') { job.status = 'error'; job.error = e.message; }
    }
  }
  active = false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(b || '{}')); } catch (e) { reject(e); } });
  });
}

// ---------- server ----------
http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Range, Content-Type', 'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE' });
    return res.end();
  }

  if (u.pathname === '/proxy') {
    const target = u.searchParams.get('url');
    if (!allowed(target)) return json(res, 403, { error: 'Host not in allow-list' });
    try {
      const headers = req.headers.range ? { Range: req.headers.range } : {};
      const up = await request(req.method === 'HEAD' ? 'HEAD' : 'GET', target, headers);
      const out = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges' };
      for (const h of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified']) if (up.headers[h]) out[h] = up.headers[h];
      res.writeHead(up.statusCode, out);
      up.pipe(res);
      req.on('close', () => up.destroy());
    } catch (e) { json(res, 502, { error: e.message }); }
    return;
  }

  if (u.pathname === '/api/head') {
    const target = u.searchParams.get('url');
    if (!allowed(target)) return json(res, 403, { error: 'Host not in allow-list' });
    try {
      const up = await request('HEAD', target);
      up.resume();
      return json(res, 200, { ok: up.statusCode < 400, status: up.statusCode, size: Number(up.headers['content-length'] || 0) });
    } catch (e) { return json(res, 200, { ok: false, error: e.message }); }
  }

  if (u.pathname === '/api/jobs' && req.method === 'GET') {
    return json(res, 200, jobs.map(({ dest, ...j }) => j));
  }
  if (u.pathname === '/api/jobs' && req.method === 'POST') {
    try {
      const { items = [] } = await readBody(req);
      const added = [];
      for (const it of items) {
        if (!allowed(it.url)) continue;
        const name = safeName(decodeURIComponent(new URL(it.url).pathname.split('/').pop() || 'file'));
        const folder = safeName(it.folder || 'misc');
        if (jobs.some(j => (j.url === it.url || j.dest === path.join(DL_DIR, folder, name)) && ['queued', 'downloading', 'done'].includes(j.status))) continue;
        const job = { id: Math.random().toString(36).slice(2, 10), url: it.url, folder, name, rel: `downloads/${folder}/${name}`, dest: path.join(DL_DIR, folder, name), status: 'queued', received: 0, total: 0 };
        jobs.push(job); added.push(job.id);
      }
      runQueue();
      return json(res, 200, { added: added.length });
    } catch (e) { return json(res, 400, { error: e.message }); }
  }
  if (u.pathname.startsWith('/api/jobs/') && req.method === 'POST') {
    const [, , , id, action] = u.pathname.split('/');
    const job = jobs.find(j => j.id === id);
    if (!job) return json(res, 404, { error: 'No such job' });
    if (action === 'cancel' && ['queued', 'downloading'].includes(job.status)) job.status = 'cancelled';
    if (action === 'retry' && ['error', 'cancelled'].includes(job.status)) { job.status = 'queued'; job.error = undefined; runQueue(); }
    if (action === 'remove' && job.status !== 'downloading') jobs.splice(jobs.indexOf(job), 1);
    return json(res, 200, { ok: true });
  }
  if (u.pathname === '/api/open-folder') {
    fs.mkdirSync(DL_DIR, { recursive: true });
    const cmd = process.platform === 'win32' ? `explorer "${DL_DIR}"` : process.platform === 'darwin' ? `open "${DL_DIR}"` : `xdg-open "${DL_DIR}"`;
    require('child_process').exec(cmd);
    return json(res, 200, { ok: true, path: DL_DIR });
  }
  if (u.pathname === '/api/ping') return json(res, 200, { ok: true, downloads: DL_DIR });

  // static files (supports Range for local GeoTIFFs in ./downloads)
  let file = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname)));
  if (!file.startsWith(ROOT) || path.basename(file) === 'server.js') { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      const start = range[1] ? +range[1] : st.size - +range[2];
      const end = range[1] && range[2] ? Math.min(+range[2], st.size - 1) : st.size - 1;
      res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes' });
      return fs.createReadStream(file, { start, end }).pipe(res);
    }
    res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, () => console.log(`Central Station running → http://localhost:${PORT}`));
