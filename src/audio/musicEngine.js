/**
 * Generative Lo-Fi music engine.
 *
 * A StationPlayer turns one station recipe (stations.js) into music:
 * - bars are scheduled ahead on the audio clock (gapless, drift-free, and
 *   robust to background-tab timer throttling),
 * - an arrangement form brings parts in and out,
 * - melodies are phrase-based (2-bar motif, varied answer, seeded per station),
 * - each station has its own bus: reverb room, tape delay, tape wobble,
 *   vinyl crackle, saturation and tone, so stations crossfade cleanly.
 */

import { getInstruments } from './instruments.js';
import { STATIONS } from './stations.js';

export const LOOKAHEAD = 1.6; // seconds of audio scheduled ahead of the clock

/** Global smoothing: keeps every station soft, round and unobtrusive. */
const SMOOTH = {
  toneMax: 3200, // nothing bright or sharp
  wobble: 0.55, // gentle tape movement, never seasick
  vinyl: 0.45,
  parts: { drums: 0.55, tabla: 0.7, lead: 0.8, arp: 0.75, bass: 0.9, melody: 0.85, counter: 0.7 },
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const irCache = new WeakMap();
function reverbIR(ctx, seconds) {
  let perCtx = irCache.get(ctx);
  if (!perCtx) {
    perCtx = new Map();
    irCache.set(ctx, perCtx);
  }
  if (perCtx.has(seconds)) return perCtx.get(seconds);
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const pre = Math.floor(sr * 0.015);
  const buf = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = i / len;
      const n = (Math.random() * 2 - 1) * Math.exp(-6.9 * x);
      // tail darkens over time like a real room
      lp += (n - lp) * (0.85 - 0.7 * x);
      d[i] = lp;
    }
  }
  perCtx.set(seconds, buf);
  return buf;
}

function saturationCurve(drive) {
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

function vinylBuffer(ctx) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 7);
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let rumble = 0;
  for (let i = 0; i < len; i++) {
    rumble += ((Math.random() * 2 - 1) - rumble) * 0.02;
    let v = rumble * 0.05 + (Math.random() * 2 - 1) * 0.006;
    if (Math.random() > 0.99935) v += (Math.random() * 2 - 1) * 0.5;
    d[i] = v;
  }
  return buf;
}

/** Shared radio output stage: gentle glue compression so stations sit at an even level. */
export function createRadioOutput(ctx, destination) {
  const input = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 18;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.03;
  comp.release.value = 0.35;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.3;
  input.connect(comp);
  comp.connect(makeup);
  makeup.connect(destination);
  return { input };
}

export function getStation(id) {
  return STATIONS.find((s) => s.id === id) || STATIONS[0];
}

const PARTS = ['chords', 'pad', 'lead', 'melody', 'counter', 'bass', 'drums', 'drone', 'arp', 'tabla'];

/** Move a MIDI note by `steps` scale degrees in the given key (for harmony lines). */
function diatonicShift(m, steps, key) {
  const { root, scale } = key;
  const n = scale.length;
  const rel = m - root;
  const oct = Math.floor(rel / 12);
  const pc = ((rel % 12) + 12) % 12;
  let idx = 0;
  for (let i = 0; i < n; i++) if (scale[i] <= pc) idx = i;
  const d = idx + steps;
  const o = oct + Math.floor(d / n);
  return root + 12 * o + scale[((d % n) + n) % n];
}

export class StationPlayer {
  constructor(ctx, destination, station) {
    this.ctx = ctx;
    this.station = station;
    this.inst = getInstruments(ctx);
    this.rng = mulberry32(hashStr(station.id) ^ Math.floor(Math.random() * 1e9));
    this.beat = 60 / station.bpm;
    this.step = this.beat / 4;
    this.beatsPerBar = station.meter || 4;
    this.stepsPerBar = this.beatsPerBar * 4;
    this.barDur = this.beat * this.beatsPerBar;
    this.lastMelody = {};
    this.bar = 0;
    this.nextBarTime = 0;
    this.phrase = null;
    this.motif = null;
    this.lastLead = null;
    this.lastBass = null;
    this.disposed = false;

    this._expandForm();
    this._expandProgression();
    this._buildBus(destination);
  }

  // ------------------------------------------------------------ structure

  _expandForm() {
    this.form = this.station.form.map((s) => ({ ...s, parts: new Set(s.parts) }));
    this.formBars = this.form.reduce((n, s) => n + s.bars, 0);
  }

  _expandProgression() {
    const expand = (prog) => {
      const out = [];
      prog.forEach((c) => {
        for (let i = 0; i < c.bars; i++) out.push({ chord: c, first: i === 0, len: c.bars });
      });
      return out;
    };
    this.chordBars = expand(this.station.progression);
    // optional named progressions, chosen per form section with `prog`
    this.progBars = {};
    Object.entries(this.station.progressions || {}).forEach(([k, prog]) => {
      this.progBars[k] = expand(prog);
    });
  }

  _section(bar) {
    let b = bar % this.formBars;
    for (const s of this.form) {
      if (b < s.bars) return { ...s, barInSection: b };
      b -= s.bars;
    }
    return { ...this.form[0], barInSection: 0 };
  }

