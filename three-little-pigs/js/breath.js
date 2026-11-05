/**
 * 「ふーっ」の判定。
 *
 * マイクの音量（RMS、0〜1）を一定間隔で受け取り、
 * まわりの雑音より十分大きい音が holdMs ミリ秒以上つづいたら「ふーっ」とみなす（声の「ふーっ」でもよい）。
 * まわりの雑音の大きさ（noise floor）は、静かなときの音量からゆっくり学習する。
 * 1 回判定したら cooldownMs のあいだと、音がいったん静かになるまでは次を判定しない。
 * マイクを開いた直後（音量がしばらく届かなかったあと、または reset() のあと）の warmupMs のあいだは、
 * 判定せずに雑音を急いで学習する。テレビがついている部屋などで、開いたとたんに判定しないようにするため。
 *
 * マイクそのものの扱いは js/mic.js にあり、ここは数値だけを扱う（Node.js でテストできる）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PigsBreath = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    /**
     * これより小さい音は、どんなに静かな部屋でも「ふーっ」にしない。
     * 自動音量調整を切ったスマートフォンのマイクでは息の音が小さく入るため、低めにしている。
     */
    minLevel: 0.03,
    /** 雑音の何倍の大きさなら「ふーっ」の候補にするか。 */
    ratio: 3,
    /** 候補の音がこの時間つづいたら「ふーっ」と判定する。 */
    holdMs: 120,
    /** 判定したあと、次を判定しない時間。 */
    cooldownMs: 900,
    /** 雑音の学習の速さ（0〜1）。 */
    adapt: 0.05,
    /** マイクを開いた直後に、雑音を急いで学習する時間と速さ。 */
    warmupMs: 250,
    warmupAdapt: 0.3,
    /** 音量がこの時間届かなかったら、マイクを開き直したとみなす。 */
    gapMs: 500,
    initialFloor: 0.01,
    /** 雑音として学習する上限。うるさい部屋でも、判定に必要な音量は minLevel 以上 maxFloor × ratio 以下になる。 */
    maxFloor: 0.04,
  });

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function createBreathDetector(options) {
    const opt = Object.assign({}, DEFAULTS, options || {});
    let floor = opt.initialFloor;
    let aboveSince = null;
    let lastBlowAt = -Infinity;
    let needQuiet = false;
    let warmupUntil = null; // null：次に音量が届いたときから学習を始める
    let lastFeedAt = -Infinity;

    function trigger() {
      return Math.max(opt.minLevel, floor * opt.ratio);
    }

    /**
     * 音量を 1 つ渡す。time はミリ秒（単調増加）。
     * 戻り値の strength は「ふーっ」メーター用の 0〜1、blow は今回「ふーっ」と判定したか。
     */
    function feed(level, time) {
      const lv = Number.isFinite(level) ? Math.max(0, level) : 0;
      const th = trigger();
      const strength = clamp((lv - floor) / (th - floor), 0, 1);

      if (warmupUntil === null || time - lastFeedAt > opt.gapMs) warmupUntil = time + opt.warmupMs;
      lastFeedAt = time;
      if (time < warmupUntil) {
        floor = clamp(floor + (lv - floor) * opt.warmupAdapt, 0.001, opt.maxFloor);
        aboveSince = null;
        return { level: lv, strength, blow: false };
      }

      if (lv < th) {
        // 静かなときだけ雑音を学習する（ふーっの最中に学習すると判定が鈍る）
        floor = clamp(floor + (lv - floor) * opt.adapt, 0.001, opt.maxFloor);
        aboveSince = null;
        if (lv < th * 0.6) needQuiet = false;
        return { level: lv, strength, blow: false };
      }

      if (needQuiet || time - lastBlowAt < opt.cooldownMs) {
        aboveSince = null;
        return { level: lv, strength, blow: false };
      }
      if (aboveSince === null) aboveSince = time;
      if (time - aboveSince >= opt.holdMs) {
        lastBlowAt = time;
        aboveSince = null;
        needQuiet = true;
        return { level: lv, strength, blow: true };
      }
      return { level: lv, strength, blow: false };
    }

    function reset() {
      aboveSince = null;
      warmupUntil = null;
      lastBlowAt = -Infinity;
      needQuiet = false;
    }

    return {
      feed,
      reset,
      get floor() { return floor; },
      get trigger() { return trigger(); },
    };
  }

  /** 波形データ（-1〜1 の数値の配列）から音量（RMS）を求める。 */
  function rms(samples) {
    if (!samples || samples.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / samples.length);
  }

  return { DEFAULTS, createBreathDetector, rms };
});
