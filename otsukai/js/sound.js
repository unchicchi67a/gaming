/**
 * 効果音。音声ファイルは使わず、Web Audio API で音を合成する。
 * ブラウザの自動再生制限があるため、AudioContext は最初のユーザー操作時に作る（unlock）。
 */
(function (root) {
  'use strict';

  let ctx = null;
  let enabled = true;
  let noiseBuf = null;

  function audio() {
    if (!enabled) return null;
    if (!ctx) {
      const Ctor = root.AudioContext || root.webkitAudioContext;
      if (!Ctor) return null;
      try {
        ctx = new Ctor();
      } catch (e) {
        return null;
      }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  /** 音程のある音。opts: type, volume, delay(ms), slide(終わりの周波数) */
  function tone(freq, duration, opts) {
    const o = opts || {};
    const c = audio();
    if (!c) return;
    const t = c.currentTime + (o.delay || 0) / 1000;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(o.volume || 0.2, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  /** 雑音を使う音（ひゅっ という風の音）。 */
  function hiss(duration, opts) {
    const o = opts || {};
    const c = audio();
    if (!c) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime + (o.delay || 0) / 1000;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const filter = c.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(o.freq || 800, t);
    if (o.freqTo) filter.frequency.exponentialRampToValueAtTime(o.freqTo, t + duration);
    filter.Q.value = o.q || 1;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(o.volume || 0.2, t + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  /** 正解の音を上げていく音程（半音）。ドレミソラ…のように明るく上がる。 */
  const SCALE = [0, 2, 4, 7, 9, 12];

  // ------------------------------------------------------------ BGM

  /**
   * のんびりした BGM。オルゴールのような音を、先読みしながら少しずつ予約して鳴らす。
   * 1 小節 4 拍 × 8 小節をくり返す。null は休み。
   */
  const TEMPO = 96;
  const MELODY = [
    'E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', null,
    'D5', 'E5', 'G5', 'E5', 'D5', null, null, null,
    'E5', 'G5', 'A5', 'C6', 'A5', 'G5', 'E5', null,
    'D5', 'E5', 'D5', 'C5', 'C5', null, null, null,
    'A4', 'C5', 'D5', 'C5', 'A4', 'G4', 'A4', null,
    'C5', 'D5', 'E5', 'G5', 'E5', null, null, null,
    'E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', 'D5',
    'E5', 'D5', 'C5', null, 'C5', null, null, null,
  ];
  const BASS = ['C3', 'G3', 'F3', 'G3', 'C3', 'G3', 'A2', 'G3', 'F3', 'C3', 'A2', 'G3', 'C3', 'G3', 'F3', 'C3'];
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const hz = (n) => 440 * Math.pow(2, (NOTE[n[0]] + (Number(n.slice(1)) + 1) * 12 - 69) / 12);

  let musicOn = false;
  let musicTimer = 0;
  let nextTime = 0;
  let step = 0;

  function musicTick() {
    const c = audio();
    if (!c || !musicOn) return;
    const eighth = 60 / TEMPO / 2;
    while (nextTime < c.currentTime + 0.25) {
      const delay = Math.max(0, (nextTime - c.currentTime) * 1000);
      const m = MELODY[step % MELODY.length];
      if (m) {
        tone(hz(m), 0.5, { type: 'sine', volume: 0.045, delay });
        tone(hz(m) * 2, 0.25, { type: 'sine', volume: 0.012, delay });
      }
      if (step % 4 === 0) {
        const b = BASS[Math.floor(step / 4) % BASS.length];
        tone(hz(b), 0.7, { type: 'triangle', volume: 0.05, delay });
      }
      nextTime += eighth;
      step++;
    }
  }

  const Sound = {
    unlock() { audio(); },
    setEnabled(v) {
      enabled = !!v;
      if (!enabled) Sound.stopMusic();
    },
    /** BGM を流す（効果音が OFF のときは流さない）。 */
    startMusic() {
      const c = audio();
      if (!c || musicOn) return;
      musicOn = true;
      step = 0;
      nextTime = c.currentTime + 0.1;
      musicTick();
      musicTimer = setInterval(musicTick, 100);
    },
    stopMusic() {
      musicOn = false;
      clearInterval(musicTimer);
    },
    get musicPlaying() { return musicOn; },
    get enabled() { return enabled; },

    /** ボタンや品物をさわったとき。 */
    tap() { tone(700, 0.1, { slide: 1000, volume: 0.13 }); },
    /** お店の入り口のベル（お客さんが来た）。 */
    bell() {
      tone(1568, 0.5, { type: 'sine', volume: 0.12 });
      tone(1319, 0.7, { type: 'sine', volume: 0.12, delay: 160 });
    },
    /** 品物をわたす（ひゅーん）。 */
    give() {
      tone(500, 0.35, { slide: 1200, type: 'triangle', volume: 0.12 });
      hiss(0.3, { freq: 1500, freqTo: 4000, q: 1.5, volume: 0.08 });
    },
    /** ほしい品物だった。step（何人目か）が進むほど、音が少しずつ高くなる。 */
    correct(step) {
      const up = Math.pow(2, (SCALE[Math.min(step || 0, SCALE.length - 1)]) / 12);
      [784, 988, 1175, 1568].forEach((f, i) => tone(f * up, i === 3 ? 0.4 : 0.16, { delay: i * 70, type: 'triangle', volume: 0.14 }));
    },
    /** スタンプを押す（ぽんっ）。 */
    stamp() {
      tone(180, 0.18, { slide: 90, type: 'sine', volume: 0.35 });
      hiss(0.08, { freq: 2500, q: 0.8, volume: 0.12 });
      tone(1568, 0.25, { type: 'sine', volume: 0.06, delay: 60 });
    },
    /** シャッターが上がる・下りる（がらがら）。 */
    shutter() {
      for (let i = 0; i < 14; i++) {
        hiss(0.05, { freq: 900 + (i % 3) * 300, q: 4, volume: 0.1, delay: i * 50 });
        tone(140 + (i % 2) * 30, 0.04, { type: 'square', volume: 0.025, delay: i * 50 });
      }
    },
    /** ボタンをおしたときの「ぷにっ」。 */
    press() { tone(520, 0.08, { slide: 780, type: 'sine', volume: 0.12 }); },
    /** ちがう品物だった。失敗っぽく聞こえないよう、やわらかい「ぽよん」にする。 */
    wrong() {
      tone(330, 0.25, { slide: 260, type: 'sine', volume: 0.16 });
      tone(294, 0.3, { slide: 330, type: 'sine', volume: 0.12, delay: 200 });
    },
    /** お客さんが歩く。 */
    steps() {
      for (let i = 0; i < 5; i++) tone(i % 2 ? 260 : 220, 0.05, { delay: i * 140, type: 'triangle', volume: 0.07 });
    },
    sparkle() {
      [1320, 1760, 2093].forEach((f, i) => tone(f, 0.18, { delay: i * 60, volume: 0.07, type: 'triangle' }));
    },
    fanfare() {
      const notes = [[523, 0], [659, 120], [784, 240], [1047, 360], [784, 560], [1047, 680]];
      notes.forEach(([f, d]) => tone(f, d === 680 ? 0.6 : 0.2, { delay: d, type: 'triangle', volume: 0.17 }));
    },
  };

  root.ShopSound = Sound;
})(typeof self !== 'undefined' ? self : this);
