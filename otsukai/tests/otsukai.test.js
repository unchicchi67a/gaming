'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Errand = require('../js/errand.js');
const Art = require('../js/art.js');
const Items = require('../../omiseyasan/js/items.js');
const ShopArt = require('../../omiseyasan/js/art.js');

/** 再現可能な疑似乱数（mulberry32）。 */
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** メモどおりに、すべての品物を買う。 */
function buyAll(state) {
  let s = state;
  const events = [];
  for (const e of s.list) {
    for (let i = 0; i < e.count; i++) {
      const r = Errand.buy(s, e.shop, e.item);
      s = r.state;
      events.push(...r.events);
    }
  }
  return { state: s, events };
}

test('レベルごとのメモの量が決まりどおりになる', () => {
  for (let level = 1; level <= Errand.MAX_LEVEL; level++) {
    const cfg = Errand.LEVELS[level];
    for (let seed = 1; seed <= 200; seed++) {
      const s = Errand.createErrand({ level, rng: seeded(seed) });
      assert.equal(s.level, level);
      const shops = Errand.shopsToVisit(s);
      assert.equal(shops.length, cfg.shops, '行くお店の数');
      assert.ok(s.list.length <= cfg.maxKinds, '品物の種類の上限');
      for (const shop of shops) {
        const kinds = s.list.filter((e) => e.shop === shop).length;
        assert.ok(kinds >= cfg.kinds[0] && kinds <= cfg.kinds[1], '1 けんで買う種類');
      }
      for (const e of s.list) {
        assert.ok(e.count >= cfg.count[0] && e.count <= cfg.count[1], '1 種類あたりの数');
        assert.ok(Items.shop(e.shop).items.some((i) => i.id === e.item), '品物はそのお店のもの');
      }
      assert.equal(new Set(s.list.map((e) => e.item)).size, s.list.length, '同じ品物は 1 行にまとめる');
    }
  }
});

test('メモの品物は、そのお店の棚にかならず並ぶ。棚には、メモにない品物もまざる', () => {
  for (let level = 1; level <= Errand.MAX_LEVEL; level++) {
    for (let seed = 1; seed <= 100; seed++) {
      const s = Errand.createErrand({ level, rng: seeded(seed) });
      for (const shop of Items.SHOPS) {
        const shelf = s.shelves[shop.id];
        assert.equal(shelf.length, Errand.LEVELS[level].shelf);
        assert.equal(new Set(shelf).size, shelf.length, '棚に同じ品物は 2 つ並ばない');
        const want = s.list.filter((e) => e.shop === shop.id).map((e) => e.item);
        for (const item of want) assert.ok(shelf.includes(item));
        assert.ok(shelf.some((i) => !want.includes(i)), 'メモにない品物もある');
      }
    }
  }
});

test('メモの順番は、行くお店ごとにまとまっている', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const s = Errand.createErrand({ level: 4, rng: seeded(seed) });
    const order = s.list.map((e) => e.shop);
    const seen = [];
    for (const shop of order) {
      if (seen[seen.length - 1] !== shop) {
        assert.ok(!seen.includes(shop), `お店が飛び飛びにならない: ${order}`);
        seen.push(shop);
      }
    }
  }
});

test('レベルの値がおかしいときは、レベル1にする', () => {
  assert.equal(Errand.clampLevel(0), 1);
  assert.equal(Errand.clampLevel(9), 1);
  assert.equal(Errand.clampLevel('abc'), 1);
  assert.equal(Errand.clampLevel('3'), 3);
  assert.equal(Errand.createErrand({ level: 99 }).level, 1);
});

test('メモどおりに買うと、お店ごとに shopDone、最後に complete になる', () => {
  for (let level = 1; level <= Errand.MAX_LEVEL; level++) {
    const s0 = Errand.createErrand({ level, rng: seeded(level * 7) });
    assert.equal(s0.complete, false);
    const { state, events } = buyAll(s0);
    assert.equal(state.complete, true);
    const p = Errand.progress(state);
    assert.equal(p.got, p.total);
    const shopDone = events.filter((e) => e.type === 'shopDone').map((e) => e.shop);
    assert.deepEqual(shopDone, Errand.shopsToVisit(s0), 'お店ごとに 1 回ずつ');
    assert.equal(events.filter((e) => e.type === 'complete').length, 1);
    assert.equal(events[events.length - 1].type, 'complete', 'complete は最後');
    for (const id of Errand.shopsToVisit(s0)) assert.equal(Errand.shopStatus(state, id), 'done');
    for (const e of s0.list) assert.equal(state.basket[e.item], 0 + e.count);
    assert.deepEqual(Object.values(s0.basket), s0.list.map(() => 0), 'もとの状態は書きかえない');
  }
});

