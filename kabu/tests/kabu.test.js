'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');

const DT = 1 / 60;
const LAST = G.SPECIES.length - 1;

/** 秒数ぶん呼ぶボタンを押しつづける。 */
function holdFor(g, sec) {
  for (let t = 0; t < sec - 1e-9; t += DT) G.hold(g, DT);
}

/** 毎回ちがう乱数で、ゲームを n 回作る。 */
function games(stage, n, salt = 0) {
  const list = [];
  for (let i = 1; i <= n; i++) list.push(G.createGame({ stage, rng: G.makeRng(i * 7919 + stage * 31 + salt) }));
  return list;
}

const MEAN = G.tierWeights(0).reduce((a, w, i) => a + w * G.TIERS[i], 0);
const gauss = (r) => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r());

/** ヒントの言葉から「あと何ケタ」を見積もる（その言葉の範囲のまんなか）。 */
function wordGap(h) {
  if (h.min === -Infinity) return -0.4;
  const i = G.HINTS.indexOf(h);
  const hi = i > 0 ? G.HINTS[i - 1].min : h.min + 2;
  return (h.min + hi) / 2;
}

/**
 * 人が遊ぶのに近いボット。直前のヒントで「あと何ケタ」を読み、ねずみの分（buffer ケタ）を残して
 * ほかの種類に割りふる。ねずみは、残りをちょうど埋めるところまで呼ぶ。
 * - perception：大勢の数を見た目で読むときのぶれ（ケタ）
 * - useWord：ヒントの数値ではなく、言葉だけで読む
 */
function playCareful(g, prng, perception = 0.1, useWord = false, buffer = 2) {
  let gap = null;
  while (g.state === 'calling') {
    const sp = G.SPECIES[g.phase];
    const grp = g.groups[g.phase];
    if (sp.kind !== 'fixed') {
      let desired;
      if (g.phase === LAST) desired = gap;
      else {
        const ranges = G.SPECIES.slice(g.phase, LAST).map((s) => Math.log10(s.max * MEAN));
        desired = Math.max(0, gap - buffer) * Math.log10(sp.max * MEAN) / ranges.reduce((a, b) => a + b, 0);
      }
      const noise = gauss(prng) * perception;
      while (G.canCall(g)) {
        const est = sp.kind === 'human'
          ? Math.log10(grp.sum || 1e-9)
          : Math.log10(Math.max(grp.count, 1) * MEAN) + (grp.count > 5 ? noise : 0);
        if (grp.count > 0 && est >= desired) break;
        G.hold(g, DT);
      }
    }
    const r = G.pull(g);
    if (r.type === 'hint') gap = useWord ? wordGap(r.hint) : r.gap;
  }
  return g.result;
}

/** でたらめに押すボット（0〜5 秒）。 */
function playRandom(g, prng) {
  while (g.state === 'calling') {
    holdFor(g, prng() * 5);
    if (!G.canPull(g)) G.hold(g, DT);
    G.pull(g);
  }
  return g.result;
}

function clearRate(stage, play, n = 600) {
  let c = 0;
  games(stage, n).forEach((g, i) => {
    if (play(g, G.makeRng(i * 104729 + 17)).clear) c++;
  });
  return c / n;
}

// ---------- 基本のルール ----------

test('おじいさんは最初から 1 人だけいて、呼び足せない', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  assert.equal(g.phase, 0);
  assert.equal(g.groups[0].count, 1);
  assert.equal(G.canCall(g), false);
  holdFor(g, 3);
  assert.equal(g.groups[0].count, 1);
  assert.ok(G.canPull(g));
});

test('人間は押した瞬間に 1 人来て、そのあと every 秒ごとに 1 人ずつ。max で止まる', () => {
  const g = G.createGame({ rng: G.makeRng(2) });
  G.pull(g); // おじいさん
  assert.equal(g.phase, 1);
  assert.equal(G.canPull(g), false, 'だれもいないと引っぱれない');
  G.hold(g, DT);
  assert.equal(g.groups[1].count, 1);
  holdFor(g, G.SPECIES[1].every * 2);
  assert.equal(g.groups[1].count, 3);
  holdFor(g, 30);
  assert.equal(g.groups[1].count, G.SPECIES[1].max);
  assert.equal(G.canCall(g), false);
});

