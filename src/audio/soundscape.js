/**
 * Procedural spatial Web Audio soundscape + generative Lo-Fi radio.
 *
 * Ambience (breeze, stream, rain, crickets, accents) and click foley live here.
 * The radio is driven by musicEngine.js: original station recipes
 * (stations.js) rendered live from synthesized instruments, with no
 * external audio files, samples or third-party recordings. Night Hindi Lo-Fi
 * (hindiLofi.js) is listed as an "external" station that main.js plays itself.
 */

import { StationPlayer, createRadioOutput, LOOKAHEAD } from './musicEngine.js';
import { STATIONS } from './stations.js';

const AMBIENCE_PROFILES = {
  japan: {
    rainLevel: 0.0,
    breezeLevel: 0.3,
    streamLevel: 0.14,
    crickets: true,
    accent: 'bamboo',
    defaultTrack: 'meadow_waltz',
  },
  india_monsoon: {
    rainLevel: 0.42,
    breezeLevel: 0.18,
    streamLevel: 0.1,
    crickets: false,
    accent: 'temple_bell',
    defaultTrack: 'malabar_monsoon',
  },
  america_pnw: {
    rainLevel: 0.22,
    breezeLevel: 0.26,
    streamLevel: 0.08,
    crickets: false,
    accent: 'wind_chime',
    defaultTrack: 'cascade_porch',
  },
  india_himalaya: {
    rainLevel: 0.0,
    breezeLevel: 0.34,
    streamLevel: 0.04,
    crickets: false,
    accent: 'temple_bell',
    defaultTrack: 'himalayan_clouds',
  },
  mountain_night: {
    rainLevel: 0.16,
    breezeLevel: 0.2,
    streamLevel: 0.03,
    crickets: true,
    accent: 'wind_chime',
    defaultTrack: 'fireside_drizzle',
  },
  india_summer: {
    rainLevel: 0.0,
    breezeLevel: 0.12,
    streamLevel: 0.0,
    crickets: true,
    accent: 'wind_chime',
    defaultTrack: 'night_hindi',
  },
};

const CHOICES_KEY = 'lofi-serene.sceneTracks.v2';

