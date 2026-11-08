import { parseM3U, normalize } from './parser.js';
import * as X from './xtream.js';
import { LS, kvGet, kvSet, kvDel } from './store.js';
import { Engine } from './player.js';
import { isNative, NativeVideo, NativeEngine } from './native.js';

/* ------------------------------------------------------------------ i18n */
const T = {
  ar: {
    app: 'أورا', search: 'ابحث عن قناة أو فيلم…', clear: 'مسح', sources: 'القوائم', settings: 'الإعدادات',
    categories: 'التصنيفات', quality: 'الجودة', sort: 'الترتيب', sortDefault: 'الافتراضي', sortAz: 'أ - ي',
    tabLive: 'مباشر', tabMovies: 'أفلام', tabSeries: 'مسلسلات', tabFavs: 'المفضلة', tabRecent: 'الأخيرة',
    all: 'الكل', uncat: 'بدون تصنيف', items: 'عنصر', found: (n, t) => `${n} نتيجة من ${t}`,
    back: 'رجوع', close: 'إغلاق', prev: 'السابق', next: 'التالي', playpause: 'تشغيل / إيقاف', favorite: 'المفضلة',
    aspect: 'أبعاد الصورة', pip: 'صورة داخل صورة', seek: 'التقديم', player: 'المشغّل',
    addFav: 'إضافة للمفضلة', removeFav: 'إزالة من المفضلة', favAdded: 'أُضيف للمفضلة', favRemoved: 'أُزيل من المفضلة',
    loading: 'جارٍ التحميل…', loadingList: 'جارٍ تحميل القائمة…', starting: 'جارٍ التشغيل…',
    reconnecting: (n, m) => `انقطع البث، إعادة الاتصال (${n}/${m})…`,
    playError: 'تعذّر تشغيل هذا البث. قد يكون الرابط متوقفاً أو غير متاح.', retry: 'إعادة المحاولة', nextCh: 'القناة التالية',
    srcTitle: 'قوائم البث', srcAdd: 'إضافة قائمة', srcFirst: 'مرحباً! أضف قائمتك للبدء',
    srcNote: 'التطبيق مشغّل فقط ولا يتضمن أي قنوات. أضف قائمة تملك حق استخدامها من مزوّدك.',
    kM3uUrl: 'رابط M3U', kM3uText: 'ملف / نص', kXtream: 'Xtream', fName: 'الاسم (اختياري)', fUrl: 'رابط القائمة',
    fPaste: 'الصق محتوى القائمة هنا', fFile: 'أو اختر ملفاً', fServer: 'عنوان الخادم', fUser: 'اسم المستخدم', fPass: 'كلمة المرور',
    add: 'إضافة', use: 'استخدام', refresh: 'تحديث', del: 'حذف', active: 'الحالية', updated: 'آخر تحديث',
    delConfirm: 'حذف هذه القائمة من الجهاز؟', srcAdded: (n) => `تمت إضافة ${n} عنصر`, srcRefreshed: (n) => `تم التحديث: ${n} عنصر`,
    noSource: 'لا توجد قائمة', pickSource: 'اختر قائمة',
    emptyNoSrc: ['لا توجد قائمة بعد', 'أضف قائمة M3U أو حساب Xtream للبدء.'],
    emptyList: ['لا توجد عناصر هنا', 'جرّب تصنيفاً آخر أو امسح الفلاتر.'],
    emptyFavs: ['المفضلة فارغة', 'اضغط النجمة على أي قناة لإضافتها.'],
    emptyRecent: ['لا يوجد سجل بعد', 'ستظهر هنا آخر القنوات التي شاهدتها.'],
    openSources: 'إدارة القوائم',
    errAuth: 'بيانات الدخول غير صحيحة أو الحساب منتهٍ.', errTimeout: 'انتهت مهلة الاتصال. تحقق من الإنترنت أو الرابط.',
    errHttp: 'ردّ الخادم بخطأ. تحقق من الرابط.', errEmpty: 'لم أجد أي قناة في هذه القائمة. تأكد أنها بصيغة M3U.',
    errFormat: 'ردّ الخادم ليس بالصيغة المتوقعة.', errNet: 'تعذّر الاتصال. تحقق من الإنترنت والرابط.', errField: 'أكمل الحقول المطلوبة.',
    errUrl: 'الرابط غير صالح.',
    sSettings: 'الإعدادات', sLang: 'اللغة', sBuffer: 'وضع البث', sStable: 'مستقر (ذاكرة أكبر)', sLow: 'أقل تأخيراً',
    sAspect: 'أبعاد الصورة', sContain: 'ملائم', sCover: 'ملء الشاشة (قص)', sFill: 'تمديد',
    sResume: 'استئناف آخر قناة عند فتح التطبيق', sTv: 'واجهة التلفاز (أكبر)', sAuto: 'تلقائي', sOn: 'تشغيل', sOff: 'إيقاف',
    sClearUser: 'مسح المفضلة والسجل', sClearAll: 'حذف كل البيانات', sClearAllC: 'سيُحذف كل شيء: القوائم والمفضلة والإعدادات. متابعة؟',
    sDone: 'تم', sAbout: 'أورا TV — مشغّل IPTV. لا يتضمن أي محتوى.',
    season: 'الموسم', episodes: 'الحلقات', seriesErr: 'تعذّر تحميل حلقات المسلسل.',
  },
  en: {
    app: 'Aura', search: 'Search channels or movies…', clear: 'Clear', sources: 'Playlists', settings: 'Settings',
    categories: 'Categories', quality: 'Quality', sort: 'Sort', sortDefault: 'Default', sortAz: 'A - Z',
    tabLive: 'Live', tabMovies: 'Movies', tabSeries: 'Series', tabFavs: 'Favorites', tabRecent: 'Recent',
    all: 'All', uncat: 'Uncategorized', items: 'items', found: (n, t) => `${n} of ${t}`,
    back: 'Back', close: 'Close', prev: 'Previous', next: 'Next', playpause: 'Play / pause', favorite: 'Favorite',
    aspect: 'Aspect ratio', pip: 'Picture in picture', seek: 'Seek', player: 'Player',
    addFav: 'Add to favorites', removeFav: 'Remove from favorites', favAdded: 'Added to favorites', favRemoved: 'Removed from favorites',
    loading: 'Loading…', loadingList: 'Loading playlist…', starting: 'Starting…',
    reconnecting: (n, m) => `Stream dropped, reconnecting (${n}/${m})…`,
    playError: 'This stream could not be played. The link may be down or unavailable.', retry: 'Retry', nextCh: 'Next channel',
    srcTitle: 'Playlists', srcAdd: 'Add a playlist', srcFirst: 'Welcome! Add your playlist to start',
    srcNote: 'This app is only a player and ships no channels. Add a playlist you are entitled to use from your provider.',
    kM3uUrl: 'M3U link', kM3uText: 'File / text', kXtream: 'Xtream', fName: 'Name (optional)', fUrl: 'Playlist URL',
    fPaste: 'Paste playlist content here', fFile: 'or choose a file', fServer: 'Server address', fUser: 'Username', fPass: 'Password',
    add: 'Add', use: 'Use', refresh: 'Refresh', del: 'Delete', active: 'Current', updated: 'Updated',
    delConfirm: 'Delete this playlist from the device?', srcAdded: (n) => `Added ${n} items`, srcRefreshed: (n) => `Updated: ${n} items`,
    noSource: 'No playlist', pickSource: 'Choose a playlist',
    emptyNoSrc: ['No playlist yet', 'Add an M3U playlist or Xtream account to begin.'],
    emptyList: ['Nothing here', 'Try another category or clear the filters.'],
    emptyFavs: ['No favorites yet', 'Tap the star on any channel to add it.'],
    emptyRecent: ['No history yet', 'Channels you watch will appear here.'],
    openSources: 'Manage playlists',
    errAuth: 'Wrong credentials or the account has expired.', errTimeout: 'Connection timed out. Check your internet and the link.',
    errHttp: 'The server returned an error. Check the link.', errEmpty: 'No channels found. Make sure it is an M3U playlist.',
    errFormat: 'The server reply was not in the expected format.', errNet: 'Could not connect. Check your internet and the link.', errField: 'Fill in the required fields.',
    errUrl: 'Invalid link.',
    sSettings: 'Settings', sLang: 'Language', sBuffer: 'Streaming mode', sStable: 'Stable (bigger buffer)', sLow: 'Lower latency',
    sAspect: 'Aspect ratio', sContain: 'Fit', sCover: 'Fill (crop)', sFill: 'Stretch',
    sResume: 'Resume last channel on launch', sTv: 'TV interface (larger)', sAuto: 'Auto', sOn: 'On', sOff: 'Off',
    sClearUser: 'Clear favorites & history', sClearAll: 'Delete all data', sClearAllC: 'Everything will be deleted: playlists, favorites, settings. Continue?',
    sDone: 'Done', sAbout: 'Aura TV — an IPTV player. Ships no content.',
    season: 'Season', episodes: 'Episodes', seriesErr: 'Could not load the series episodes.',
  },
};

