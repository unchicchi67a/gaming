/**
 * マイク入力。音量（RMS）を毎フレーム求めて、登録された関数に渡す。
 *
 * 息の「ふーっ」は雑音として消されやすいため、ブラウザのノイズ抑制・エコー除去・
 * 自動音量調整はすべて切ってマイクを開く。
 * マイクは HTTPS か localhost（ブラウザによっては file:// も）でしか使えない。
 *
 * スマートフォンでは、マイクを開いているあいだ音の出力が通話用に切りかわり、
 * 読み上げや効果音の音質が落ちる（ガサガサした声になる）。
 * そのため main.js は、「ふーっ」を待つあいだだけ start() し、それ以外は stop() する。
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
  let generation = 0; // stop() のたびに増やす。開いている途中で stop() されたら、開いたマイクをすぐ閉じる

  function supported() {
    return !!(root.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      (root.AudioContext || root.webkitAudioContext));
  }

  function loop() {
    rafId = root.requestAnimationFrame(loop);
    if (!analyser) return;
    let sum = 0;
    if (buffer instanceof Float32Array) {
      // 小さい音も細かく測れるよう、使えるときは小数の波形を使う
      analyser.getFloatTimeDomainData(buffer);
      for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    } else {
      analyser.getByteTimeDomainData(buffer);
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
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
      if (!ctx || ctx.state === 'closed') ctx = new Ctor();
      // iOS では、ほかの音やマイクの切りかえで 'interrupted' になることがある
      if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume();
    } catch (e) {
      return Promise.resolve(false);
    }
    const gen = generation;
    starting = navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    }).then((s) => {
      if (gen !== generation) {
        // 許可は取れたが、もう要らなくなった
        s.getTracks().forEach((t) => t.stop());
        return true;
      }
      stream = s;
      const source = ctx.createMediaStreamSource(s);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0;
      buffer = typeof analyser.getFloatTimeDomainData === 'function'
        ? new Float32Array(analyser.fftSize)
        : new Uint8Array(analyser.fftSize);
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
    generation++;
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
