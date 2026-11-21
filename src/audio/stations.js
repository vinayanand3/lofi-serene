/**
 * Lo-Fi radio station recipes.
 *
 * Each station is an original composition recipe rendered live by
 * musicEngine.js: its own tempo, key or raga, instruments, groove,
 * arrangement, room and tape character. Notes are MIDI numbers (60 = middle C).
 *
 * use: 'study' (steady groove, gentle melody) or 'sleep' (beatless, sparse, dark).
 *
 * Composed stations add `lines` (written melodies, one array of
 * [step, midi, durationSteps] notes per bar) and name them per form section
 * with `melody` and `counter`. `progressions` lets each section use its own
 * chords via `prog`, and `meter: 3` gives a waltz (12 sixteenth steps a bar).
 *
 * No station uses piano or electric piano.
 */

const ch = (bass, notes, bars = 1) => ({ bass, notes, bars });
const n = (s, m, d) => [s, m, d];

const SCALES = {
  hirajoshi: [0, 2, 3, 7, 8],
  megh: [0, 2, 5, 7, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  bhupali: [0, 2, 4, 7, 9],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  majPent: [0, 2, 4, 7, 9],
  bhairav: [0, 1, 4, 5, 7, 8, 11],
};


/* ------------------------------------------------------------------
 * Composed stations: written themes, sectioned harmony, no piano.
 * All melodies are original.
 * ---------------------------------------------------------------- */

/** Japan: a gentle pastoral waltz in F (harp, wooden flute, strings, cello). */
const MEADOW_WALTZ = {
  id: 'meadow_waltz',
  name: 'Meadow Wind Waltz',
  style: 'Pastoral waltz · harp, wooden flute & strings',
  use: 'study',
  bpm: 76,
  meter: 3,
  swing: 0,
  key: { root: 65, scale: SCALES.major },
  progression: [ch(41, [53, 57, 60, 64])],
  progressions: {
    A: [
      ch(41, [53, 57, 60, 64]), // Fmaj7
      ch(38, [53, 57, 60, 62]), // Dm7
      ch(46, [53, 57, 58, 62]), // Bbmaj7
      ch(48, [55, 60, 62, 64]), // C(add9)
      ch(45, [55, 57, 60, 64]), // Am7
      ch(46, [53, 57, 58, 62]), // Bbmaj7
      ch(43, [53, 55, 58, 62]), // Gm7
      ch(48, [55, 58, 60, 65]), // C7sus
    ],
    B: [
      ch(46, [53, 57, 58, 62]), // Bbmaj7
      ch(48, [55, 60, 62, 64]), // C(add9)
      ch(45, [55, 57, 60, 64]), // Am7
      ch(38, [53, 57, 60, 62]), // Dm7
      ch(43, [53, 55, 58, 62]), // Gm7
      ch(48, [55, 58, 60, 64]), // C7
      ch(41, [53, 57, 60, 64]), // Fmaj7
      ch(41, [53, 57, 60, 65]), // F
    ],
  },
  lines: {
    A: [
      [n(0, 72, 8), n(8, 74, 2), n(10, 76, 2)],
      [n(0, 77, 6), n(6, 76, 2), n(8, 74, 4)],
      [n(0, 74, 8), n(8, 72, 4)],
      [n(0, 72, 4), n(4, 70, 2), n(6, 69, 2), n(8, 67, 4)],
      [n(0, 69, 8), n(8, 72, 4)],
      [n(0, 77, 8), n(8, 76, 2), n(10, 74, 2)],
      [n(0, 74, 6), n(6, 72, 2), n(8, 70, 4)],
      [n(0, 72, 12)],
    ],
    B: [
      [n(0, 74, 4), n(4, 77, 4), n(8, 81, 4)],
      [n(0, 79, 8), n(8, 76, 4)],
      [n(0, 76, 4), n(4, 79, 4), n(8, 81, 4)],
      [n(0, 77, 8), n(8, 76, 2), n(10, 74, 2)],
      [n(0, 74, 4), n(4, 77, 4), n(8, 79, 4)],
      [n(0, 79, 6), n(6, 77, 2), n(8, 76, 4)],
      [n(0, 76, 6), n(6, 74, 2), n(8, 72, 4)],
      [n(0, 77, 12)],
    ],
  },
  comp: { inst: 'harp', pattern: 'waltz', vel: 0.55 },
  pad: { inst: 'strings', vel: 0.6, opts: { attack: 1.8, release: 2.6, cutoff: 1300 } },
  bass: { inst: 'cello', pattern: 'waltz' },
  form: [
    { bars: 4, prog: 'A', parts: ['chords'] },
    { bars: 8, prog: 'A', parts: ['chords', 'bass'], melody: { line: 'A', inst: 'ocarina', vel: 0.62 } },
    {
      bars: 8,
      prog: 'A',
      parts: ['chords', 'bass', 'pad'],
      melody: { line: 'A', inst: 'ocarina', vel: 0.62 },
      counter: { line: 'A', inst: 'glock', oct: 12, firstOnly: true, vel: 0.35 },
    },
    {
      bars: 8,
      prog: 'B',
      parts: ['chords', 'bass', 'pad'],
      melody: { line: 'B', inst: 'flute', vel: 0.6 },
      counter: { line: 'B', inst: 'ocarina', harm: -2, sparse: 0.35, vel: 0.36 },
    },
    { bars: 8, prog: 'A', parts: ['chords', 'pad'], melody: { line: 'A', inst: 'harp', vel: 0.7, grace: 0.15 } },
    { bars: 4, prog: 'B', parts: ['chords', 'pad'] },
  ],
  mix: { chords: 0.9, pad: 0.75, melody: 0.95, counter: 0.7, bass: 0.6 },
  reverb: { size: 3.4, wet: 0.32, send: { bass: 0.15, pad: 0.4 } },
  delay: { beats: 1.5, feedback: 0.25, send: { melody: 0.14, counter: 0.2 } },
  tone: 4800,
  wobble: 2,
  vinyl: 0.12,
  gain: 0.62,
};

/** Mountain Cottage: a slow fireside piece in G for a drizzly night. */
const FIRESIDE_DRIZZLE = {
  id: 'fireside_drizzle',
  name: 'Fireside Drizzle',
  style: 'Fingerpicked nylon guitar, cello & soft rain',
  use: 'sleep',
  bpm: 60,
  swing: 0.12,
  swingUnit: 16,
  key: { root: 67, scale: SCALES.major },
  progression: [ch(43, [55, 59, 62, 66])],
  progressions: {
    A: [
      ch(43, [55, 59, 62, 66]), // Gmaj7
      ch(40, [54, 55, 59, 62]), // Em9
      ch(48, [55, 59, 60, 64]), // Cmaj7
      ch(50, [55, 57, 62, 64]), // Dsus
      ch(43, [55, 59, 62, 66]), // Gmaj7
      ch(47, [54, 57, 59, 62]), // Bm7
      ch(48, [55, 59, 60, 64]), // Cmaj7
      ch(50, [54, 57, 62, 64]), // D(add9)
    ],
    B: [
      ch(40, [54, 55, 59, 62]), // Em9
      ch(48, [55, 59, 60, 64]), // Cmaj7
      ch(43, [55, 59, 62, 66]), // Gmaj7
      ch(50, [54, 57, 62, 64]), // D(add9)
      ch(40, [54, 55, 59, 62]), // Em9
      ch(45, [55, 57, 60, 64]), // Am7
      ch(48, [55, 59, 60, 64]), // Cmaj7
      ch(50, [55, 57, 62, 64]), // Dsus
    ],
  },
  lines: {
    A: [
      [n(4, 74, 4), n(8, 71, 8)],
      [n(0, 71, 4), n(4, 74, 4), n(8, 76, 8)],
      [n(0, 76, 6), n(6, 74, 2), n(8, 71, 8)],
      [n(0, 69, 12), n(12, 71, 2), n(14, 74, 2)],
      [n(0, 74, 8), n(8, 79, 8)],
      [n(0, 78, 6), n(6, 76, 2), n(8, 74, 8)],
      [n(0, 76, 4), n(4, 74, 4), n(8, 72, 4), n(12, 71, 4)],
      [n(0, 69, 16)],
    ],
    B: [
      [n(0, 79, 8), n(8, 78, 4), n(12, 76, 4)],
      [n(0, 76, 8), n(8, 79, 8)],
      [n(0, 79, 4), n(4, 74, 12)],
      [n(0, 76, 8), n(8, 78, 8)],
      [n(0, 79, 8), n(8, 83, 8)],
      [n(0, 81, 8), n(8, 79, 4), n(12, 76, 4)],
      [n(0, 76, 8), n(8, 74, 4), n(12, 72, 4)],
      [n(0, 74, 16)],
    ],
  },
  comp: { inst: 'guitar', pattern: 'fingerpick', vel: 0.62 },
  pad: { inst: 'strings', vel: 0.45, oct: -12, opts: { attack: 2.4, release: 3, cutoff: 1000, hp: 80 } },
  bass: { inst: 'cello', pattern: 'long', vel: 0.5 },
  form: [
    { bars: 4, prog: 'A', parts: ['chords'] },
    { bars: 8, prog: 'A', parts: ['chords', 'bass'], melody: { line: 'A', inst: 'cello', oct: -12, vel: 0.7 } },
    {
      bars: 8,
      prog: 'B',
      parts: ['chords', 'pad'],
      melody: { line: 'B', inst: 'ocarina', vel: 0.52 },
      counter: { line: 'B', inst: 'cello', oct: -12, harm: -2, sparse: 0.4, vel: 0.42 },
    },
    { bars: 8, prog: 'A', parts: ['chords', 'bass', 'pad'], melody: { line: 'A', inst: 'harp', vel: 0.62, grace: 0.12 } },
    { bars: 4, prog: 'A', parts: ['chords'] },
  ],
  mix: { chords: 0.95, pad: 0.6, melody: 0.9, counter: 0.65, bass: 0.5 },
  reverb: { size: 2.8, wet: 0.3, send: { pad: 0.4, bass: 0.1 } },
  delay: { beats: 0.75, feedback: 0.22, send: { melody: 0.1 } },
  tone: 4200,
  wobble: 4,
  vinyl: 0,
  hiss: 0.25,
  rain: 0.7,
  gain: 0.6,
};

/** America (Pacific Northwest): gentle Americana in D for a foggy dawn. */
const CASCADE_PORCH = {
  id: 'cascade_porch',
  name: 'Cascade Porch',
  style: 'Americana · steel guitar & pedal steel',
  use: 'study',
  bpm: 70,
  swing: 0.1,
  swingUnit: 16,
  key: { root: 62, scale: SCALES.major },
  progression: [ch(38, [50, 57, 62, 66])],
  progressions: {
    A: [
      ch(38, [50, 57, 62, 66]), // D
      ch(43, [55, 59, 62, 67]), // G
      ch(47, [54, 57, 59, 62]), // Bm7
      ch(43, [55, 59, 62, 67]), // G
      ch(38, [50, 57, 62, 66]), // D
      ch(45, [52, 57, 61, 64]), // A
      ch(43, [55, 59, 62, 67]), // G
      ch(45, [52, 57, 62, 64]), // Asus
    ],
    B: [
      ch(40, [55, 59, 62, 64]), // Em7
      ch(43, [55, 59, 62, 67]), // G
      ch(38, [50, 57, 62, 66]), // D
      ch(47, [54, 57, 59, 62]), // Bm7
      ch(40, [55, 59, 62, 64]), // Em7
      ch(43, [55, 59, 62, 67]), // G
      ch(45, [52, 57, 62, 64]), // Asus
      ch(45, [52, 57, 61, 64]), // A
    ],
  },
  lines: {
    A: [
      [n(0, 66, 8), n(8, 69, 8)],
      [n(0, 71, 12), n(12, 69, 4)],
      [n(0, 66, 8), n(8, 62, 8)],
      [n(0, 67, 12), n(12, 69, 4)],
      [n(0, 74, 8), n(8, 73, 4), n(12, 71, 4)],
      [n(0, 69, 12), n(12, 71, 4)],
      [n(0, 71, 6), n(6, 69, 2), n(8, 67, 8)],
      [n(0, 69, 16)],
    ],
    B: [
      [n(0, 71, 8), n(8, 74, 8)],
      [n(0, 74, 4), n(4, 76, 4), n(8, 74, 8)],
      [n(0, 78, 12), n(12, 76, 4)],
      [n(0, 74, 8), n(8, 71, 8)],
      [n(0, 71, 4), n(4, 74, 4), n(8, 79, 8)],
      [n(0, 78, 6), n(6, 76, 2), n(8, 74, 8)],
      [n(0, 76, 16)],
      [n(0, 73, 16)],
    ],
  },
  comp: { inst: 'steel', pattern: 'travis', vel: 0.6 },
  bass: { inst: 'upright', pattern: 'country' },
  drums: { kit: 'brushes' },
  form: [
    { bars: 4, prog: 'A', parts: ['chords'] },
    { bars: 8, prog: 'A', parts: ['chords', 'bass', 'drumsLight'], melody: { line: 'A', inst: 'pedalsteel', vel: 0.7 } },
    {
      bars: 8,
      prog: 'A',
      parts: ['chords', 'bass', 'drums'],
      melody: { line: 'A', inst: 'pedalsteel', vel: 0.7 },
      counter: { line: 'A', inst: 'pedalsteel', harm: -2, vel: 0.4, opts: { pan: -0.25 } },
    },
    { bars: 8, prog: 'B', parts: ['chords', 'bass', 'drums'], melody: { line: 'B', inst: 'pedalsteel', vel: 0.72 } },
    { bars: 8, prog: 'A', parts: ['chords', 'bass', 'drumsLight'], melody: { line: 'A', inst: 'ocarina', oct: 12, vel: 0.45, sparse: 0.2 } },
    { bars: 4, prog: 'B', parts: ['chords'] },
  ],
  mix: { chords: 0.95, melody: 0.9, counter: 0.6, bass: 0.85, drums: 0.7 },
  reverb: { size: 2.4, wet: 0.24, send: { bass: 0, drums: 0.1, melody: 0.32 } },
  delay: { beats: 0.75, feedback: 0.24, send: { melody: 0.16 } },
  tone: 4600,
  wobble: 3,
  vinyl: 0.1,
  gain: 0.6,
};

export const STATIONS = [
  MEADOW_WALTZ,
  FIRESIDE_DRIZZLE,
  CASCADE_PORCH,
  {
    id: 'kyoto_dusk',
    name: 'Kyoto Dusk',
    style: 'Lo-fi hip-hop · koto & nylon guitar',
    use: 'study',
    bpm: 68,
    swing: 0.3,
    swingUnit: 16,
    progression: [
      ch(46, [57, 60, 62, 65]), // Bbmaj9
      ch(48, [58, 62, 64, 67]), // C9
      ch(45, [55, 60, 64, 67]), // Am7
      ch(50, [57, 60, 64, 65]), // Dm9
      ch(43, [58, 62, 65, 69]), // Gm9
      ch(48, [58, 62, 64, 67]), // C9
      ch(41, [57, 60, 64, 67]), // Fmaj9
      ch(50, [57, 60, 64, 65]), // Dm9
    ],
    comp: { inst: 'guitar', pattern: 'lofi', vel: 0.7, roll: 0.03 },
    bass: { inst: 'sub', pattern: 'lofi' },
    drums: { kit: 'boombap' },
    lead: {
      inst: 'koto',
      root: 62,
      scale: SCALES.hirajoshi,
      low: 62,
      high: 81,
      vel: 0.8,
      density: 0.9,
      rest: 0.25,
      repeat: 0.5,
      rhythms: [
        [[0, 3], [3, 3], [6, 6], [16, 2], [18, 4], [24, 8]],
        [[2, 2], [4, 4], [10, 6], [20, 3], [23, 3], [26, 6]],
        [[0, 6], [8, 2], [10, 2], [12, 4], [24, 4], [28, 4]],
      ],
    },
    form: [
      { bars: 4, parts: ['chords'] },
      { bars: 8, parts: ['chords', 'bass', 'drums', 'lead'] },
      { bars: 8, parts: ['chords', 'bass', 'drumsLight', 'lead'] },
      { bars: 8, parts: ['chords', 'bass', 'drums', 'lead'] },
      { bars: 4, parts: ['chords', 'lead'] },
    ],
    mix: { chords: 0.9, lead: 0.8, bass: 1.0, drums: 0.9 },
    reverb: { size: 2.2, wet: 0.22, send: { drums: 0.08, bass: 0 } },
    delay: { beats: 0.75, feedback: 0.3, send: { lead: 0.28 } },
    tone: 4200,
    wobble: 7,
    vinyl: 0.6,
    gain: 0.27,
  },
  {
    id: 'malabar_monsoon',
    name: 'Malabar Monsoon',
    style: 'Raag Megh · bansuri & tanpura',
    use: 'sleep',
    bpm: 54,
    swing: 0,
    progression: [ch(38, [50, 57, 62], 4)],
    comp: { inst: 'pad', pattern: 'swell', vel: 0.5, roll: 0.4, opts: { warm: true, cutoff: 700, attack: 4, release: 5 } },
    drone: { type: 'tanpura', root: 50 },
    lead: {
      inst: 'flute',
      root: 62,
      scale: SCALES.megh,
      low: 62,
      high: 81,
      vel: 0.75,
      density: 0.95,
      rest: 0.35,
      repeat: 0.35,
      legato: 1.0,
      rhythms: [
        [[0, 10], [12, 4], [16, 14]],
        [[2, 6], [8, 8], [20, 12]],
        [[0, 4], [4, 4], [8, 12], [24, 8]],
        [[0, 14], [16, 6], [24, 8]],
      ],
    },
    form: [
      { bars: 16, parts: ['drone', 'chords', 'lead'] },
      { bars: 8, parts: ['drone', 'chords'] },
    ],
    mix: { chords: 0.8, lead: 0.85, drone: 0.9 },
    reverb: { size: 3.8, wet: 0.35, send: { drone: 0.25 } },
    delay: { beats: 1.5, feedback: 0.25, send: { lead: 0.16 } },
    tone: 5000,
    wobble: 3,
    vinyl: 0,
    gain: 0.74,
  },
  {
    id: 'cedar_fog',
    name: 'Cedar Fog Trio',
    style: 'Swing guitar trio · vibes & brushes',
    use: 'study',
    bpm: 72,
    swing: 0.66,
    swingUnit: 8,
    progression: [
      ch(41, [56, 60, 63, 67]), // Fm9
      ch(46, [56, 60, 62, 67]), // Bb13
      ch(39, [55, 58, 62, 65]), // Ebmaj9
      ch(36, [55, 58, 62, 63]), // Cm9
      ch(44, [55, 60, 63, 70]), // Abmaj9
      ch(37, [53, 59, 63, 68]), // Db13
      ch(43, [53, 58, 62, 65]), // Gm7
      ch(36, [52, 58, 61, 67]), // C7b9
    ],
    comp: { inst: 'eguitar', pattern: 'jazz', vel: 0.6, roll: 0.014, opts: { pan: -0.15 } },
    bass: { inst: 'upright', pattern: 'walk' },
    drums: { kit: 'jazz' },
    lead: {
      inst: 'vibes',
      root: 63,
      scale: SCALES.major,
      low: 67,
      high: 84,
      vel: 0.8,
      density: 0.85,
      rest: 0.2,
      repeat: 0.45,
      opts: { pan: 0.12 },
      rhythms: [
        [[0, 2], [2, 2], [4, 4], [10, 2], [12, 4], [20, 2], [22, 2], [24, 6]],
        [[2, 2], [6, 2], [8, 4], [14, 2], [16, 6], [26, 2], [28, 4]],
        [[0, 6], [6, 2], [8, 2], [10, 6], [18, 2], [20, 2], [22, 10]],
      ],
    },
    form: [
      { bars: 8, parts: ['chords', 'bass', 'drumsLight'] },
      { bars: 16, parts: ['chords', 'bass', 'drums', 'lead'] },
      { bars: 8, parts: ['chords', 'bass', 'drums'] },
    ],
    mix: { chords: 0.85, lead: 0.95, bass: 1.0, drums: 0.8 },
    reverb: { size: 1.5, wet: 0.18, send: { bass: 0.05, drums: 0.12 } },
    tone: 3800,
    wobble: 9,
    vinyl: 0.25,
    gain: 0.48,
  },
  {
    id: 'himalayan_clouds',
    name: 'Himalayan Cloud Harp',
    style: 'Raag Bhupali · harp & singing bowls',
    use: 'sleep',
    bpm: 50,
    swing: 0,
    progression: [
      ch(36, [55, 60, 62, 64, 69], 2), // C6/9
      ch(33, [55, 60, 62, 64], 2), // Am11
      ch(31, [55, 60, 62, 64, 69], 2), // G6sus
      ch(40, [55, 60, 62, 67], 2), // C/E
    ],
    comp: { inst: 'harp', pattern: 'harp', vel: 0.55 },
    bass: { inst: 'sub', pattern: 'long' },
    drone: { type: 'bowl', notes: [60, 55, 57, 55] },
    lead: {
      inst: 'ocarina',
      root: 60,
      scale: SCALES.bhupali,
      low: 67,
      high: 84,
      vel: 0.5,
      density: 0.75,
      rest: 0.4,
      repeat: 0.5,
      rhythms: [
        [[0, 8], [12, 4], [20, 12]],
        [[4, 6], [10, 6], [24, 8]],
        [[0, 12], [16, 16]],
      ],
    },
    form: [
      { bars: 8, parts: ['chords', 'drone'] },
      { bars: 16, parts: ['chords', 'drone', 'lead', 'bass'] },
    ],
    mix: { chords: 0.9, lead: 0.7, bass: 0.5, drone: 0.8 },
    reverb: { size: 5, wet: 0.45 },
    delay: { beats: 1, feedback: 0.35, send: { lead: 0.2, chords: 0.08 } },
    tone: 5200,
    wobble: 2,
    vinyl: 0,
    gain: 0.9,
  },
  {
    id: 'midnight_vinyl',
    name: 'Midnight Vinyl',
    style: 'Dark jazz guitar & vibraphone · slow',
    use: 'study',
    bpm: 62,
    swing: 0.22,
    swingUnit: 16,
    progression: [
      ch(45, [55, 59, 60, 64]), // Am9
      ch(38, [53, 57, 60, 64]), // Dm9
      ch(43, [53, 57, 59, 64]), // G13
      ch(36, [52, 55, 59, 64]), // Cmaj7
      ch(41, [52, 57, 59, 64]), // Fmaj7#11
      ch(40, [50, 56, 59, 65]), // E7b9
      ch(45, [55, 59, 60, 64]), // Am9
      ch(40, [50, 57, 59, 62]), // E7sus
    ],
    comp: { inst: 'eguitar', pattern: 'lofi', vel: 0.6, roll: 0.035 },
    bass: { inst: 'upright', pattern: 'lofi' },
    drums: { kit: 'rimbap' },
    lead: {
      inst: 'vibes',
      root: 69,
      scale: SCALES.aeolian,
      low: 67,
      high: 86,
      vel: 0.75,
      density: 0.8,
      rest: 0.3,
      repeat: 0.5,
      rhythms: [
        [[0, 4], [6, 2], [8, 8], [20, 4], [26, 6]],
        [[3, 3], [6, 6], [16, 4], [22, 2], [24, 8]],
        [[0, 2], [2, 2], [4, 8], [18, 2], [20, 12]],
      ],
    },
    form: [
      { bars: 4, parts: ['chords', 'bass'] },
      { bars: 8, parts: ['chords', 'bass', 'drums', 'lead'] },
      { bars: 8, parts: ['chords', 'bass', 'drums'] },
      { bars: 8, parts: ['chords', 'bass', 'drums', 'lead'] },
    ],
    mix: { chords: 0.95, lead: 0.8, bass: 1.0, drums: 0.85 },
    reverb: { size: 1.8, wet: 0.2, send: { drums: 0.06, bass: 0 } },
    delay: { beats: 0.5, feedback: 0.28, send: { lead: 0.22 } },
    tone: 2600,
    wobble: 10,
    vinyl: 1.0,
    gain: 0.41,
  },
  {
    id: 'starlight_drift',
    name: 'Starlight Drift',
    style: 'Beatless ambient · music box',
    use: 'sleep',
    bpm: 46,
    swing: 0,
    progression: [
      ch(40, [56, 59, 63, 66], 2), // Emaj9
      ch(37, [52, 56, 59, 63], 2), // C#m9
      ch(33, [56, 59, 63, 64], 2), // Amaj7#11
      ch(35, [52, 56, 59, 61], 2), // B6sus
    ],
    comp: { inst: 'pad', pattern: 'swell', vel: 0.75, roll: 0.25, opts: { warm: true, cutoff: 820, attack: 3.2, release: 4.5 } },
    bass: { inst: 'sub', pattern: 'long' },
    lead: {
      inst: 'musicbox',
      root: 64,
      scale: SCALES.lydian,
      low: 71,
      high: 88,
      vel: 0.6,
      density: 0.7,
      rest: 0.45,
      repeat: 0.55,
      rhythms: [
        [[0, 6], [8, 8], [20, 12]],
        [[4, 4], [12, 8], [28, 4]],
        [[0, 16], [18, 6], [24, 8]],
      ],
    },
    form: [
      { bars: 8, parts: ['chords', 'bass'] },
      { bars: 16, parts: ['chords', 'bass', 'lead'] },
    ],
    mix: { chords: 1.0, lead: 0.7, bass: 0.45 },
    reverb: { size: 6.5, wet: 0.55, send: { bass: 0.1 } },
    delay: { beats: 1.5, feedback: 0.4, send: { lead: 0.3 } },
    tone: 2800,
    wobble: 3,
    vinyl: 0,
    gain: 0.45,
  },
  {
    id: 'rio_bossa',
    name: 'Rio Twilight Bossa',
    style: 'Bossa nova · nylon guitar & flute',
    use: 'study',
    bpm: 64,
    swing: 0.08,
    swingUnit: 16,
    progression: [
      ch(41, [52, 57, 60, 64]), // Fmaj7
      ch(43, [53, 57, 58, 62]), // Gm9
      ch(36, [52, 55, 58, 62]), // C9
      ch(41, [52, 57, 60, 64]), // Fmaj7
      ch(46, [53, 57, 62, 64]), // Bbmaj9#11
      ch(40, [50, 55, 58, 62]), // Em7b5
      ch(45, [49, 55, 58, 61]), // A7b9
      ch(38, [52, 53, 57, 60]), // Dm9
    ],
    comp: { inst: 'guitar', pattern: 'bossa', vel: 0.7, roll: 0.012 },
    bass: { inst: 'upright', pattern: 'bossa' },
    drums: { kit: 'bossa' },
    lead: {
      inst: 'flute',
      root: 62,
      scale: SCALES.dorian,
      low: 65,
      high: 84,
      vel: 0.7,
      density: 0.85,
      rest: 0.3,
      repeat: 0.5,
      legato: 0.9,
      opts: { pan: 0.2 },
      rhythms: [
        [[0, 6], [6, 2], [8, 4], [14, 2], [16, 8], [26, 6]],
        [[2, 4], [6, 4], [10, 6], [18, 2], [20, 4], [24, 8]],
        [[0, 3], [3, 3], [6, 10], [22, 2], [24, 8]],
      ],
    },
    form: [
      { bars: 4, parts: ['chords', 'drumsLight'] },
      { bars: 8, parts: ['chords', 'bass', 'drums', 'lead'] },
      { bars: 8, parts: ['chords', 'bass', 'drums'] },
      { bars: 8, parts: ['chords', 'bass', 'drums', 'lead'] },
    ],
    mix: { chords: 0.95, lead: 0.75, bass: 0.95, drums: 0.8 },
    reverb: { size: 1.3, wet: 0.16, send: { bass: 0, drums: 0.08 } },
    tone: 5200,
    wobble: 4,
    vinyl: 0.15,
    gain: 0.84,
  },
  {
    id: 'seoul_cafe',
    name: 'Seoul Rainy Café',
    style: 'Neo-soul · clean guitar & kalimba',
    use: 'study',
    bpm: 70,
    swing: 0.2,
    swingUnit: 16,
    progression: [
      ch(37, [53, 56, 60, 63]), // Dbmaj9
      ch(36, [51, 55, 58, 62]), // Cm9
      ch(34, [53, 56, 60, 61]), // Bbm9
      ch(39, [54, 58, 61, 65]), // Ebm9
      ch(42, [53, 58, 61, 65]), // Gbmaj9
      ch(41, [56, 60, 63, 67]), // Fm9
      ch(34, [53, 56, 60, 61]), // Bbm9
      ch(44, [54, 58, 61, 65]), // Ab13sus
    ],
    comp: { inst: 'eguitar', pattern: 'neosoul', vel: 0.62, roll: 0.022 },
    bass: { inst: 'sub', pattern: 'neosoul' },
    drums: { kit: 'neosoul' },
    lead: {
      inst: 'kalimba',
      root: 61,
      scale: SCALES.majPent,
      low: 68,
      high: 87,
      vel: 0.8,
      density: 0.85,
      rest: 0.25,
      repeat: 0.5,
      rhythms: [
        [[0, 2], [3, 2], [6, 2], [8, 4], [16, 2], [19, 2], [22, 4], [28, 4]],
        [[2, 2], [4, 2], [7, 3], [12, 4], [18, 2], [20, 2], [24, 8]],
        [[0, 4], [6, 2], [10, 2], [12, 4], [22, 2], [26, 6]],
      ],
    },
    form: [
      { bars: 4, parts: ['chords', 'lead'] },
      { bars: 8, parts: ['chords', 'bass', 'drums', 'lead'] },
      { bars: 8, parts: ['chords', 'bass', 'drumsLight'] },
      { bars: 8, parts: ['chords', 'bass', 'drums', 'lead'] },
    ],
    mix: { chords: 0.9, lead: 0.75, bass: 1.0, drums: 0.9 },
    reverb: { size: 1.9, wet: 0.22, send: { bass: 0, drums: 0.07 } },
    delay: { beats: 0.75, feedback: 0.32, send: { lead: 0.25 } },
    tone: 4600,
    wobble: 6,
    vinyl: 0.3,
    gain: 0.29,
  },
  {
    id: 'nordic_aurora',
    name: 'Nordic Aurora',
    style: 'Chillwave · pulsing pads & arps',
    use: 'study',
    bpm: 76,
    swing: 0,
    progression: [
      ch(45, [57, 60, 64, 71], 2), // Am(add9)
      ch(41, [57, 60, 64, 65], 2), // Fmaj7
      ch(48, [55, 60, 64, 67], 2), // C
      ch(43, [55, 59, 62, 64], 2), // G6
    ],
    comp: { inst: 'pad', pattern: 'swell', vel: 0.75, roll: 0.05, opts: { cutoff: 1500, attack: 0.6, release: 1.8 } },
    pump: true,
    arp: { inst: 'synthPluck', vel: 0.7 },
    bass: { inst: 'sub', pattern: 'pulse' },
    drums: { kit: 'halftime' },
    form: [
      { bars: 4, parts: ['chords', 'arp'] },
      { bars: 8, parts: ['chords', 'arp', 'bass', 'drums'] },
      { bars: 8, parts: ['chords', 'bass', 'drumsLight'] },
      { bars: 8, parts: ['chords', 'arp', 'bass', 'drums'] },
    ],
    mix: { chords: 0.8, arp: 0.7, bass: 0.9, drums: 0.85 },
    reverb: { size: 3.2, wet: 0.3, send: { bass: 0, drums: 0.2, arp: 0.3 } },
    delay: { beats: 0.75, feedback: 0.45, send: { arp: 0.4 } },
    tone: 5600,
    wobble: 2,
    vinyl: 0,
    gain: 0.42,
  },
  {
    id: 'banaras_dawn',
    name: 'Banaras Dawn',
    style: 'Raag Bhairav · sitar & tabla',
    use: 'study',
    bpm: 60,
    swing: 0.05,
    swingUnit: 16,
    progression: [ch(36, [48, 55], 4)],
    drone: { type: 'tanpura', root: 48 },
    tabla: { tonic: 60 },
    lead: {
      inst: 'sitar',
      root: 60,
      scale: SCALES.bhairav,
      low: 60,
      high: 79,
      vel: 0.8,
      density: 0.9,
      rest: 0.2,
      repeat: 0.45,
      rhythms: [
        [[0, 4], [4, 2], [6, 2], [8, 8], [18, 2], [20, 4], [24, 8]],
        [[0, 6], [6, 2], [8, 2], [10, 6], [16, 4], [22, 2], [24, 8]],
        [[2, 2], [4, 4], [8, 4], [12, 4], [16, 12]],
      ],
    },
    form: [
      { bars: 8, parts: ['drone', 'lead'] },
      { bars: 16, parts: ['drone', 'lead', 'tabla'] },
      { bars: 4, parts: ['drone', 'tabla'] },
    ],
    mix: { lead: 0.85, drone: 0.9, tabla: 0.9 },
    reverb: { size: 2.6, wet: 0.26, send: { tabla: 0.12 } },
    delay: { beats: 0.5, feedback: 0.2, send: { lead: 0.12 } },
    tone: 5600,
    wobble: 3,
    vinyl: 0.1,
    gain: 1.7,
  },
  {
    id: 'cassette_night',
    name: 'Cassette Night',
    style: 'Late-night lo-fi · clean electric guitar',
    use: 'study',
    bpm: 60,
    swing: 0.26,
    swingUnit: 16,
    progression: [
      ch(40, [54, 55, 59, 62]), // Em9
      ch(36, [52, 55, 59, 62]), // Cmaj9
      ch(45, [55, 59, 60, 64]), // Am9
      ch(47, [52, 54, 57, 62]), // Bm11
      ch(43, [54, 57, 59, 62]), // Gmaj9
      ch(42, [52, 57, 60, 64]), // F#m7b5(11)
      ch(36, [52, 55, 59, 62]), // Cmaj9
      ch(47, [52, 54, 57, 61]), // B7sus(9)
    ],
    comp: { inst: 'pad', pattern: 'swell', vel: 0.7, roll: 0.08, opts: { warm: true, cutoff: 900, attack: 1.2, release: 2.2 } },
    bass: { inst: 'sub', pattern: 'lofi' },
    drums: { kit: 'boombap' },
    lead: {
      inst: 'eguitar',
      root: 64,
      scale: SCALES.aeolian,
      low: 62,
      high: 81,
      vel: 0.85,
      density: 0.85,
      rest: 0.2,
      repeat: 0.55,
      legato: 1.0,
      opts: { pan: 0.2 },
      rhythms: [
        [[0, 6], [6, 2], [8, 8], [18, 2], [20, 4], [24, 8]],
        [[2, 4], [6, 6], [14, 2], [16, 10], [28, 4]],
        [[0, 3], [3, 3], [6, 10], [20, 2], [22, 10]],
        [[4, 4], [8, 4], [12, 12], [26, 6]],
      ],
    },
    form: [
      { bars: 4, parts: ['chords', 'bass'] },
      { bars: 8, parts: ['chords', 'bass', 'drums', 'lead'] },
      { bars: 8, parts: ['chords', 'bass', 'drumsLight', 'lead'] },
      { bars: 8, parts: ['chords', 'bass', 'drums', 'lead'] },
      { bars: 4, parts: ['chords', 'bass', 'lead'] },
    ],
    mix: { chords: 0.75, lead: 1.0, bass: 1.15, drums: 0.8 },
    reverb: { size: 2.8, wet: 0.28, send: { bass: 0, drums: 0.08, lead: 0.32 } },
    delay: { beats: 0.75, feedback: 0.35, send: { lead: 0.3 } },
    tone: 3000,
    wobble: 16,
    vinyl: 0,
    hiss: 0.5,
    gain: 0.3,
  },
  {
    id: 'rainy_rhodes',
    name: 'Rainy Window',
    style: 'Lo-fi hip-hop · jazzy guitar & rain',
    use: 'study',
    bpm: 80,
    swing: 0.28,
    swingUnit: 16,
    progression: [
      ch(36, [51, 55, 58, 62]), // Cm9
      ch(41, [51, 55, 57, 62]), // F13
      ch(46, [57, 60, 62, 65]), // Bbmaj9
      ch(43, [53, 57, 58, 62]), // Gm9
      ch(39, [55, 58, 62, 65]), // Ebmaj9
      ch(44, [54, 58, 60, 65]), // Ab13
      ch(38, [53, 57, 60, 64]), // Dm9
      ch(43, [53, 56, 59, 62]), // G7b9
    ],
    comp: { inst: 'eguitar', pattern: 'lofi', vel: 0.66, roll: 0.03 },
    bass: { inst: 'sub', pattern: 'lofi' },
    drums: { kit: 'boombap' },
    lead: {
      inst: 'guitar',
      root: 70,
      scale: SCALES.major,
      low: 65,
      high: 84,
      vel: 0.7,
      density: 0.8,
      rest: 0.4,
      repeat: 0.5,
      opts: { pan: 0.15 },
      rhythms: [
        [[0, 4], [6, 2], [8, 6], [20, 2], [22, 2], [24, 8]],
        [[2, 2], [4, 6], [12, 4], [18, 4], [26, 6]],
        [[0, 6], [10, 2], [12, 4], [22, 10]],
      ],
    },
    form: [
      { bars: 4, parts: ['chords'] },
      { bars: 8, parts: ['chords', 'bass', 'drums'] },
      { bars: 8, parts: ['chords', 'bass', 'drums', 'lead'] },
      { bars: 8, parts: ['chords', 'bass', 'drumsLight', 'lead'] },
      { bars: 8, parts: ['chords', 'bass', 'drums'] },
    ],
    mix: { chords: 1.0, lead: 0.7, bass: 1.0, drums: 0.85 },
    reverb: { size: 2.0, wet: 0.2, send: { bass: 0, drums: 0.07 } },
    delay: { beats: 0.75, feedback: 0.25, send: { lead: 0.22 } },
    tone: 3600,
    wobble: 6,
    vinyl: 0.55,
    rain: 1.0,
    gain: 0.26,
  },
];
