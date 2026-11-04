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

  function noise(c) {
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    return src;
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

  /** 雑音を使う音（風・水・がさがさ）。opts: filter, freq, freqTo, q, volume, delay(ms), attack */
  function hiss(duration, opts) {
    const o = opts || {};
    const c = audio();
    if (!c) return;
    const t = c.currentTime + (o.delay || 0) / 1000;
    const src = noise(c);
    const filter = c.createBiquadFilter();
    filter.type = o.filter || 'bandpass';
    filter.frequency.setValueAtTime(o.freq || 800, t);
    if (o.freqTo) filter.frequency.exponentialRampToValueAtTime(o.freqTo, t + duration);
    filter.Q.value = o.q || 1;
    const gain = c.createGain();
    const attack = o.attack || 0.01;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(o.volume || 0.3, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t, Math.random());
    src.stop(t + duration + 0.05);
  }

  const Sound = {
    unlock() { audio(); },
    setEnabled(v) { enabled = !!v; },
    get enabled() { return enabled; },

    tap() { tone(660, 0.12, { slide: 990, volume: 0.15 }); },
    sparkle() {
      [1320, 1760, 2093].forEach((f, i) => tone(f, 0.18, { delay: i * 60, volume: 0.07, type: 'triangle' }));
    },
    place(house) {
      if (house === 'straw') {
        hiss(0.22, { freq: 3000, q: 0.7, volume: 0.22 });
        tone(520, 0.12, { type: 'triangle', volume: 0.1, delay: 30 });
      } else if (house === 'wood') {
        tone(330, 0.09, { type: 'square', volume: 0.09 });
        tone(300, 0.09, { type: 'square', volume: 0.09, delay: 120 });
        hiss(0.05, { freq: 2000, volume: 0.12 });
      } else {
        tone(110, 0.2, { type: 'sine', volume: 0.35, slide: 70 });
        hiss(0.08, { freq: 1200, q: 2, volume: 0.15 });
      }
    },
    built() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, { delay: i * 110, type: 'triangle', volume: 0.16 }));
    },
    step() { tone(180, 0.06, { type: 'triangle', volume: 0.08 }); },
    wolfIn() {
      tone(196, 0.3, { type: 'sawtooth', volume: 0.06 });
      tone(185, 0.4, { type: 'sawtooth', volume: 0.06, delay: 320 });
    },
    inhale() { hiss(0.35, { freq: 600, freqTo: 2400, q: 1.2, volume: 0.12, attack: 0.25 }); },
    whoosh() { hiss(1.0, { freq: 1800, freqTo: 300, q: 0.8, volume: 0.45, attack: 0.08 }); },
    wobble() {
      tone(140, 0.5, { type: 'triangle', volume: 0.18, slide: 120 });
      tone(160, 0.4, { type: 'triangle', volume: 0.12, delay: 150, slide: 130 });
    },
    crash() {
      hiss(0.9, { freq: 900, freqTo: 200, q: 0.6, volume: 0.4 });
      tone(400, 0.6, { slide: 90, type: 'triangle', volume: 0.15 });
    },
    boing() { tone(220, 0.35, { slide: 440, type: 'triangle', volume: 0.18 }); },
    run() {
      for (let i = 0; i < 6; i++) tone(i % 2 ? 300 : 250, 0.05, { delay: i * 90, type: 'triangle', volume: 0.08 });
    },
    tired() { tone(330, 0.6, { slide: 160, type: 'sine', volume: 0.15 }); },
    climb() {
      for (let i = 0; i < 5; i++) tone(400 + i * 80, 0.07, { delay: i * 150, type: 'square', volume: 0.05 });
    },
    pour() {
      hiss(0.7, { freq: 700, freqTo: 1400, q: 3, volume: 0.25, attack: 0.06 });
      for (let i = 0; i < 5; i++) tone(500 + Math.random() * 500, 0.06, { delay: 80 + i * 110, volume: 0.06 });
    },
    boil() {
      for (let i = 0; i < 12; i++) tone(300 + Math.random() * 400, 0.06, { delay: i * 90, slide: 900, volume: 0.06 });
      hiss(1.2, { freq: 4000, q: 0.5, volume: 0.06, attack: 0.3 });
    },
    slide() { tone(1400, 1.0, { slide: 250, type: 'sine', volume: 0.12 }); },
    splash() {
      hiss(0.5, { freq: 1800, freqTo: 500, q: 0.7, volume: 0.45 });
      tone(180, 0.25, { slide: 80, volume: 0.25 });
    },
    hot() {
      for (let i = 0; i < 4; i++) tone(880, 0.08, { delay: i * 130, slide: 1320, type: 'square', volume: 0.05 });
    },
    happy() {
      const notes = [523, 659, 784, 659, 784, 1047];
      notes.forEach((f, i) => tone(f, 0.22, { delay: i * 150, type: 'triangle', volume: 0.15 }));
    },
    fanfare() {
      const notes = [[523, 0], [659, 120], [784, 240], [1047, 360], [784, 560], [1047, 680]];
      notes.forEach(([f, d]) => tone(f, d === 680 ? 0.6 : 0.2, { delay: d, type: 'triangle', volume: 0.17 }));
    },
  };

  root.PigsSound = Sound;
})(typeof self !== 'undefined' ? self : this);
