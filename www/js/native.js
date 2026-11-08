// Bridge to the native ExoPlayer plugin (Android). Mirrors the small slice of the
// <video> element API that app.js uses, so the UI code is identical in both modes.

export function isNative() {
  try {
    const C = window.Capacitor;
    return !!(C && C.isNativePlatform && C.isNativePlatform() && C.isPluginAvailable && C.isPluginAvailable('AuraPlayer'));
  } catch (_) { return false; }
}

const noop = () => {};
const swallow = (p) => { try { if (p && p.catch) p.catch(noop); } catch (_) { /* ignore */ } };

export class NativeVideo extends EventTarget {
  constructor(plugin) {
    super();
    this.p = plugin;
    this.paused = true;
    this.duration = NaN;
    this._t = 0;
    // app.js toggles CSS classes on the element; there is none in native mode.
    this.classList = { toggle: noop, add: noop, remove: noop, contains: () => false };
    this.requestPictureInPicture = undefined;
  }
  get currentTime() { return this._t; }
  set currentTime(sec) {
    const s = Math.max(0, Number(sec) || 0);
    this._t = s;
    swallow(this.p.seekTo({ ms: Math.round(s * 1000) }));
  }
  play() {
    swallow(this.p.resume());
    if (this.paused) { this.paused = false; this.dispatchEvent(new Event('play')); }
    return Promise.resolve();
  }
  pause() {
    swallow(this.p.pause());
    if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); }
  }
}

const FIRST_FRAME_TIMEOUT = 20000;

export class NativeEngine {
  /** hooks: {onBuffering(bool), onFatal(err), onPlaying()} - same contract as player.js Engine. */
  constructor(nv, hooks = {}) {
    this.nv = nv;
    this.p = nv.p;
    this.hooks = hooks;
    this.token = 0;
    this.gen = 0; // every play/stop bumps it; plugin echoes it so late events of an old stream are ignored
    this.started = false;
    this.pending = null;
    swallow(this.p.addListener('state', (e) => this._state(e || {})));
    swallow(this.p.addListener('time', (e) => this._time(e || {})));
  }

  _state(e) {
    if (e.gen !== this.gen) return;
    const nv = this.nv;
    switch (e.state) {
      case 'playing': {
        if (nv.paused) { nv.paused = false; nv.dispatchEvent(new Event('play')); }
        if (this.pending) {
          const pd = this.pending;
          this.pending = null;
          clearTimeout(pd.timer);
          this.started = true;
          pd.resolve('native');
        }
        if (this.hooks.onBuffering) this.hooks.onBuffering(false);
        if (this.started && this.hooks.onPlaying) this.hooks.onPlaying();
        nv.dispatchEvent(new Event('playing'));
        break;
      }
      case 'buffering':
        if (this.started && this.hooks.onBuffering) this.hooks.onBuffering(true);
        break;
      case 'ended':
        nv.dispatchEvent(new Event('ended'));
        break;
      case 'error': {
        const err = new Error(e.message || 'native');
        if (this.pending) {
          const pd = this.pending;
          this.pending = null;
          clearTimeout(pd.timer);
          pd.reject(err);
        } else if (this.started && this.hooks.onFatal) {
          this.started = false;
          this.hooks.onFatal(err);
        }
        break;
      }
      default: break;
    }
  }

  _time(e) {
    if (e.gen !== this.gen) return;
    const nv = this.nv;
    nv._t = Math.max(0, Number(e.pos) || 0) / 1000;
    const d = Number(e.dur);
    nv.duration = d > 0 ? d / 1000 : NaN;
    if (typeof e.paused === 'boolean' && e.paused !== nv.paused) {
      nv.paused = e.paused;
      nv.dispatchEvent(new Event(e.paused ? 'pause' : 'play'));
    }
    nv.dispatchEvent(new Event('timeupdate'));
  }

  stop() {
    this.token++;
    this.gen++;
    this.started = false;
    if (this.pending) {
      const pd = this.pending;
      this.pending = null;
      clearTimeout(pd.timer);
      pd.reject(new Error('cancelled'));
    }
    this.nv.paused = true;
    this.nv._t = 0;
    this.nv.duration = NaN;
    swallow(this.p.stop());
  }

  /** Resolves when the first frame plays; rejects on error, timeout or cancel. */
  play(url, { live = true, buffer = 'stable' } = {}) {
    this.stop();
    const tok = this.token;
    const gen = ++this.gen;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending && this.pending.tok === tok) {
          this.pending = null;
          reject(new Error('timeout'));
        }
      }, FIRST_FRAME_TIMEOUT);
      this.pending = { tok, resolve, reject, timer };
      let call;
      try { call = this.p.play({ url, live: !!live, buffer, gen }); } catch (e) { call = Promise.reject(e); }
      Promise.resolve(call).catch((e) => {
        if (this.pending && this.pending.tok === tok) {
          this.pending = null;
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(String((e && e.message) || e || 'native')));
        }
      });
    });
  }
}
