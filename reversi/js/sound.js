/**
 * 効果音。音声ファイルは使わず、Web Audio API で音を合成する。
 * ブラウザの自動再生制限があるため、AudioContext は最初のユーザー操作時に作る（unlock）。
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
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(o.volume || 0.2, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + duration + 0.03);
  }

  root.ReversiSound = {
    setEnabled(value) {
      enabled = !!value;
    },
    unlock() {
      audio();
    },
    place() {
      tone(190, 0.12, { type: 'triangle', volume: 0.4, slide: 90 });
      tone(1100, 0.025, { type: 'square', volume: 0.04 });
    },
    flip(delayMs) {
      tone(560, 0.06, { type: 'triangle', volume: 0.12, slide: 380, delay: delayMs });
    },
    pass() {
      tone(440, 0.12, { volume: 0.15 });
      tone(330, 0.2, { volume: 0.15, delay: 140 });
    },
    undo() {
      tone(620, 0.09, { volume: 0.12, slide: 400 });
    },
    start() {
      tone(523, 0.1, { type: 'triangle', volume: 0.15 });
      tone(784, 0.14, { type: 'triangle', volume: 0.15, delay: 90 });
    },
    win() {
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(f, 0.2, { type: 'triangle', volume: 0.18, delay: i * 110 })
      );
    },
    lose() {
      [392, 330, 262].forEach((f, i) =>
        tone(f, 0.28, { type: 'triangle', volume: 0.16, delay: i * 170 })
      );
    },
    draw() {
      tone(440, 0.18, { type: 'triangle', volume: 0.15 });
      tone(440, 0.18, { type: 'triangle', volume: 0.15, delay: 220 });
    },
  };
})(window);
