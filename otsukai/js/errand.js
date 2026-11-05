/**
 * おつかいの進行（画面に触れない純粋なロジック）。
 *
 * 1 回の遊び：
 *   - お母さんのメモ（list）：どのお店で、どの品物を、いくつ買うか。レベルで量が変わる
 *   - どのお店にも棚（shelves）がある。メモの品物と、メモにない品物がまざって並ぶ
 *   - 棚の品物をタッチすると 1 こ買う。メモの数だけ買ったら、その品物はおしまい
 *   - メモの品物をぜんぶ買ったら、おうちに帰っておしまい
 *   - 失敗はない。メモにない品物や、もう足りている品物をタッチしても買わない（画面側でヒントを出す）
 *
 * 品物とお店のデータは「おみせやさんごっこ」（omiseyasan/js/items.js）のものを使う。
 * 状態はイミュータブルに扱い、buy() は新しい状態と出来事（events）を返す。
 * ブラウザでは window.Errand、Node.js では require で読み込める。
 */
(function (root) {
  'use strict';

  const Items = (typeof module === 'object' && module.exports)
    ? require('../../omiseyasan/js/items.js')
    : root.ShopItems;

  /**
   * レベルごとの決まり。
   * shops：行くお店の数 / kinds：1 けんで買う品物の種類（最小と最大）
   * count：1 種類あたりの数（最小と最大）/ maxKinds：メモ全体の種類の上限 / shelf：1 けんの棚に並ぶ数
   */
  const LEVELS = [
    null,
    { name: 'ひとつ', shops: 1, kinds: [1, 1], count: [1, 1], maxKinds: 1, shelf: 3 },
    { name: 'いくつか', shops: 1, kinds: [1, 1], count: [2, 3], maxKinds: 1, shelf: 4 },
    { name: '2けん', shops: 2, kinds: [1, 1], count: [1, 2], maxKinds: 2, shelf: 4 },
    { name: '3けん', shops: 3, kinds: [1, 2], count: [1, 2], maxKinds: 4, shelf: 4 },
  ];
  const MAX_LEVEL = LEVELS.length - 1;
  const DEFAULT_LEVEL = 1;

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** min 以上 max 以下の整数。 */
  function between(min, max, rng) {
    return min + Math.floor(rng() * (max - min + 1));
  }

  function clampLevel(level) {
    const n = Math.round(Number(level));
    return n >= 1 && n <= MAX_LEVEL ? n : DEFAULT_LEVEL;
  }

  /**
   * 新しいおつかいを始める。
   * opts: level（1〜4）, rng（0 以上 1 未満を返す関数）
   */
  function createErrand(opts) {
    const o = opts || {};
    const rng = o.rng || Math.random;
    const level = clampLevel(o.level);
    const cfg = LEVELS[level];

    const visit = shuffle(Items.SHOPS.map((s) => s.id), rng).slice(0, cfg.shops);
    // 1 けんに 1 種類は必ず買う。残りの種類を、上限までお店にふりわける
    const kinds = {};
    let total = 0;
    for (const id of visit) {
      kinds[id] = cfg.kinds[0];
      total += cfg.kinds[0];
    }
    for (const id of visit) {
      const extra = between(0, cfg.kinds[1] - cfg.kinds[0], rng);
      const add = Math.min(extra, cfg.maxKinds - total);
      kinds[id] += add;
      total += add;
    }

    const list = [];
    const shelves = {};
    for (const shop of Items.SHOPS) {
      const ids = shuffle(shop.items.map((i) => i.id), rng);
      const want = ids.slice(0, kinds[shop.id] || 0);
      for (const item of want) {
        list.push(Object.freeze({ shop: shop.id, item, count: between(cfg.count[0], cfg.count[1], rng) }));
      }
      // 棚：メモの品物と、メモにない品物をまぜて並べる
      shelves[shop.id] = Object.freeze(shuffle(ids.slice(0, Math.max(cfg.shelf, want.length)), rng));
    }
    // メモの順番は、お店の並び（行く順）にそろえる
    list.sort((a, b) => visit.indexOf(a.shop) - visit.indexOf(b.shop));

    const basket = {};
    for (const entry of list) basket[entry.item] = 0;

    return Object.freeze({
      level,
      list: Object.freeze(list),
      shelves: Object.freeze(shelves),
      basket: Object.freeze(basket),
      complete: false,
    });
  }

  function entryOf(state, itemId) {
    return state.list.find((e) => e.item === itemId) || null;
  }

  /** メモの品物のうち、まだ買っていない数。メモにない品物は 0。 */
  function remaining(state, itemId) {
    const e = entryOf(state, itemId);
    return e ? e.count - state.basket[itemId] : 0;
  }

  /** そのお店で、まだ買う品物（メモの順）。 */
  function stillNeeded(state, shopId) {
    return state.list.filter((e) => e.shop === shopId && remaining(state, e.item) > 0).map((e) => e.item);
  }

  /**
   * お店のようす。
   * 'none'：メモにこのお店の品物はない / 'todo'：まだ買うものがある / 'done'：ぜんぶ買った
   */
  function shopStatus(state, shopId) {
    const entries = state.list.filter((e) => e.shop === shopId);
    if (!entries.length) return 'none';
    return entries.every((e) => remaining(state, e.item) === 0) ? 'done' : 'todo';
  }

  /** 行く必要のあるお店（メモの順）。 */
  function shopsToVisit(state) {
    const out = [];
    for (const e of state.list) if (!out.includes(e.shop)) out.push(e.shop);
    return out;
  }

  /** 買った数とメモの数の合計。 */
  function progress(state) {
    let got = 0;
    let total = 0;
    for (const e of state.list) {
      got += state.basket[e.item];
      total += e.count;
    }
    return { got, total };
  }

  /**
   * お店の棚の品物をタッチする。
   * events:
   *   - { type: 'bought', item, have, need, itemDone }  1 こ買った（have：買った数、need：メモの数）
   *   - { type: 'shopDone', shop }                      このお店で買うものがなくなった（bought のあと）
   *   - { type: 'complete' }                             メモのものをぜんぶ買った（shopDone のあと）
   *   - { type: 'enough', item, need }                  もうメモの数だけ買ってある
   *   - { type: 'notOnList', item, wanted }             メモにない品物（wanted：このお店でまだ買う品物）
   * おしまいのあとや、そのお店の棚にない品物をタッチしたときは何も起こらない（events が空）。
   */
  function buy(state, shopId, itemId) {
    const shelf = state.shelves[shopId];
    if (state.complete || !shelf || !shelf.includes(itemId)) return { state, events: [] };

    const entry = entryOf(state, itemId);
    if (!entry) {
      return { state, events: [{ type: 'notOnList', item: itemId, wanted: stillNeeded(state, shopId) }] };
    }
    if (remaining(state, itemId) === 0) {
      return { state, events: [{ type: 'enough', item: itemId, need: entry.count }] };
    }

    const basket = Object.freeze(Object.assign({}, state.basket, { [itemId]: state.basket[itemId] + 1 }));
    const next0 = Object.assign({}, state, { basket });
    const complete = progress(next0).got === progress(next0).total;
    const next = Object.freeze(Object.assign(next0, { complete }));

    const have = basket[itemId];
    const events = [{ type: 'bought', item: itemId, have, need: entry.count, itemDone: have === entry.count }];
    if (shopStatus(next, shopId) === 'done') events.push({ type: 'shopDone', shop: shopId });
    if (complete) events.push({ type: 'complete' });
    return { state: next, events };
  }

  const Errand = {
    LEVELS,
    MAX_LEVEL,
    DEFAULT_LEVEL,
    clampLevel,
    createErrand,
    remaining,
    stillNeeded,
    shopStatus,
    shopsToVisit,
    progress,
    buy,
  };

  if (typeof module === 'object' && module.exports) module.exports = Errand;
  root.Errand = Errand;
})(typeof self !== 'undefined' ? self : this);
