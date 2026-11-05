/**
 * お店屋さんごっこの進行（画面に触れない純粋なロジック）。
 *
 * 1 回の遊び：
 *   - 棚に並べる品物を、お店の品物の中から shelfSize 個選ぶ
 *   - お客さんが customers 人やってきて、棚にある品物を 1 つずつ注文する
 *   - 正しい品物をわたすと次のお客さんへ。全員にわたしたら閉店
 *   - ちがう品物をわたしても失敗にはしない（misses を数えて、画面側でヒントを出す）
 *
 * 状態はイミュータブルに扱い、give() は新しい状態と出来事（events）を返す。
 * ブラウザでは window.ShopGame、Node.js では require で読み込める。
 */
(function (root) {
  'use strict';

  const Items = (typeof module === 'object' && module.exports) ? require('./items.js') : root.ShopItems;

  const SHELF_SIZES = [3, 4, 6];
  const DEFAULT_SHELF = 4;
  const DEFAULT_CUSTOMERS = 5;

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * 注文の並びを作る。棚の品物をなるべく満遍なく使い、同じ品物が 2 回続かないようにする。
   * 棚の品物をシャッフルした「袋」から順に取り出し、空になったら袋を詰め直す。
   */
  function makeOrderItems(shelf, count, rng) {
    const out = [];
    let bag = [];
    while (out.length < count) {
      if (!bag.length) bag = shuffle(shelf, rng);
      let k = 0;
      if (out.length && bag[0] === out[out.length - 1] && bag.length > 1) k = 1;
      out.push(bag.splice(k, 1)[0]);
    }
    return out;
  }

  /** お客さんの並び。人数がお客さんの種類より多いときも、同じお客さんが続かないようにする。 */
  function makeCustomers(count, rng) {
    const ids = Items.CUSTOMERS.map((c) => c.id);
    const out = [];
    let bag = [];
    while (out.length < count) {
      if (!bag.length) bag = shuffle(ids, rng);
      let k = 0;
      if (out.length && bag[0] === out[out.length - 1] && bag.length > 1) k = 1;
      out.push(bag.splice(k, 1)[0]);
    }
    return out;
  }

  /**
   * 新しい遊びを始める。
   * opts: shopId（必須）, shelfSize（3 / 4 / 6）, customers（人数）, rng（0 以上 1 未満を返す関数）
   */
  function createGame(opts) {
    const o = opts || {};
    const shop = Items.shop(o.shopId);
    if (!shop) throw new Error('unknown shop: ' + o.shopId);
    const rng = o.rng || Math.random;
    const shelfSize = Math.min(shop.items.length, SHELF_SIZES.includes(o.shelfSize) ? o.shelfSize : DEFAULT_SHELF);
    const count = Math.max(1, Math.floor(o.customers || DEFAULT_CUSTOMERS));

    const shelf = shuffle(shop.items.map((i) => i.id), rng).slice(0, shelfSize);
    const wanted = makeOrderItems(shelf, count, rng);
    const who = makeCustomers(count, rng);
    const orders = wanted.map((item, i) => ({ customer: who[i], item }));

    return Object.freeze({
      shopId: shop.id,
      shelf: Object.freeze(shelf),
      orders: Object.freeze(orders.map(Object.freeze)),
      index: 0,
      misses: 0,
      finished: false,
    });
  }

  /** いま来ているお客さんの注文。閉店後は null。 */
  function currentOrder(state) {
    return state.finished ? null : state.orders[state.index];
  }

  function progress(state) {
    return { served: state.index, total: state.orders.length };
  }

  /**
   * 品物をわたす。
   * events:
   *   - { type: 'correct', item, customer }        ほしい品物だった
   *   - { type: 'next', item, customer }           次のお客さんが来る（correct のあと）
   *   - { type: 'closed' }                          全員にわたし終えた（correct のあと）
   *   - { type: 'wrong', given, wanted, customer, misses }  ちがう品物だった
   * 閉店後や、棚にない品物をわたしたときは何も起こらない（events が空）。
   */
  function give(state, itemId) {
    const order = currentOrder(state);
    if (!order || !state.shelf.includes(itemId)) return { state, events: [] };

    if (itemId !== order.item) {
      const misses = state.misses + 1;
      return {
        state: Object.freeze(Object.assign({}, state, { misses })),
        events: [{ type: 'wrong', given: itemId, wanted: order.item, customer: order.customer, misses }],
      };
    }

    const index = state.index + 1;
    const finished = index >= state.orders.length;
    const next = Object.freeze(Object.assign({}, state, { index, misses: 0, finished }));
    const events = [{ type: 'correct', item: order.item, customer: order.customer }];
    if (finished) events.push({ type: 'closed' });
    else events.push({ type: 'next', item: next.orders[index].item, customer: next.orders[index].customer });
    return { state: next, events };
  }

  const Game = { SHELF_SIZES, DEFAULT_SHELF, DEFAULT_CUSTOMERS, createGame, currentOrder, progress, give };

  if (typeof module === 'object' && module.exports) module.exports = Game;
  root.ShopGame = Game;
})(typeof self !== 'undefined' ? self : this);
