/**
 * "Night Hindi Lo-Fi" — Original Procedural Slowed + Reverb Web Audio Composition
 * Inspired by late-night chill Hindi lo-fi (nostalgic acoustic guitar arpeggios,
 * breathy bansuri flute with meend pitch glides, warm string pads, lush ConvolverNode
 * hall reverb, vinyl warmth, and a soft slowed boom-bap / tabla-inflected groove).
 *
 * Zero external audio files, zero ads, instant playback.
 */

const BPM = 70; // Slow, swaying late-night Hindi lo-fi groove

// Note frequency helper (MIDI note -> Hz)
function mtof(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// Three evolving 8-bar sections (24 bars = ~82s cycle with melodic variations)
// Key: A natural minor / C major (warm nostalgic Hindi-lofi tonality)
const SECTIONS = [
  // Section A — "Midnight Rain" (Bansuri flute + acoustic guitar arpeggios + string pad)
  {
    name: 'Midnight Rain',
    lead: 'bansuri',
    drums: true,
    guitarArp: true,
    chords: [
      { root: 45, notes: [57, 60, 64, 67, 71] }, // Am9
      { root: 41, notes: [53, 57, 60, 64, 67] }, // Fmaj9
      { root: 48, notes: [55, 60, 64, 67, 71] }, // Cmaj9
      { root: 43, notes: [55, 59, 62, 64, 69] }, // G6/9
      { root: 45, notes: [57, 60, 64, 67, 71] }, // Am9
      { root: 41, notes: [53, 57, 60, 64, 69] }, // Fmaj13
      { root: 50, notes: [57, 60, 62, 64, 69] }, // Dm11
      { root: 40, notes: [52, 56, 59, 62, 64] }, // E7 (nostalgic Hindi turnaround)
    ],
    // Lyrical singable phrases: [beatOffset, midiNote, durationBeats, slideFromOffset]
    melody: [
      [[0.5, 76, 1.5, -2], [2.25, 74, 0.75, 0], [3.0, 72, 1.2, 0]],
      [[0.5, 72, 1.0, 0], [1.5, 71, 0.75, 0], [2.25, 69, 1.6, 2]],
      [[0.75, 72, 1.25, -2], [2.0, 74, 0.75, 0], [2.75, 76, 1.4, -2]],
      [[0.5, 74, 1.8, 2], [2.75, 71, 1.2, 0]],
      [[0.5, 76, 1.25, -2], [1.75, 79, 1.0, -3], [2.75, 76, 1.2, 0]],
      [[0.5, 74, 1.2, 2], [1.75, 72, 1.0, 0], [2.75, 69, 1.3, 0]],
      [[0.5, 72, 1.0, -2], [1.5, 71, 0.75, 0], [2.25, 69, 1.5, 0]],
      [[0.5, 68, 1.8, 1], [2.5, 71, 1.4, -2]],
    ],
  },
  // Section B — "Terrace Breeze" (Bansuri chorus melody + gentle bass + groove)
  {
    name: 'Terrace Breeze',
    lead: 'bansuri',
    drums: true,
    guitarArp: true,
    chords: [
      { root: 41, notes: [53, 57, 60, 64, 67] }, // Fmaj9
      { root: 43, notes: [55, 59, 62, 64, 69] }, // G6/9
      { root: 40, notes: [52, 55, 59, 62, 67] }, // Em9
      { root: 45, notes: [57, 60, 64, 67, 71] }, // Am9
      { root: 50, notes: [57, 60, 62, 64, 69] }, // Dm11
      { root: 43, notes: [55, 59, 62, 65, 69] }, // G13
      { root: 48, notes: [55, 60, 64, 67, 71] }, // Cmaj9
      { root: 45, notes: [57, 60, 64, 67, 71] }, // Am9
    ],
    melody: [
      [[0.0, 72, 1.2, 0], [1.25, 74, 0.75, 0], [2.0, 76, 1.5, -2], [3.5, 74, 0.6, 0]],
      [[0.25, 74, 1.2, 0], [1.5, 71, 1.0, 0], [2.5, 74, 1.4, -2]],
      [[0.5, 71, 1.0, 0], [1.5, 72, 0.75, 0], [2.25, 74, 1.5, 0]],
      [[0.5, 72, 1.6, 2], [2.5, 69, 1.4, 0]],
      [[0.5, 77, 1.2, -2], [1.75, 76, 0.75, 0], [2.5, 74, 1.4, 0]],
      [[0.5, 74, 1.0, 0], [1.5, 72, 0.75, 0], [2.25, 71, 1.5, 0]],
      [[0.5, 72, 1.8, -2], [2.5, 76, 1.4, -2]],
      [[0.5, 72, 2.2, 2]],
    ],
  },
  // Section C — "Moonlit Reflection" (Dreamy beatless breakdown -> bansuri & reverb pad)
  {
    name: 'Moonlit Reflection',
    lead: 'bansuri',
    drums: false,
    guitarArp: true,
    chords: [
      { root: 41, notes: [53, 57, 60, 64, 67] }, // Fmaj9
      { root: 48, notes: [55, 60, 64, 67, 71] }, // Cmaj9
      { root: 50, notes: [57, 60, 62, 64, 69] }, // Dm11
      { root: 45, notes: [57, 60, 64, 67, 71] }, // Am9
      { root: 41, notes: [53, 57, 60, 64, 69] }, // Fmaj13
      { root: 43, notes: [55, 59, 62, 64, 69] }, // G6/9
      { root: 40, notes: [52, 56, 59, 62, 64] }, // E7
      { root: 45, notes: [57, 60, 64, 67, 71] }, // Am9
    ],
    melody: [
      [[0.75, 76, 2.2, -2]],
      [[0.5, 79, 1.6, -3], [2.5, 76, 1.6, 0]],
      [[0.75, 74, 1.8, 2], [2.75, 72, 1.3, 0]],
      [[0.5, 71, 1.2, 0], [1.75, 69, 2.2, 2]],
      [[0.75, 72, 1.6, -2], [2.5, 74, 1.5, 0]],
      [[0.5, 76, 1.5, -2], [2.25, 74, 1.8, 0]],
      [[0.75, 71, 1.8, 1], [2.75, 68, 1.4, 0]],
      [[0.5, 69, 2.8, -2]],
    ],
  },
];

export class HindiLofiPlayer {
  constructor({ onStateChange } = {}) {
    this.onStateChange = onStateChange;
    this.ctx = null;
    this.masterGain = null;
    this.dryBus = null;
    this.reverbSend = null;
    this.delaySend = null;
    this.noiseBuf = null;

    this.enabled = false;
    this.volume = 0.72;
    this.barIndex = 0;
    this.timer = null;
  }

  get playing() {
    return this.enabled && this.ctx?.state === 'running';
  }

  _ensureContext() {
    if (this.ctx) return;

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioCtx();

    // Soft master bus glue compressor + warm tape lowpass
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 3.2;
    comp.attack.value = 0.015;
    comp.release.value = 0.22;

    const tapeWarmth = this.ctx.createBiquadFilter();
    tapeWarmth.type = 'lowpass';
    tapeWarmth.frequency.value = 4600;

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.0001;

    comp.connect(tapeWarmth);
    tapeWarmth.connect(this.masterGain);
    this.masterGain.connect(this.ctx.destination);

    this.dryBus = comp;

    // Lush 2.8s Stereo Slowed+Reverb Convolver
    const convolver = this.ctx.createConvolver();
    convolver.buffer = this._createReverbIR(2.8, 2.6);
    const revLP = this.ctx.createBiquadFilter();
    revLP.type = 'lowpass';
    revLP.frequency.value = 2100;
    const revGain = this.ctx.createGain();
    revGain.gain.value = 0.48;

    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 1.0;
    this.reverbSend.connect(convolver);
    convolver.connect(revLP);
    revLP.connect(revGain);
    revGain.connect(comp);

    // Dotted-8th stereo tape echo
    const delay = this.ctx.createDelay(1.0);
    delay.delayTime.value = (60 / BPM) * 0.75;
    const fb = this.ctx.createGain();
    fb.gain.value = 0.34;
    const dLP = this.ctx.createBiquadFilter();
    dLP.type = 'lowpass';
    dLP.frequency.value = 1350;

    this.delaySend = this.ctx.createGain();
    this.delaySend.gain.value = 0.28;
    this.delaySend.connect(delay);
    delay.connect(dLP);
    dLP.connect(fb);
    fb.connect(delay);
    dLP.connect(this.reverbSend);
    dLP.connect(comp);

    this.noiseBuf = this._createNoiseBuffer(0.4);
    this._startVinylLayer(comp);
    this.ctx.addEventListener('statechange', () => {
      if (this.playing && this.timer === null) this._scheduleBar();
      this.onStateChange?.();
    });
  }

  _createReverbIR(duration, decay) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * duration);
    const ir = this.ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, decay);
        data[i] = (Math.random() * 2 - 1) * env;
      }
    }
    return ir;
  }

  _createNoiseBuffer(seconds) {
    const sr = this.ctx.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + w * 0.04;
      b1 = 0.985 * b1 + w * 0.07;
      b2 = 0.950 * b2 + w * 0.12;
      d[i] = (b0 + b1 + b2 + w * 0.08) * 0.4;
    }
    return buf;
  }

  _startVinylLayer(dest) {
    const sr = this.ctx.sampleRate;
    const len = sr * 6;
    const buf = this.ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const r = Math.random();
      d[i] = r > 0.9993 ? (Math.random() * 2 - 1) * 0.36 : (Math.random() * 2 - 1) * 0.003;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 1750;
    const g = this.ctx.createGain();
    g.gain.value = 0.085;

    src.connect(hp);
    hp.connect(g);
    g.connect(dest);
    src.start();
  }

  // --- Instruments ---
  /** Soft string-pad chord (slow bow attack, no piano strike). */
  _playPadChord(midiNotes, startTime, duration) {
    midiNotes.forEach((m, idx) => {
      const t = startTime + idx * 0.06;
      const freq = mtof(m);
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      osc2.type = 'triangle';
      const detune = 5 + Math.random() * 4;
      osc1.frequency.setValueAtTime(freq, t);
      osc2.frequency.setValueAtTime(freq, t);
      osc1.detune.value = detune;
      osc2.detune.value = -detune;

      const sawG = this.ctx.createGain();
      sawG.gain.value = 0.35;

      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(820, t);
      lp.Q.value = 0.4;

      const env = this.ctx.createGain();
      const attack = Math.min(0.9, duration * 0.3);
      env.gain.setValueAtTime(0.0001, t);
      env.gain.linearRampToValueAtTime(0.034, t + attack);
      env.gain.setValueAtTime(0.034, t + duration * 0.7);
      env.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.5);

      osc1.connect(sawG);
      sawG.connect(lp);
      osc2.connect(lp);
      lp.connect(env);
      env.connect(this.dryBus);
      env.connect(this.reverbSend);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + duration + 0.6);
      osc2.stop(t + duration + 0.6);
    });
  }

  _playGuitarPluck(midi, startTime, velocity = 0.055, panVal = 0) {
    const freq = mtof(midi);
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, startTime);
    osc.detune.value = (Math.random() - 0.5) * 6;

    const body = this.ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.setValueAtTime(1900, startTime);
    body.frequency.exponentialRampToValueAtTime(480, startTime + 0.65);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(velocity, startTime + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.15);

    const pan = this.ctx.createStereoPanner();
    pan.pan.value = panVal;

    osc.connect(body);
    body.connect(env);
    env.connect(pan);
    pan.connect(this.dryBus);
    pan.connect(this.reverbSend);

    osc.start(startTime);
    osc.stop(startTime + 1.2);
  }

  _playBansuri(midi, startTime, duration, slideSemitones = 0) {
    const targetFreq = mtof(midi);
    const startFreq = slideSemitones ? mtof(midi + slideSemitones) : targetFreq * 0.992;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, startTime);
    // Expressive Indian meend glide into the note
    osc.frequency.exponentialRampToValueAtTime(targetFreq, startTime + 0.14);

    // Gentle breath vibrato
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 4.8;
    const vibG = this.ctx.createGain();
    vibG.gain.setValueAtTime(0.2, startTime);
    vibG.gain.linearRampToValueAtTime(3.6, startTime + duration * 0.45);
    vib.connect(vibG);
    vibG.connect(osc.frequency);

    // Subtle breathy air layer
    const airSrc = this.ctx.createBufferSource();
    airSrc.buffer = this.noiseBuf;
    airSrc.loop = true;
    const airBP = this.ctx.createBiquadFilter();
    airBP.type = 'bandpass';
    airBP.frequency.value = targetFreq * 2.0;
    airBP.Q.value = 5.0;
    const airG = this.ctx.createGain();
    airG.gain.value = 0.022;
    airSrc.connect(airBP);
    airBP.connect(airG);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(0.082, startTime + 0.16);
    env.gain.exponentialRampToValueAtTime(0.052, startTime + duration * 0.65);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    const pan = this.ctx.createStereoPanner();
    pan.pan.value = 0.12;

    osc.connect(env);
    airG.connect(env);
    env.connect(pan);
    pan.connect(this.dryBus);
    pan.connect(this.reverbSend);
    pan.connect(this.delaySend);

    osc.start(startTime);
    vib.start(startTime);
    airSrc.start(startTime);
    osc.stop(startTime + duration + 0.08);
    vib.stop(startTime + duration + 0.08);
    airSrc.stop(startTime + duration + 0.08);
  }

  _playSubBass(midi, startTime, duration) {
    const freq = mtof(midi - 12);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, startTime);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(0.16, startTime + 0.05);
    env.gain.exponentialRampToValueAtTime(0.085, startTime + duration * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(env);
    env.connect(this.dryBus);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.06);
  }

  _playKick(t, vol = 0.19) {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(102, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vol, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);

    osc.connect(env);
    env.connect(this.dryBus);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  _playTablaBayan(t) {
    // Soft low-pitched tabla-style resonant bounce on beat 3.5
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(118, t);
    osc.frequency.exponentialRampToValueAtTime(148, t + 0.09);
    osc.frequency.exponentialRampToValueAtTime(98, t + 0.24);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.075, t + 0.014);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);

    osc.connect(env);
    env.connect(this.dryBus);
    env.connect(this.reverbSend);
    osc.start(t);
    osc.stop(t + 0.28);
  }

  _playSnare(t, vol = 0.065) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1350;
    bp.Q.value = 1.0;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vol, t + 0.006);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);

    src.connect(bp);
    bp.connect(env);
    env.connect(this.dryBus);
    env.connect(this.reverbSend);
    src.start(t);
    src.stop(t + 0.18);
  }

  _playHat(t, vol = 0.018) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;

    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 5400;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(vol, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);

    src.connect(hp);
    hp.connect(env);
    env.connect(this.dryBus);
    src.start(t);
    src.stop(t + 0.07);
  }

  _scheduleBar() {
    this.timer = null;
    if (!this.playing) return;

    const beat = 60 / BPM;
    const barDur = beat * 4;
    const now = this.ctx.currentTime + 0.05;

    const secIdx = Math.floor(this.barIndex / 8) % SECTIONS.length;
    const barInSec = this.barIndex % 8;
    const section = SECTIONS[secIdx];
    const chord = section.chords[barInSec];

    // 1. Warm sub-bass + soft string pad chord
    this._playSubBass(chord.root, now, barDur * 0.94);
    this._playPadChord(chord.notes, now, barDur * 0.98);

    // 2. Gentle acoustic guitar arpeggio (classic unplugged Hindi lo-fi texture)
    if (section.guitarArp) {
      const arpPattern = [0, 1, 2, 3, 2, 4, 3, 1];
      arpPattern.forEach((noteSlot, step) => {
        const midi = chord.notes[noteSlot % chord.notes.length];
        const swing = step % 2 === 1 ? beat * 0.04 : 0;
        const t = now + step * (beat * 0.5) + swing;
        const pan = step % 2 === 0 ? -0.26 : 0.22;
        this._playGuitarPluck(midi, t, step === 0 ? 0.052 : 0.036, pan);
      });
    }

    // 3. Soft slowed boom-bap + tabla-inflected groove
    if (section.drums) {
      this._playKick(now, 0.19);
      this._playKick(now + beat * 2.55, 0.14);
      this._playSnare(now + beat * 1.0, 0.058);
      this._playSnare(now + beat * 3.0, 0.065);
      if (barInSec % 2 === 1) {
        this._playTablaBayan(now + beat * 3.5);
      }
      for (let i = 0; i < 8; i++) {
        const swing = i % 2 === 1 ? beat * 0.055 : 0;
        this._playHat(now + i * (beat * 0.5) + swing, i % 2 === 0 ? 0.018 : 0.011);
      }
    }

    // 4. Lyrical lead melody (bansuri flute)
    const phrase = section.melody[barInSec];
    if (phrase) {
      phrase.forEach(([bOff, midi, durBeats, slide]) => {
        const t = now + beat * bOff;
        this._playBansuri(midi, t, beat * durBeats, slide || 0);
      });
    }

    this.barIndex += 1;
    this.timer = window.setTimeout(() => this._scheduleBar(), barDur * 1000);
  }

  start() {
    if (this.enabled) return this.unlockIfPending();
    this._ensureContext();
    this.enabled = true;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(this.volume, now, 0.45);
    clearTimeout(this.timer);
    this.timer = null;

    this.onStateChange?.();
    return this.unlockIfPending();
  }

  stop() {
    this.enabled = false;
    clearTimeout(this.timer);
    this.timer = null;
    if (this.ctx && this.masterGain) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(0.0001, now, 0.35);
    }
    this.onStateChange?.();
  }

  async unlockIfPending() {
    if (!this.enabled) return false;
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        return false;
      }
    }
    if (this.playing && this.timer === null) this._scheduleBar();
    this.onStateChange?.();
    return this.playing;
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, (Number(val) || 0) / 100));
    if (this.ctx && this.masterGain && this.enabled) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.12);
    }
  }
}
