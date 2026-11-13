'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const G = require('../js/game.js');
const A = require('../js/art.js');

const DT = 1 / 60;

function run(g, seconds, each) {
  const all = [];
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps && g.phase === 'play'; i++) {
    if (each) each(g);
    all.push(...G.step(g, DT));
  }
  return all;
}

/** 猫をずっと動かす（休ませない）。 */
function forceCreep(c) {
  c.state = 'creep';
  c.timer = 999;
}

/** 人が遊ぶのに近い自動操作。反応の速さは 0.3 秒に 1 回まで。 */
function bot(opts) {
  const o = opts || {};
  let cooldown = 0;
  return function (g) {
    // 温度は「強」と「中」を切りかえて、ちょうどいい温度にたもつ
    if (g.T < 0.72) G.setHeat(g, 'high');
    else if (g.T > 0.82) G.setHeat(g, 'mid');
    cooldown -= DT;
    if (cooldown > 0) return;
    const cats = g.cats.filter((c) => !c.out).sort((a, b) => b.progress - a.progress);
    const c = cats[0];
    if (!c || c.progress < 0.55) return;
    if (o.treats && g.treats > 0 && (c.progress > 0.85 || c.annoy + 0.3 * c.temper >= 1)) G.treat(g, c.index);
    else if (c.annoy + 0.3 * c.temper < 1 || c.progress > 0.9) G.push(g, c.index);
    else return;
    cooldown = 0.3;
  };
}

test('はじめは 4 匹ともこたつの奥にいて、おやつは 3 個', () => {
  const g = G.createGame({ seed: 1 });
  assert.equal(g.cats.length, 4);
  assert.deepEqual(g.cats.map((c) => c.side), ['s', 'e', 'n', 'w']);
  for (const c of g.cats) {
    assert.equal(c.out, false);
    assert.equal(c.progress, 0);
  }
  assert.equal(g.treats, 3);
  assert.equal(g.phase, 'play');
  assert.equal(g.heat, 'mid');
});

test('同じ種なら同じ進み方をする', () => {
  const a = G.createGame({ seed: 42 });
  const b = G.createGame({ seed: 42 });
  const ea = run(a, 30);
  const eb = run(b, 30);
  assert.deepEqual(ea, eb);
  assert.deepEqual(a.cats.map((c) => c.progress), b.cats.map((c) => c.progress));
});

test('動いている猫はだんだん出てくる', () => {
  const g = G.createGame({ seed: 1 });
  forceCreep(g.cats[1]);
  run(g, 1, () => forceCreep(g.cats[1]));
  assert.ok(g.cats[1].progress > 0.05);
});

test('押すと奥にもどり、イライラがたまる。ほとんど出ていない猫は押せない', () => {
  const g = G.createGame({ seed: 1 });
  const c = g.cats[0];
  assert.equal(G.push(g, 0).type, 'none');
  c.progress = 0.7;
  const r = G.push(g, 0);
  assert.equal(r.type, 'push');
  assert.ok(c.progress < 0.7 && c.progress > 0);
  assert.ok(c.annoy > 0);
  assert.equal(c.state, 'stun');
  assert.equal(g.stats.pushes, 1);
});

test('押しすぎると怒って出ていく。短気な猫ほど早い', () => {
  function pushesUntilFlee(index) {
    const g = G.createGame({ seed: 1 });
    for (let n = 1; n < 20; n++) {
      g.cats[index].progress = 0.8;
      const r = G.push(g, index);
      if (r.type === 'flee') {
        assert.equal(g.cats[index].out, true);
        assert.equal(g.stats.flees, 1);
        return n;
      }
    }
    return Infinity;
  }
  const boss = pushesUntilFlee(3);
  const mochi = pushesUntilFlee(0);
  assert.ok(boss < mochi, `ボス ${boss} 回、もち ${mochi} 回`);
});

test('イライラは時間がたつと消える', () => {
  const g = G.createGame({ seed: 1 });
  g.cats[0].progress = 0.8;
  G.push(g, 0);
  const before = g.cats[0].annoy;
  run(g, 3);
  assert.ok(g.cats[0].annoy < before);
});

test('おやつをあげると奥にもどり、しばらく出てこない。なくなるとあげられない', () => {
  const g = G.createGame({ seed: 1 });
  const c = g.cats[2];
  c.progress = 0.9;
  c.annoy = 0.8;
  assert.equal(G.treat(g, 2).type, 'treat');
  assert.equal(c.progress, 0);
  assert.equal(c.annoy, 0);
  assert.equal(c.state, 'content');
  assert.equal(g.treats, 2);
  run(g, 8);
  assert.equal(c.progress, 0);
  G.treat(g, 0);
  G.treat(g, 1);
  assert.equal(g.treats, 0);
  assert.equal(G.treat(g, 3).type, 'none');
});

test('温度：強で上がり、弱で下がる。熱すぎると知らせる', () => {
  const g = G.createGame({ seed: 1 });
  G.setHeat(g, 'high');
  const events = run(g, 7, (g2) => g2.cats.forEach((c) => { c.state = 'content'; c.timer = 5; }));
  assert.ok(g.T >= G.HOT);
  assert.ok(events.some((e) => e.type === 'hot'));
  G.setHeat(g, 'low');
  run(g, 7, (g2) => g2.cats.forEach((c) => { c.state = 'content'; c.timer = 5; }));
  assert.ok(g.T < 0.6);
  G.setHeat(g, 'nope');
  assert.equal(g.heat, 'low');
});