test('動物は長く押すほど速く集まる（はじめの 1 秒より、4 秒目からの 1 秒のほうが多く来る）', () => {
  const g = G.createGame({ rng: G.makeRng(3) });
  for (let i = 0; i < 3; i++) {
    G.hold(g, DT);
    G.pull(g);
  }
  assert.equal(G.SPECIES[g.phase].id, 'dog');
  holdFor(g, 1);
  const first = g.groups[g.phase].count;
  holdFor(g, 2);
  const before = g.groups[g.phase].count;
  holdFor(g, 1);
  const later = g.groups[g.phase].count - before;
  assert.ok(later > first * 3, `はじめ ${first} 匹、あと ${later} 匹`);
});

test('手を離しても、押し直すと続きから増える（減らない）', () => {
  const g = G.createGame({ rng: G.makeRng(4) });
  for (let i = 0; i < 3; i++) {
    G.hold(g, DT);
    G.pull(g);
  }
  holdFor(g, 2);
  const a = g.groups[g.phase].count;
  holdFor(g, 0.5);
  assert.ok(g.groups[g.phase].count > a);
});

test('力は、種類ごとの強さの合計をかけ算したもの', () => {
  const g = G.createGame({ rng: G.makeRng(5) });
  G.pull(g);
  holdFor(g, 1);
  G.pull(g);
  holdFor(g, 0.5);
  const sums = g.groups.filter((x) => x.count > 0).map((x) => x.sum);
  const expected = sums.reduce((a, b) => a * b, 1);
  assert.ok(Math.abs(G.power(g) - expected) < 1e-9);
  for (const grp of g.groups) {
    const s = grp.tierCounts.reduce((a, n, i) => a + n * G.TIERS[i], 0);
    assert.ok(Math.abs(s - grp.sum) < 1e-9);
    assert.equal(grp.tierCounts.reduce((a, b) => a + b, 0), grp.count);
  }
});

test('ねずみより前は、どれだけ強くてもかぶはぬけず、ヒントだけが返る', () => {
  const g = G.createGame({ stage: 0, rng: G.makeRng(6) });
  for (let i = 0; i < LAST; i++) {
    holdFor(g, 20);
    const r = G.pull(g);
    assert.equal(r.type, 'hint');
    assert.equal(g.state, 'calling');
  }
  assert.equal(g.hints.at(-1).hint.id, 'over', '強すぎると根っこが悲鳴をあげる');
  holdFor(g, 0.1);
  const r = G.pull(g);
  assert.equal(r.type, 'final');
  assert.equal(g.state, 'done');
  assert.ok(r.distance > g.target * (1 + g.tol), '飛びすぎ');
  assert.equal(r.clear, false);
});

test('飛ぶ距離：力が重さ以下ならぬけない。それより大きいと FLY_UNIT ×（力 / 重さ − 1）', () => {
  const g = G.createGame({ rng: G.makeRng(7) });
  assert.equal(G.distanceFor(g, g.weight), 0);
  assert.equal(G.distanceFor(g, g.weight * 0.5), 0);
  assert.ok(Math.abs(G.distanceFor(g, g.weight * 3) - 2 * G.FLY_UNIT) < 1e-9);
  assert.ok(Math.abs(G.distanceFor(g, G.neededPower(g)) - g.target) < 1e-6);
});

test('クリアは、誤差が届け先までの距離の tol 以内のとき。ぬけなければ失敗', () => {
  const g = G.createGame({ stage: 2, rng: G.makeRng(8) });
  while (g.phase < LAST) {
    G.hold(g, DT);
    G.pull(g);
  }
  G.hold(g, DT);
  // 力を直接いじって、判定だけを確かめる
  const setPower = (p) => {
    const others = G.power(g) / g.groups[LAST].sum;
    g.groups[LAST].sum = p / others;
  };
  const judge = (dist) => {
    const copy = { ...g, groups: g.groups.map((x) => ({ ...x })), state: 'calling', hints: [] };
    const others = G.power(copy) / copy.groups[LAST].sum;
    copy.groups[LAST].sum = (g.weight * (1 + dist / G.FLY_UNIT)) / others;
    return G.pull(copy);
  };
  assert.equal(judge(g.target).clear, true);
  assert.equal(judge(g.target * (1 + g.tol * 0.98)).clear, true);
  assert.equal(judge(g.target * (1 - g.tol * 0.98)).clear, true);
  assert.equal(judge(g.target * (1 + g.tol * 1.02)).clear, false);
  assert.equal(judge(g.target * (1 - g.tol * 1.02)).clear, false);
  setPower(g.weight * 0.9);
  const r = G.pull(g);
  assert.equal(r.pulled, false);
  assert.equal(r.clear, false);
});

