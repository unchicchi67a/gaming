/**
 * 効果音。音声ファイルは使わず、Web Audio API で音を合成する。
 * ブラウザの自動再生制限があるため、AudioContext は最初に音を鳴らすとき（ユーザー操作のあと）に作る。
 */
(function (root) {
  'use strict';

  let ctx = null;
  let enabled = true;
  let noiseBuffer = null;

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
    gain.gain.exponentialRampToValueAtTime(o.volume || 0.1, t + (o.attack || 0.006));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  /** ノイズ（シャーッ、ぽふ などに使う）。 */
  function noise(duration, opts) {
    const o = opts || {};
    const c = audio();
    if (!c) return;
    if (!noiseBuffer) {
      noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const t = c.currentTime + (o.delay || 0) / 1000;
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const filter = c.createBiquadFilter();
    filter.type = o.filter || 'bandpass';
    filter.frequency.setValueAtTime(o.freq || 1000, t);
    if (o.slide) filter.frequency.exponentialRampToValueAtTime(o.slide, t + duration);
    filter.Q.value = o.q || 1;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(o.volume || 0.1, t + (o.attack || 0.01));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t);
    src.stop(t + duration + 0.03);
  }

  root.KotatsuSound = {
    setEnabled(on) {
      enabled = !!on;
    },
    /** ユーザー操作の中で呼んで、音を鳴らせる状態にしておく。 */
    unlock() {
      audio();
    },
    /** ふとんを押す「ぽふっ」。 */
    push() {
      noise(0.12, { filter: 'lowpass', freq: 700, slide: 200, volume: 0.25 });
      tone(160, 0.1, { slide: 90, type: 'triangle', volume: 0.12 });
    },
    /** ちいさく「にゃ」。 */
    mew() {
      tone(620, 0.09, { slide: 880, volume: 0.06 });
      tone(880, 0.22, { slide: 520, volume: 0.06, delay: 80 });
    },
    /** 怒りの「シャーッ」。 */
    hiss() {
      noise(0.55, { freq: 3800, q: 0.8, volume: 0.22, attack: 0.03 });
    },
    treat() {
      tone(520, 0.08, { slide: 780, type: 'triangle', volume: 0.12 });
      tone(780, 0.14, { slide: 1170, type: 'triangle', volume: 0.1, delay: 90 });
    },
    escape() {
      tone(440, 0.28, { slide: 220, type: 'triangle', volume: 0.1 });
    },
    back() {
      tone(330, 0.16, { slide: 520, type: 'triangle', volume: 0.09 });
    },
    doorbell() {
      tone(988, 0.55, { type: 'sine', volume: 0.16 });
      tone(784, 0.9, { type: 'sine', volume: 0.16, delay: 420 });
    },
    fridge() {
      noise(0.08, { filter: 'highpass', freq: 2000, volume: 0.12 });
      tone(96, 1.4, { type: 'sawtooth', volume: 0.025, attack: 0.2, delay: 60 });
    },
    bird() {
      [0, 130, 300].forEach((d) => tone(3200, 0.07, { slide: 4200, volume: 0.05, delay: d }));
    },
    click() {
      tone(1400, 0.03, { type: 'square', volume: 0.03 });
    },
    hot() {
      noise(0.5, { freq: 900, slide: 2400, q: 2, volume: 0.06, attack: 0.15 });
    },
    clear() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, { type: 'triangle', volume: 0.12, delay: i * 130 }));
    },
    over() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.32, { type: 'triangle', volume: 0.11, delay: i * 200 }));
    },
  };
})(typeof self !== 'undefined' ? self : this);