  _chordAt(bar) {
    const sec = this._section(bar);
    const bars = (sec.prog && this.progBars[sec.prog]) || null;
    if (bars) return bars[sec.barInSection % bars.length];
    return this.chordBars[bar % this.chordBars.length];
  }

  // ------------------------------------------------------------------ bus

  _buildBus(destination) {
    const ctx = this.ctx;
    const st = this.station;
    const g = (v) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };

    this.fader = g(0);
    this.fader.connect(destination);

    const shaper = ctx.createWaveShaper();
    shaper.curve = saturationCurve(1.05);
    shaper.oversample = '2x';
    shaper.connect(this.fader);

    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = Math.min(SMOOTH.toneMax, st.tone || 5000);
    tone.Q.value = 0.5;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 42;
    hp.connect(tone);
    // level trim sits before the saturator so loud stations never get squashed
    const trim = g(st.gain ?? 1);
    tone.connect(trim);
    trim.connect(shaper);
    this.tone = hp;

    const conv = ctx.createConvolver();
    conv.buffer = reverbIR(ctx, st.reverb?.size || 2);
    conv.connect(hp);

    let delayIn = null;
    if (st.delay) {
      delayIn = g(1);
      const dt = Math.min(1.9, st.delay.beats * this.beat);
      const dL = ctx.createDelay(2);
      const dR = ctx.createDelay(2);
      dL.delayTime.value = dt;
      dR.delayTime.value = dt;
      const fbL = g(st.delay.feedback * 0.8);
      const fbR = g(st.delay.feedback * 0.8);
      const dampL = ctx.createBiquadFilter();
      const dampR = ctx.createBiquadFilter();
      dampL.type = dampR.type = 'lowpass';
      dampL.frequency.value = 1600;
      dampR.frequency.value = 1400;
      const panL = ctx.createStereoPanner();
      const panR = ctx.createStereoPanner();
      panL.pan.value = -0.55;
      panR.pan.value = 0.55;
      delayIn.connect(dL);
      dL.connect(dampL);
      dampL.connect(panL);
      panL.connect(hp);
      dampL.connect(fbL);
      fbL.connect(dR);
      dR.connect(dampR);
      dampR.connect(panR);
      panR.connect(hp);
      dampR.connect(fbR);
      fbR.connect(dL);
      // stereo-wide reverb on the echoes
      panL.connect(conv);
    }

    // tape wobble: slow wow plus faint flutter, in cents
    this.wobble = g(1);
    this.wowOsc = ctx.createOscillator();
    this.wowOsc.frequency.value = 0.42;
    const wowDepth = g((st.wobble || 0) * SMOOTH.wobble);
    this.wowOsc.connect(wowDepth);
    wowDepth.connect(this.wobble);
    this.flutterOsc = ctx.createOscillator();
    this.flutterOsc.frequency.value = 6.1;
    const flDepth = g((st.wobble || 0) * SMOOTH.wobble * 0.08);
    this.flutterOsc.connect(flDepth);
    flDepth.connect(this.wobble);
    const t0 = ctx.currentTime;
    this.wowOsc.start(t0);
    this.flutterOsc.start(t0);

    this.voices = {};
    PARTS.forEach((part) => {
      const bus = g((st.mix?.[part] ?? 1) * (SMOOTH.parts[part] ?? 1));
      bus.connect(hp);
      const wet = st.reverb?.send?.[part] ?? st.reverb?.wet ?? 0.2;
      if (wet > 0) {
        const send = g(wet);
        bus.connect(send);
        send.connect(conv);
      }
      const dsend = st.delay?.send?.[part];
      if (delayIn && dsend) {
        const s = g(dsend);
        bus.connect(s);
        s.connect(delayIn);
      }
      let out = bus;
      if (part === 'chords' && st.pump) {
        this.pump = g(1);
        this.pump.connect(bus);
        out = this.pump;
      }
      this.voices[part] = { out, wobble: this.wobble };
    });

    if (st.hiss > 0) {
      // cassette hiss: soft band-limited noise after the tone filter, so it stays airy
      this.hissSrc = ctx.createBufferSource();
      this.hissSrc.buffer = this.inst.noise;
      this.hissSrc.loop = true;
      const hhp = ctx.createBiquadFilter();
      hhp.type = 'highpass';
      hhp.frequency.value = 2500;
      const hlp = ctx.createBiquadFilter();
      hlp.type = 'lowpass';
      hlp.frequency.value = 9000;
      const hg = g(st.hiss * 0.012);
      this.hissSrc.connect(hhp);
      hhp.connect(hlp);
      hlp.connect(hg);
      hg.connect(shaper);
      this.hissSrc.start(t0);
    }