/* ------------------------------------------------------------------ helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const ICONS = {
  live: '<rect x="3" y="7" width="18" height="12" rx="2"/><path d="m8 3 4 4 4-4"/>',
  film: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M4 15h16M9 4v16M15 4v16"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  pause: '<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>',
};
const ic = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'value') el.value = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const coded = (code, msg) => Object.assign(new Error(msg || code), { code });
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const fmtTime = (s) => {
  if (!isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60), hr = Math.floor(m / 60);
  return hr ? `${hr}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

/* ------------------------------------------------------------------ state */
const S = {
  settings: Object.assign({ lang: 'ar', buffer: 'stable', aspect: 'contain', resume: false, tv: 'auto' }, LS.get('settings', {})),
  sources: LS.get('sources', []),
  activeId: LS.get('active', null),
  favs: new Set(LS.get('favs', [])),
  recents: LS.get('recents', []),
  channels: [], byId: new Map(), byType: { live: [], movie: [], series: [] },
  tab: 'live', cat: 'all', quality: 'all', q: '', sort: 'default',
  list: [], shown: 0,
  current: null, playlist: [], playTok: 0, retries: 0, retryTimer: 0, idleTimer: 0, statusMode: null,
  wake: null, lastFocus: null,
};
let lang = S.settings.lang === 'en' ? 'en' : 'ar';
const t = (k, ...a) => {
  const v = (T[lang] && T[lang][k] != null) ? T[lang][k] : T.ar[k];
  return typeof v === 'function' ? v(...a) : (v == null ? k : v);
};
const UNCAT = '\u0000';
const TABS = [['live', 'live', 'tabLive'], ['movies', 'film', 'tabMovies'], ['series', 'list', 'tabSeries'], ['favs', 'star', 'tabFavs'], ['recent', 'clock', 'tabRecent']];
const QUALITIES = ['4K', 'FHD', 'HD', 'SD'];
const CHUNK = 48;

const saveSettings = () => LS.set('settings', S.settings);
const saveSources = () => LS.set('sources', S.sources.map(({ text, ...rest }) => rest));
const saveFavs = () => LS.set('favs', [...S.favs]);
const saveRecents = () => LS.set('recents', S.recents);

/* ------------------------------------------------------------------ toast + loader */
let toastTimer = 0;
function toast(msg, isErr) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast' + (isErr ? ' err' : '');
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, isErr ? 5000 : 2600);
}
function showLoader(msg) { $('#loaderText').textContent = msg || t('loading'); $('#loader').hidden = false; }
function hideLoader() { $('#loader').hidden = true; }

/* ------------------------------------------------------------------ history layers (Android back button) */
const layers = [];
function pushLayer(name, close) { layers.push({ name, close }); history.pushState({ layer: name }, ''); }
window.addEventListener('popstate', () => { const l = layers.pop(); if (l) l.close(); });
const hasLayer = (name) => layers.some((l) => l.name === name);

/* ------------------------------------------------------------------ i18n apply */
function applyI18n() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  $$('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.title = lang === 'ar' ? 'أورا TV' : 'Aura TV';
}
function applyTv() {
  const ua = /(\bTV\b|SmartTV|Tizen|WebOS|AFT[A-Z]|BRAVIA|CrKey|Android.*Box)/i.test(navigator.userAgent);
  const on = S.settings.tv === 'on' || (S.settings.tv === 'auto' && ua);
  document.documentElement.classList.toggle('tv', on);
}

