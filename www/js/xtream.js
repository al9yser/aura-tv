// Xtream Codes API helpers. Network access is injected (getJson) so this is testable.
import { makeChannel } from './parser.js';

const enc = encodeURIComponent;
const arr = (x) => (Array.isArray(x) ? x : []);

export function normalizeServer(input) {
  let s = String(input || '').trim();
  if (!s) throw new Error('server');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;
  const u = new URL(s);
  const path = u.pathname.replace(/\/player_api\.php$/i, '').replace(/\/+$/, '');
  return u.origin + path;
}

export function apiUrl(server, user, pass, action, extra) {
  return `${server}/player_api.php?username=${enc(user)}&password=${enc(pass)}` +
    (action ? `&action=${action}` : '') + (extra || '');
}

export const liveUrl = (s, u, p, id, ext = 'm3u8') => `${s}/live/${enc(u)}/${enc(p)}/${id}.${ext}`;
export const movieUrl = (s, u, p, id, ext = 'mp4') => `${s}/movie/${enc(u)}/${enc(p)}/${id}.${ext}`;
export const episodeUrl = (s, u, p, id, ext = 'mp4') => `${s}/series/${enc(u)}/${enc(p)}/${id}.${ext}`;

function catMap(cats) {
  const m = new Map();
  for (const c of arr(cats)) m.set(String(c.category_id), c.category_name || '');
  return m;
}

export function mapLive(streams, cats, src) {
  const cm = catMap(cats);
  return arr(streams).map((s) => makeChannel({
    key: `live|${src.server}|${s.stream_id}`,
    name: s.name,
    url: liveUrl(src.server, src.user, src.pass, s.stream_id, 'm3u8'),
    logo: s.stream_icon,
    group: cm.get(String(s.category_id)) || '',
    tvgId: s.epg_channel_id,
    type: 'live',
    extra: { alt: liveUrl(src.server, src.user, src.pass, s.stream_id, 'ts') },
  }));
}

export function mapVod(streams, cats, src) {
  const cm = catMap(cats);
  return arr(streams).map((s) => makeChannel({
    key: `movie|${src.server}|${s.stream_id}`,
    name: s.name,
    url: movieUrl(src.server, src.user, src.pass, s.stream_id, s.container_extension || 'mp4'),
    logo: s.stream_icon,
    group: cm.get(String(s.category_id)) || '',
    type: 'movie',
  }));
}

export function mapSeries(list, cats, src) {
  const cm = catMap(cats);
  return arr(list).map((s) => makeChannel({
    key: `series|${src.server}|${s.series_id}`,
    name: s.name,
    url: '',
    logo: s.cover,
    group: cm.get(String(s.category_id)) || '',
    type: 'series',
    extra: { seriesId: s.series_id },
  }));
}

/** Turn a get_series_info response into [{season, episodes:[{id,title,num,url}]}]. */
export function parseSeriesInfo(info, src) {
  const eps = (info && info.episodes) || {};
  const seasons = Array.isArray(eps) ? eps.map((e, i) => [String(i + 1), e]) : Object.entries(eps);
  return seasons
    .map(([season, list]) => ({
      season: Number(season) || season,
      episodes: arr(list).map((e) => ({
        id: e.id,
        num: Number(e.episode_num) || 0,
        title: e.title || `S${season}E${e.episode_num}`,
        url: episodeUrl(src.server, src.user, src.pass, e.id, e.container_extension || 'mp4'),
      })).sort((a, b) => a.num - b.num),
    }))
    .sort((a, b) => Number(a.season) - Number(b.season));
}

/** Fetch everything for a source. Live must succeed; VOD/series failures are tolerated. */
export async function fetchAll(src, getJson) {
  const auth = await getJson(apiUrl(src.server, src.user, src.pass));
  const ui = auth && auth.user_info;
  if (!ui || Number(ui.auth) === 0 || String(ui.status || '').toLowerCase() === 'disabled') {
    const e = new Error('auth');
    e.code = 'auth';
    throw e;
  }
  const call = (a) => getJson(apiUrl(src.server, src.user, src.pass, a));
  const soft = (p) => p.catch(() => []);
  const [lc, ls, vc, vs, sc, ss] = await Promise.all([
    call('get_live_categories'), call('get_live_streams'),
    soft(call('get_vod_categories')), soft(call('get_vod_streams')),
    soft(call('get_series_categories')), soft(call('get_series')),
  ]);
  return [
    ...mapLive(ls, lc, src),
    ...mapVod(vs, vc, src),
    ...mapSeries(ss, sc, src),
  ];
}