test('ヒント：あと少しほど、かぶが土から出てくる。言葉の範囲は上から順に小さくなる', () => {
  for (let i = 1; i < G.HINTS.length; i++) assert.ok(G.HINTS[i].min < G.HINTS[i - 1].min);
  let prev = -1;
  for (let gap = 12; gap >= -1; gap -= 0.25) {
    const lift = G.liftFor(gap);
    assert.ok(lift >= prev && lift <= 1);
    prev = lift;
  }
  assert.equal(G.hintFor(-1).id, 'over');
  assert.equal(G.hintFor(20).id, G.HINTS[0].id);
});

test('届け先は、ステージの候補からランダムに決まる。place を指定するとそれになる', () => {
  for (let s = 0; s < G.STAGES.length; s++) {
    const seen = new Set(games(s, 40).map((g) => g.placeIndex));
    assert.equal(seen.size, G.STAGES[s].places.length, `ステージ ${s + 1}`);
  }
  const g = G.createGame({ stage: 0, place: 2, rng: G.makeRng(9) });
  assert.equal(g.place.name, G.STAGES[0].places[2].name);
});

test('ステージは 10 個あり、先に進むほど届け先が遠い', () => {
  assert.equal(G.STAGES.length, 10);
  for (let s = 1; s < G.STAGES.length; s++) {
    const near = Math.min(...G.STAGES[s].places.map((p) => p.dist));
    const prevFar = Math.max(...G.STAGES[s - 1].places.map((p) => p.dist));
    assert.ok(near > prevFar, `ステージ ${s + 1}`);
  }
});

// ---------- バランス ----------

test('いちばん遠い届け先（火星）にも、全員を最大まで呼べば届く', () => {
  for (const g of games(9, 30)) {
    while (g.state === 'calling') {
      holdFor(g, 20);
      G.pull(g);
    }
    assert.ok(g.result.distance > g.target * (1 + g.tol), `${g.result.distance}`);
  }
});

test('いちばん近い届け先は、各種類 1 人（1 匹）ずつでは、だいたい飛びすぎない', () => {
  let over = 0;
  const list = games(0, 300);
  for (const g of list) {
    while (g.state === 'calling') {
      if (!G.canPull(g)) G.hold(g, DT);
      G.pull(g);
    }
    if (g.result.distance > g.target * (1 + g.tol)) over++;
  }
  assert.ok(over / list.length < 0.1, `${over} / ${list.length}`);
});

test('ヒントをよく読むボットは、でたらめなボットよりずっとクリアできる。どのステージも必勝ではない', () => {
  for (let s = 0; s < G.STAGES.length; s++) {
    const careful = clearRate(s, (g, r) => playCareful(g, r));
    const random = clearRate(s, playRandom);
    assert.ok(careful >= 0.3, `ステージ ${s + 1}：よく読む ${careful}`);
    assert.ok(careful < 0.97, `ステージ ${s + 1}：よく読む ${careful}`);
    assert.ok(random < 0.15, `ステージ ${s + 1}：でたらめ ${random}`);
    assert.ok(careful > random + 0.25, `ステージ ${s + 1}：よく読む ${careful} / でたらめ ${random}`);
  }
});

test('ヒントの言葉だけでも、でたらめよりクリアできる', () => {
  for (let s = 0; s < G.STAGES.length; s++) {
    const word = clearRate(s, (g, r) => playCareful(g, r, 0.1, true), 400);
    const random = clearRate(s, playRandom, 400);
    assert.ok(word > random + 0.1, `ステージ ${s + 1}：言葉だけ ${word} / でたらめ ${random}`);
  }
});

test('先のステージほど難しい（最初の 3 つより、最後の 3 つのほうがクリアしにくい）', () => {
  const rates = G.STAGES.map((_, s) => clearRate(s, (g, r) => playCareful(g, r), 400));
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  assert.ok(avg(rates.slice(0, 3)) > avg(rates.slice(-3)) + 0.2, rates.join(', '));
  assert.ok(rates[0] >= 0.7, `ステージ 1：${rates[0]}`);
});

test('ねずみで細かく合わせるのが大事（ねずみの分を残さず、その前で合わせきろうとすると、クリアしにくい）', () => {
  let careful = 0;
  let lazy = 0;
  const n = 400;
  for (let i = 1; i <= n; i++) {
    const a = G.createGame({ stage: 4, rng: G.makeRng(i) });
    if (playCareful(a, G.makeRng(i + 5)).clear) careful++;
    // ねずみの分を残さず、ねずみの前で合わせきろうとする
    const b = G.createGame({ stage: 4, rng: G.makeRng(i) });
    if (playCareful(b, G.makeRng(i + 5), 0.1, false, 0).clear) lazy++;
  }
  assert.ok(careful > lazy * 1.5, `ねずみで合わせる ${careful} / 合わせない ${lazy}`);
});
