import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM3U, normalize, detectQuality, detectType } from '../www/js/parser.js';
import * as X from '../www/js/xtream.js';
import { planChain } from '../www/js/player.js';

const SAMPLE = `﻿#EXTM3U x-tvg-url="http://epg"
#EXTINF:-1 tvg-id="bein1.qa" tvg-name="beIN 1 HD" tvg-logo="http://l/1.png" group-title="Sports, Live",beIN Sports 1 HD
http://h/live/1.m3u8
#EXTINF:-1 group-title="أفلام",فيلم الأسد
http://h/movie/u/p/55.mp4
#EXTGRP:Kids
#EXTINF:-1,Cartoon, The Best
http://h/9.ts|User-Agent=VLC
#EXTINF:-1,Broken entry
not-a-url
#EXTINF:-1 group-title="مسلسلات",مسلسل الحارة
http://h/series/u/p/77.mkv
`;

test('parseM3U handles attrs, commas in names/groups, EXTGRP, BOM, bad lines', () => {
  const ch = parseM3U(SAMPLE);
  assert.equal(ch.length, 4);
  assert.equal(ch[0].name, 'beIN Sports 1 HD');
  assert.equal(ch[0].group, 'Sports, Live');
  assert.equal(ch[0].logo, 'http://l/1.png');
  assert.equal(ch[0].tvgId, 'bein1.qa');
  assert.equal(ch[0].quality, 'HD');
  assert.equal(ch[0].type, 'live');
  assert.equal(ch[1].type, 'movie');
  assert.equal(ch[2].name, 'Cartoon, The Best');
  assert.equal(ch[2].group, 'Kids');
  assert.equal(ch[2].url, 'http://h/9.ts');
  assert.equal(ch[3].type, 'series');
});

test('parseM3U tolerates garbage', () => {
  assert.deepEqual(parseM3U(''), []);
  assert.deepEqual(parseM3U(null), []);
  assert.deepEqual(parseM3U('<html>not a playlist</html>'), []);
  assert.equal(parseM3U('http://a/b.m3u8').length, 1); // bare URL list
});

test('ids are stable and unique per channel', () => {
  const a = parseM3U(SAMPLE), b = parseM3U(SAMPLE);
  assert.deepEqual(a.map((c) => c.id), b.map((c) => c.id));
  assert.equal(new Set(a.map((c) => c.id)).size, a.length);
});

test('normalize unifies Arabic variants', () => {
  assert.equal(normalize('أَحمد'), normalize('احمد'));
  assert.equal(normalize('مدرسة'), normalize('مدرسه'));
  assert.equal(normalize('Café  HD'), 'cafe hd');
});

test('quality + type detection', () => {
  assert.equal(detectQuality('Movie 4K'), '4K');
  assert.equal(detectQuality('CNN FHD'), 'FHD');
  assert.equal(detectQuality('CNN 1080p'), 'FHD');
  assert.equal(detectQuality('Chd'), '');
  assert.equal(detectQuality('MBC SD'), 'SD');
  assert.equal(detectType('http://x/live/1', 'Movies channels'), 'movie');
});

test('xtream helpers', () => {
  assert.equal(X.normalizeServer('host.tv:8080/'), 'http://host.tv:8080');
  assert.equal(X.normalizeServer('https://h.tv/player_api.php'), 'https://h.tv');
  assert.throws(() => X.normalizeServer(''));
  const src = { server: 'http://h', user: 'u s', pass: 'p/1' };
  const live = X.mapLive([{ stream_id: 5, name: 'A', category_id: '2', epg_channel_id: 'e' }], [{ category_id: '2', category_name: 'News' }], src);
  assert.equal(live[0].url, 'http://h/live/u%20s/p%2F1/5.m3u8');
  assert.equal(live[0].alt, 'http://h/live/u%20s/p%2F1/5.ts');
  assert.equal(live[0].group, 'News');
  assert.deepEqual(X.mapVod(false, null, src), []);
  const info = X.parseSeriesInfo({ episodes: { 2: [{ id: 9, episode_num: 1 }], 1: [{ id: 2, episode_num: 2, title: 'b' }, { id: 1, episode_num: 1, title: 'a' }] } }, src);
  assert.deepEqual(info.map((s) => s.season), [1, 2]);
  assert.deepEqual(info[0].episodes.map((e) => e.title), ['a', 'b']);
});

test('xtream fetchAll: auth failure and soft failures', async () => {
  const src = { server: 'http://h', user: 'u', pass: 'p' };
  await assert.rejects(X.fetchAll(src, async () => ({ user_info: { auth: 0 } })), { code: 'auth' });
  const get = async (url) => {
    if (!url.includes('action=')) return { user_info: { auth: 1, status: 'Active' } };
    if (url.includes('get_live_streams')) return [{ stream_id: 1, name: 'X', category_id: 1 }];
    if (url.includes('get_live_categories')) return [{ category_id: 1, category_name: 'G' }];
    throw new Error('panel has no vod');
  };
  const all = await X.fetchAll(src, get);
  assert.equal(all.length, 1);
  assert.equal(all[0].type, 'live');
});

test('player engine plan', () => {
  assert.deepEqual(planChain('http://a/b.m3u8?x=1', true)[0], 'hls');
  assert.deepEqual(planChain('http://a/b.mp4', false), ['native']);
  assert.equal(planChain('http://a/1234', true)[0], 'mpegts');
  assert.equal(planChain('http://a/1234', false)[0], 'native');
});