    if (st.rain > 0) {
      // gentle rain on the window: a soft wash plus quieter patter, spread wide
      this.rainSrcs = [];
      [
        { hp: 400, lp: 2600, level: 0.03, pan: -0.6, rate: 1 },
        { hp: 400, lp: 2600, level: 0.03, pan: 0.6, rate: 0.93 },
        { hp: 2800, lp: 7000, level: 0.012, pan: 0, rate: 1.07 },
      ].forEach((layer) => {
        const src = ctx.createBufferSource();
        src.buffer = this.inst.noise;
        src.loop = true;
        src.playbackRate.value = layer.rate;
        const hpF = ctx.createBiquadFilter();
        hpF.type = 'highpass';
        hpF.frequency.value = layer.hp;
        const lpF = ctx.createBiquadFilter();
        lpF.type = 'lowpass';
        lpF.frequency.value = layer.lp;
        const lg = g(layer.level * st.rain);
        // slow swell so the rain breathes instead of sounding like static
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.05 + Math.random() * 0.05;
        const lfoG = g(layer.level * st.rain * 0.35);
        lfo.connect(lfoG);
        lfoG.connect(lg.gain);
        const pan = ctx.createStereoPanner();
        pan.pan.value = layer.pan;
        src.connect(hpF);
        hpF.connect(lpF);
        lpF.connect(lg);
        lg.connect(pan);
        pan.connect(shaper);
        src.start(t0, Math.random() * 1.5);
        lfo.start(t0);
        this.rainSrcs.push(src, lfo);
      });
    }

