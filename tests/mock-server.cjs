// Static server for www/ + fake IPTV provider (M3U list and Xtream API) for tests.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', 'www');
const VID = path.join(__dirname, 'fixtures', 'vid.webm');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

function m3u(n) {
  const groups = ['أخبار', 'رياضة', 'أطفال', 'Movies HD', 'مسلسلات عربية', 'Music'];
  let s = '#EXTM3U\n';
  for (let i = 0; i < n; i++) {
    const g = groups[i % groups.length];
    const q = ['', ' HD', ' FHD', ' 4K', ' SD'][i % 5];
    const nm = i % 7 === 0 ? `قناة الجزيرة ${i}${q}` : `Channel ${i}${q}`;
    const logo = i % 3 === 0 ? `http://127.0.0.1:${PORT}/logo-missing.png` : '';
    s += `#EXTINF:-1 tvg-id="c${i}" tvg-logo="${logo}" group-title="${g}",${nm}\nhttp://127.0.0.1:${PORT}/stream/${i}\n`;
  }
  return s;
}
function json(res, o) { res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify(o)); }

let PORT = 0;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname;
  if (p === '/list.m3u') { res.writeHead(200, { 'content-type': 'audio/x-mpegurl', 'access-control-allow-origin': '*' }); return res.end(m3u(1500)); }
  if (p === '/bad.m3u') { res.writeHead(200, { 'access-control-allow-origin': '*' }); return res.end('<html>nope</html>'); }
  if (p === '/vid.mp4') {
    const st = fs.statSync(VID); const range = req.headers.range;
    const h = { 'content-type': 'video/webm', 'accept-ranges': 'bytes', 'access-control-allow-origin': '*' };
    if (range) { const m = /bytes=(\d*)-(\d*)/.exec(range); const a = +m[1] || 0, b = m[2] ? +m[2] : st.size - 1; res.writeHead(206, { ...h, 'content-range': `bytes ${a}-${b}/${st.size}`, 'content-length': b - a + 1 }); return fs.createReadStream(VID, { start: a, end: b }).pipe(res); }
    res.writeHead(200, { ...h, 'content-length': st.size }); return fs.createReadStream(VID).pipe(res);
  }
  if (p === '/dead.mp4') { res.writeHead(404); return res.end(); }
  if (p === '/player_api.php') {
    const user = u.searchParams.get('username'), pass = u.searchParams.get('password'), act = u.searchParams.get('action');
    if (user !== 'good' || pass !== 'pw') return json(res, { user_info: { auth: 0 } });
    if (!act) return json(res, { user_info: { auth: 1, status: 'Active' }, server_info: {} });
    if (act === 'get_live_categories') return json(res, [{ category_id: '1', category_name: 'News' }, { category_id: '2', category_name: 'Sports' }]);
    if (act === 'get_live_streams') return json(res, Array.from({ length: 40 }, (_, i) => ({ stream_id: 100 + i, name: `XT Live ${i} HD`, category_id: String(1 + (i % 2)), stream_icon: '', epg_channel_id: '' })));
    if (act === 'get_vod_categories') return json(res, [{ category_id: '9', category_name: 'Action' }]);
    if (act === 'get_vod_streams') return json(res, [{ stream_id: 900, name: 'XT Movie', category_id: '9', container_extension: 'mp4' }]);
    if (act === 'get_series_categories') return json(res, [{ category_id: '7', category_name: 'Drama' }]);
    if (act === 'get_series') return json(res, [{ series_id: 5, name: 'XT Series', category_id: '7', cover: '' }]);
    if (act === 'get_series_info') return json(res, { episodes: { 1: [{ id: 'e1', episode_num: 1, title: 'Pilot', container_extension: 'mp4' }, { id: 'e2', episode_num: 2, title: 'Second', container_extension: 'mp4' }] } });
    return json(res, []);
  }
  // Xtream media URLs -> the test video
  if (/^\/(live|movie|series|stream)\//.test(p)) { req.url = '/vid.mp4'; return server.emit('request', req, res); }
  let f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
module.exports = { start: () => new Promise((r) => server.listen(0, '127.0.0.1', () => { PORT = server.address().port; r(PORT); })), stop: () => server.close() };
if (require.main === module) module.exports.start().then((p) => console.log('http://127.0.0.1:' + p));
