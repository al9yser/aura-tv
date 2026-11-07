// Playback engine: tries the best decoder for the URL, falls back to the others,
// and reports buffering / fatal errors so the UI can reconnect with back-off.

const libs = {};
function loadLib(name) {
  if (libs[name]) return libs[name];
  const file = name === 'hls' ? 'vendor/hls.min.js' : 'vendor/mpegts.js';
  libs[name] = new Promise((resolve) => {
    const g = () => (name === 'hls' ? window.Hls : window.mpegts);
    if (g()) return resolve(g());
    const s = document.createElement('script');
    s.src = file;
    s.async = true;
    s.onload = () => resolve(g() || null);
    s.onerror = () => resolve(null);
    document.head.appendChild(s);
  });
  return libs[name];
}

export function planChain(url, live) {
  const low = String(url || '').toLowerCase();
  const path = low.split('?')[0];
  if (/\.m3u8?$/.test(path) || low.includes('m3u8')) return ['hls', 'native', 'mpegts'];
  if (/\.(mp4|m4v|webm|mov|mkv|avi)$/.test(path)) return ['native'];
  if (/\.ts$/.test(path)) return ['mpegts', 'native', 'hls'];
  return live ? ['mpegts', 'hls', 'native'] : ['native', 'hls', 'mpegts'];
}

const FIRST_FRAME_TIMEOUT = 15000;

export class Engine {
  /** hooks: {onBuffering(bool), onFatal(err), onPlaying()} */
  constructor(video, hooks = {}) {
    this.v = video;
    this.hooks = hooks;
    this.inst = null;
    this.token = 0;
    this.started = false;
    this.recoveries = 0;
    video.addEventListener('waiting', () => this.started && hooks.onBuffering && hooks.onBuffering(true));
    video.addEventListener('stalled', () => this.started && hooks.onBuffering && hooks.onBuffering(true));
    video.addEventListener('playing', () => {
      if (hooks.onBuffering) hooks.onBuffering(false);
      if (this.started && hooks.onPlaying) hooks.onPlaying();
    });
    video.addEventListener('error', () => {
      if (this.started && this.inst && this.inst.kind === 'native') this._fatal(new Error('media'));
    });
  }

  _fatal(err) {
    const tok = this.token;
    setTimeout(() => { if (tok === this.token && this.hooks.onFatal) this.hooks.onFatal(err); }, 0);
  }

  _destroyInst() {
    const i = this.inst;
    this.inst = null;
    if (!i) return;
    try {
      if (i.kind === 'hls') { i.hls.destroy(); }
      else if (i.kind === 'mpegts') { i.player.pause(); i.player.unload(); i.player.detachMediaElement(); i.player.destroy(); }
    } catch (_) { /* ignore */ }
    try { this.v.removeAttribute('src'); this.v.load(); } catch (_) { /* ignore */ }
  }

  stop() {
    this.token++;
    this.started = false;
    this._destroyInst();
  }

  /** Resolves once the first frame plays; rejects if every decoder failed. */
  async play(url, { live = true, buffer = 'stable', onEngine } = {}) {
    this.stop();
    const tok = this.token;
    this.recoveries = 0;
    let lastErr = new Error('failed');
    for (const kind of planChain(url, live)) {
      if (tok !== this.token) throw new Error('cancelled');
      if (onEngine) onEngine(kind);
      try {
        await this._try(kind, url, { live, buffer }, tok);
        if (tok !== this.token) throw new Error('cancelled');
        this.started = true;
        return kind;
      } catch (e) {
        if (tok !== this.token) throw new Error('cancelled');
        lastErr = e;
        this._destroyInst();
      }
    }
    throw lastErr;
  }

  _try(kind, url, opts, tok) {
    const v = this.v;
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (ok, err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        v.removeEventListener('playing', onPlaying);
        v.removeEventListener('error', onError);
        if (ok) resolve(); else reject(err || new Error(kind));
      };
      const onPlaying = () => finish(true);
      const onError = () => { if (kind === 'native') finish(false, new Error('media')); };
      const timer = setTimeout(() => finish(false, new Error('timeout')), FIRST_FRAME_TIMEOUT);
      v.addEventListener('playing', onPlaying);
      v.addEventListener('error', onError);
      const start = () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };

      (async () => {
        try {
          if (kind === 'native') {
            this.inst = { kind };
            v.src = url;
            start();
          } else if (kind === 'hls') {
            const Hls = await loadLib('hls');
            if (tok !== this.token) return finish(false, new Error('cancelled'));
            if (!Hls) {
              // No hls.js bundled: let the platform decode HLS natively when it can.
              if (v.canPlayType('application/vnd.apple.mpegurl')) { this.inst = { kind: 'native' }; v.src = url; start(); return; }
              return finish(false, new Error('no-hls'));
            }
            if (!Hls.isSupported()) return finish(false, new Error('no-mse'));
            const stable = opts.buffer !== 'low';
            const hls = new Hls({
              enableWorker: true,
              lowLatencyMode: !stable,
              maxBufferLength: stable ? 40 : 12,
              liveSyncDurationCount: stable ? 4 : 2,
              manifestLoadingMaxRetry: 2,
              levelLoadingMaxRetry: 2,
              fragLoadingMaxRetry: 3,
            });
            this.inst = { kind, hls };
            hls.on(Hls.Events.ERROR, (_e, d) => {
              if (!d || !d.fatal) return;
              if (!this.started) return finish(false, new Error(d.details || 'hls'));
              if (d.type === Hls.ErrorTypes.NETWORK_ERROR && this.recoveries++ < 3) hls.startLoad();
              else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && this.recoveries++ < 3) hls.recoverMediaError();
              else this._fatal(new Error(d.details || 'hls'));
            });
            hls.loadSource(url);
            hls.attachMedia(v);
            start();
          } else if (kind === 'mpegts') {
            const M = await loadLib('mpegts');
            if (tok !== this.token) return finish(false, new Error('cancelled'));
            if (!M || !M.isSupported()) return finish(false, new Error('no-mpegts'));
            const player = M.createPlayer(
              { type: 'mpegts', isLive: !!opts.live, url },
              { enableWorker: true, liveBufferLatencyChasing: opts.buffer === 'low', lazyLoad: false },
            );
            this.inst = { kind, player };
            player.on(M.Events.ERROR, () => {
              if (!this.started) finish(false, new Error('mpegts'));
              else this._fatal(new Error('mpegts'));
            });
            player.attachMediaElement(v);
            player.load();
            start();
          }
        } catch (e) { finish(false, e); }
      })();
    });
  }
}
