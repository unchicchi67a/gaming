'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Items = require('../js/items.js');
const Game = require('../js/shop.js');
const Art = require('../js/art.js');

/** 決まった並びの乱数（テストの結果を毎回同じにする）。 */
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** いまのお客さんがほしい品物を、閉店まで順にわたす。 */
function serveAll(state) {
  let s = state;
  const events = [];
  while (!s.finished) {
    const r = Game.give(s, Game.currentOrder(s).item);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

test('お店は やおやさん・くだものやさん・パンやさん の 3 つ', () => {
  assert.deepEqual(Items.SHOPS.map((s) => s.id), ['yaoya', 'kudamono', 'panya']);
  for (const shop of Items.SHOPS) {
    assert.ok(shop.items.length >= Math.max(...Game.SHELF_SIZES), `${shop.id} の品物が足りない`);
  }
});

test('品物の id は重ならず、すべてに名前と絵がある', () => {
  const ids = Items.SHOPS.flatMap((s) => s.items.map((i) => i.id));
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) {
    assert.ok(Items.item(id).name, `${id} に名前がない`);
    assert.ok(Art.ITEM_IDS.includes(id), `${id} の絵がない`);
    assert.match(Art.item(id), /^<svg[\s\S]*<path/);
  }
});

test('お客さんすべてに絵がある', () => {
  for (const c of Items.CUSTOMERS) {
    assert.ok(Art.CUSTOMER_IDS.includes(c.id), `${c.id} の絵がない`);
    assert.match(Art.customer(c.id), /c-eyes-happy/);
  }
});

test('お店の外観・町・スタンプなど、画面で使う絵がそろっている', () => {
  for (const shop of Items.SHOPS) {
    const svg = Art.storefront(shop.id, shop.items.map((i) => i.id));
    assert.equal((svg.match(/<svg /g) || []).length, 4, `${shop.id} の外観に品物が 3 つ入っていない`);
  }
  assert.match(Art.town(), /^<svg/);
  assert.match(Art.stamp(), /^<svg/);
  assert.match(Art.cloud(), /^<svg/);
});

test('受け取った品物は、お客さんの手もとの位置に入れ子の svg として置く', () => {
  const svg = Art.heldItem('apple');
  assert.match(svg, /^<svg x="58" y="160" width="84" height="84" /);
  assert.match(Art.customer('bear'), /class="c-held-box" x="58" y="160" width="84" height="84"/);
});

test('メロンパンの絵は、何枚出しても clipPath の id が重ならない', () => {
  const id = (svg) => svg.match(/clipPath id="([^"]+)"/)[1];
  assert.notEqual(id(Art.item('melonpan')), id(Art.item('melonpan')));
});

test('棚には指定した数だけ、そのお店の品物が重ならずに並ぶ', () => {
  for (const shop of Items.SHOPS) {
    for (const size of Game.SHELF_SIZES) {
      const s = Game.createGame({ shopId: shop.id, shelfSize: size, rng: seeded(size) });
      assert.equal(s.shelf.length, size);
      assert.equal(new Set(s.shelf).size, size);
      for (const id of s.shelf) assert.ok(shop.items.some((i) => i.id === id));
    }
  }
});

test('棚の数を指定しないとき・おかしな数のときは 4 つ', () => {
  assert.equal(Game.createGame({ shopId: 'yaoya' }).shelf.length, 4);
  assert.equal(Game.createGame({ shopId: 'yaoya', shelfSize: 99 }).shelf.length, 4);
});

test('知らないお店では始められない', () => {
  assert.throws(() => Game.createGame({ shopId: 'nope' }));
});

test('お客さんは 5 人で、注文はかならず棚にある品物', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = Game.createGame({ shopId: 'kudamono', shelfSize: 3, rng: seeded(seed) });
    assert.equal(s.orders.length, Game.DEFAULT_CUSTOMERS);
    for (const o of s.orders) {
      assert.ok(s.shelf.includes(o.item));
      assert.ok(Items.customer(o.customer));
    }
  }
});

test('同じ品物・同じお客さんが 2 回続けて来ない', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const s = Game.createGame({ shopId: 'panya', shelfSize: 3, customers: 12, rng: seeded(seed) });
    for (let i = 1; i < s.orders.length; i++) {
      assert.notEqual(s.orders[i].item, s.orders[i - 1].item, `seed ${seed} の ${i} 人目`);
      assert.notEqual(s.orders[i].customer, s.orders[i - 1].customer, `seed ${seed} の ${i} 人目`);
    }
  }
});

test('棚の品物はまんべんなく注文される（棚の数以上の人数なら、全部 1 回は出る）', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const s = Game.createGame({ shopId: 'yaoya', shelfSize: 4, customers: 5, rng: seeded(seed) });
    const ordered = new Set(s.orders.map((o) => o.item));
    assert.equal(ordered.size, 4, `seed ${seed}`);
  }
});

test('ほしい品物をわたすと、次のお客さんが来る', () => {
  const s0 = Game.createGame({ shopId: 'yaoya', rng: seeded(7) });
  const first = Game.currentOrder(s0);
  const { state, events } = Game.give(s0, first.item);
  assert.deepEqual(events, [
    { type: 'correct', item: first.item, customer: first.customer },
    { type: 'next', item: state.orders[1].item, customer: state.orders[1].customer },
  ]);
  assert.equal(state.index, 1);
  assert.deepEqual(Game.progress(state), { served: 1, total: 5 });
  // もとの状態は変わらない
  assert.equal(s0.index, 0);
});

test('ちがう品物をわたしても先へは進まず、まちがえた回数だけ数える', () => {
  const s0 = Game.createGame({ shopId: 'kudamono', rng: seeded(3) });
  const want = Game.currentOrder(s0).item;
  const other = s0.shelf.find((id) => id !== want);
  const r1 = Game.give(s0, other);
  assert.deepEqual(r1.events, [{ type: 'wrong', given: other, wanted: want, customer: s0.orders[0].customer, misses: 1 }]);
  assert.equal(r1.state.index, 0);
  const r2 = Game.give(r1.state, other);
  assert.equal(r2.events[0].misses, 2);
  // 正しくわたすと、まちがえた回数は 0 にもどる
  const r3 = Game.give(r2.state, want);
  assert.equal(r3.events[0].type, 'correct');
  assert.equal(r3.state.misses, 0);
});

test('棚にない品物は受け付けない', () => {
  const s0 = Game.createGame({ shopId: 'yaoya', shelfSize: 3, rng: seeded(5) });
  const notOnShelf = Items.shop('yaoya').items.find((i) => !s0.shelf.includes(i.id)).id;
  assert.deepEqual(Game.give(s0, notOnShelf), { state: s0, events: [] });
  assert.deepEqual(Game.give(s0, 'apple'), { state: s0, events: [] });
});

test('全員にわたすと閉店し、そのあとは何も起こらない', () => {
  const s0 = Game.createGame({ shopId: 'panya', rng: seeded(11) });
  const { state, events } = serveAll(s0);
  assert.equal(state.finished, true);
  assert.equal(Game.currentOrder(state), null);
  assert.equal(events.filter((e) => e.type === 'correct').length, 5);
  assert.deepEqual(events[events.length - 1], { type: 'closed' });
  assert.deepEqual(Game.give(state, state.shelf[0]).events, []);
});

test('状態は書きかえられない', () => {
  const s0 = Game.createGame({ shopId: 'yaoya', rng: seeded(1) });
  assert.ok(Object.isFrozen(s0));
  assert.ok(Object.isFrozen(s0.shelf));
  assert.ok(Object.isFrozen(s0.orders[0]));
});