test('寒いと出やすく、ちょうどいいと出にくく、熱すぎると飛び出す', () => {
  const cold = G.heatFactor(0.1);
  const mid = G.heatFactor(0.5);
  const sweet = G.heatFactor(0.8);
  const hot = G.heatFactor(0.95);
  assert.ok(cold > mid && mid > sweet && hot > cold);
});

test('完全に出た猫はしばらくして戻ってくる', () => {
  const g = G.createGame({ seed: 1 });
  const c = g.cats[0];
  c.progress = 0.99;
  forceCreep(c);
  const ev = run(g, 1, () => { if (!c.out) forceCreep(c); });
  assert.ok(ev.some((e) => e.type === 'escape' && e.cat === 0));
  assert.equal(c.out, true);
  const ev2 = run(g, 13);
  assert.ok(ev2.some((e) => e.type === 'return' && e.cat === 0));
  assert.equal(c.out, false);
});

test('4 匹とも出たら負け', () => {
  const g = G.createGame({ seed: 1 });
  for (const c of g.cats) c.progress = 0.999;
  g.cats.forEach(forceCreep);
  run(g, 0.5);
  assert.equal(g.phase, 'over');
  assert.equal(g.reason, 'empty');
});

test('物音のイベントが起きる（同じものは続かない）', () => {
  const g = G.createGame({ seed: 7 });
  const kinds = [];
  run(g, G.DURATION, (g2) => g2.cats.forEach((c) => { c.progress = 0; }))
    .filter((e) => e.type === 'event')
    .forEach((e) => kinds.push(e.kind));
  assert.ok(kinds.length >= 4, `イベント ${kinds.length} 回`);
  for (let i = 1; i < kinds.length; i++) assert.notEqual(kinds[i], kinds[i - 1]);
  for (const k of kinds) assert.ok(G.EVENT_KINDS.includes(k));
});

test('ピンポーンで全員が少し出てくる（おやつで満足している猫はのぞく）', () => {
  // ピンポーンが選ばれるまで、種を変えてやり直す
  for (let i = 0; i < 50; i++) {
    const copy = G.createGame({ seed: 3 + i });
    G.treat(copy, 0);
    copy.lastEvent = 'bird';
    copy.nextEvent = 0;
    copy.cats.forEach((c) => { if (c.index) c.state = 'rest'; c.timer = 99; });
    const ev = G.step(copy, DT);
    const e = ev.find((x) => x.type === 'event');
    if (e && e.kind === 'doorbell') {
      assert.equal(copy.cats[0].progress, 0);
      for (const c of copy.cats.slice(1)) assert.ok(c.progress >= 0.24);
      return;
    }
  }
  assert.fail('ピンポーンが一度も起きなかった');
});

test('朝まで耐えるとクリアで、時計は 21:00 から 7:00 まで進む', () => {
  assert.equal(G.clockText(0), '21:00');
  assert.equal(G.clockText(G.DURATION / 2), '2:00');
  assert.equal(G.clockText(G.DURATION), '7:00');
  const g = G.createGame({ seed: 1 });
  const ev = run(g, G.DURATION + 1, (g2) => g2.cats.forEach((c) => { c.progress = 0; }));
  assert.equal(g.phase, 'clear');
  assert.ok(ev.some((e) => e.type === 'clear'));
  assert.ok(g.cost > 0);
});

test('バランス：何もしないと朝までもたない', () => {
  let survived = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const g = G.createGame({ seed });
    run(g, G.DURATION + 1);
    if (g.phase === 'clear') survived++;
  }
  assert.ok(survived <= 3, `放置で ${survived} / 30 回クリア`);
});

test('バランス：ふつうに操作すれば、たいてい朝まで耐えられる', () => {
  let cleared = 0;
  const scores = [];
  for (let seed = 1; seed <= 30; seed++) {
    const g = G.createGame({ seed });
    run(g, G.DURATION + 1, bot({ treats: true }));
    if (g.phase === 'clear') cleared++;
    scores.push(Math.round(g.score));
  }
  assert.ok(cleared >= 24, `自動操作で ${cleared} / 30 回クリア（スコア ${scores.join(', ')}）`);
});

test('称号はスコアが高いほど上がり、負けたときは専用の称号', () => {
  const order = [0, 2600, 4100, 5600, 6700].map((s) => G.rank(s, 'clear'));
  assert.equal(new Set(order).size, order.length);
  assert.equal(G.rank(9999, 'over'), '猫に見捨てられし者');
});

test('絵：4 辺すべての出口があり、猫の毛の色がすべて描ける', () => {
  for (const s of G.SIDES) assert.ok(A.SLOTS[s], s);
  const g = G.createGame({ seed: 1 });
  const svg = A.scene(g.cats);
  for (const c of g.cats) assert.ok(svg.includes(`id="cat-${c.index}"`));
  for (const s of G.SIDES) assert.ok(svg.includes(`id="hit-${s}"`) && svg.includes(`id="bubble-${s}"`));
  // 出ていないとき（progress 0）は顔がふとんにかくれ、出きったとき（1）は外に出ている
  assert.ok(A.offsetFor(0) < -60);
  assert.ok(A.offsetFor(1) >= 180);
});

test('index.html：全画面の処理と、ホーム画面に追加したとき用の設定がある', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.includes('js/fullscreen.js'));
  assert.ok(html.includes('apple-mobile-web-app-capable'));
  for (const f of ['fullscreen.js', 'game.js', 'art.js', 'sound.js', 'main.js']) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'js', f)), f);
  }
});
