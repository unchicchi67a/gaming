/**
 * 「3びきのこぶた」の物語の進行ルール。
 *
 * 画面や音には一切触れず、「いまどの場面か」「あと何回タッチ（ふーっ）すれば次へ進むか」
 * だけを管理する。act() は状態を書き換えず、新しい状態と起きた出来事（events）を返す。
 * 画面側は events を見てアニメーションや語りを再生する。
 *
 * ブラウザ（window.PigsStory）と Node.js（require）の両方から読み込める。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PigsStory = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * 場面の一覧（物語の順番どおり）。
   * - build: タッチするたびに家のパーツがひとつ増える。pieces 個で完成
   * - knock: タッチでオオカミが戸をノックする。knocks 回で次へ
   * - blow:  ふーっ（息またはタッチ）を blows 回で決着。breaks が true なら家が飛ぶ
   * - fill:  タッチするたびにおなべにお湯が入る。pieces 回でいっぱい
   */
  const SCENES = Object.freeze([
    Object.freeze({ id: 'title', kind: 'title' }),
    Object.freeze({ id: 'straw-build', kind: 'build', house: 'straw', pieces: 5 }),
    Object.freeze({ id: 'straw-knock', kind: 'knock', house: 'straw', knocks: 1 }),
    Object.freeze({ id: 'straw-blow', kind: 'blow', house: 'straw', blows: 1, breaks: true }),
    Object.freeze({ id: 'wood-build', kind: 'build', house: 'wood', pieces: 6 }),
    Object.freeze({ id: 'wood-knock', kind: 'knock', house: 'wood', knocks: 1 }),
    Object.freeze({ id: 'wood-blow', kind: 'blow', house: 'wood', blows: 1, breaks: true }),
    Object.freeze({ id: 'brick-build', kind: 'build', house: 'brick', pieces: 8 }),
    Object.freeze({ id: 'brick-knock', kind: 'knock', house: 'brick', knocks: 1 }),
    Object.freeze({ id: 'brick-blow', kind: 'blow', house: 'brick', blows: 2, breaks: false }),
    Object.freeze({ id: 'pot-fill', kind: 'fill', pieces: 4 }),
    Object.freeze({ id: 'ending', kind: 'ending' }),
  ]);

  const INTERACTIVE = new Set(['build', 'knock', 'blow', 'fill']);

  function indexOf(id) {
    const i = SCENES.findIndex((s) => s.id === id);
    if (i < 0) throw new Error('unknown scene: ' + id);
    return i;
  }

  /** 最初（タイトル）の状態。id を渡すとその場面の最初から始める。 */
  function createState(id) {
    return Object.freeze({ index: id ? indexOf(id) : 0, count: 0 });
  }

  function currentScene(state) {
    return SCENES[state.index];
  }

  function isInteractive(state) {
    return INTERACTIVE.has(currentScene(state).kind);
  }

  /** いまの場面で必要な回数（タッチ・ふーっ）。対話のない場面は 0。 */
  function required(scene) {
    if (scene.kind === 'build' || scene.kind === 'fill') return scene.pieces;
    if (scene.kind === 'knock') return scene.knocks;
    if (scene.kind === 'blow') return scene.blows;
    return 0;
  }

  function advance(state, events) {
    const next = Object.freeze({ index: state.index + 1, count: 0 });
    events.push({ type: 'scene', id: SCENES[next.index].id });
    return next;
  }

  /**
   * 操作を 1 つ適用する。
   * action: 'start' | 'tap' | 'blow' | 'restart' | 'home'
   * 場面に合わない操作は無視する（state はそのまま、events は空）。
   */
  function act(state, action) {
    const scene = currentScene(state);
    const events = [];

    if (action === 'home') {
      if (state.index === 0) return { state, events };
      const next = createState();
      events.push({ type: 'scene', id: 'title' });
      return { state: next, events };
    }

    switch (scene.kind) {
      case 'title':
        if (action !== 'start') break;
        return { state: advance(state, events), events };

      case 'build': {
        if (action !== 'tap') break;
        const count = state.count + 1;
        events.push({ type: 'piece', house: scene.house, index: count - 1, total: scene.pieces });
        if (count < scene.pieces) {
          return { state: Object.freeze({ index: state.index, count }), events };
        }
        events.push({ type: 'built', house: scene.house });
        return { state: advance(state, events), events };
      }

      case 'knock': {
        if (action !== 'tap') break;
        const count = state.count + 1;
        events.push({ type: 'knock', house: scene.house, index: count - 1, total: scene.knocks });
        if (count < scene.knocks) {
          return { state: Object.freeze({ index: state.index, count }), events };
        }
        return { state: advance(state, events), events };
      }

      case 'blow': {
        if (action !== 'blow') break;
        const count = state.count + 1;
        const last = count >= scene.blows;
        if (scene.breaks) {
          events.push(last
            ? { type: 'blownAway', house: scene.house }
            : { type: 'shake', house: scene.house, index: count - 1, total: scene.blows });
        } else {
          events.push({ type: 'holds', house: scene.house, index: count - 1, total: scene.blows });
          if (last) events.push({ type: 'gaveUp', house: scene.house });
        }
        if (!last) return { state: Object.freeze({ index: state.index, count }), events };
        return { state: advance(state, events), events };
      }

      case 'fill': {
        if (action !== 'tap') break;
        const count = state.count + 1;
        events.push({ type: 'pour', index: count - 1, total: scene.pieces });
        if (count < scene.pieces) {
          return { state: Object.freeze({ index: state.index, count }), events };
        }
        events.push({ type: 'boiling' });
        return { state: advance(state, events), events };
      }

      case 'ending':
        if (action !== 'restart') break;
        events.push({ type: 'scene', id: SCENES[1].id });
        return { state: Object.freeze({ index: 1, count: 0 }), events };
    }
    return { state, events };
  }

  return {
    SCENES,
    createState,
    currentScene,
    isInteractive,
    required,
    act,
  };
});
