/**
 * マイク入力。音量（RMS）を毎フレーム求めて、登録された関数に渡す。
 *
 * 息の「ふーっ」は雑音として消されやすいため、ブラウザのノイズ抑制・エコー除去・
 * 自動音量調整はすべて切ってマイクを開く。
 * マイクは HTTPS か localhost（ブラウザによっては file:// も）でしか使えない。
 */
(function (root) {
  'use strict';

  let stream = null;
  let ctx = null;
  let analyser = null;
  let buffer = null;
  let rafId = 0;
  let listener = null;
  let starting = null;

  function supported() {
    return !!(root.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      (root.AudioContext || root.webkitAudioContext));
  }

  function loop() {
    rafId = root.requestAnimationFrame(loop);
    if (!analyser) return;
    analyser.getByteTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      const v = (buffer[i] - 128) / 128;
      sum += v * v;
    }
    const level = Math.sqrt(sum / buffer.length);
    if (listener) listener(level, root.performance.now());
  }

  /** マイクを開く。成功すると true、使えない・許可されないと false。 */
  function start() {
    if (stream) return Promise.resolve(true);
    if (!supported()) return Promise.resolve(false);
    if (starting) return starting;
    // AudioContext はユーザー操作の中で作る必要があるため、getUserMedia より先に作る
    const Ctor = root.AudioContext || root.webkitAudioContext;
    try {
      ctx = ctx || new Ctor();
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {
      return Promise.resolve(false);
    }
    starting = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    }).then((s) => {
      stream = s;
      const source = ctx.createMediaStreamSource(s);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      buffer = new Uint8Array(analyser.fftSize);
      source.connect(analyser);
      cancelAnimationFrame(rafId);
      loop();
      return true;
    }).catch(() => false).finally(() => {
      starting = null;
    });
    return starting;
  }

  function stop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    analyser = null;
  }

  root.PigsMic = {
    supported,
    start,
    stop,
    get active() { return !!stream; },
    /** 音量を受け取る関数を登録する。fn(level, timeMs) */
    onLevel(fn) { listener = fn; },
  };
})(typeof self !== 'undefined' ? self : this);