/* ------------------------------------------------------------------ data */
async function fetchRaw(url, ms) {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw coded('http', 'HTTP ' + r.status);
    return await r.text();
  } catch (e) {
    if (e.name === 'AbortError') throw coded('timeout');
    throw e;
  } finally { clearTimeout(to); }
}
const getText = (u) => fetchRaw(u, 60000);
async function getJson(u) {
  const txt = await fetchRaw(u, 60000);
  try { return JSON.parse(txt); } catch (_) { throw coded('format'); }
}

async function fetchChannels(src) {
  let chs;
  if (src.kind === 'xtream') chs = await X.fetchAll(src, getJson);
  else if (src.kind === 'm3u-url') chs = parseM3U(await getText(src.url));
  else chs = parseM3U(src.text || '');
  if (!chs.length) throw coded('empty');
  return chs;
}

function errMsg(e) {
  switch (e && e.code) {
    case 'auth': return t('errAuth');
    case 'timeout': return t('errTimeout');
    case 'http': return t('errHttp');
    case 'empty': return t('errEmpty');
    case 'format': return t('errFormat');
    case 'field': return t('errField');
    case 'url': return t('errUrl');
    default: return t('errNet');
  }
}

function setChannels(chs) {
  const byId = new Map();
  const byType = { live: [], movie: [], series: [] };
  for (const c of chs) {
    c.search = normalize(c.name + ' ' + c.group);
    byId.set(c.id, c);
    (byType[c.type] || byType.live).push(c);
  }
  S.channels = chs; S.byId = byId; S.byType = byType;
}

const activeSource = () => S.sources.find((s) => s.id === S.activeId) || null;

async function activate(id, { refresh = false } = {}) {
  const src = S.sources.find((s) => s.id === id);
  if (!src) return false;
  showLoader(t('loadingList'));
  try {
    let chs = refresh ? null : await kvGet('ch:' + id);
    const fresh = !chs || !chs.length;
    if (fresh) {
      chs = await fetchChannels(src);
      await kvSet('ch:' + id, chs.map(({ search, ...c }) => c));
      src.updatedAt = Date.now(); src.count = chs.length; saveSources();
    }
    setChannels(chs);
    S.activeId = id; LS.set('active', id);
    S.tab = 'live'; S.cat = 'all'; S.quality = 'all'; S.q = ''; $('#q').value = ''; $('#qClear').hidden = true;
    if (!S.byType.live.length) S.tab = S.byType.movie.length ? 'movies' : (S.byType.series.length ? 'series' : 'live');
    renderAll();
    if (refresh) toast(t('srcRefreshed', chs.length));
    return true;
  } catch (e) {
    toast(errMsg(e), true);
    return false;
  } finally { hideLoader(); }
}

/* ------------------------------------------------------------------ list + filters */
const TAB_TYPE = { live: 'live', movies: 'movie', series: 'series' };
function baseList() {
  if (S.tab === 'favs') return S.channels.filter((c) => S.favs.has(c.id));
  if (S.tab === 'recent') return S.recents.map((r) => S.byId.get(r.id)).filter(Boolean);
  return S.byType[TAB_TYPE[S.tab]] || [];
}
function filteredList() {
  let list = baseList();
  const total = list.length;
  if (S.cat !== 'all') list = list.filter((c) => (c.group || UNCAT) === S.cat);
  if (S.quality !== 'all') list = list.filter((c) => c.quality === S.quality);
  if (S.q) { const toks = S.q.split(' '); list = list.filter((c) => toks.every((k) => c.search.includes(k))); }
  if (S.sort === 'az' && S.tab !== 'recent') {
    const loc = lang === 'ar' ? 'ar' : undefined;
    list = [...list].sort((a, b) => a.name.localeCompare(b.name, loc));
  }
  return { list, total };
}

function renderTabs() {
  const nav = $('#tabs');
  nav.replaceChildren(...TABS.map(([id, icon, key]) => h('button', {
    class: 'tab', role: 'tab', 'aria-selected': String(S.tab === id), dataset: { tab: id }, html: ic(icon) + `<span>${t(key)}</span>`,
  })));
}

function renderQual() {
  const box = $('#qual');
  const mk = (q, label) => h('button', { class: 'chip', 'aria-pressed': String(S.quality === q), dataset: { q }, text: label });
  box.replaceChildren(mk('all', t('all')), ...QUALITIES.map((q) => mk(q, q)));
}

function renderCats() {
  const box = $('#cats');
  const base = baseList();
  const counts = new Map();
  for (const c of base) { const g = c.group || UNCAT; counts.set(g, (counts.get(g) || 0) + 1); }
  if (S.cat !== 'all' && !counts.has(S.cat)) S.cat = 'all';
  const chip = (key, label, n) => h('button', {
    class: 'chip', role: 'option', 'aria-selected': String(S.cat === key), dataset: { cat: key },
  }, label, h('span', { class: 'n', text: n }));
  box.replaceChildren(chip('all', t('all'), base.length), ...[...counts].map(([g, n]) => chip(g, g === UNCAT ? t('uncat') : g, n)));
}

function renderMeta(total) {
  const meta = $('#meta');
  if (!S.channels.length) { meta.textContent = ''; return; }
  meta.textContent = S.list.length === total ? `${total} ${t('items')}` : t('found', S.list.length, total);
}

let io = null;
function renderList() {
  const { list, total } = filteredList();
  S.list = list; S.shown = 0;
  const grid = $('#grid');
  grid.replaceChildren();
  renderMeta(total);
  const empty = $('#empty');
  if (!list.length) {
    let msg = t('emptyList');
    if (!S.sources.length) msg = t('emptyNoSrc');
    else if (S.tab === 'favs' && !S.q && S.cat === 'all') msg = t('emptyFavs');
    else if (S.tab === 'recent' && !S.q && S.cat === 'all') msg = t('emptyRecent');
    const kids = [h('b', { text: msg[0] }), h('div', { text: msg[1] })];
    if (!S.sources.length) kids.push(h('p', {}, h('button', { class: 'btn gold', dataset: { act: 'sources' }, text: t('openSources') })));
    empty.replaceChildren(...kids);
    empty.hidden = false;
  } else { empty.hidden = true; appendChunk(); }
  grid.scrollTop = 0;
}

