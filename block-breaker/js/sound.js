/**
 * 効果音。音声ファイルは使わず、Web Audio API で音を合成する。
 * ブラウザの自動再生制限があるため、AudioContext は最初に音を鳴らすとき（ユーザー操作のあと）に作る。
 */
(function (root) {
  'use strict';

  let ctx = null;
  let enabled = true;

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
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(o.volume || 0.08, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  // かたさごとの音の高さ（かたいほど低い）
  const HIT_NOTES = [0, 988, 880, 784, 698, 622];

  root.BlockSound = {
    setEnabled(on) {
      enabled = !!on;
    },
    /** ユーザー操作の中で呼んで、音を鳴らせる状態にしておく。 */
    unlock() {
      audio();
    },
    launch() {
      tone(520, 0.12, { slide: 880, type: 'triangle', volume: 0.12 });
    },
    paddle() {
      tone(330, 0.07, { type: 'triangle', volume: 0.16 });
    },
    wall() {
      tone(220, 0.04, { type: 'triangle', volume: 0.08 });
    },
    hit(hp) {
      tone(HIT_NOTES[hp] || 660, 0.06, { volume: 0.06 });
    },
    steel() {
      tone(1760, 0.08, { type: 'sine', volume: 0.08 });
      tone(2637, 0.06, { type: 'sine', volume: 0.04, delay: 10 });
    },
    brk(maxHp) {
      const base = 1046 + (maxHp - 1) * 120;
      tone(base, 0.08, { volume: 0.07 });
      tone(base * 1.5, 0.1, { volume: 0.05, delay: 40 });
    },
    lost() {
      tone(392, 0.45, { slide: 98, type: 'sawtooth', volume: 0.08 });
    },
    clear() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, { type: 'triangle', volume: 0.14, delay: i * 110 }));
    },
    over() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.26, { type: 'triangle', volume: 0.12, delay: i * 180 }));
    },
  };
})(typeof self !== 'undefined' ? self : this);
