package com.aura.iptv;

import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Native video playback (ExoPlayer / Media3) rendered BEHIND the transparent WebView.
 * Handles HLS, raw MPEG-TS, MP4, MKV, http/https, redirects and VLC-style User-Agent,
 * none of which the in-WebView player can do reliably against IPTV servers.
 */
@CapacitorPlugin(name = "AuraPlayer")
public class AuraPlayerPlugin extends Plugin {

    private static final String DEFAULT_UA = "VLC/3.0.20 LibVLC/3.0.20";

    private final Handler main = new Handler(Looper.getMainLooper());
    private ExoPlayer player;
    private PlayerView view;
    private boolean isLive = true;
    private int gen = 0;
    private boolean wasPlayingBeforePause = false;

    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            emitTime();
            if (player != null) {
                main.postDelayed(this, 500);
            }
        }
    };

    @Override
    public void load() {
        WebView web = getBridge().getWebView();
        web.setBackgroundColor(Color.TRANSPARENT);
    }

    private void ensureView() {
        if (view != null) {
            return;
        }
        WebView web = getBridge().getWebView();
        ViewGroup parent = (ViewGroup) web.getParent();
        view = (PlayerView) LayoutInflater.from(getContext()).inflate(R.layout.aura_player_view, parent, false);
        view.setKeepScreenOn(true);
        parent.addView(view, 0); // index 0 => drawn below the WebView
    }

    private void emit(String state, String message) {
        JSObject o = new JSObject();
        o.put("state", state);
        o.put("gen", gen);
        if (message != null) {
            o.put("message", message);
        }
        notifyListeners("state", o);
    }

    private void emitTime() {
        if (player == null) {
            return;
        }
        JSObject o = new JSObject();
        long dur = player.getDuration();
        o.put("gen", gen);
        o.put("pos", player.getCurrentPosition());
        o.put("dur", (isLive || dur == C.TIME_UNSET) ? -1 : dur);
        o.put("paused", !player.getPlayWhenReady());
        notifyListeners("time", o);
    }

    private void releasePlayer() {
        main.removeCallbacks(ticker);
        if (player != null) {
            try {
                player.stop();
                player.release();
            } catch (Exception ignored) {
                // already released
            }
            player = null;
        }
        if (view != null) {
            view.setPlayer(null);
            view.setVisibility(View.GONE);
        }
    }

    @PluginMethod
    public void play(final PluginCall call) {
        final String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("no url");
            return;
        }
        Boolean liveArg = call.getBoolean("live", true);
        final boolean live = liveArg == null || liveArg;
        final String buffer = call.getString("buffer", "stable");
        final String ua = call.getString("ua", DEFAULT_UA);
        Integer genArg = call.getInt("gen", 0);
        final int newGen = genArg == null ? 0 : genArg;

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    releasePlayer();
                    ensureView();
                    isLive = live;
                    gen = newGen;

                    boolean stable = !"low".equals(buffer);
                    DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
                            .setBufferDurationsMs(
                                    stable ? 15000 : 5000,
                                    stable ? 50000 : 15000,
                                    stable ? 2500 : 1000,
                                    stable ? 5000 : 2000)
                            .build();

                    DefaultHttpDataSource.Factory http = new DefaultHttpDataSource.Factory()
                            .setUserAgent(ua == null ? DEFAULT_UA : ua)
                            .setAllowCrossProtocolRedirects(true)
                            .setConnectTimeoutMs(15000)
                            .setReadTimeoutMs(20000);

                    player = new ExoPlayer.Builder(getContext())
                            .setMediaSourceFactory(new DefaultMediaSourceFactory(getContext()).setDataSourceFactory(http))
                            .setLoadControl(loadControl)
                            .setAudioAttributes(new AudioAttributes.Builder()
                                    .setUsage(C.USAGE_MEDIA)
                                    .setContentType(C.AUDIO_CONTENT_TYPE_MOVIE)
                                    .build(), true)
                            .build();

                    player.addListener(new Player.Listener() {
                        @Override
                        public void onPlaybackStateChanged(int state) {
                            if (state == Player.STATE_BUFFERING) {
                                emit("buffering", null);
                            } else if (state == Player.STATE_READY) {
                                if (player != null && player.getPlayWhenReady()) {
                                    emit("playing", null);
                                }
                            } else if (state == Player.STATE_ENDED) {
                                emit("ended", null);
                            }
                        }

                        @Override
                        public void onIsPlayingChanged(boolean playing) {
                            if (playing) {
                                emit("playing", null);
                            }
                        }

                        @Override
                        public void onPlayerError(PlaybackException error) {
                            if (error.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW && player != null) {
                                player.seekToDefaultPosition();
                                player.prepare();
                                return;
                            }
                            emit("error", error.getErrorCodeName());
                        }
                    });

                    MediaItem.Builder item = new MediaItem.Builder().setUri(url);
                    if (url.toLowerCase().contains(".m3u8")) {
                        item.setMimeType(MimeTypes.APPLICATION_M3U8);
                    }
                    player.setMediaItem(item.build());
                    view.setPlayer(player);
                    view.setVisibility(View.VISIBLE);
                    player.setPlayWhenReady(true);
                    player.prepare();
                    main.postDelayed(ticker, 500);
                    call.resolve();
                } catch (Exception e) {
                    String m = e.getMessage();
                    call.reject(m == null ? "player error" : m);
                }
            }
        });
    }

    @PluginMethod
    public void stop(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                releasePlayer();
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void pause(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (player != null) {
                    player.setPlayWhenReady(false);
                }
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void resume(final PluginCall call) {
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (player != null) {
                    player.setPlayWhenReady(true);
                }
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void seekTo(final PluginCall call) {
        Long msArg = call.getLong("ms", 0L);
        final long ms = msArg == null ? 0L : msArg;
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (player != null && !isLive) {
                    player.seekTo(ms);
                }
                call.resolve();
            }
        });
    }

    @PluginMethod
    public void setAspect(final PluginCall call) {
        final String mode = call.getString("mode", "contain");
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (view != null) {
                    int rm = AspectRatioFrameLayout.RESIZE_MODE_FIT;
                    if ("cover".equals(mode)) {
                        rm = AspectRatioFrameLayout.RESIZE_MODE_ZOOM;
                    } else if ("fill".equals(mode)) {
                        rm = AspectRatioFrameLayout.RESIZE_MODE_FILL;
                    }
                    view.setResizeMode(rm);
                }
                call.resolve();
            }
        });
    }

    @Override
    protected void handleOnPause() {
        if (player != null) {
            wasPlayingBeforePause = player.getPlayWhenReady();
            player.setPlayWhenReady(false);
        }
    }

    @Override
    protected void handleOnResume() {
        if (player != null && wasPlayingBeforePause) {
            player.setPlayWhenReady(true);
        }
        wasPlayingBeforePause = false;
    }

    @Override
    protected void handleOnDestroy() {
        releasePlayer();
    }
}