function logoNode(c) {
  const avatar = () => h('div', { class: 'avatar', 'aria-hidden': 'true', text: ([...c.name.trim()][0] || '?').toUpperCase() });
  if (!c.logo || !/^https?:\/\//i.test(c.logo)) return avatar();
  const img = h('img', { src: c.logo, alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  img.addEventListener('error', () => img.replaceWith(avatar()), { once: true });
  return img;
}

function card(c) {
  const fav = S.favs.has(c.id);
  return h('div', { class: 'card', role: 'button', tabindex: '0', dataset: { id: c.id }, 'aria-label': c.name },
    h('div', { class: 'thumb' }, logoNode(c), c.quality && h('span', { class: 'badge', text: c.quality })),
    h('div', { class: 'info' }, h('div', { class: 'name', text: c.name }), h('div', { class: 'grp', text: c.group || '' })),
    h('button', { class: 'fav' + (fav ? ' on' : ''), 'aria-pressed': String(fav), 'aria-label': t(fav ? 'removeFav' : 'addFav'), dataset: { fav: c.id }, html: ic('star') }));
}

function appendChunk() {
  if (S.shown >= S.list.length) return;
  const frag = document.createDocumentFragment();
  const end = Math.min(S.shown + CHUNK, S.list.length);
  for (let i = S.shown; i < end; i++) frag.append(card(S.list[i]));
  S.shown = end;
  $('#grid').append(frag);
}

function renderSource() {
  const s = activeSource();
  $('#srcName').textContent = s ? s.name : t('noSource');
}

function renderAll() {
  renderTabs(); renderQual(); renderCats(); renderList(); renderSource();
  $('#sort').value = S.sort;
}

/* ------------------------------------------------------------------ favorites + recents */
function toggleFav(id) {
  const on = !S.favs.has(id);
  if (on) S.favs.add(id); else S.favs.delete(id);
  saveFavs();
  $$(`[data-fav="${id}"]`).forEach((b) => {
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', t(on ? 'removeFav' : 'addFav'));
  });
  if (S.tab === 'favs' && !on) {
    const el = $(`.card[data-id="${id}"]`);
    if (el) el.remove();
    S.list = S.list.filter((c) => c.id !== id);
    if (!S.list.length) renderList(); else renderMeta(baseList().length);
  }
  if (S.current && S.current.id === id) updatePlayerFav();
  toast(t(on ? 'favAdded' : 'favRemoved'));
}
function pushRecent(c) {
  if (c.type === 'series' || !S.byId.has(c.id)) return;
  S.recents = [{ id: c.id, t: Date.now() }, ...S.recents.filter((r) => r.id !== c.id)].slice(0, 40);
  saveRecents();
  LS.set('last', { src: S.activeId, id: c.id });
}

/* ------------------------------------------------------------------ modal */
let modalLayer = false;
function openModal(title, body, { forced = false, onClose } = {}) {
  const m = $('#modal');
  if (m.hidden) S.lastFocus = document.activeElement;
  $('#mTitle').textContent = title;
  setModalBody(body);
  $('#mClose').hidden = forced;
  m.hidden = false;
  m._onClose = onClose || null;
  if (!forced && !modalLayer) { modalLayer = true; pushLayer('modal', hideModalUI); }
  const first = $$('input, textarea, select, button.btn, button', $('#mBody'))[0];
  (first || $('#mClose')).focus({ preventScroll: true });
}
function setModalBody(body) { $('#mBody').replaceChildren(...[].concat(body)); }
function hideModalUI() {
  const m = $('#modal');
  if (m.hidden) return;
  m.hidden = true; modalLayer = false;
  if (m._onClose) m._onClose();
  const f = S.lastFocus;
  if (f && document.contains(f) && !$('#player').hidden === false) f.focus({ preventScroll: true });
}
function closeModal() { if (modalLayer) history.back(); else hideModalUI(); }

const field = (label, input, cls = '') => h('label', { class: 'field ' + cls }, h('span', { text: label }), input);

function srcSubtitle(s) {
  const kind = s.kind === 'xtream' ? 'Xtream' : s.kind === 'm3u-url' ? 'M3U' : 'M3U (file)';
  const when = s.updatedAt ? ` · ${t('updated')}: ${new Intl.DateTimeFormat(lang === 'ar' ? 'ar' : 'en', { dateStyle: 'medium' }).format(s.updatedAt)}` : '';
  return `${kind} · ${s.count || 0} ${t('items')}${when}`;
}

function openSources(forced = false) {
  let kind = 'm3u-url';
  const wrap = h('div');
  const build = () => {
    const parts = [];
    if (forced) parts.push(h('p', { class: 'note', text: t('srcFirst') }));
    parts.push(h('p', { class: 'note', text: t('srcNote') }));
    if (S.sources.length) {
      parts.push(h('div', { class: 'list' }, S.sources.map((s) => h('div', { class: 'src-item' + (s.id === S.activeId ? ' active' : '') },
        h('div', { class: 't' }, h('b', { text: s.name + (s.id === S.activeId ? ` ✓` : '') }), h('small', { text: srcSubtitle(s) })),
        s.id !== S.activeId && h('button', { class: 'btn ghost', text: t('use'), onclick: async () => { if (await activate(s.id)) closeModal(); } }),
        s.kind !== 'm3u-text' && h('button', { class: 'icon-btn', 'aria-label': t('refresh'), html: ic('refresh'), onclick: async () => { const ok = await activate(s.id, { refresh: true }); if (ok) build(); } }),
        h('button', { class: 'icon-btn', 'aria-label': t('del'), html: ic('trash'), onclick: () => removeSource(s.id, build) })))));
    }
    parts.push(h('h3', { class: 'h3', text: t('srcAdd') }));
    const seg = h('div', { class: 'seg', role: 'tablist' }, [['m3u-url', 'kM3uUrl'], ['m3u-text', 'kM3uText'], ['xtream', 'kXtream']].map(([k, key]) =>
      h('button', { type: 'button', role: 'tab', 'aria-selected': String(kind === k), text: t(key), onclick: () => { kind = k; build(); } })));
    parts.push(seg);

    const name = h('input', { type: 'text', autocomplete: 'off', maxlength: '60' });
    const inputs = { name };
    const form = h('form', { novalidate: true });
    form.append(field(t('fName'), name, 'rtl'));
    if (kind === 'm3u-url') {
      inputs.url = h('input', { type: 'url', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'https://…/playlist.m3u' });
      form.append(field(t('fUrl'), inputs.url));
    } else if (kind === 'm3u-text') {
      inputs.text = h('textarea', { spellcheck: 'false', placeholder: '#EXTM3U\n#EXTINF:-1,…\nhttp://…' });
      const file = h('input', { type: 'file', accept: '.m3u,.m3u8,.txt,text/plain,audio/x-mpegurl,application/vnd.apple.mpegurl' });
      file.addEventListener('change', async () => { const f = file.files && file.files[0]; if (f) { inputs.text.value = await f.text(); if (!name.value) name.value = f.name.replace(/\.[^.]+$/, ''); } });
      form.append(field(t('fPaste'), inputs.text), field(t('fFile'), file));
    } else {
      inputs.server = h('input', { type: 'text', inputmode: 'url', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', placeholder: 'http://host:port' });
      inputs.user = h('input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
      inputs.pass = h('input', { type: 'password', autocomplete: 'off' });
      form.append(field(t('fServer'), inputs.server), field(t('fUser'), inputs.user), field(t('fPass'), inputs.pass));
    }
    form.append(h('button', { class: 'btn gold', type: 'submit', text: t('add') }));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { await addSource(kind, inputs, forced); } catch (e) { toast(errMsg(e), true); }
    });
    parts.push(form);
    wrap.replaceChildren(...parts);
  };
  build();
  openModal(t('srcTitle'), wrap, { forced });
}

async function addSource(kind, inputs, forced) {
  const val = (k) => (inputs[k] ? inputs[k].value.trim() : '');
  const src = { id: 's' + Date.now().toString(36), kind, name: val('name') || `${t('srcTitle')} ${S.sources.length + 1}`, updatedAt: Date.now() };
  if (kind === 'm3u-url') {
    let u = val('url');
    if (!u) throw coded('field');
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'http://' + u;
    try { new URL(u); } catch (_) { throw coded('url'); }
    src.url = u;
  } else if (kind === 'm3u-text') {
    if (!val('text')) throw coded('field');
    src.text = val('text');
  } else {
    if (!val('server') || !val('user') || !val('pass')) throw coded('field');
    try { src.server = X.normalizeServer(val('server')); } catch (_) { throw coded('url'); }
    src.user = val('user'); src.pass = val('pass');
    if (!inputs.name.value.trim()) src.name = new URL(src.server).hostname;
  }
  showLoader(t('loadingList'));
  let chs;
  try { chs = await fetchChannels(src); } finally { hideLoader(); }
  src.count = chs.length;
  await kvSet('ch:' + src.id, chs);
  S.sources.push(src);
  saveSources();
  delete src.text;
  if (forced) hideModalUI(); else closeModal();
  await activate(src.id);
  toast(t('srcAdded', chs.length));
}

async function removeSource(id, rebuild) {
  if (!window.confirm(t('delConfirm'))) return;
  S.sources = S.sources.filter((s) => s.id !== id);
  saveSources();
  await kvDel('ch:' + id);
  if (S.activeId === id) {
    S.activeId = null; LS.del('active');
    S.channels = []; S.byId = new Map(); S.byType = { live: [], movie: [], series: [] };
    if (S.sources.length) { await activate(S.sources[0].id); }
    else { renderAll(); closeModal(); setTimeout(() => openSources(true), 50); return; }
  }
  rebuild();
  renderAll();
}

function settingsBody() {
  const sel = (id, value, opts) => {
    const s = h('select', { id }, opts.map(([v, label]) => h('option', { value: v, text: label })));
    s.value = value; return s;
  };
  const langSel = sel('sLang', S.settings.lang, [['ar', 'العربية'], ['en', 'English']]);
  const bufSel = sel('sBuf', S.settings.buffer, [['stable', t('sStable')], ['low', t('sLow')]]);
  const aspSel = sel('sAsp', S.settings.aspect, [['contain', t('sContain')], ['cover', t('sCover')], ['fill', t('sFill')]]);
  const tvSel = sel('sTv', S.settings.tv, [['auto', t('sAuto')], ['on', t('sOn')], ['off', t('sOff')]]);
  const resume = h('input', { type: 'checkbox', id: 'sRes' }); resume.checked = !!S.settings.resume;
  const commit = () => {
    const newLang = langSel.value === 'en' ? 'en' : 'ar';
    S.settings = { lang: newLang, buffer: bufSel.value, aspect: aspSel.value, tv: tvSel.value, resume: resume.checked };
    saveSettings(); applyTv(); applyAspect();
    if (newLang !== lang) {
      lang = newLang; applyI18n(); renderAll();
      $('#mTitle').textContent = t('sSettings');
      setModalBody(settingsBody());
      const again = $('#sLang'); if (again) again.focus({ preventScroll: true });
    }
  };
  [langSel, bufSel, aspSel, tvSel, resume].forEach((el) => el.addEventListener('change', commit));
  return [
    field(t('sLang'), langSel, 'rtl'), field(t('sBuffer'), bufSel, 'rtl'), field(t('sAspect'), aspSel, 'rtl'), field(t('sTv'), tvSel, 'rtl'),
    h('label', { class: 'check' }, resume, h('span', { text: t('sResume') })),
    h('p', {}, h('button', { class: 'btn ghost', type: 'button', text: t('sClearUser'), onclick: () => { S.favs.clear(); S.recents = []; saveFavs(); saveRecents(); renderAll(); toast(t('sDone')); } })),
    h('p', {}, h('button', { class: 'btn danger', type: 'button', text: t('sClearAll'), onclick: clearAll })),
    h('p', { class: 'note', text: t('sAbout') + ' v1.0.0' }),
  ];
}
function openSettings() { openModal(t('sSettings'), settingsBody()); }
async function clearAll() {
  if (!window.confirm(t('sClearAllC'))) return;
  for (const s of S.sources) await kvDel('ch:' + s.id);
  ['settings', 'sources', 'active', 'favs', 'recents', 'last'].forEach((k) => LS.del(k));
  location.reload();
}

/* ------------------------------------------------------------------ series */
async function openSeries(c) {
  const src = activeSource();
  if (!src || src.kind !== 'xtream') return;
  showLoader(t('loading'));
  let seasons;
  try {
    const info = await getJson(X.apiUrl(src.server, src.user, src.pass, 'get_series_info', '&series_id=' + encodeURIComponent(c.seriesId)));
    seasons = X.parseSeriesInfo(info, src).filter((s) => s.episodes.length);
    if (!seasons.length) throw coded('empty');
  } catch (e) { hideLoader(); toast(t('seriesErr'), true); return; }
  hideLoader();
  const body = h('div');
  let cur = seasons[0];
  const build = () => {
    const sel = h('select', {}, seasons.map((s) => h('option', { value: String(s.season), text: `${t('season')} ${s.season}` })));
    sel.value = String(cur.season);
    sel.addEventListener('change', () => { cur = seasons.find((s) => String(s.season) === sel.value) || cur; build(); sel.focus(); });
    const eps = cur.episodes.map((e) => ({ id: 'ep' + e.id, name: `${c.name} — S${cur.season}E${e.num || '?'}`, url: e.url, logo: c.logo, group: `${t('season')} ${cur.season}`, type: 'movie', quality: '' }));
    body.replaceChildren(
      field(t('season'), sel, 'rtl'),
      h('div', { class: 'h3', text: t('episodes') }),
      ...cur.episodes.map((e, i) => h('button', { class: 'ep', type: 'button', onclick: () => play(eps[i], eps) },
        h('span', { class: 'num', text: e.num || i + 1 }), h('span', { text: e.title }))));
  };
  build();
  openModal(c.name, body);
}

/* ------------------------------------------------------------------ player */
const playerEl = $('#player');
// On Android the native ExoPlayer plugin does the decoding; in a browser the <video> element does.
// Anything going wrong while setting the native path up must never break the app: fall back to <video>.
const playerHooks = {
  onBuffering: (b) => { if (b) { if (!S.statusMode) setStatus('buffer'); } else if (S.statusMode === 'buffer' || S.statusMode === 'loading') setStatus(null); },
  onPlaying: () => { if (S.statusMode && S.statusMode !== 'error') setStatus(null); },
  onFatal: (e) => onFatal(e),
};
let NATIVE = false;
let nv = null;
let video = $('#video');
let engine = null;
try {
  if (isNative()) {
    const plugin = window.Capacitor.registerPlugin('AuraPlayer');
    const candidate = new NativeVideo(plugin);
    engine = new NativeEngine(candidate, playerHooks);
    nv = candidate; video = candidate; NATIVE = true;
    playerEl.classList.add('native');
  }
} catch (e) {
  NATIVE = false; nv = null; video = $('#video'); engine = null;
  try { console.error('native player unavailable, using <video>:', e && e.message); } catch (_) { /* ignore */ }
}
if (!engine) engine = new Engine(video, playerHooks);

function setStatus(mode, text, actions, detail) {
  S.statusMode = mode;
  const box = $('#pStatus');
  if (!mode) { box.hidden = true; return; }
  box.hidden = false;
  box.classList.toggle('err', mode === 'error');
  $('#pStatusText').textContent = text || (mode === 'loading' ? t('starting') : '');
  $('#pDetail').textContent = mode === 'error' ? (detail || '') : '';
  $('#pActions').replaceChildren(...(actions || []));
  if (mode === 'error' || mode === 'retry') bump(true);
}

function updatePlayerFav() {
  const on = S.current && S.favs.has(S.current.id);
  const b = $('#cFav');
  b.classList.toggle('on', !!on);
  b.setAttribute('aria-pressed', String(!!on));
}
function updatePlayIcon() { $('#cPlay').innerHTML = ic(video.paused ? 'play' : 'pause', 'fill'); }

function applyAspect() {
  video.classList.toggle('cover', S.settings.aspect === 'cover');
  video.classList.toggle('fill', S.settings.aspect === 'fill');
  if (NATIVE) { try { const r = nv.p.setAspect({ mode: S.settings.aspect }); if (r && r.catch) r.catch(() => {}); } catch (_) { /* ignore */ } }
}

function play(c, list) {
  if (c.type === 'series' && c.seriesId != null) { openSeries(c); return; }
  if (!c.url) return;
  const wasOpen = !playerEl.hidden;
  S.current = c;
  S.playlist = list || S.list;
  S.retries = 0;
  clearTimeout(S.retryTimer);
  if (!wasOpen) {
    S.lastFocus = document.activeElement;
    playerEl.hidden = false;
    if (NATIVE) document.documentElement.classList.add('native-playing');
    pushLayer('player', hidePlayerUI);
    document.body.style.overflow = 'hidden';
  }
  const live = c.type === 'live';
  $('#pTitle').textContent = c.name;
  $('#pSub').textContent = c.group || '';
  $('#pLive').hidden = !live;
  $('#seekRow').hidden = live;
  $('#cPip').hidden = !(document.pictureInPictureEnabled && video.requestPictureInPicture);
  applyAspect(); updatePlayerFav(); updatePlayIcon();
  const many = S.playlist.length > 1;
  $('#cPrev').hidden = !many; $('#cNext').hidden = !many;
  pushRecent(c);
  setMediaSession(c);
  acquireWake();
  bump(true);
  if (!wasOpen) $('#stage').focus({ preventScroll: true });
  startPlayback(c, false);
}

async function startPlayback(c, auto) {
  const tok = ++S.playTok;
  setStatus(auto ? 'retry' : 'loading', auto ? t('reconnecting', S.retries, 5) : t('starting'));
  const live = c.type === 'live';
  let lastErr = null;
  for (const u of [c.url, c.alt].filter(Boolean)) {
    try {
      await engine.play(u, { live, buffer: S.settings.buffer });
      if (tok !== S.playTok) return;
      setStatus(null); updatePlayIcon(); bump();
      return;
    } catch (e) {
      if (tok !== S.playTok || (e && e.message === 'cancelled')) return;
      lastErr = e;
    }
  }
  if (auto && S.retries < 5) { scheduleRetry(); return; }
  showPlayError(lastErr);
}

function scheduleRetry() {
  if (!S.current || playerEl.hidden) return;
  if (S.retries >= 5) { showPlayError(); return; }
  const n = ++S.retries;
  setStatus('retry', t('reconnecting', n, 5));
  clearTimeout(S.retryTimer);
  S.retryTimer = setTimeout(() => { if (S.current && !playerEl.hidden) startPlayback(S.current, true); }, Math.min(1500 * 2 ** (n - 1), 10000));
}
function onFatal(err) {
  if (!S.current || playerEl.hidden) return;
  if (S.current.type !== 'live') { showPlayError(err); return; }
  scheduleRetry();
}
const errDetail = (e) => { const m = e && e.message ? String(e.message) : ''; return m && m !== 'failed' && m !== 'cancelled' ? m.slice(0, 200) : ''; };
function showPlayError(err) {
  S.playTok++;
  engine.stop();
  const acts = [h('button', { class: 'btn', type: 'button', text: t('retry'), onclick: () => { S.retries = 0; startPlayback(S.current, false); } })];
  if (S.playlist.length > 1) acts.push(h('button', { class: 'btn ghost', type: 'button', text: t('nextCh'), onclick: () => zap(1) }));
  acts.push(h('button', { class: 'btn ghost', type: 'button', text: t('back'), onclick: closePlayer }));
  setStatus('error', t('playError'), acts, errDetail(err));
  const first = $('#pActions button');
  if (first) first.focus({ preventScroll: true });
}

function zap(dir) {
  if (!S.current || S.playlist.length < 2) return;
  let i = S.playlist.findIndex((c) => c.id === S.current.id);
  if (i < 0) i = 0;
  const n = S.playlist.length;
  const nxt = S.playlist[(i + dir + n) % n];
  if (nxt.type === 'series' && nxt.seriesId != null) return zap(dir + Math.sign(dir)); // skip unplayable placeholders
  play(nxt, S.playlist);
}

function hidePlayerUI() {
  S.playTok++;
  clearTimeout(S.retryTimer); clearTimeout(S.idleTimer);
  engine.stop();
  releaseWake();
  setStatus(null);
  playerEl.hidden = true;
  document.documentElement.classList.remove('native-playing');
  document.body.style.overflow = '';
  S.current = null;
  try { if (document.pictureInPictureElement) document.exitPictureInPicture(); } catch (_) { /* ignore */ }
  const f = S.lastFocus;
  if (f && document.contains(f)) f.focus({ preventScroll: true });
}
function closePlayer() { if (hasLayer('player')) history.back(); else hidePlayerUI(); }

function bump(force) {
  playerEl.classList.remove('idle');
  clearTimeout(S.idleTimer);
  S.idleTimer = setTimeout(() => {
    if (S.statusMode === 'error' || video.paused && !force) return;
    playerEl.classList.add('idle');
    if (playerEl.contains(document.activeElement) && document.activeElement !== $('#stage')) $('#stage').focus({ preventScroll: true });
  }, 4500);
}

function togglePlay() { if (video.paused) { const p = video.play(); if (p && p.catch) p.catch(() => {}); } else video.pause(); }
video.addEventListener('play', updatePlayIcon);
video.addEventListener('pause', updatePlayIcon);
video.addEventListener('timeupdate', () => {
  if (!S.current || S.current.type === 'live') return;
  const d = video.duration;
  if (!isFinite(d) || d <= 0) { $('#seekRow').hidden = true; return; }
  $('#seekRow').hidden = false;
  if (document.activeElement !== $('#seek')) $('#seek').value = String(Math.round((video.currentTime / d) * 1000));
  $('#tCur').textContent = fmtTime(video.currentTime); $('#tDur').textContent = fmtTime(d);
});
video.addEventListener('ended', () => { if (S.current && S.current.type !== 'live' && S.playlist.length > 1) zap(1); });
$('#seek').addEventListener('input', (e) => { if (isFinite(video.duration)) video.currentTime = (Number(e.target.value) / 1000) * video.duration; });

async function acquireWake() { try { if (navigator.wakeLock && !S.wake) { S.wake = await navigator.wakeLock.request('screen'); S.wake.addEventListener('release', () => { S.wake = null; }); } } catch (_) { /* optional */ } }
function releaseWake() { try { if (S.wake) S.wake.release(); } catch (_) { /* ignore */ } S.wake = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !playerEl.hidden) acquireWake(); });

function setMediaSession(c) {
  try {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({ title: c.name, artist: c.group || 'Aura TV' });
    const set = (a, fn) => { try { navigator.mediaSession.setActionHandler(a, fn); } catch (_) { /* unsupported */ } };
    set('play', () => video.play()); set('pause', () => video.pause());
    set('previoustrack', () => zap(-1)); set('nexttrack', () => zap(1));
  } catch (_) { /* optional */ }
}

/* ------------------------------------------------------------------ input: events */
$('#tabs').addEventListener('click', (e) => {
  const b = e.target.closest('.tab');
  if (!b || b.dataset.tab === S.tab) return;
  S.tab = b.dataset.tab; S.cat = 'all';
  renderTabs(); renderCats(); renderList();
  const nb = $(`.tab[data-tab="${S.tab}"]`); if (nb) nb.focus({ preventScroll: true });
});
$('#cats').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  S.cat = b.dataset.cat;
  $$('#cats .chip').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  renderList();
});
$('#qual').addEventListener('click', (e) => {
  const b = e.target.closest('.chip'); if (!b) return;
  S.quality = b.dataset.q;
  $$('#qual .chip').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  renderList();
});
$('#sort').addEventListener('change', (e) => { S.sort = e.target.value; renderList(); });
const onSearch = debounce(() => { S.q = normalize($('#q').value); renderList(); }, 160);
$('#q').addEventListener('input', () => { $('#qClear').hidden = !$('#q').value; onSearch(); });
$('#qClear').addEventListener('click', () => { $('#q').value = ''; $('#qClear').hidden = true; S.q = ''; renderList(); $('#q').focus(); });
$('#btnSource').addEventListener('click', () => openSources(false));
$('#btnSettings').addEventListener('click', openSettings);
$('#mClose').addEventListener('click', closeModal);
$('#modal').addEventListener('mousedown', (e) => { if (e.target === $('#modal') && !$('#mClose').hidden) closeModal(); });
$('#empty').addEventListener('click', (e) => { if (e.target.closest('[data-act="sources"]')) openSources(!S.sources.length); });

