// M3U parsing + text helpers. Pure functions (no DOM) so they can be unit-tested in Node.

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;

/** Lowercase, strip accents / Arabic diacritics, unify Arabic letter variants. */
export function normalize(s) {
  return String(s == null ? '' : s)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(MARKS, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Small stable hash (djb2) -> base36. */
export function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function detectQuality(name) {
  const n = String(name || '');
  if (/(^|[^a-z0-9])(4k|uhd|2160p?)([^a-z0-9]|$)/i.test(n)) return '4K';
  if (/(^|[^a-z0-9])(fhd|full\s?hd|1080p?)([^a-z0-9]|$)/i.test(n)) return 'FHD';
  if (/(^|[^a-z0-9])(hd|720p?)([^a-z0-9]|$)/i.test(n)) return 'HD';
  if (/(^|[^a-z0-9])(sd|480p?|360p?)([^a-z0-9]|$)/i.test(n)) return 'SD';
  return '';
}

const MOVIE_RE = /(movie|movies|vod|film|films|cinema|أفلام|افلام|فيلم|سينما)/i;
const SERIES_RE = /(series|serie|مسلسل|مسلسلات|episodes?)/i;

export function detectType(url, group) {
  const u = String(url || '').toLowerCase();
  if (/\/series\/[^/]+\/[^/]+\/\d+/.test(u)) return 'series';
  if (/\/movie\/[^/]+\/[^/]+\/\d+/.test(u)) return 'movie';
  const g = String(group || '');
  if (SERIES_RE.test(g)) return 'series';
  if (MOVIE_RE.test(g) || /\.(mp4|mkv|avi|mov)(\?|$)/.test(u)) return 'movie';
  return 'live';
}

export function makeChannel({ key, name, url, logo, group, tvgId, type, extra }) {
  const nm = String(name || '').trim() || 'Untitled';
  const c = {
    id: hash(key || `${url}|${nm}`),
    name: nm,
    url: url || '',
    logo: logo || '',
    group: String(group || '').trim(),
    tvgId: tvgId || '',
    type: type || detectType(url, group),
    quality: detectQuality(nm),
  };
  if (extra) Object.assign(c, extra);
  return c;
}

function parseExtInf(line) {
  const body = line.slice(line.indexOf(':') + 1);
  let inQuote = false;
  let comma = -1;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') inQuote = !inQuote;
    else if (ch === ',' && !inQuote) { comma = i; break; }
  }
  const head = comma < 0 ? body : body.slice(0, comma);
  const title = comma < 0 ? '' : body.slice(comma + 1).trim();
  const attrs = {};
  head.replace(/([\w-]+)="([^"]*)"/g, (_, k, v) => { attrs[k.toLowerCase()] = v; return ''; });
  return {
    name: title || attrs['tvg-name'] || '',
    logo: attrs['tvg-logo'] || '',
    group: attrs['group-title'] || '',
    tvgId: attrs['tvg-id'] || '',
  };
}

const URL_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

/** Parse M3U / M3U8 text into channel objects. Never throws on malformed input. */
export function parseM3U(text) {
  const out = [];
  if (!text) return out;
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
  let meta = null;
  let grp = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      meta = parseExtInf(line);
      if (!meta.group && grp) meta.group = grp;
      continue;
    }
    if (line.startsWith('#EXTGRP:')) {
      grp = line.slice(8).trim();
      if (meta && !meta.group) meta.group = grp;
      continue;
    }
    if (line.startsWith('#')) continue;
    if (!URL_RE.test(line)) { meta = null; continue; }
    const url = line.split('|')[0].trim(); // drop Kodi-style "|User-Agent=..." suffix
    const m = meta || { name: '', logo: '', group: grp, tvgId: '' };
    out.push(makeChannel({ name: m.name || url.split('/').pop(), url, logo: m.logo, group: m.group, tvgId: m.tvgId }));
    meta = null;
    grp = '';
  }
  return out;
}
