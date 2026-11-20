/**
 * YouTube IFrame Player API audio controller for the Lo-Fi Radio.
 * Supports any YouTube URL or 11-character video ID with continuous looping.
 */

export const DEFAULT_YOUTUBE_VIDEO_ID = 't8yVk0bm684';
const STORAGE_KEY = 'lofi-diorama-yt-id';

const YT_ERROR_MESSAGES = {
  2: 'Invalid YouTube video ID',
  5: 'HTML5 player error — try again',
  100: 'Video not found or set to private',
  101: 'This YouTube video has embedding disabled by its owner',
  150: 'This YouTube video has embedding disabled by its owner',
  153: 'YouTube playback blocked by referrer/embed policy',
};

/**
 * Extract an 11-char YouTube video ID from any standard YouTube URL or raw ID.
 */
export function parseYouTubeVideoId(input) {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      const v = url.searchParams.get('v');
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
      const parts = url.pathname.split('/').filter(Boolean);
      if (
        ['embed', 'shorts', 'live', 'v'].includes(parts[0]) &&
        /^[a-zA-Z0-9_-]{11}$/.test(parts[1] || '')
      ) {
        return parts[1];
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function getSavedVideoId() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && /^[a-zA-Z0-9_-]{11}$/.test(saved)) return saved;
  } catch {
    // Ignore storage errors in restricted contexts
  }
  return DEFAULT_YOUTUBE_VIDEO_ID;
}

let apiPromise = null;

function loadYouTubeIframeAPI() {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    document.head.appendChild(tag);
  });
  return apiPromise;
}

export class YouTubeRadio {
  constructor(mountId = 'yt-radio-host', { onStateChange = null, onError = null } = {}) {
    this.mountId = mountId;
    this.wrapId = 'yt-radio-wrap';
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.videoId = getSavedVideoId();
    this.player = null;
    this.ready = false;
    this.enabled = true;
    this.playing = false;
    this.volume = 70;
    this.mountSeq = 0;
  }

  getVideoUrl() {
    return `https://www.youtube.com/watch?v=${this.videoId}`;
  }

  async _mountPlayer(videoId) {
    const seq = ++this.mountSeq;
    const YT = await loadYouTubeIframeAPI();
    if (seq !== this.mountSeq) return; // superseded by newer loadVideo call

    if (this.player) {
      try {
        this.player.destroy();
      } catch {
        // Ignore teardown errors
      }
      this.player = null;
      this.ready = false;
      this.playing = false;
    }

    const wrap = document.getElementById(this.wrapId);
    if (!wrap) return;
    wrap.innerHTML = '';
    const host = document.createElement('div');
    host.id = this.mountId;
    wrap.appendChild(host);

    this.player = new YT.Player(host, {
      height: '113',
      width: '200',
      videoId,
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        enablejsapi: 1,
        fs: 0,
        loop: 1,
        modestbranding: 1,
        playsinline: 1,
        playlist: videoId,
        rel: 0,
        origin: window.location.origin,
      },
      events: {
        onReady: (e) => {
          if (seq !== this.mountSeq) return;
          this.ready = true;
          const iframe = e.target.getIframe?.();
          if (iframe) {
            iframe.setAttribute('allow', 'autoplay; encrypted-media');
          }
          e.target.setVolume(this.volume);
          if (this.enabled) {
            e.target.unMute();
            e.target.playVideo();
          }
        },
        onStateChange: (e) => {
          if (seq !== this.mountSeq) return;
          const S = window.YT?.PlayerState;
          if (!S) return;
          if (e.data === S.PLAYING) {
            this.playing = true;
            this.onStateChange?.(true);
          } else if (e.data === S.PAUSED) {
            this.playing = false;
            this.onStateChange?.(false);
          } else if (e.data === S.CUED && this.enabled) {
            e.target.unMute();
            e.target.setVolume(this.volume);
            e.target.playVideo();
          } else if (e.data === S.ENDED && this.enabled) {
            e.target.seekTo(0);
            e.target.playVideo();
          }
        },
        onError: (e) => {
          if (seq !== this.mountSeq) return;
          this.playing = false;
          const msg = YT_ERROR_MESSAGES[e.data] || `YouTube player error (${e.data})`;
          console.error('[YouTubeRadio]', msg, videoId);
          this.onError?.(msg, e.data);
        },
      },
    });
  }

  async init() {
    if (this.mountSeq > 0) return;
    await this._mountPlayer(this.videoId);
  }

  loadVideo(input) {
    const id = parseYouTubeVideoId(input);
    if (!id) return null;
    this.videoId = id;
    this.enabled = true;
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Ignore storage errors
    }

    // Re-mount a fresh player directly on the new videoId so playlist/loop and
    // autoplay-under-user-gesture always kick in reliably.
    this._mountPlayer(id);
    return id;
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.mountSeq === 0) {
      this._mountPlayer(this.videoId);
      return this.enabled;
    }
    if (this.ready && this.player) {
      if (this.enabled) {
        this.player.unMute();
        this.player.setVolume(this.volume);
        this.player.playVideo();
      } else {
        this.player.pauseVideo();
      }
    }
    return this.enabled;
  }

  unlockIfPending() {
    if (!this.enabled) return;
    if (this.mountSeq === 0) {
      this._mountPlayer(this.videoId);
      return;
    }
    if (this.ready && this.player && !this.playing) {
      this.player.unMute();
      this.player.setVolume(this.volume);
      this.player.playVideo();
    }
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(100, Number(val) || 0));
    if (this.ready && this.player) {
      this.player.setVolume(this.volume);
    }
  }
}