$('#grid').addEventListener('click', (e) => {
  const fav = e.target.closest('.fav');
  if (fav) { e.stopPropagation(); toggleFav(fav.dataset.fav); return; }
  const cardEl = e.target.closest('.card');
  if (!cardEl) return;
  const c = S.byId.get(cardEl.dataset.id);
  if (c) play(c, S.list);
});
$('#grid').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('card')) { e.preventDefault(); e.target.click(); }
});

if ('IntersectionObserver' in window) {
  io = new IntersectionObserver((en) => { if (en.some((x) => x.isIntersecting)) appendChunk(); }, { rootMargin: '600px' });
  io.observe($('#sentinel'));
} else window.addEventListener('scroll', debounce(() => { if (innerHeight + scrollY > document.body.scrollHeight - 800) appendChunk(); }, 80));

// player controls
$('#pBack').addEventListener('click', closePlayer);
$('#cPlay').addEventListener('click', togglePlay);
$('#cPrev').addEventListener('click', () => zap(-1));
$('#cNext').addEventListener('click', () => zap(1));
$('#cFav').addEventListener('click', () => { if (S.current) toggleFav(S.current.id); });
$('#cAspect').addEventListener('click', () => {
  const order = ['contain', 'cover', 'fill'];
  S.settings.aspect = order[(order.indexOf(S.settings.aspect) + 1) % order.length];
  saveSettings(); applyAspect();
  toast(t({ contain: 'sContain', cover: 'sCover', fill: 'sFill' }[S.settings.aspect]));
});
$('#cPip').addEventListener('click', async () => { try { if (document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); } catch (_) { /* unsupported */ } });
$('#stage').addEventListener('click', () => { if (playerEl.classList.contains('idle')) bump(true); else playerEl.classList.add('idle'); });
['pointermove', 'pointerdown', 'touchstart'].forEach((ev) => playerEl.addEventListener(ev, () => bump(), { passive: true }));

