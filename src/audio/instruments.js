/**
 * Synthesized instrument voices for the Lo-Fi radio.
 *
 * Every sound is generated in the browser: FM electric piano, felt piano,
 * Karplus-Strong plucked strings (nylon guitar, koto, harp, sitar, tanpura,
 * upright bass), bansuri-style flute, vibraphone, kalimba, music box,
 * singing bowl, analog pads, synth pluck, drum kits and tabla.
 * No samples or recordings are used, so the music is fully original.
 */

export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

const SILENT = 0.0001;

function makeWave(ctx, amps) {
  const real = new Float32Array(amps.length + 1);
  const imag = new Float32Array(amps.length + 1);
  amps.forEach((a, i) => (imag[i + 1] = a));
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

const instrumentCache = new WeakMap();

/** One shared Instruments instance per AudioContext (keeps buffer caches warm). */
export function getInstruments(ctx) {
  let inst = instrumentCache.get(ctx);
  if (!inst) {
    inst = new Instruments(ctx);
    instrumentCache.set(ctx, inst);
  }
  return inst;
}

export class Instruments {
  constructor(ctx) {
    this.ctx = ctx;
    this.ksCache = new Map();
    this.noise = this._noiseBuffer(2.0);
    this.waves = {
      felt: makeWave(ctx, [1, 0.52, 0.2, 0.11, 0.05, 0.025, 0.012]),
      flute: makeWave(ctx, [1, 0.22, 0.09, 0.03]),
      reed: makeWave(ctx, [1, 0.5, 0.33, 0.2, 0.12, 0.07]),
    };
  }

  // ---------------------------------------------------------------- helpers

  _noiseBuffer(seconds) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noiseSrc(t, dur) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const offset = Math.random() * 1.5;
    src.start(t, offset);
    src.stop(t + dur + 0.05);
    return src;
  }

  _gain(v = 1) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    return g;
  }

  _filter(type, freq, q = 0.7) {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  _osc(type, freq, t, end, wave) {
    const o = this.ctx.createOscillator();
    if (wave) o.setPeriodicWave(wave);
    else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(end);
    return o;
  }

  /** Attach tape wobble (cents) to a detune param, and detach when the node ends. */
  _wobble(voice, param, node) {
    if (!voice.wobble) return;
    voice.wobble.connect(param);
    node.addEventListener('ended', () => {
      try {
        voice.wobble.disconnect(param);
      } catch {
        /* already disconnected */
      }
    });
  }

  /** Percussive envelope: fast attack then exponential decay with time constant tc. */
  _perc(param, t, peak, attack, tc) {
    param.setValueAtTime(SILENT, t);
    param.linearRampToValueAtTime(peak, t + attack);
    param.setTargetAtTime(SILENT, t + attack, tc);
  }

  /** Sustained envelope: attack, decay to sustain, release at t + dur. */
  _adsr(param, t, dur, peak, a, d, s, r) {
    param.setValueAtTime(SILENT, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.setTargetAtTime(Math.max(SILENT, peak * s), t + a, d / 3);
    param.setTargetAtTime(SILENT, t + Math.max(dur, a + 0.01), r / 4);
  }

  // ------------------------------------------------------ Karplus-Strong core

  _ks(freq, kind) {
    const presets = {
      guitar: { bright: 0.32, t60: 2.6, len: 2.6, buzz: 0 },
      eguitar: { bright: 0.5, t60: 3.4, len: 3.4, buzz: 0 },
      koto: { bright: 0.5, t60: 2.2, len: 2.4, buzz: 0.05 },
      harp: { bright: 0.38, t60: 4.2, len: 4.2, buzz: 0 },
      sitar: { bright: 0.65, t60: 3.0, len: 3.0, buzz: 0.4 },
      tanpura: { bright: 0.7, t60: 5.0, len: 5.0, buzz: 0.55 },
      bass: { bright: 0.18, t60: 1.4, len: 1.6, buzz: 0 },
    };
    const p = presets[kind] || presets.guitar;
    const sr = this.ctx.sampleRate;
    const N = Math.max(2, Math.floor(sr / freq - 0.5));
    const key = `${kind}:${N}`;
    const cached = this.ksCache.get(key);
    if (cached) return cached;

    const len = Math.floor(sr * p.len);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const realF = sr / (N + 0.5);
    const damp = Math.pow(10, -3 / (realF * p.t60));

    let lp = 0;
    let mean = 0;
    for (let i = 0; i < N; i++) {
      lp += (Math.random() * 2 - 1 - lp) * p.bright;
      d[i] = lp;
      mean += lp;
    }
    mean /= N;
    for (let i = 0; i < N; i++) d[i] -= mean;
    for (let i = N; i < len; i++) {
      const a = d[i - N];
      const b = i - N - 1 >= 0 ? d[i - N - 1] : 0;
      d[i] = damp * 0.5 * (a + b);
    }
    if (p.buzz > 0) {
      // Jawari-style bridge buzz: asymmetric clipping plus a touch of high-pass sparkle
      let prev = 0;
      for (let i = 0; i < len; i++) {
        const x = d[i];
        const clipped = x > 0 ? Math.tanh(x * (1 + p.buzz * 5)) : x * (1 - p.buzz * 0.5);
        const sparkle = (x - prev) * p.buzz * 1.6;
        prev = x;
        d[i] = clipped + sparkle;
      }
    }
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    const norm = peak > 0 ? 0.9 / peak : 1;
    for (let i = 0; i < len; i++) d[i] *= norm;

    const entry = { buffer: buf, rate: freq / realF, length: p.len };
    // Bounded cache so hours of playback never grow memory without limit
    if (this.ksCache.size > 160) {
      const oldest = this.ksCache.keys().next().value;
      this.ksCache.delete(oldest);
    }
    this.ksCache.set(key, entry);
    return entry;
  }

  // ------------------------------------------------------------ keyboards

  /** FM electric piano (Rhodes-like tine and bark). */
  epiano(voice, t, m, dur, vel, opts = {}) {
    const ctx = this.ctx;
    const f = mtof(m);
    const bright = opts.bright ?? 1;
    const end = t + dur + 0.9;

    const car = this._osc('sine', f, t, end);
    const mod = this._osc('sine', f, t, end);
    const modG = this._gain(0);
    modG.gain.setValueAtTime(f * (0.45 + 0.8 * vel) * bright, t);
    modG.gain.setTargetAtTime(f * 0.18 * bright, t, 0.22);
    mod.connect(modG);
    modG.connect(car.frequency);

    const tine = this._osc('sine', f * 4.01, t, t + 0.6);
    const tineG = this._gain(0);
    this._perc(tineG.gain, t, 0.025 * vel * bright, 0.004, 0.05);
    tine.connect(tineG);

    const amp = this._gain(0);
    this._adsr(amp.gain, t, dur, 0.24 * vel, 0.014, 2.2, 0.4, 0.9);
    car.connect(amp);
    tineG.connect(amp);

    const lp = this._filter('lowpass', 1400 * bright + 500, 0.5);
    amp.connect(lp);

    let out = lp;
    if (opts.tremolo) {
      const trem = this._gain(1 - opts.tremolo / 2);
      const lfo = this._osc('sine', opts.tremRate || 4.3, t, end);
      const depth = this._gain(opts.tremolo / 2);
      lfo.connect(depth);
      depth.connect(trem.gain);
      lp.connect(trem);
      out = trem;
    }
    if (opts.pan) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = opts.pan;
      out.connect(pan);
      out = pan;
    }
    out.connect(voice.out);
    this._wobble(voice, car.detune, car);
    this._wobble(voice, mod.detune, mod);
  }

  /** Soft felt-hammer upright piano. */
  felt(voice, t, m, dur, vel, opts = {}) {
    const f = mtof(m);
    const ring = Math.min(dur + 0.4, 6);
    const end = t + ring + 1.2;
    const o1 = this._osc('sine', f, t, end, this.waves.felt);
    const o2 = this._osc('sine', f, t, end, this.waves.felt);
    o2.detune.value = 2.5;

    const lp = this._filter('lowpass', 650 + 950 * vel, 0.4);
    lp.frequency.setTargetAtTime(420 + 300 * vel, t + 0.01, 0.5);

    const amp = this._gain(0);
    const decayTc = 0.9 + Math.max(0, (72 - m) / 24) * 1.2;
    amp.gain.setValueAtTime(SILENT, t);
    amp.gain.linearRampToValueAtTime(0.2 * vel, t + 0.02);
    amp.gain.setTargetAtTime(0.0001, t + 0.012, decayTc);
    amp.gain.setTargetAtTime(SILENT, t + ring, 0.12);

    o1.connect(lp);
    o2.connect(lp);
    lp.connect(amp);

    // felt thump
    const thump = this._noiseSrc(t, 0.06);
    const thLp = this._filter('lowpass', 380, 0.7);
    const thG = this._gain(0);
    this._perc(thG.gain, t, 0.015 * vel, 0.002, 0.015);
    thump.connect(thLp);
    thLp.connect(thG);
    thG.connect(amp);

    let out = amp;
    if (opts.pan) {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = opts.pan;
      amp.connect(pan);
      out = pan;
    }
    out.connect(voice.out);
    this._wobble(voice, o1.detune, o1);
    this._wobble(voice, o2.detune, o2);
  }

  /** Analog-style pad. warm=true uses triangles for a softer sleep pad. */
  pad(voice, t, m, dur, vel, opts = {}) {
    const f = mtof(m);
    const a = opts.attack ?? 1.6;
    const r = opts.release ?? 2.6;
    const end = t + dur + r * 1.6;
    const type = opts.warm ? 'triangle' : 'sawtooth';
    const oscs = [-7, 7].map((c) => {
      const o = this._osc(type, f, t, end);
      o.detune.value = c;
      return o;
    });
    const sub = this._osc('sine', f / 2, t, end);
    const subG = this._gain(opts.warm ? 0.5 : 0.3);
    sub.connect(subG);

    const lp = this._filter('lowpass', opts.cutoff ?? 900, 0.6);
    const lfo = this._osc('sine', 0.07 + Math.random() * 0.05, t, end);
    const lfoG = this._gain((opts.cutoff ?? 900) * 0.3);
    lfo.connect(lfoG);
    lfoG.connect(lp.frequency);

    const amp = this._gain(0);
    amp.gain.setValueAtTime(SILENT, t);
    amp.gain.linearRampToValueAtTime(0.06 * vel, t + a);
    amp.gain.setTargetAtTime(SILENT, t + Math.max(dur, a), r / 4);

    oscs.forEach((o) => o.connect(lp));
    subG.connect(lp);
    lp.connect(amp);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? (Math.random() - 0.5) * 0.5;
    amp.connect(pan);
    pan.connect(voice.out);
    oscs.forEach((o) => this._wobble(voice, o.detune, o));
  }

  // ------------------------------------------------------------- plucked

  /** Karplus-Strong plucked string: guitar, koto, harp, sitar, tanpura, bass. */
  pluck(voice, t, m, dur, vel, opts = {}) {
    const kind = opts.kind || 'guitar';
    const f = mtof(m);
    const ks = this._ks(f, kind);
    const src = this.ctx.createBufferSource();
    src.buffer = ks.buffer;
    src.playbackRate.value = ks.rate;

    if (opts.bendFrom) {
      // meend / oshi: slide into the note from bendFrom cents away
      src.detune.setValueAtTime(opts.bendFrom, t);
      src.detune.linearRampToValueAtTime(0, t + (opts.bendTime ?? 0.16));
    } else if (kind === 'koto') {
      src.detune.setValueAtTime(18, t);
      src.detune.linearRampToValueAtTime(0, t + 0.05);
    }

    const amp = this._gain(0);
    const level = { eguitar: 0.3, guitar: 0.32, koto: 0.26, harp: 0.28, sitar: 0.22, tanpura: 0.12, bass: 0.5 }[kind] ?? 0.3;
    amp.gain.setValueAtTime(SILENT, t);
    amp.gain.linearRampToValueAtTime(level * vel, t + (kind === 'bass' ? 0.01 : 0.008));
    const ringEnd = opts.letRing ? t + ks.length : t + Math.min(dur + 0.08, ks.length);
    if (!opts.letRing) amp.gain.setTargetAtTime(SILENT, t + dur, 0.06);

    const tone = {
      guitar: this._filter('lowpass', 1900, 0.5),
      eguitar: this._filter('lowpass', 2300, 0.8),
      koto: this._filter('lowpass', 2400, 0.5),
      harp: this._filter('lowpass', 2200, 0.5),
      sitar: this._filter('lowpass', 2800, 0.5),
      tanpura: this._filter('lowpass', 1800, 0.5),
      bass: this._filter('lowpass', 650, 0.6),
    }[kind] || this._filter('lowpass', 2500, 0.5);

    src.connect(tone);
    let node = tone;
    if (kind === 'guitar') {
      const body = this._filter('peaking', 210, 1.2);
      body.gain.value = 4;
      node.connect(body);
      node = body;
    }
    if (kind === 'eguitar') {
      // clean neck pickup: soft mid bump plus a detuned chorus copy panned opposite
      const mid = this._filter('peaking', 700, 0.9);
      mid.gain.value = 3;
      node.connect(mid);
      node = mid;
      const ch = this.ctx.createBufferSource();
      ch.buffer = ks.buffer;
      ch.playbackRate.value = ks.rate;
      ch.detune.value = 9;
      const chG = this._gain(0.45);
      const chPan = this.ctx.createStereoPanner();
      chPan.pan.value = -(opts.pan ?? 0.2);
      const chLp = this._filter('lowpass', 2000, 0.6);
      ch.connect(chLp);
      chLp.connect(chG);
      chG.connect(chPan);
      chPan.connect(amp);
      ch.start(t + 0.012);
      ch.stop(t + Math.min(dur + 0.08, ks.length) + 0.1);
      this._wobble(voice, ch.detune, ch);
    }
    if (kind === 'sitar' || kind === 'tanpura') {
      // moving resonance gives the shimmering jawari sweep
      const bp = this._filter('peaking', f * 3, 2.5);
      bp.gain.value = 3.5;
      bp.frequency.setValueAtTime(f * 7, t);
      bp.frequency.exponentialRampToValueAtTime(f * 2, t + ks.length * 0.8);
      node.connect(bp);
      node = bp;
    }
    node.connect(amp);

    if (kind === 'bass') {
      // sine fundamental keeps the upright bass round on small speakers
      const fund = this._osc('sine', f, t, ringEnd + 0.2);
      const fg = this._gain(0);
      fg.gain.setValueAtTime(SILENT, t);
      fg.gain.linearRampToValueAtTime(0.16 * vel, t + 0.02);
      fg.gain.setTargetAtTime(SILENT, t + 0.02, 0.5);
      if (!opts.letRing) fg.gain.setTargetAtTime(SILENT, t + dur, 0.05);
      fund.connect(fg);
      fg.connect(amp);
    }

    let out = amp;
    if (opts.pan) {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = opts.pan;
      amp.connect(pan);
      out = pan;
    }
    out.connect(voice.out);
    src.start(t);
    src.stop(ringEnd + 0.1);
    this._wobble(voice, src.detune, src);
  }

  /** Thumb piano: sine tine with inharmonic overtone. */
  kalimba(voice, t, m, dur, vel, opts = {}) {
    const f = mtof(m);
    const end = t + 2.2;
    const amp = this._gain(1);
    [
      [1, 1, 0.55],
      [5.95, 0.06, 0.06],
      [2.0, 0.05, 0.2],
    ].forEach(([ratio, a, tc]) => {
      const o = this._osc('sine', f * ratio, t, end);
      const g = this._gain(0);
      this._perc(g.gain, t, 0.24 * vel * a, 0.002, tc);
      o.connect(g);
      g.connect(amp);
      this._wobble(voice, o.detune, o);
    });
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0.15;
    amp.connect(pan);
    pan.connect(voice.out);
  }

  /** Vibraphone with motor tremolo. */
  vibes(voice, t, m, dur, vel, opts = {}) {
    const f = mtof(m);
    const end = t + 3.2;
    const sum = this._gain(1);
    [
      [1, 1, 1.1],
      [4.0, 0.1, 0.2],
    ].forEach(([ratio, a, tc]) => {
      const o = this._osc('sine', f * ratio, t, end);
      const g = this._gain(0);
      this._perc(g.gain, t, 0.2 * vel * a, 0.003, tc);
      o.connect(g);
      g.connect(sum);
    });
    const trem = this._gain(0.8);
    const lfo = this._osc('sine', 5.2, t, end);
    const depth = this._gain(0.2);
    lfo.connect(depth);
    depth.connect(trem.gain);
    sum.connect(trem);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0.2;
    trem.connect(pan);
    pan.connect(voice.out);
  }

  /** Music box / celesta bell for sleep stations. */
  musicbox(voice, t, m, dur, vel, opts = {}) {
    const f = mtof(m);
    const end = t + 4;
    const sum = this._gain(1);
    [
      [1, 1, 1.0],
      [2.0, 0.18, 0.35],
      [5.04, 0.025, 0.08],
    ].forEach(([ratio, a, tc]) => {
      const o = this._osc('sine', f * ratio, t, end);
      const g = this._gain(0);
      this._perc(g.gain, t, 0.15 * vel * a, 0.002, tc);
      o.connect(g);
      g.connect(sum);
      this._wobble(voice, o.detune, o);
    });
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? (Math.random() - 0.5) * 0.6;
    sum.connect(pan);
    pan.connect(voice.out);
  }

  /** Struck Himalayan singing bowl with slow beating partials. */
  bowl(voice, t, m, dur, vel) {
    const f = mtof(m);
    const end = t + 14;
    const sum = this._gain(1);
    [
      [1, 1, 4.2],
      [2.76, 0.42, 2.4],
      [5.4, 0.16, 1.0],
    ].forEach(([ratio, a, tc]) => {
      [-0.35, 0.35].forEach((beat, k) => {
        const o = this._osc('sine', f * ratio + beat * ratio, t, end);
        const g = this._gain(0);
        g.gain.setValueAtTime(SILENT, t);
        g.gain.linearRampToValueAtTime(0.07 * vel * a, t + 0.03);
        g.gain.setTargetAtTime(SILENT, t + 0.03, tc);
        o.connect(g);
        const pan = this.ctx.createStereoPanner();
        pan.pan.value = k === 0 ? -0.35 : 0.35;
        g.connect(pan);
        pan.connect(sum);
      });
    });
    sum.connect(voice.out);
  }

  // ---------------------------------------------------------------- winds

  /** Bansuri-style breathy bamboo flute with meend glides and delayed vibrato. */
  flute(voice, t, m, dur, vel, opts = {}) {
    const f = mtof(m);
    const end = t + dur + 0.6;
    const o = this._osc('sine', f, t, end, this.waves.flute);
    if (opts.from != null && Math.abs(opts.from - m) <= 7) {
      o.frequency.setValueAtTime(mtof(opts.from), t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.18);
    } else {
      o.frequency.setValueAtTime(f * 0.988, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    }
    const vib = this._osc('sine', 4.8, t, end);
    const vibG = this._gain(0);
    vibG.gain.setValueAtTime(0, t);
    vibG.gain.linearRampToValueAtTime(0, t + 0.35);
    vibG.gain.linearRampToValueAtTime(f * 0.0065, t + 0.9);
    vib.connect(vibG);
    vibG.connect(o.frequency);

    const amp = this._gain(0);
    this._adsr(amp.gain, t, dur, 0.17 * vel, 0.14, 0.6, 0.78, 0.35);

    const breath = this._noiseSrc(t, dur + 0.6);
    const bp = this._filter('bandpass', f * 1.6, 1.3);
    const bg = this._gain(0);
    bg.gain.setValueAtTime(SILENT, t);
    bg.gain.linearRampToValueAtTime(0.05 * vel, t + 0.05);
    bg.gain.setTargetAtTime(0.012 * vel, t + 0.05, 0.12);
    bg.gain.setTargetAtTime(SILENT, t + dur, 0.08);
    breath.connect(bp);
    bp.connect(bg);
    bg.connect(amp);

    const lp = this._filter('lowpass', 3400, 0.5);
    o.connect(lp);
    lp.connect(amp);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0.12;
    amp.connect(pan);
    pan.connect(voice.out);
    this._wobble(voice, o.detune, o);
  }

  /** Soft analog synth pluck (chillwave arpeggios). */
  synthPluck(voice, t, m, dur, vel, opts = {}) {
    const f = mtof(m);
    const end = t + 1.4;
    const o1 = this._osc('sawtooth', f, t, end);
    const o2 = this._osc('square', f * 1.002, t, end);
    const g2 = this._gain(0.35);
    o2.connect(g2);
    const lp = this._filter('lowpass', 1600, 0.8);
    lp.frequency.setValueAtTime(1600 * (0.6 + vel * 0.5), t);
    lp.frequency.setTargetAtTime(380, t, 0.09);
    const amp = this._gain(0);
    this._perc(amp.gain, t, 0.11 * vel, 0.004, 0.2);
    o1.connect(lp);
    g2.connect(lp);
    lp.connect(amp);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0;
    amp.connect(pan);
    pan.connect(voice.out);
    this._wobble(voice, o1.detune, o1);
  }

  /** Warm sine sub bass with optional glide from a previous note. */
  sub(voice, t, m, dur, vel, opts = {}) {
    const f = mtof(m);
    const end = t + dur + 0.5;
    const o = this._osc('sine', f, t, end);
    if (opts.from != null) {
      o.frequency.setValueAtTime(mtof(opts.from), t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    }
    const h = this._osc('triangle', f, t, end);
    const hg = this._gain(0.18);
    h.connect(hg);
    const lp = this._filter('lowpass', 420, 0.5);
    const amp = this._gain(0);
    this._adsr(amp.gain, t, dur, 0.24 * vel, 0.03, 0.8, 0.7, 0.25);
    o.connect(amp);
    hg.connect(lp);
    lp.connect(amp);
    amp.connect(voice.out);
  }

  // ---------------------------------------------------------------- drums

  kick(voice, t, vel, opts = {}) {
    const end = t + 0.5;
    const o = this._osc('sine', opts.pitch ?? 118, t, end);
    o.frequency.setValueAtTime(opts.pitch ?? 118, t);
    o.frequency.exponentialRampToValueAtTime(opts.low ?? 44, t + 0.11);
    const amp = this._gain(0);
    this._perc(amp.gain, t, 0.62 * vel, 0.003, opts.tc ?? 0.12);
    o.connect(amp);
    const click = this._noiseSrc(t, 0.02);
    const clp = this._filter('lowpass', 2200, 0.7);
    const cg = this._gain(0);
    this._perc(cg.gain, t, 0.012 * vel * (opts.click ?? 1), 0.002, 0.004);
    click.connect(clp);
    clp.connect(cg);
    cg.connect(amp);
    amp.connect(voice.out);
  }

  snare(voice, t, vel, opts = {}) {
    const n = this._noiseSrc(t, 0.4);
    const bp = this._filter('bandpass', opts.tone ?? 1700, 0.7);
    const lp = this._filter('lowpass', opts.dusty ? 2400 : 4000, 0.5);
    const g = this._gain(0);
    this._perc(g.gain, t, 0.17 * vel, 0.003, opts.tc ?? 0.06);
    n.connect(bp);
    bp.connect(lp);
    lp.connect(g);
    const body = this._osc('triangle', 190, t, t + 0.25);
    body.frequency.setValueAtTime(205, t);
    body.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    const bg = this._gain(0);
    this._perc(bg.gain, t, 0.14 * vel, 0.001, 0.035);
    body.connect(bg);
    const out = this._gain(1);
    g.connect(out);
    bg.connect(out);
    out.connect(voice.out);
  }

  rim(voice, t, vel) {
    const o = this._osc('triangle', 1650, t, t + 0.08);
    const g = this._gain(0);
    this._perc(g.gain, t, 0.07 * vel, 0.002, 0.012);
    const n = this._noiseSrc(t, 0.05);
    const bp = this._filter('bandpass', 2600, 2);
    const ng = this._gain(0);
    this._perc(ng.gain, t, 0.1 * vel, 0.001, 0.01);
    n.connect(bp);
    bp.connect(ng);
    o.connect(g);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = -0.15;
    g.connect(pan);
    ng.connect(pan);
    pan.connect(voice.out);
  }

  clap(voice, t, vel) {
    const out = this._gain(1);
    [0, 0.011, 0.023].forEach((off, i) => {
      const n = this._noiseSrc(t + off, i === 2 ? 0.3 : 0.03);
      const bp = this._filter('bandpass', 1300, 1.1);
      const g = this._gain(0);
      this._perc(g.gain, t + off, 0.16 * vel, 0.001, i === 2 ? 0.07 : 0.008);
      n.connect(bp);
      bp.connect(g);
      g.connect(out);
    });
    out.connect(voice.out);
  }

  hat(voice, t, vel, opts = {}) {
    const n = this._noiseSrc(t, opts.open ? 0.5 : 0.1);
    const hp = this._filter('highpass', opts.dark ? 4800 : 6000, 0.7);
    const lp = this._filter('lowpass', opts.dark ? 7000 : 9000, 0.5);
    const g = this._gain(0);
    this._perc(g.gain, t, 0.045 * vel, 0.002, opts.open ? 0.12 : 0.016);
    n.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = opts.pan ?? 0.25;
    g.connect(pan);
    pan.connect(voice.out);
  }

  shaker(voice, t, vel) {
    const n = this._noiseSrc(t, 0.12);
    const bp = this._filter('bandpass', 6500, 1.2);
    const g = this._gain(0);
    g.gain.setValueAtTime(SILENT, t);
    g.gain.linearRampToValueAtTime(0.04 * vel, t + 0.018);
    g.gain.setTargetAtTime(SILENT, t + 0.02, 0.022);
    n.connect(bp);
    bp.connect(g);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = 0.35;
    g.connect(pan);
    pan.connect(voice.out);
  }

  ride(voice, t, vel) {
    const sum = this._gain(1);
    [5320, 7110, 8430].forEach((fr) => {
      const o = this._osc('square', fr, t, t + 1.2);
      const g = this._gain(0);
      this._perc(g.gain, t, 0.003 * vel, 0.002, 0.35);
      o.connect(g);
      g.connect(sum);
    });
    const n = this._noiseSrc(t, 0.8);
    const hp = this._filter('highpass', 6000, 0.7);
    const ng = this._gain(0);
    this._perc(ng.gain, t, 0.018 * vel, 0.002, 0.22);
    n.connect(hp);
    hp.connect(ng);
    ng.connect(sum);
    const lp = this._filter('lowpass', 9000, 0.5);
    sum.connect(lp);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = 0.3;
    lp.connect(pan);
    pan.connect(voice.out);
  }

  /** Brush sweep on a snare head. */
  brush(voice, t, vel, len = 0.22) {
    const n = this._noiseSrc(t, len + 0.3);
    const bp = this._filter('bandpass', 2800, 0.6);
    bp.frequency.setValueAtTime(2200, t);
    bp.frequency.linearRampToValueAtTime(3600, t + len);
    const g = this._gain(0);
    g.gain.setValueAtTime(SILENT, t);
    g.gain.linearRampToValueAtTime(0.05 * vel, t + len * 0.35);
    g.gain.setTargetAtTime(SILENT, t + len * 0.4, len * 0.25);
    n.connect(bp);
    bp.connect(g);
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = -0.1;
    g.connect(pan);
    pan.connect(voice.out);
  }

  /**
   * Tabla strokes. tonic is the dayan's tuning (midi).
   * Strokes: dha, dhin, na, tin, ge, ka, ti
   */
  tabla(voice, t, stroke, vel, tonic) {
    const dayanF = mtof(tonic);
    const out = this._gain(1);
    const dayan = (ringTc, bright) => {
      [
        [1, 1, ringTc],
        [2, 0.5 * bright, ringTc * 0.6],
        [3, 0.32 * bright, ringTc * 0.4],
        [4, 0.16 * bright, ringTc * 0.25],
      ].forEach(([ratio, a, tc]) => {
        const o = this._osc('sine', dayanF * ratio, t, t + ringTc * 6 + 0.1);
        const g = this._gain(0);
        this._perc(g.gain, t, 0.12 * vel * a, 0.0015, tc);
        o.connect(g);
        g.connect(out);
      });
      const n = this._noiseSrc(t, 0.03);
      const bp = this._filter('bandpass', 3200, 1.5);
      const ng = this._gain(0);
      this._perc(ng.gain, t, 0.05 * vel, 0.001, 0.006);
      n.connect(bp);
      bp.connect(ng);
      ng.connect(out);
    };
    const bayan = (gamak) => {
      const o = this._osc('sine', 82, t, t + 1.2);
      o.frequency.setValueAtTime(78, t);
      o.frequency.linearRampToValueAtTime(gamak ? 112 : 88, t + 0.28);
      const g = this._gain(0);
      this._perc(g.gain, t, 0.3 * vel, 0.004, 0.22);
      o.connect(g);
      g.connect(out);
    };
    const slap = () => {
      const n = this._noiseSrc(t, 0.06);
      const lp = this._filter('lowpass', 520, 0.7);
      const g = this._gain(0);
      this._perc(g.gain, t, 0.18 * vel, 0.001, 0.018);
      n.connect(lp);
      lp.connect(g);
      g.connect(out);
    };
    switch (stroke) {
      case 'dha':
        bayan(true);
        dayan(0.32, 1);
        break;
      case 'dhin':
        bayan(false);
        dayan(0.5, 0.6);
        break;
      case 'na':
        dayan(0.3, 1);
        break;
      case 'tin':
        dayan(0.45, 0.5);
        break;
      case 'ti':
        dayan(0.06, 0.8);
        break;
      case 'ge':
        bayan(Math.random() > 0.5);
        break;
      case 'ka':
        slap();
        break;
      default:
        break;
    }
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = -0.2;
    out.connect(pan);
    pan.connect(voice.out);
  }
}
