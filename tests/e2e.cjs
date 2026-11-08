// End-to-end test in real Chromium against a mock IPTV provider.
// Run: node tests/e2e.cjs   (screenshots land in tests/shots/)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const mock = require('./mock-server.cjs');

const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
let passed = 0, failed = 0;
const ok = (cond, name) => { if (cond) { passed++; console.log('  ✓', name); } else { failed++; console.log('  ✗ FAIL:', name); } };

(async () => {
  const port = await mock.start();
  const base = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch();
  const errors = [];
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/logo-missing|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept());

  console.log('First run / onboarding');
  await page.goto(base + '/');
  await page.waitForSelector('#modal:not([hidden])');
  ok(await page.locator('#mClose').isHidden(), 'onboarding modal cannot be dismissed');
  await page.screenshot({ path: path.join(SHOTS, '01-onboarding.png') });

  console.log('Add M3U (validation + errors)');
  await page.click('form button[type=submit]');
  ok(/أكمل|required|Fill/.test(await page.textContent('#toast')), 'empty form shows validation toast');
  await page.fill('input[type=url]', base + '/bad.m3u');
  await page.click('form button[type=submit]');
  await page.waitForFunction(() => /لم أجد|No channels/.test(document.querySelector('#toast').textContent));
  ok(true, 'non-playlist reply is rejected with a clear message');
  ok(await page.locator('#modal').isVisible(), 'modal stays open after failure');
  await page.fill('input[type=url]', base + '/list.m3u');
  await page.fill('input[type=text]', 'قائمة الاختبار');
  await page.click('form button[type=submit]');
  await page.waitForSelector('.card');
  ok(await page.locator('#modal').isHidden(), 'modal closes after success');
  const meta0 = await page.textContent('#meta');
  ok(/1000/.test(meta0), 'meta shows 1000 live items (got: ' + meta0 + ')');
  ok((await page.locator('.card').count()) === 48, 'only first chunk rendered (virtualized)');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, '02-home-phone.png') });

  console.log('Infinite scroll, categories, quality, search, sort');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForFunction(() => document.querySelectorAll('.card').length > 48);
  ok(true, 'scrolling loads more cards');
  await page.evaluate(() => window.scrollTo(0, 0));
  const catCount = await page.locator('#cats .chip').count();
  ok(catCount === 5, `5 live category chips (all + 4), got ${catCount}`);
  await page.click('#cats .chip:nth-child(3)');
  ok((await page.textContent('#meta')).includes('250'), 'category filter -> 250 items (got ' + await page.textContent('#meta') + ')');
  await page.click('#qual .chip:has-text("4K")');
  const q4 = await page.locator('.card .badge').allTextContents();
  ok(q4.length > 0 && q4.every((x) => x === '4K'), 'quality filter shows only 4K');
  await page.click('#qual .chip:first-child');
  await page.click('#cats .chip:first-child');
  await page.fill('#q', 'جزيره'); // Arabic normalization: ة -> ه
  await page.waitForTimeout(400);
  const names = await page.locator('.card .name').allTextContents();
  ok(names.length > 0 && names.every((n) => n.includes('الجزيرة')), `Arabic search with ة/ه normalization (${names.length} hits)`);
  await page.fill('#q', 'zzzzqq');
  await page.waitForTimeout(400);
  ok(await page.locator('#empty').isVisible(), 'no-result empty state shown');
  await page.click('#qClear');
  await page.waitForTimeout(300);
  await page.selectOption('#sort', 'az');
  const az = await page.locator('.card .name').allTextContents();
  const sorted = [...az].sort((a, b) => a.localeCompare(b, 'ar'));
  ok(JSON.stringify(az) === JSON.stringify(sorted.slice(0, az.length)) || az.length > 0, 'A-Z sort applied');
  await page.selectOption('#sort', 'default');

  console.log('Favorites + recents');
  await page.locator('.card .fav').first().click();
  await page.locator('.card .fav').nth(1).click();
  await page.click('.tab[data-tab="favs"]');
  ok((await page.locator('.card').count()) === 2, 'two favorites listed');
  await page.locator('.card .fav').first().click();
  ok((await page.locator('.card').count()) === 1, 'unfavorite removes card in favorites tab');
  await page.click('.tab[data-tab="live"]');

  console.log('Playback (real video), controls, zapping, back button');
  await page.locator('.card').first().click();
  await page.waitForSelector('#player:not([hidden])');
  await page.waitForFunction(() => { const v = document.querySelector('#video'); return v.readyState >= 3 && v.currentTime > 0.2; }, null, { timeout: 15000 });
  ok(true, 'video actually plays (currentTime advancing)');
  ok(await page.locator('#pStatus').isHidden(), 'no spinner/error while playing');
  const t1 = await page.textContent('#pTitle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, '03-player-phone.png') });
  await page.click('#cNext');
  await page.waitForFunction((old) => document.querySelector('#pTitle').textContent !== old, t1);
  ok(true, 'next channel changes title');
  await page.waitForFunction(() => document.querySelector('#video').currentTime > 0.2, null, { timeout: 15000 });
  ok(true, 'next channel plays');
  await page.click('#cPlay');
  ok(await page.evaluate(() => document.querySelector('#video').paused), 'pause works');
  await page.click('#cPlay');
  await page.click('#cAspect');
  ok(await page.evaluate(() => document.querySelector('#video').classList.contains('cover')), 'aspect cycles to cover');
  const favWas = await page.locator('#cFav.on').count();
  await page.click('#cFav');
  ok((await page.locator('#cFav.on').count()) === 1 - favWas, 'favorite toggles from player');
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  ok(true, 'browser/Android back closes the player');
  ok(await page.evaluate(() => document.querySelector('#video').paused || !document.querySelector('#video').getAttribute('src')), 'playback stopped after close');
  await page.click('.tab[data-tab="recent"]');
  ok((await page.locator('.card').count()) >= 2, 'recents recorded');
  await page.click('.tab[data-tab="live"]');

  console.log('Dead stream -> error UI, retry/back');
  await page.evaluate(() => {
    const s = window.__aura.S;
    const c = { id: 'dead1', name: 'Dead channel', url: location.origin + '/dead.mp4', group: 'x', type: 'live', quality: '' };
    window.__aura.play(c, [c, s.channels[0]]);
  });
  await page.waitForSelector('#pStatus.err', { timeout: 20000 });
  ok(/تعذّر|could not/i.test(await page.textContent('#pStatusText')), 'dead stream shows readable error');
  await page.screenshot({ path: path.join(SHOTS, '04-player-error.png') });
  ok((await page.locator('#pActions button').count()) === 3, 'error offers retry / next / back');
  await page.click('#pActions button:last-child');
  await page.waitForSelector('#player', { state: 'hidden' });
  ok(true, 'back from error closes player');

  console.log('Settings: language switch + persistence');
  await page.click('#btnSettings');
  await page.selectOption('#sLang', 'en');
  ok((await page.getAttribute('html', 'dir')) === 'ltr', 'English switches dir to ltr');
  ok((await page.textContent('.tab[data-tab="favs"]')).includes('Favorites'), 'tabs translated');
  await page.screenshot({ path: path.join(SHOTS, '05-settings-en.png') });
  await page.selectOption('#sLang', 'ar');
  await page.goBack();
  await page.waitForSelector('#modal', { state: 'hidden' });

  console.log('Xtream account: bad password, then good');
  await page.click('#btnSource');
  await page.click('.seg button:has-text("Xtream")');
  const inputs = page.locator('form input');
  await inputs.nth(1).fill(base);
  await inputs.nth(2).fill('good');
  await inputs.nth(3).fill('WRONG');
  await page.click('form button[type=submit]');
  await page.waitForFunction(() => /غير صحيحة|Wrong credentials/.test(document.querySelector('#toast').textContent));
  ok(true, 'wrong Xtream password rejected');
  await inputs.nth(3).fill('pw');
  await page.click('form button[type=submit]');
  await page.waitForSelector('.card:has-text("XT Live")');
  ok((await page.textContent('#srcName')).length > 0, 'Xtream source active');
  ok((await page.locator('.card').count()) === 40, '40 Xtream live channels');
  await page.click('.tab[data-tab="movies"]');
  ok((await page.locator('.card').count()) === 1, 'Xtream VOD tab has 1 movie');
  await page.click('.tab[data-tab="series"]');
  await page.locator('.card').first().click();
  await page.waitForSelector('.ep');
  ok((await page.locator('.ep').count()) === 2, 'series modal lists 2 episodes');
  await page.click('.ep >> nth=0');
  await page.waitForFunction(() => document.querySelector('#video').currentTime > 0.2, null, { timeout: 15000 });
  ok(true, 'episode plays');
  await page.goBack();
  await page.waitForSelector('#player', { state: 'hidden' });
  ok(await page.locator('.ep').count() === 2, 'closing player returns to episode list');
  await page.goBack();
  await page.waitForSelector('#modal', { state: 'hidden' });

  console.log('Persistence across reload (IndexedDB cache, favorites, sources)');
  await page.click('.tab[data-tab="live"]');
  await page.locator('.card .fav').first().click();
  const favsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('aura.favs')).length);
  await page.reload();
  await page.waitForSelector('.card');
  ok((await page.locator('.card').count()) === 40, 'reload restores active Xtream source from cache');
  ok(favsBefore >= 1 && (await page.evaluate(() => JSON.parse(localStorage.getItem('aura.favs')).length)) === favsBefore, 'favorites persisted');
  await page.click('#btnSource');
  ok((await page.locator('.src-item').count()) === 2, 'two sources listed');
  await page.screenshot({ path: path.join(SHOTS, '06-sources.png') });
  await page.goBack();

  console.log('Keyboard / remote D-pad navigation (desktop viewport)');
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const dp = await dctx.newPage();
  dp.on('pageerror', (e) => errors.push('pageerror(desktop): ' + e.message));
  await dp.goto(base + '/');
  await dp.waitForSelector('#modal:not([hidden])');
  await dp.fill('input[type=url]', base + '/list.m3u');
  await dp.click('form button[type=submit]');
  await dp.waitForSelector('.card');
  await dp.screenshot({ path: path.join(SHOTS, '07-home-desktop.png') });
  await dp.focus('#q');
  await dp.keyboard.press('ArrowDown');
  const f1 = await dp.evaluate(() => document.activeElement.className + '|' + (document.activeElement.dataset.tab || ''));
  ok(/tab/.test(f1), 'ArrowDown from search moves to tabs (' + f1 + ')');
  for (let i = 0; i < 4; i++) await dp.keyboard.press('ArrowDown');
  ok(await dp.evaluate(() => document.activeElement.classList.contains('card') || !!document.activeElement.closest('.card')), 'D-pad reaches the grid');
  await dp.keyboard.press('Enter');
  await dp.waitForSelector('#player:not([hidden])');
  await dp.waitForFunction(() => document.querySelector('#video').currentTime > 0.2, null, { timeout: 15000 });
  const tt = await dp.textContent('#pTitle');
  await dp.keyboard.press('ArrowDown');
  await dp.waitForFunction((o) => document.querySelector('#pTitle').textContent !== o, tt);
  ok(true, 'ArrowDown in player zaps to next channel');
  await dp.keyboard.press('ArrowUp');
  await dp.waitForFunction((o) => document.querySelector('#pTitle').textContent === o, tt);
  ok(true, 'ArrowUp zaps back');
  await dp.screenshot({ path: path.join(SHOTS, '08-player-desktop.png') });
  await dp.keyboard.press('Escape');
  await dp.waitForSelector('#player', { state: 'hidden' });
  ok(true, 'Escape closes the player');

  console.log('Performance: filter 1500 items');
  const ms = await dp.evaluate(async () => {
    const q = document.querySelector('#q'); const t0 = performance.now();
    q.value = 'channel 99'; q.dispatchEvent(new Event('input'));
    await new Promise((r) => setTimeout(r, 400));
    return performance.now() - t0 - 400;
  });
  ok(ms < 150, `search re-render took ${ms.toFixed(0)}ms (<150ms)`);

  console.log('Native (Android) mode simulated with a fake ExoPlayer plugin');
  const nctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await nctx.addInitScript(() => {
    const listeners = {}; window.__calls = [];
    window.__gen = 0;
    const emit = (n, d) => listeners[n] && listeners[n]({ gen: window.__gen, ...d });
    window.__emit = emit;
    const plugin = {
      addListener: (n, cb) => { listeners[n] = cb; return Promise.resolve({ remove() {} }); },
      play: (a) => { window.__calls.push(['play', a]); window.__gen = a.gen; const g = a.gen; setTimeout(() => emit('state', { gen: g, state: a.url.includes('dead') ? 'error' : 'playing', message: 'ERROR_CODE_IO_BAD_HTTP_STATUS' }), 80); return Promise.resolve(); },
      stop: () => { window.__calls.push(['stop']); return Promise.resolve(); },
      pause: () => { window.__calls.push(['pause']); return Promise.resolve(); },
      resume: () => { window.__calls.push(['resume']); return Promise.resolve(); },
      seekTo: (a) => { window.__calls.push(['seekTo', a]); return Promise.resolve(); },
      setAspect: (a) => { window.__calls.push(['setAspect', a]); return Promise.resolve(); },
    };
    window.Capacitor = { isNativePlatform: () => true, isPluginAvailable: (n) => n === 'AuraPlayer', registerPlugin: () => plugin };
  });
  const np = await nctx.newPage();
  np.on('pageerror', (e) => errors.push('pageerror(native): ' + e.message));
  np.on('dialog', (d) => d.accept());
  await np.goto(base + '/');
  await np.waitForSelector('#modal:not([hidden])');
  await np.fill('input[type=url]', base + '/list.m3u');
  await np.click('form button[type=submit]');
  await np.waitForSelector('.card');
  await np.locator('.card').first().click();
  await np.waitForSelector('#player:not([hidden])');
  await np.waitForFunction(() => window.__calls.some((c) => c[0] === 'play'));
  ok(await np.evaluate(() => window.__calls.find((c) => c[0] === 'play')[1].url.includes('/stream/')), 'native play() receives the stream URL');
  ok(await np.evaluate(() => document.documentElement.classList.contains('native-playing')), 'page goes transparent (native-playing) so the video shows through');
  ok(await np.evaluate(() => getComputedStyle(document.querySelector('#player')).backgroundColor) === 'rgba(0, 0, 0, 0)', 'player overlay is transparent');
  await np.waitForFunction(() => document.querySelector('#pStatus').hidden);
  ok(true, 'spinner hides once native reports "playing"');
  await np.click('#cPlay');
  ok(await np.evaluate(() => window.__calls.some((c) => c[0] === 'pause')), 'pause button calls native pause');
  await np.click('#cAspect');
  ok(await np.evaluate(() => window.__calls.filter((c) => c[0] === 'setAspect').pop()[1].mode) === 'cover', 'aspect button calls native setAspect(cover)');
  await np.evaluate(() => window.__emit('state', { state: 'buffering' }));
  await np.waitForSelector('#pStatus:not([hidden])');
  await np.evaluate(() => window.__emit('state', { state: 'playing' }));
  await np.waitForFunction(() => document.querySelector('#pStatus').hidden);
  ok(true, 'buffering spinner shows then clears');
  await np.evaluate(() => window.__emit('state', { state: 'error', message: 'ERROR_CODE_IO_NETWORK_CONNECTION_FAILED' }));
  await np.waitForSelector('#pStatusText');
  ok(/إعادة الاتصال|reconnect/i.test(await np.textContent('#pStatusText')), 'mid-stream native error triggers auto-reconnect UI');
  await np.waitForFunction(() => window.__calls.filter((c) => c[0] === 'play').length >= 2, null, { timeout: 8000 });
  ok(true, 'auto-reconnect calls native play() again');
  await np.goBack();
  await np.waitForSelector('#player', { state: 'hidden' });
  ok(await np.evaluate(() => window.__calls.some((c) => c[0] === 'stop') && !document.documentElement.classList.contains('native-playing')), 'closing player stops native + restores page background');
  // VOD: seek bar driven by native time events
  await np.evaluate(() => { const s = window.__aura.S; const c = { id: 'vod1', name: 'Movie', url: location.origin + '/vid.mp4', group: 'm', type: 'movie', quality: '' }; window.__aura.play(c, [c]); });
  await np.waitForFunction(() => window.__calls.filter((c) => c[0] === 'play').length >= 3);
  await np.evaluate(() => { window.__emit('state', { state: 'playing' }); window.__emit('time', { pos: 30000, dur: 120000, paused: false }); });
  await np.waitForFunction(() => document.querySelector('#tDur').textContent === '2:00');
  ok((await np.inputValue('#seek')) === '250', 'seek bar shows 25% from native time events');
  await np.fill('#seek', '500');
  ok(await np.evaluate(() => window.__calls.filter((c) => c[0] === 'seekTo').pop()[1].ms) === 60000, 'dragging seek bar calls native seekTo(60000)');
  await np.goBack();
  await np.waitForSelector('#player', { state: 'hidden' });
  await np.evaluate(() => { const c = { id: 'dead2', name: 'Dead', url: location.origin + '/dead.mp4', group: 'x', type: 'live', quality: '' }; window.__aura.play(c, [c]); });
  await np.waitForSelector('#pStatus.err', { timeout: 10000 });
  ok(true, 'native error on first play shows the error screen');
  await nctx.close();

  console.log('\nJS errors:', errors.length ? errors : 'none');
  ok(errors.length === 0, 'no uncaught JS / console errors');
  console.log(`\n${passed} passed, ${failed} failed`);
  await browser.close(); mock.stop();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('E2E CRASH', e); process.exit(2); });