test('1 こ買うごとに、買った数とメモの数を知らせる', () => {
  // レベル2：1 種類を 2〜3 こ
  const s0 = Errand.createErrand({ level: 2, rng: seeded(5) });
  const e = s0.list[0];
  let s = s0;
  for (let i = 1; i <= e.count; i++) {
    const r = Errand.buy(s, e.shop, e.item);
    s = r.state;
    assert.deepEqual(r.events[0], { type: 'bought', item: e.item, have: i, need: e.count, itemDone: i === e.count });
    assert.equal(Errand.remaining(s, e.item), e.count - i);
  }
});

test('もう足りている品物は、それ以上買わない', () => {
  const s0 = Errand.createErrand({ level: 4, rng: seeded(11) });
  const shop = s0.list[0].shop;
  const mine = s0.list.filter((x) => x.shop === shop);
  let s = s0;
  // 先頭の品物だけメモの数まで買う（お店にはまだ買うものが残るようにする）
  const first = mine[0];
  for (let i = 0; i < first.count; i++) s = Errand.buy(s, shop, first.item).state;
  const r = Errand.buy(s, shop, first.item);
  assert.equal(r.state, s, '状態は変わらない');
  assert.deepEqual(r.events, [{ type: 'enough', item: first.item, need: first.count }]);
});

test('メモにない品物は買わず、このお店でまだ買う品物を教える', () => {
  const s0 = Errand.createErrand({ level: 3, rng: seeded(3) });
  const e = s0.list[0];
  const other = s0.shelves[e.shop].find((i) => !s0.list.some((x) => x.item === i));
  const r = Errand.buy(s0, e.shop, other);
  assert.equal(r.state, s0);
  assert.deepEqual(r.events, [{ type: 'notOnList', item: other, wanted: [e.item] }]);

  // メモに入っていないお店では、教える品物がない
  const none = Items.SHOPS.map((x) => x.id).find((id) => Errand.shopStatus(s0, id) === 'none');
  const r2 = Errand.buy(s0, none, s0.shelves[none][0]);
  assert.deepEqual(r2.events, [{ type: 'notOnList', item: s0.shelves[none][0], wanted: [] }]);
});

test('棚にない品物や、おしまいのあとは何も起こらない', () => {
  const s0 = Errand.createErrand({ level: 1, rng: seeded(2) });
  const e = s0.list[0];
  const notOnShelf = Items.shop(e.shop).items.map((i) => i.id).find((i) => !s0.shelves[e.shop].includes(i));
  assert.deepEqual(Errand.buy(s0, e.shop, notOnShelf).events, []);
  assert.deepEqual(Errand.buy(s0, 'nosuchshop', e.item).events, []);
  // ほかのお店の棚から、メモの品物は買えない
  const otherShop = Items.SHOPS.find((x) => x.id !== e.shop).id;
  assert.deepEqual(Errand.buy(s0, otherShop, e.item).events, []);

  const done = buyAll(s0).state;
  assert.deepEqual(Errand.buy(done, e.shop, e.item).events, []);
});

test('お店のようすは none → todo → done と変わる', () => {
  const s0 = Errand.createErrand({ level: 2, rng: seeded(9) });
  const e = s0.list[0];
  for (const shop of Items.SHOPS) {
    assert.equal(Errand.shopStatus(s0, shop.id), shop.id === e.shop ? 'todo' : 'none');
  }
  assert.deepEqual(Errand.stillNeeded(s0, e.shop), [e.item]);
  const done = buyAll(s0).state;
  assert.equal(Errand.shopStatus(done, e.shop), 'done');
  assert.deepEqual(Errand.stillNeeded(done, e.shop), []);
});

test('すべての品物とお店に、絵がある（おみせやさんごっこの絵を使う）', () => {
  for (const shop of Items.SHOPS) {
    assert.ok(ShopArt.storefront(shop.id, []).includes('<svg'), shop.id);
    for (const it of shop.items) assert.ok(ShopArt.ITEM_IDS.includes(it.id), it.id);
  }
  for (const fn of ['mother', 'house', 'basket', 'flower']) {
    assert.ok(Art[fn]().startsWith('<svg'), fn);
  }
  // お母さんの絵は、うさぎの絵にエプロンと髪かざりを足したもの
  assert.ok(Art.mother().includes('m-apron'));
  assert.ok(Art.mother().includes('m-ribbon'));
});

test('index.html が読み込むファイルがすべてある', () => {
  const dir = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.includes('../omiseyasan/js/items.js'));
  for (const src of srcs) assert.ok(fs.existsSync(path.join(dir, src)), src);
  assert.match(html, /apple-mobile-web-app-capable/);
});