    if (st.vinyl > 0) {
      this.vinylSrc = ctx.createBufferSource();
      this.vinylSrc.buffer = vinylBuffer(ctx);
      this.vinylSrc.loop = true;
      const vhp = ctx.createBiquadFilter();
      vhp.type = 'highpass';
      vhp.frequency.value = 900;
      const vg = g(st.vinyl * 0.11 * SMOOTH.vinyl);
      this.vinylSrc.connect(vhp);
      vhp.connect(vg);
      vg.connect(tone);
      this.vinylSrc.start(t0);
    }
  }

  // -------------------------------------------------------------- control

  start(time, fadeIn = 2.5) {
    this.nextBarTime = time;
    const g = this.fader.gain;
    g.cancelScheduledValues(time);
    g.setValueAtTime(0.0001, time);
    g.linearRampToValueAtTime(1, time + Math.max(0.01, fadeIn));
  }

  /** Continue after a pause without trying to catch up on missed bars. */
  resync(time) {
    if (this.nextBarTime < time) this.nextBarTime = time;
  }

  scheduleUntil(horizon) {
    if (this.disposed) return;
    while (this.nextBarTime < horizon) {
      this._scheduleBar(this.nextBarTime, this.bar);
      this.nextBarTime += this.barDur;
      this.bar += 1;
    }
  }

  stop(fadeOut = 2.5) {
    if (this.disposed) return;
    const now = this.ctx.currentTime;
    const g = this.fader.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.0001, now + fadeOut);
    this.disposed = true;
    setTimeout(() => this._teardown(), (fadeOut + LOOKAHEAD + 6) * 1000);
  }

  _teardown() {
    try {
      this.wowOsc.stop();
      this.flutterOsc.stop();
      this.vinylSrc?.stop();
      this.hissSrc?.stop();
      this.rainSrcs?.forEach((n) => n.stop());
      this.fader.disconnect();
    } catch {
      /* already torn down */
    }
  }

  // ------------------------------------------------------------ utilities

  _r() {
    return this.rng();
  }

  _pick(arr) {
    return arr[Math.floor(this._r() * arr.length)];
  }

  _human(ms) {
    return (this._r() - 0.5) * 2 * (ms / 1000);
  }

  _stepTime(t0, s) {
    const st = this.station;
    let off = 0;
    if (st.swing) {
      if (st.swingUnit === 8) {
        if (s % 4 === 2) off = st.swing * this.step;
      } else if (s % 2 === 1) {
        off = st.swing * this.step;
      }
    }
    return t0 + s * this.step + off;
  }

  _play(inst, part, t, m, dur, vel, opts = {}) {
    const I = this.inst;
    const v = this.voices[part];
    switch (inst) {
      case 'epiano':
        return I.epiano(v, t, m, dur, vel, opts);
      case 'felt':
        return I.felt(v, t, m, dur, vel, opts);
      case 'pad':
        return I.pad(v, t, m, dur, vel, opts);
      case 'guitar':
      case 'eguitar':
      case 'koto':
      case 'harp':
      case 'sitar':
      case 'tanpura':
        return I.pluck(v, t, m, dur, vel, { ...opts, kind: inst });
      case 'upright':
        return I.pluck(v, t, m, dur, vel, { ...opts, kind: 'bass' });
      case 'sub':
        return I.sub(v, t, m, dur, vel, opts);
      case 'kalimba':
        return I.kalimba(v, t, m, dur, vel, opts);
      case 'vibes':
        return I.vibes(v, t, m, dur, vel, opts);
      case 'musicbox':
        return I.musicbox(v, t, m, dur, vel, opts);
      case 'flute':
        return I.flute(v, t, m, dur, vel, opts);
      case 'synthPluck':
        return I.synthPluck(v, t, m, dur, vel, opts);
      case 'steel':
        return I.pluck(v, t, m, dur, vel, { ...opts, kind: 'steel' });
      case 'strings':
        return I.strings(v, t, m, dur, vel, opts);
      case 'cello':
        return I.cello(v, t, m, dur, vel, opts);
      case 'pedalsteel':
        return I.pedalsteel(v, t, m, dur, vel, opts);
      case 'glock':
        return I.glock(v, t, m, dur, vel, opts);
      case 'ocarina':
        return I.flute(v, t, m, dur, vel, { ...opts, pure: true });
      default:
        return undefined;
    }
  }

  // ----------------------------------------------------------------- bars

  _scheduleBar(t0, bar) {
    const sec = this._section(bar);
    const cb = this._chordAt(bar);
    const c = {
      t0,
      bar,
      sec,
      chord: cb.chord,
      first: cb.first,
      len: cb.len,
      next: this._chordAt(bar + 1).chord,
    };
    const p = sec.parts;
    if (p.has('drone')) this._drone(c);
    if (p.has('chords')) this._comp(c);
    if (p.has('pad')) this._pad(c);
    if (p.has('arp')) this._arp(c);
    if (p.has('bass')) this._bass(c);
    if (p.has('drums')) this._drums(c, false);
    if (p.has('drumsLight')) this._drums(c, true);
    if (p.has('tabla')) this._tabla(c);
    if (p.has('lead')) this._lead(c);
    else this.phrase = null;
    if (sec.melody) this._melody(c, sec.melody, 'melody');
    if (sec.counter) this._melody(c, sec.counter, 'counter');
  }

  /** Sustained string or pad bed that swells in on each chord change. */
  _pad(c) {
    const cfg = this.station.pad;
    if (!cfg || !c.first) return;
    const dur = c.len * this.barDur + 0.2;
    c.chord.notes.forEach((m, i) => {
      const t = c.t0 + i * 0.06 + this._human(20);
      this._play(cfg.inst, 'pad', t, m + (cfg.oct || 0), dur, cfg.vel * (0.9 + this._r() * 0.1), cfg.opts || {});
    });
  }

  /**
   * Written melody: plays one bar of a composed line (station.lines) per bar.
   * Each pass varies a little: humanized timing and dynamics, the odd grace
   * note, and optional harmony a few scale degrees away.
   */
  _melody(c, cfg, part) {
    const line = this.station.lines?.[cfg.line];
    if (!line) return;
    const barNotes = line[c.sec.barInSection % line.length] || [];
    const key = this.station.key;
    const legato = cfg.legato ?? 0.95;
    const grace = cfg.grace ?? 0.1;
    barNotes.forEach(([s, m0, d], i) => {
      if (cfg.firstOnly && i > 0) return;
      if (cfg.sparse && i > 0 && this._r() < cfg.sparse) return;
      let m = m0 + (cfg.oct || 0);
      if (cfg.harm && key) m = diatonicShift(m, cfg.harm, key);
      const t = this._stepTime(c.t0, s + (cfg.shift || 0)) + this._human(9);
      const dur = Math.max(0.12, (cfg.dur ?? d) * this.step * legato);
      // gentle phrase shape: downbeats and longer notes sing a little more
      const shape = (s === 0 ? 1 : 0.88) * (d >= 6 ? 1.04 : 0.96);
      const vel = (cfg.vel ?? 0.7) * shape * (0.9 + this._r() * 0.14);
      const opts = { ...(cfg.opts || {}) };
      const prev = this.lastMelody[part];
      // slides are idiomatic on pedal steel and cello; winds only slur now and then
      const slides = ['pedalsteel', 'cello'].includes(cfg.inst) || (['flute', 'ocarina'].includes(cfg.inst) && this._r() < 0.25);
      if (slides && prev != null && prev !== m && Math.abs(prev - m) <= 4) opts.from = prev;
      if (key && d >= 4 && i > 0 && this._r() < grace && ['felt', 'flute', 'ocarina', 'harp', 'guitar', 'steel'].includes(cfg.inst)) {
        const up = diatonicShift(m, 1, key);
        this._play(cfg.inst, part, t - 0.07, up, 0.09, vel * 0.45, { ...(cfg.opts || {}) });
      }
      this._play(cfg.inst, part, t, m, dur, vel, opts);
      this.lastMelody[part] = m;
    });
  }

  _comp(c) {
    const cfg = this.station.comp;
    if (!cfg) return;
    const notes = c.chord.notes;
    if (!notes.length) return;
    const play = (s, durSteps, vel, list = notes, extraLate = 0) => {
      const t = this._stepTime(c.t0, s) + this._human(5) + extraLate;
      list.forEach((m, i) => {
        const roll = (cfg.roll ?? 0.02) * i;
        this._play(cfg.inst, 'chords', t + roll, m, durSteps * this.step, cfg.vel * vel * (0.92 + this._r() * 0.12), cfg.opts);
      });
    };

    switch (cfg.pattern) {
      case 'lofi':
        play(0, 13, 1);
        if (this._r() < 0.65) play(10, 5, 0.6, notes.slice(-3));
        break;
      case 'swell':
        if (c.first) play(0, c.len * this.stepsPerBar + 2, 1);
        break;
      case 'jazz': {
        const bank = [
          [[0, 5, 0.9], [6, 3, 0.65]],
          [[2, 3, 0.75], [8, 6, 0.85]],
          [[0, 3, 0.85], [10, 4, 0.7]],
          [[4, 3, 0.7], [10, 5, 0.8]],
          [[0, 7, 0.9]],
        ];
        this._pick(bank).forEach(([s, d, v]) => play(s, d, v));
        break;
      }
      case 'bossa': {
        const hits = c.bar % 2 === 0 ? [0, 3, 6, 10, 13] : [2, 6, 10, 12];
        hits.forEach((s, i) => play(s, 2.4, i === 0 ? 1 : 0.78, notes));
        break;
      }
      case 'neosoul':
        play(0, 7, 1, notes, 0.02);
        if (this._r() < 0.7) play(7, 2, 0.55, notes.slice(-3), 0.025);
        play(11, 4, 0.7, notes, 0.02);
        break;
      case 'harp': {
        // gentle rising arpeggio, falling back on the second bar of a chord
        const seq = c.first ? [...notes] : [...notes].reverse();
        const steps = [0, 3, 6, 9, 12, 14];
        seq.forEach((m, i) => {
          if (i > 0 && this._r() < 0.15) return;
          const t = this._stepTime(c.t0, steps[i % steps.length]) + this._human(15);
          this._play('harp', 'chords', t, m, 4, cfg.vel * (0.8 + this._r() * 0.25), { letRing: true });
        });
        break;
      }
      case 'waltz': {
        // flowing broken chord in 3/4: low note, then a rising and falling arc
        const low = this._bassRoot(c.chord.bass) + 12;
        const up = [...notes].sort((a, b) => a - b);
        const arc = c.bar % 2 === 0 ? [low, up[0], up[1], up[2], up[3] ?? up[2], up[2]] : [low, up[1], up[2], up[3] ?? up[2], up[2], up[1]];
        arc.forEach((m, i) => {
          const s = i * 2;
          const t = this._stepTime(c.t0, s) + this._human(10);
          const v = (i === 0 ? 0.95 : 0.62) * cfg.vel * (0.9 + this._r() * 0.14);
          this._play(cfg.inst, 'chords', t, m, (i === 0 ? 11 : 5) * this.step, v, cfg.opts);
        });
        break;
      }
      case 'fingerpick': {
        // p-i-m-a fingerstyle on eighths, thumb on the low note
        const low = this._bassRoot(c.chord.bass) + 12;
        const up = [...notes].sort((a, b) => a - b);
        const order = c.bar % 2 === 0 ? [low, up[1], up[2], up[3] ?? up[2], up[0] + 12 > 72 ? up[2] : up[1], up[2], up[1], up[2]] : [low, up[2], up[1], up[3] ?? up[2], low + 7, up[2], up[3] ?? up[1], up[1]];
        order.forEach((m, i) => {
          if (i > 0 && this._r() < 0.08) return;
          const s = i * 2;
          const t = this._stepTime(c.t0, s) + this._human(12);
          const v = (i === 0 ? 0.95 : i === 4 ? 0.78 : 0.6) * cfg.vel * (0.9 + this._r() * 0.15);
          this._play(cfg.inst, 'chords', t, m, (i % 4 === 0 ? 7 : 5) * this.step, v, cfg.opts);
        });
        break;
      }
      case 'travis': {
        // alternating thumb bass with syncopated treble pinches
        const root = this._bassRoot(c.chord.bass) + 12;
        const alt = root + 7 > 57 ? root - 5 : root + 7;
        const up = [...notes].sort((a, b) => a - b);
        const top = up[up.length - 1];
        [[0, root], [4, alt], [8, root], [12, alt]].forEach(([s, m], i) => {
          const t = this._stepTime(c.t0, s) + this._human(8);
          this._play(cfg.inst, 'chords', t, m, 3.6 * this.step, cfg.vel * (i % 2 ? 0.72 : 0.85), { ...cfg.opts, pan: -0.12 });
        });
        const treble = c.bar % 2 === 0 ? [[0, top], [3, up[2]], [6, up[1]], [10, up[2]], [14, top]] : [[2, up[2]], [6, top], [10, up[1]], [12, up[2]], [14, up[1]]];
        treble.forEach(([s, m]) => {
          if (s > 0 && this._r() < 0.1) return;
          const t = this._stepTime(c.t0, s) + this._human(10);
          this._play(cfg.inst, 'chords', t, m, 4 * this.step, cfg.vel * 0.58 * (0.9 + this._r() * 0.15), { ...cfg.opts, pan: 0.14 });
        });
        break;
      }
      default:
        play(0, this.stepsPerBar - 1, 1);
    }
  }

  _arp(c) {
    const cfg = this.station.arp;
    if (!cfg) return;
    const base = [...c.chord.notes].sort((a, b) => a - b).map((m) => m + 12);
    const seq = [0, 1, 2, 3, 2, 1, 2, 3];
    for (let i = 0; i < 8; i++) {
      const s = i * 2;
      const m = base[seq[i] % base.length];
      const accent = s % 8 === 0 ? 1 : 0.7;
      this._play(cfg.inst, 'arp', this._stepTime(c.t0, s), m, this.step * 1.5, cfg.vel * accent, {
        pan: i % 2 ? 0.3 : -0.3,
      });
    }
  }

  _bassRoot(m) {
    // sleep stations keep the bass out of the deep sub range (no boom)
    const [lo, hi] = this.station.use === 'sleep' ? [38, 50] : [31, 45];
    let r = m;
    while (r > hi) r -= 12;
    while (r < lo) r += 12;
    return r;
  }

  _bass(c) {
    const cfg = this.station.bass;
    if (!cfg) return;
    const root = this._bassRoot(c.chord.bass);
    const nextRoot = this._bassRoot(c.next.bass);
    const inst = cfg.inst;
    const hit = (s, m, durSteps, vel, opts = {}) => {
      const t = this._stepTime(c.t0, s) + this._human(4);
      this._play(inst, 'bass', t, m, durSteps * this.step, vel, opts);
      this.lastBass = m;
    };
    switch (cfg.pattern) {
      case 'lofi':
        hit(0, root, 9, 0.9);
        if (this._r() < 0.8) hit(10, this._r() < 0.3 ? root + 12 : root, 5, 0.6);
        break;
      case 'long':
        if (c.first) hit(0, root, c.len * this.stepsPerBar - 1, cfg.vel ?? 0.55);
        break;
      case 'walk': {
        const pcs = c.chord.notes.map((m) => (((m - root) % 12) + 12) % 12).filter((x) => x > 0);
        const tone1 = root + this._pick(pcs.length ? pcs : [7]);
        const tone2 = root + this._pick([7, ...pcs]);
        const approach = nextRoot + (this._r() < 0.5 ? -1 : 1);
        [root, tone1, tone2, approach].forEach((m, i) => hit(i * 4, this._bassRoot(m), 3.6, i === 0 ? 0.95 : 0.78));
        break;
      }
      case 'bossa':
        hit(0, root, 5.5, 0.9);
        hit(6, root + 7, 2, 0.7);
        hit(8, root + 7, 5.5, 0.8);
        hit(14, c.next === c.chord ? root : nextRoot, 2, 0.65);
        break;
      case 'neosoul':
        hit(0, root, 6, 0.95, { from: this.lastBass != null && Math.abs(this.lastBass - root) <= 5 ? this.lastBass : null });
        if (this._r() < 0.6) hit(7, root + 12, 2, 0.5, { from: root });
        hit(10, root + 7, 5, 0.7);
        break;
      case 'country':
        hit(0, root, 7, 0.85);
        hit(8, root + 7 > 50 ? root - 5 : root + 7, 7, 0.65);
        break;
      case 'waltz':
        hit(0, root, 10, 0.8);
        break;
      case 'pulse':
        for (let s = 0; s < 16; s += 2) hit(s, root, 1.5, s % 8 === 0 ? 0.8 : 0.5);
        break;
      default:
        hit(0, root, 14, 0.8);
    }
  }

  _duck(t) {
    if (!this.pump) return;
    const g = this.pump.gain;
    g.setTargetAtTime(0.35, t, 0.006);
    g.setTargetAtTime(1, t + 0.05, 0.13);
  }

  _drums(c, light) {
    const kit = this.station.drums?.kit;
    if (!kit) return;
    const I = this.inst;
    const v = this.voices.drums;
    const at = (s, extra = 0) => this._stepTime(c.t0, s) + this._human(6) + extra;
    const lastBarOfSection = c.sec.barInSection === c.sec.bars - 1;

    switch (kit) {
      case 'boombap': {
        I.kick(v, at(0), 1);
        if (this._r() < 0.5) I.kick(v, at(7), 0.5);
        I.kick(v, at(10), 0.85);
        if (!light) {
          I.snare(v, at(4, 0.012), 0.85, { dusty: true });
          if (!lastBarOfSection || this._r() < 0.5) I.snare(v, at(12, 0.012), 0.9, { dusty: true });
        }
        for (let s = 0; s < 16; s += 2) {
          I.hat(v, at(s), s % 4 === 0 ? 0.6 : 0.38, { dark: true });
        }
        break;
      }
      case 'rimbap': {
        I.kick(v, at(0), 0.9, { tc: 0.14 });
        if (this._r() < 0.6) I.kick(v, at(10), 0.7, { tc: 0.14 });
        if (!light) {
          I.rim(v, at(4, 0.015), 0.85);
          I.rim(v, at(12, 0.015), 0.9);
        }
        for (let s = 0; s < 16; s += 2) I.hat(v, at(s), s % 4 === 0 ? 0.42 : 0.26, { dark: true });
        if (this._r() < 0.3) I.hat(v, at(14), 0.3, { dark: true, open: true });
        break;
      }
      case 'jazz': {
        [0, 4, 6, 8, 12, 14].forEach((s) => I.ride(v, at(s), s % 4 === 0 ? 0.8 : 0.55));
        I.kick(v, at(0), 0.22, { tc: 0.1, click: 0 });
        I.kick(v, at(8), 0.18, { tc: 0.1, click: 0 });
        I.hat(v, at(4), 0.35, { dark: true, pan: -0.3 });
        I.hat(v, at(12), 0.35, { dark: true, pan: -0.3 });
        if (!light) {
          I.brush(v, at(0), 0.7, this.beat * 0.9);
          I.brush(v, at(8), 0.7, this.beat * 0.9);
          I.snare(v, at(4), 0.18, { dusty: true, tc: 0.05 });
          I.snare(v, at(12), 0.2, { dusty: true, tc: 0.05 });
          if (this._r() < 0.3) I.snare(v, at(14), 0.12, { dusty: true, tc: 0.04 });
        }
        break;
      }
      case 'bossa': {
        [[0, 0.7], [6, 0.45], [8, 0.7], [14, 0.45]].forEach(([s, vel]) => I.kick(v, at(s), vel, { tc: 0.1, click: 0.3 }));
        if (!light) {
          const clave = c.bar % 2 === 0 ? [0, 6, 12] : [4, 10];
          clave.forEach((s) => I.rim(v, at(s), 0.7));
        }
        const shake = [0.55, 0.25, 0.38, 0.25];
        for (let s = 0; s < 16; s++) I.shaker(v, at(s), shake[s % 4]);
        break;
      }
      case 'neosoul': {
        I.kick(v, at(0), 0.95);
        if (this._r() < 0.5) I.kick(v, at(7), 0.45);
        I.kick(v, at(10), 0.8);
        if (!light) {
          I.snare(v, at(4, 0.028), 0.8, { dusty: true, tc: 0.07 });
          I.snare(v, at(12, 0.028), 0.85, { dusty: true, tc: 0.07 });
          if (this._r() < 0.5) I.snare(v, at(6), 0.14, { dusty: true, tc: 0.03 });
          if (this._r() < 0.5) I.snare(v, at(15), 0.12, { dusty: true, tc: 0.03 });
        }
        const hv = [0.5, 0.2, 0.34, 0.2];
        for (let s = 0; s < 16; s++) {
          if (s % 2 === 1) continue;
          I.hat(v, at(s, 0.008), hv[s % 4]);
        }
        break;
      }
      case 'brushes': {
        // soft Americana brushes: long sweeps, gentle taps on 2 and 4
        I.kick(v, at(0), 0.25, { tc: 0.1, click: 0 });
        I.kick(v, at(8), 0.2, { tc: 0.1, click: 0 });
        I.brush(v, at(0), 0.55, this.beat * 1.8);
        I.brush(v, at(8), 0.5, this.beat * 1.8);
        if (!light) {
          I.snare(v, at(4), 0.14, { dusty: true, tc: 0.05 });
          I.snare(v, at(12), 0.16, { dusty: true, tc: 0.05 });
        }
        I.shaker(v, at(6), 0.18);
        I.shaker(v, at(14), 0.18);
        break;
      }
      case 'halftime': {
        I.kick(v, at(0), 0.9, { tc: 0.16 });
        this._duck(at(0));
        if (this._r() < 0.5) {
          I.kick(v, at(10), 0.55, { tc: 0.14 });
          this._duck(at(10));
        }
        if (!light) I.clap(v, at(8), 0.75);
        for (let s = 0; s < 16; s += 2) I.hat(v, at(s), s % 4 === 2 ? 0.3 : 0.16);
        break;
      }
      default:
        break;
    }
  }

  _tabla(c) {
    const cfg = this.station.tabla;
    if (!cfg) return;
    const I = this.inst;
    const v = this.voices.tabla;
    // Keherwa (8 beats): dha ge na ti | na ka dhin na
    const theka = ['dha', 'ge', 'na', 'ti', 'na', 'ka', 'dhin', 'na'];
    const fill = c.sec.barInSection % 4 === 3;
    theka.forEach((stroke, i) => {
      const s = i * 2;
      if (fill && i >= 6) return;
      const vel = (i === 0 ? 1 : i === 4 ? 0.8 : 0.65) * (0.9 + this._r() * 0.15);
      I.tabla(v, this._stepTime(c.t0, s) + this._human(7), stroke, vel, cfg.tonic);
    });
    if (fill) {
      // tirakita flourish into the next cycle
      ['ti', 'ti', 'ka', 'ti'].forEach((stroke, k) => {
        I.tabla(v, this._stepTime(c.t0, 12 + k) + this._human(4), stroke, 0.6, cfg.tonic);
      });
    }
  }

  _drone(c) {
    const cfg = this.station.drone;
    if (!cfg) return;
    if (cfg.type === 'tanpura') {
      const r = cfg.root;
      // Pa, Sa, Sa, low Sa: the classic four-string cycle
      [r - 5, r, r, r - 12].forEach((m, i) => {
        const t = c.t0 + i * this.beat + this._human(20);
        this._play('tanpura', 'drone', t, m, 5, 0.8 + this._r() * 0.15, { letRing: true });
      });
    } else if (cfg.type === 'bowl') {
      if (c.bar % 4 === 0) {
        const m = cfg.notes[Math.floor(c.bar / 4) % cfg.notes.length];
        this.inst.bowl(this.voices.drone, c.t0 + this._human(30), m, 10, 0.8);
      }
    }
  }

  // ------------------------------------------------------------- melody

  _degToMidi(deg) {
    const L = this.station.lead;
    const n = L.scale.length;
    const oct = Math.floor(deg / n);
    const idx = ((deg % n) + n) % n;
    return L.root + L.scale[idx] + 12 * oct;
  }

  _degRange() {
    if (this._range) return this._range;
    const L = this.station.lead;
    let lo = -20;
    while (this._degToMidi(lo) < L.low) lo += 1;
    let hi = lo;
    while (this._degToMidi(hi + 1) <= L.high) hi += 1;
    this._range = [lo, hi];
    return this._range;
  }

  _clampDeg(d) {
    const [lo, hi] = this._degRange();
    if (d < lo) return lo + (lo - d) % 2;
    if (d > hi) return hi - (d - hi) % 2;
    return d;
  }

  _snap(deg, chord) {
    const pcs = new Set([chord.bass, ...chord.notes].map((m) => ((m % 12) + 12) % 12));
    for (const delta of [0, -1, 1, -2, 2]) {
      const d = this._clampDeg(deg + delta);
      if (pcs.has(((this._degToMidi(d) % 12) + 12) % 12)) return d;
    }
    return deg;
  }

  _isHome(deg) {
    const L = this.station.lead;
    const n = L.scale.length;
    const iv = L.scale[((deg % n) + n) % n];
    return iv === 0 || iv === 7;
  }

  _makeMotif() {
    const L = this.station.lead;
    const [lo, hi] = this._degRange();
    const rhythm = this._pick(L.rhythms);
    const center = Math.round((lo + hi) / 2);
    let deg = center + Math.floor(this._r() * 5) - 2;
    const moves = [-2, -1, -1, 1, 1, 2, 0, -3, 3];
    const notes = [];
    rhythm.forEach(([s, d], i) => {
      if (i > 0 && this._r() > L.density) return;
      if (i > 0) deg = this._clampDeg(deg + this._pick(moves));
      notes.push({ s, d, deg });
    });
    return notes;
  }

  _answer(motif) {
    // same rhythm, new ending that resolves home
    const b = motif.map((n) => ({ ...n }));
    if (b.length >= 2) {
      const k = b.length - 2;
      b[k].deg = this._clampDeg(b[k].deg + this._pick([-1, 1, 2, -2]));
    }
    const last = b[b.length - 1];
    let d = last.deg;
    for (const delta of [0, -1, 1, -2, 2, -3, 3]) {
      if (this._isHome(this._clampDeg(last.deg + delta))) {
        d = this._clampDeg(last.deg + delta);
        break;
      }
    }
    last.deg = d;
    last.d = Math.min(32 - last.s, last.d + 4);
    return b;
  }

  _newPhrase() {
    const L = this.station.lead;
    if (this._r() < L.rest) {
      this.phrase = null;
      return;
    }
    if (!this.motif || this._r() > L.repeat) this.motif = this._makeMotif();
    this.phrase = { a: this.motif, b: this._answer(this.motif) };
  }

  _lead(c) {
    const L = this.station.lead;
    if (!L) return;
    const pb = c.sec.barInSection % 4;
    if (pb === 0) this._newPhrase();
    if (!this.phrase) return;
    const notes = pb < 2 ? this.phrase.a : this.phrase.b;
    const off = (pb % 2) * 16;
    notes.forEach((n) => {
      if (n.s < off || n.s >= off + 16) return;
      const s = n.s - off;
      // land downbeats and held notes on chord tones so phrases sound settled
      const deg = s % 8 === 0 || n.d >= 6 ? this._snap(n.deg, c.chord) : n.deg;
      const m = this._degToMidi(deg);
      const t = this._stepTime(c.t0, s) + this._human(10);
      const dur = n.d * this.step * (L.legato ?? 0.92);
      const opts = { ...(L.opts || {}) };
      if (L.inst === 'flute' && this.lastLead != null) opts.from = this.lastLead;
      if (L.inst === 'sitar' && this.lastLead != null && this._r() < 0.35 && Math.abs(this.lastLead - m) <= 3) {
        opts.bendFrom = (this.lastLead - m) * 100;
        opts.bendTime = 0.22;
      }
      this._play(L.inst, 'lead', t, m, dur, L.vel * (0.85 + this._r() * 0.25), opts);
      this.lastLead = m;
    });
  }
}

/**
 * Render a station offline (used for previews and automated checks).
 * Returns an AudioBuffer.
 */
export async function renderStationOffline(stationId, seconds = 40, sampleRate = 44100) {
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const out = createRadioOutput(ctx, ctx.destination);
  const player = new StationPlayer(ctx, out.input, getStation(stationId));
  player.start(0.05, 0.01);
  player.scheduleUntil(seconds);
  return ctx.startRendering();
}