function loadSceneChoices() {
  try {
    const raw = window.localStorage.getItem(CHOICES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveSceneChoices(choices) {
  try {
    window.localStorage.setItem(CHOICES_KEY, JSON.stringify(choices));
  } catch {
    /* storage unavailable: choices last for this visit only */
  }
}

const USE_LABEL = { study: 'Study', sleep: 'Sleep' };

/** Played by HindiLofiPlayer in main.js rather than the station engine. */
export const EXTERNAL_HINDI_ID = 'night_hindi';

/** Station list for the UI (id, name, bpm, tag). */
export const RADIO_TRACKS = [
  ...STATIONS.map((s) => ({
    id: s.id,
    name: s.name,
    bpm: s.bpm,
    use: s.use,
    style: s.style,
  })),
  {
    id: EXTERNAL_HINDI_ID,
    name: 'Night Hindi Lo-Fi',
    bpm: 70,
    use: 'study',
    style: 'Hindi lo-fi · bansuri & acoustic guitar',
    external: true,
  },
].map((t) => ({ ...t, tag: `${USE_LABEL[t.use] || 'Study'} · ${t.style}` }));

const stationById = (id) => STATIONS.find((s) => s.id === id) || null;

const RADIO_LEVEL = 0.75;
const CROSSFADE = 2.5;

export class TeahouseSoundscape {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.ambienceGain = null;
    this.radioGain = null;
    this.radioOut = null;
    this.breezeGain = null;
    this.streamGain = null;
    this.rainGain = null;
    this.breezePanner = null;
    this.streamPanner = null;

    this.profileKey = 'japan';
    this.trackIndex = 0;
    // Each scene has its own track; a station picked in Controls is remembered for that scene only.
    this.sceneChoices = loadSceneChoices();
    this.ambienceOn = false;
    this.radioOn = false;
    this.cricketTimer = null;
    this.accentTimer = null;
    this.radioTimer = null;
    this.player = null;
    this.radioVolume = 1;
    this.ambienceVolume = 1;
  }

  _ambience() {
    return AMBIENCE_PROFILES[this.profileKey] || AMBIENCE_PROFILES.japan;
  }

  getCurrentTrack() {
    return RADIO_TRACKS[this.trackIndex] || RADIO_TRACKS[0];
  }

  _setTrackIndex(idx) {
    if (idx === this.trackIndex && (this.player || this.getCurrentTrack().external)) return;
    this.trackIndex = idx;
    if (!this.ctx) return;
    if (this.getCurrentTrack().external) {
      // played outside the engine: just let the engine station fade away
      this.player?.stop(CROSSFADE);
      this.player = null;
    } else if (this.radioOn && this.ctx.state === 'running') {
      this._switchPlayer();
    } else if (this.player) {
      // Radio is off: drop the old station; the new one starts on resume.
      this.player.stop(0.3);
      this.player = null;
    }
  }

  selectTrack(trackId) {
    const idx = RADIO_TRACKS.findIndex((t) => t.id === trackId);
    if (idx === -1) return this.getCurrentTrack();
    this.sceneChoices[this.profileKey] = trackId;
    saveSceneChoices(this.sceneChoices);
    this._setTrackIndex(idx);
    return this.getCurrentTrack();
  }

  /** Step through stations; `filter` ('study' | 'sleep' | null) limits the list. */
  stepTrack(dir = 1, filter = null) {
    const list = RADIO_TRACKS.filter((t) => !filter || t.use === filter);
    if (!list.length) return this.getCurrentTrack();
    const cur = list.findIndex((t) => t.id === this.getCurrentTrack().id);
    const next = list[(cur + dir + list.length) % list.length];
    return this.selectTrack(next.id);
  }

  nextTrack(filter = null) {
    return this.stepTrack(1, filter);
  }

  /** Music level, 0 to 1 (applies while the built-in radio plays). */
  setRadioVolume(v) {
    this.radioVolume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.radioOn) {
      this.radioGain.gain.setTargetAtTime(RADIO_LEVEL * this.radioVolume + 0.0001, this.ctx.currentTime, 0.12);
    }
  }

  /** Ambience level, 0 to 1. */
  setAmbienceVolume(v) {
    this.ambienceVolume = Math.max(0, Math.min(1, v));
    if (this.ctx && this.ambienceOn) {
      this.ambienceGain.gain.setTargetAtTime(0.95 * this.ambienceVolume + 0.0001, this.ctx.currentTime, 0.12);
    }
  }

  setProfile(profileKey) {
    if (!AMBIENCE_PROFILES[profileKey]) return this.getCurrentTrack();
    this.profileKey = profileKey;
    const amb = this._ambience();

    const wanted = this.sceneChoices[profileKey] || amb.defaultTrack;
    let idx = RADIO_TRACKS.findIndex((t) => t.id === wanted);
    if (idx === -1) idx = RADIO_TRACKS.findIndex((t) => t.id === amb.defaultTrack);
    if (idx !== -1) this._setTrackIndex(idx);

    if (this.ctx) {
      const now = this.ctx.currentTime;
      this.breezeGain.gain.setTargetAtTime(amb.breezeLevel, now, 0.6);
      this.streamGain.gain.setTargetAtTime(amb.streamLevel, now, 0.6);
      this.rainGain.gain.setTargetAtTime(amb.rainLevel, now, 0.6);
    }
    return this.getCurrentTrack();
  }

  _ensureContext() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx({ latencyHint: 'playback' });
    const amb = this._ambience();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;
    this.masterGain.connect(this.ctx.destination);

    // --- Ambience bus ---
    this.ambienceGain = this.ctx.createGain();
    this.ambienceGain.gain.value = 0.0001;
    this.ambienceGain.connect(this.masterGain);

    this.ctx.addEventListener('statechange', () => this.onStateChange?.());

    this._buildBreeze(amb.breezeLevel);
    this._buildStream(amb.streamLevel);
    this._buildRain(amb.rainLevel);

    // --- Lo-Fi Radio bus (stations crossfade into a shared glue compressor) ---
    this.radioGain = this.ctx.createGain();
    this.radioGain.gain.value = 0.0001;
    this.radioGain.connect(this.masterGain);
    this.radioOut = createRadioOutput(this.ctx, this.radioGain);
  }

  // --- Radio scheduling ---

  _switchPlayer() {
    const now = this.ctx.currentTime;
    const hadPlayer = Boolean(this.player);
    if (hadPlayer) this.player.stop(CROSSFADE);
    const station = stationById(this.getCurrentTrack().id);
    if (!station) return false;
    this.player = new StationPlayer(this.ctx, this.radioOut.input, station);
    this.player.start(now + 0.12, hadPlayer ? CROSSFADE : 0.6);
    this._pumpRadio();
  }

  _pumpRadio() {
    if (!this.radioOn || !this.ctx || !this.player) return;
    this.player.scheduleUntil(this.ctx.currentTime + LOOKAHEAD);
  }

  _startRadioLoop() {
    if (!this.ctx || this.ctx.state !== 'running') return false;
    const now = this.ctx.currentTime;
    if (!this.player) {
      const station = stationById(this.getCurrentTrack().id);
      if (!station) return false;
      this.player = new StationPlayer(this.ctx, this.radioOut.input, station);
      this.player.start(now + 0.12, 1.2);
    } else {
      this.player.resync(now + 0.12);
    }
    if (!this.radioTimer) {
      // 250 ms tick, 1.6 s lookahead: survives the 1 s timer clamp in background tabs
      this.radioTimer = window.setInterval(() => this._pumpRadio(), 250);
    }
    this._pumpRadio();
    return true;
  }

  _stopRadioLoop() {
    clearInterval(this.radioTimer);
    this.radioTimer = null;
  }

  _createNoiseBuffer(seconds, type = 'pink') {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buffer = this.ctx.createBuffer(1, len, sr);
    const data = buffer.getChannelData(0);

    if (type === 'white') {
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } else if (type === 'pink') {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.055;
        b6 = w * 0.115926;
      }
    } else if (type === 'vinyl') {
      for (let i = 0; i < len; i++) {
        const r = Math.random();
        data[i] = r > 0.9994 ? (Math.random() * 2 - 1) * 0.42 : (Math.random() * 2 - 1) * 0.004;
      }
    }
    return buffer;
  }

  _buildBreeze(level) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._createNoiseBuffer(5.0, 'pink');
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 1.4;

    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.085;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 185;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    this.breezeGain = this.ctx.createGain();
    this.breezeGain.gain.value = level;

    this.breezePanner = this.ctx.createStereoPanner();
    this.breezePanner.pan.value = -0.25;

    src.connect(filter);
    filter.connect(this.breezeGain);
    this.breezeGain.connect(this.breezePanner);
    this.breezePanner.connect(this.ambienceGain);
    src.start();
  }

  _buildStream(level) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._createNoiseBuffer(4.0, 'pink');
    src.loop = true;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 880;
    bp.Q.value = 0.9;

    this.streamGain = this.ctx.createGain();
    this.streamGain.gain.value = level;

    this.streamPanner = this.ctx.createStereoPanner();
    this.streamPanner.pan.value = 0.35;

    src.connect(bp);
    bp.connect(this.streamGain);
    this.streamGain.connect(this.streamPanner);
    this.streamPanner.connect(this.ambienceGain);
    src.start();
  }

  _buildRain(level) {
    const src = this.ctx.createBufferSource();
    src.buffer = this._createNoiseBuffer(5.0, 'pink');
    src.loop = true;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 620;

    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3400;

    this.rainGain = this.ctx.createGain();
    this.rainGain.gain.value = level;

    src.connect(hp);
    hp.connect(lp);
    lp.connect(this.rainGain);
    this.rainGain.connect(this.ambienceGain);
    src.start();
  }

  _scheduleCricket() {
    if (!this.ambienceOn || !this.ctx) return;
    if (this._ambience().crickets) {
      const now = this.ctx.currentTime;
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = (Math.random() - 0.5) * 1.1;
      pan.connect(this.ambienceGain);

      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(3950 + Math.random() * 350, now);

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      const pulses = 2 + Math.floor(Math.random() * 2);
      for (let i = 0; i < pulses; i++) {
        const t = now + i * 0.11;
        env.gain.linearRampToValueAtTime(0.013, t + 0.02);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
      }
      osc.connect(env);
      env.connect(pan);
      osc.start(now);
      osc.stop(now + pulses * 0.12 + 0.05);
    }

    this.cricketTimer = window.setTimeout(
      () => this._scheduleCricket(),
      2800 + Math.random() * 4800
    );
  }

  _scheduleAccent() {
    if (!this.ambienceOn || !this.ctx) return;
    const now = this.ctx.currentTime;
    const accent = this._ambience().accent;

    if (accent === 'bamboo') {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(290, now + 0.09);

      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 460;
      bp.Q.value = 6.0;

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(0.06, now + 0.006);
      env.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);

      osc.connect(bp);
      bp.connect(env);
      env.connect(this.ambienceGain);
      osc.start(now);
      osc.stop(now + 0.28);
    } else if (accent === 'temple_bell' || accent === 'wind_chime') {
      const freqs = accent === 'temple_bell' ? [523.25, 1046.5] : [659.25, 987.77];
      freqs.forEach((f, idx) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.0001, now);
        env.gain.linearRampToValueAtTime(0.024 / (idx + 1), now + 0.02);
        env.gain.exponentialRampToValueAtTime(0.0001, now + 2.4);
        osc.connect(env);
        env.connect(this.ambienceGain);
        osc.start(now);
        osc.stop(now + 2.5);
      });
    }

    this.accentTimer = window.setTimeout(
      () => this._scheduleAccent(),
      14000 + Math.random() * 14000
    );
  }
  toggleAmbience() {
    return this.setAmbience(!this.ambienceOn);
  }

  setAmbience(on, fade = 0.45) {
    this._ensureContext();
    this.ambienceOn = on;
    const now = this.ctx.currentTime;
    this.ambienceGain.gain.cancelScheduledValues(now);
    this.ambienceGain.gain.setValueAtTime(this.ambienceGain.gain.value, now);
    this.ambienceGain.gain.setTargetAtTime(this.ambienceOn ? 0.95 * this.ambienceVolume + 0.0001 : 0.0001, now, this.ambienceOn ? 0.45 : fade / 3);

    if (this.ambienceOn) {
      this._scheduleCricket();
      this._scheduleAccent();
    } else {
      clearTimeout(this.cricketTimer);
      clearTimeout(this.accentTimer);
    }
    return this.ambienceOn;
  }

  toggleRadio() {
    return this.setRadio(!this.radioOn);
  }

  /** Turn the built-in station engine on or off (fade in seconds when turning off). */
  setRadio(on, fade = 0.4) {
    this._ensureContext();
    this.radioOn = on;
    const now = this.ctx.currentTime;
    this.radioGain.gain.cancelScheduledValues(now);
    this.radioGain.gain.setValueAtTime(this.radioGain.gain.value, now);
    this.radioGain.gain.setTargetAtTime(this.radioOn ? RADIO_LEVEL * this.radioVolume + 0.0001 : 0.0001, now, this.radioOn ? 0.4 : fade / 3);

    if (this.radioOn) {
      if (!this._startRadioLoop()) {
        this.ctx.resume().then(() => this.radioOn && this._startRadioLoop());
      }
    } else {
      this._stopRadioLoop();
    }
    return this.radioOn;
  }

  enableRadioOnStart() {
    if (this.radioOn && this.ctx?.state === 'running') return true;
    this._ensureContext();
    this.radioOn = true;
    const now = this.ctx.currentTime;
    this.radioGain.gain.cancelScheduledValues(now);
    this.radioGain.gain.setTargetAtTime(RADIO_LEVEL * this.radioVolume + 0.0001, now, 0.4);
    return this._startRadioLoop();
  }

  unlockIfPending() {
    if (!this.radioOn) return false;
    this._ensureContext();
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().then(() => {
        if (this.radioOn) this._startRadioLoop();
      });
    } else {
      this._startRadioLoop();
    }
    return true;
  }

  setParallaxPan(normX) {
    if (!this.ctx || !this.breezePanner || !this.streamPanner) return;
    const now = this.ctx.currentTime;
    this.breezePanner.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, -0.28 - normX * 0.3)), now, 0.15);
    this.streamPanner.pan.setTargetAtTime(Math.max(-0.9, Math.min(0.9, 0.34 - normX * 0.3)), now, 0.15);
  }

  /** Soft two-tone bell for the focus timer (plays even when music is off). */
  playBell() {
    this._ensureContext();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const now = this.ctx.currentTime + 0.05;
    [[659.25, 0], [987.77, 0.42], [659.25, 0.84]].forEach(([freq, d]) => {
      [1, 2.76].forEach((ratio, k) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq * ratio;
        const env = this.ctx.createGain();
        env.gain.setValueAtTime(0.0001, now + d);
        env.gain.linearRampToValueAtTime(k ? 0.012 : 0.06, now + d + 0.01);
        env.gain.exponentialRampToValueAtTime(0.0001, now + d + (k ? 0.6 : 2.4));
        osc.connect(env);
        env.connect(this.masterGain);
        osc.start(now + d);
        osc.stop(now + d + 2.5);
      });
    });
  }

  // --- Interactive Tactile Foley ---
  playLanternChime() {
    if (!this.ambienceOn && !this.radioOn) return;
    this._ensureContext();
    const now = this.ctx.currentTime;
    [587.33, 880.0].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.05);
      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now + i * 0.05);
      env.gain.linearRampToValueAtTime(0.042 / (i + 1), now + i * 0.05 + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.05 + 1.3);
      osc.connect(env);
      env.connect(this.masterGain);
      osc.start(now + i * 0.05);
      osc.stop(now + i * 0.05 + 1.35);
    });
  }

  playWaterDrop() {
    if (!this.ambienceOn && !this.radioOn) return;
    this._ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const startF = 440 + Math.random() * 140;
    osc.frequency.setValueAtTime(startF, now);
    osc.frequency.exponentialRampToValueAtTime(startF * 1.95, now + 0.09);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.055, now + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

    const pan = this.ctx.createStereoPanner();
    pan.pan.value = 0.28;

    osc.connect(env);
    env.connect(pan);
    pan.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  playCandleFlare() {
    if (!this.ambienceOn && !this.radioOn) return;
    this._ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(330, now + 0.35);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.032, now + 0.08);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.7);
  }
}