/* ------------------------------------------------------------------ input: keyboard / remote (D-pad) */
function scopeEl() {
  if (!playerEl.hidden) return playerEl;
  if (!$('#modal').hidden) return $('.sheet');
  return document.body;
}
function focusables(root) {
  return $$('button, a[href], input, select, textarea, [tabindex="0"]', root).filter((el) => !el.disabled && !el.hidden && el.tabIndex >= 0 && el.offsetParent !== null && !el.closest('[hidden]') && getComputedStyle(el).visibility !== 'hidden');
}
function moveFocus(dir) {
  const root = scopeEl();
  const cur = document.activeElement;
  const list = focusables(root);
  if (!cur || cur === document.body || !root.contains(cur)) { if (list[0]) { list[0].focus(); return true; } return false; }
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let best = null, bs = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const dx = b.left + b.width / 2 - cx, dy = b.top + b.height / 2 - cy;
    let prim, sec;
    if (dir === 'left') { if (dx >= -2) continue; prim = -dx; sec = Math.abs(dy); }
    else if (dir === 'right') { if (dx <= 2) continue; prim = dx; sec = Math.abs(dy); }
    else if (dir === 'up') { if (dy >= -2) continue; prim = -dy; sec = Math.abs(dx); }
    else { if (dy <= 2) continue; prim = dy; sec = Math.abs(dx); }
    const score = prim + sec * 2.5;
    if (score < bs) { bs = score; best = el; }
  }
  if (!best) return false;
  best.focus();
  best.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  return true;
}
const DIRS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };

function playerKey(e) {
  const k = e.key;
  const inBars = !!(e.target.closest && e.target.closest('.p-bar, .p-top, .p-status'));
  const wasIdle = playerEl.classList.contains('idle');
  bump();
  if (k === 'Escape' || k === 'BrowserBack' || k === 'GoBack') { e.preventDefault(); closePlayer(); return; }
  if (k === 'MediaPlayPause') { e.preventDefault(); togglePlay(); return; }
  if (k === 'MediaTrackNext' || k === 'ChannelUp' || k === 'PageUp') { e.preventDefault(); zap(1); return; }
  if (k === 'MediaTrackPrevious' || k === 'ChannelDown' || k === 'PageDown') { e.preventDefault(); zap(-1); return; }
  if (DIRS[k]) {
    if (inBars) {
      if (e.target.id === 'seek' && (k === 'ArrowLeft' || k === 'ArrowRight')) return; // native slider step
      e.preventDefault();
      if (k === 'ArrowUp' && !moveFocus('up')) $('#stage').focus();
      else if (k !== 'ArrowUp') moveFocus(DIRS[k]);
      return;
    }
    e.preventDefault();
    if (k === 'ArrowUp') zap(-1);
    else if (k === 'ArrowDown') zap(1);
    else if (S.current && S.current.type !== 'live' && !wasIdle) video.currentTime += k === 'ArrowRight' ? 10 : -10;
    return;
  }
  if ((k === 'Enter' || k === ' ') && e.target.id === 'stage') {
    e.preventDefault();
    if (wasIdle) { const b = $('#cPlay'); if (b) b.focus({ preventScroll: true }); } else togglePlay();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!playerEl.hidden) { playerKey(e); return; }
  if (e.key === 'Escape' && !$('#modal').hidden && !$('#mClose').hidden) { e.preventDefault(); closeModal(); return; }
  const dir = DIRS[e.key];
  if (dir) {
    const tg = e.target;
    if (tg.tagName === 'TEXTAREA') return;
    if ((tg.tagName === 'INPUT' && tg.type !== 'checkbox' && tg.type !== 'file') && (dir === 'left' || dir === 'right')) return;
    if (tg.tagName === 'SELECT' && (dir === 'up' || dir === 'down')) return;
    if (moveFocus(dir)) e.preventDefault();
    return;
  }
  if (e.key === '/' && e.target === document.body) { e.preventDefault(); $('#q').focus(); }
});

/* ------------------------------------------------------------------ boot */
async function boot() {
  applyI18n(); applyTv(); applyAspect();
  renderTabs(); renderQual(); renderCats(); renderSource();
  let ok = false;
  if (S.sources.length) {
    const id = S.sources.some((s) => s.id === S.activeId) ? S.activeId : S.sources[0].id;
    ok = await activate(id);
  }
  if (!S.sources.length) { renderAll(); openSources(true); return; }
  if (!ok) { renderAll(); return; }
  if (S.settings.resume) {
    const last = LS.get('last', null);
    const c = last && last.src === S.activeId ? S.byId.get(last.id) : null;
    if (c) { const list = S.byType[c.type === 'movie' ? 'movie' : c.type] || []; play(c, list); }
  }
}
window.__aura = { S, play, activate }; // handy for debugging / tests
boot();
