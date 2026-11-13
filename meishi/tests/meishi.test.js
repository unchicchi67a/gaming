'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');

/** ゲームを最後まで（または limit 秒まで）すすめる。bot(g, state) が押すかどうかを返す。 */
function play(bot, seed, limit = 300) {
  const g = G.createGame({ rng: G.makeRng(seed) });
  const st = { holding: false };
  while (g.state === 'playing' && g.time < limit) G.step(g, 1 / 60, bot(g, st));
  return g;
}

/** 腰ゲージを見ながら押したり離したりする。 */
function rhythmBot(g, st) {
  if (st.holding && g.player.stamina < 0.15) st.holding = false;
  else if (!st.holding && g.player.stamina > 0.7) st.holding = true;
  return st.holding;
}

test('深さ：床より上は高さ、床で 0、ゴールで地球の半径', () => {
  assert.ok(Math.abs(G.depthAt(0) + G.START_HEIGHT) < 1e-9);
  assert.equal(G.depthAt(G.SURFACE), 0);
  assert.equal(G.depthAt(G.GOAL), G.EARTH_RADIUS);
  assert.equal(G.depthAt(G.GOAL + 5), G.EARTH_RADIUS);
});

test('深さ：x が増えるほど深くなり、xAtDepth で元に戻る', () => {
  let prev = -Infinity;
  for (let x = 0; x <= G.GOAL; x += 0.5) {
    const d = G.depthAt(x);
    assert.ok(d > prev, `x=${x} で深さが増えていない`);
    prev = d;
    assert.ok(Math.abs(G.xAtDepth(d) - x) < 1e-6, `x=${x} の逆変換がずれている`);
  }
});

test('地層：上から順に並び、深さに合った地層を返す', () => {
  for (let i = 2; i < G.LAYERS.length; i++) assert.ok(G.LAYERS[i].from > G.LAYERS[i - 1].from);
  assert.equal(G.LAYERS[G.layerIndexAt(0)].id, 'office');
  assert.equal(G.LAYERS[G.layerIndexAt(G.SURFACE + 0.1)].id, 'underfloor');
  assert.equal(G.LAYERS[G.layerIndexAt(G.xAtDepth(20))].id, 'subway');
  assert.equal(G.LAYERS[G.layerIndexAt(G.xAtDepth(100000))].id, 'mantle');
  assert.equal(G.LAYERS[G.layerIndexAt(G.GOAL)].id, 'inner');
});

test('深さの表示', () => {
  assert.equal(G.formatDepth(0), '床から 120 cm');
  assert.equal(G.formatDepth(G.xAtDepth(3.24)), '地下 3.2 m');
  assert.equal(G.formatDepth(G.xAtDepth(567)), '地下 567 m');
  assert.equal(G.formatDepth(G.xAtDepth(12345)), '地下 12.3 km');
  assert.equal(G.formatDepth(G.xAtDepth(1234567)), '地下 1,235 km');
  assert.equal(G.formatDepth(G.GOAL), '地球の中心');
});

test('何もしないと、部長より高いままで失礼度が満タンになって負け', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = play(() => false, seed);
    assert.equal(g.result, 'rude');
    assert.ok(g.time < 15);
  }
});

test('押しっぱなしだと、ぎっくり腰で負け', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = play(() => true, seed);
    assert.equal(g.result, 'back');
    assert.equal(g.player.stamina, 0);
  }
});

test('腰と相談しながら押せば、たいてい勝てる（バランスの確認）', () => {
  // 部長が強すぎるという声があったので、ふつうに押せばほぼ勝てるようにしている
  let wins = 0;
  const n = 60;
  for (let seed = 1; seed <= n; seed++) {
    const g = play(rhythmBot, seed);
    assert.notEqual(g.state, 'playing', '300 秒で決着がついていない');
    if (g.result === 'win') {
      wins++;
      assert.ok(g.player.x >= G.GOAL);
    }
  }
  assert.ok(wins >= n * 0.85, `勝った回数 ${wins} / ${n}`);
});

test('腰を使い切らない雑な押し方だと、ときどき部長に負ける（簡単すぎない）', () => {
  const casual = (g, st) => {
    if (st.holding && g.player.stamina < 0.4) st.holding = false;
    else if (!st.holding && g.player.stamina > 0.9) st.holding = true;
    return st.holding;
  };
  let wins = 0;
  const n = 120;
  for (let seed = 1; seed <= n; seed++) if (play(casual, seed).result === 'win') wins++;
  assert.ok(wins >= n * 0.6 && wins < n, `勝った回数 ${wins} / ${n}`);
});

test('床より上では、段階を順に進み、そのたびにできごとが起きる', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  const stages = [];
  const st = { holding: false };
  while (g.player.x < G.SURFACE && g.state === 'playing') {
    for (const e of G.step(g, 1 / 60, rhythmBot(g, st))) {
      if (e.type === 'stage' && e.who === 'player') stages.push(e.index);
    }
  }
  assert.deepEqual(stages, [1, 2, 3, 4, 5, 6]);
  assert.equal(G.SURFACE_STAGES[G.stageIndexAt(G.SURFACE)].name, '床にはりつく');
});

test('床は、floorTime 秒押しつづけないと掘りきれない', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  g.player.x = G.SURFACE;
  g.player.stamina = 1;
  let broke = null;
  for (let i = 0; i < 600 && broke === null; i++) {
    if (G.step(g, 1 / 60, true).some((e) => e.type === 'floorBreak' && e.who === 'player')) broke = g.time;
  }
  assert.ok(Math.abs(broke - G.TUNING.floorTime) < 0.05, `掘りきった時間 ${broke}`);
  assert.equal(g.player.floorHp, 0);
  // 掘りきるまでは床の高さのまま
  const h = G.createGame({ rng: G.makeRng(1) });
  h.player.x = G.SURFACE;
  G.step(h, 0.25, true);
  assert.equal(h.player.x, G.SURFACE);
  // 掘りきったあとは下に進める
  G.step(g, 0.2, true);
  assert.ok(g.player.x > G.SURFACE);
});

test('電車には自分も部長も当たり、気絶して押し戻される', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  const train = G.HAZARDS.findIndex((h) => h.id === 'train');
  const h = G.HAZARDS[train];
  for (const m of [g.player, g.opp]) {
    m.floorHp = 0;
    m.x = (h.from + h.to) / 2;
  }
  g.opp.mode = 'rest';
  g.opp.react = 99; // 部長が動かないように
  g.hazards[train].phase = 'warn';
  g.hazards[train].timer = 0.001;
  const events = G.step(g, 1 / 60, false);
  const hits = events.filter((e) => e.type === 'hit').map((e) => e.who).sort();
  assert.deepEqual(hits, ['opp', 'player']);
  assert.ok(g.player.x < h.from && g.opp.x < h.from);
  assert.ok(g.player.stun > 0);
  // 気絶しているあいだは、押しても下がらない
  const x = g.player.x;
  G.step(g, 0.25, true);
  assert.equal(g.player.x, x);
  // 同じ電車には 2 回当たらない
  g.player.stun = 0;
  g.player.x = (h.from + h.to) / 2;
  assert.ok(!G.step(g, 1 / 60, false).some((e) => e.type === 'hit' && e.who === 'player'));
});

test('じゃまものの区間は、それぞれの地層の中にある', () => {
  const layerOf = { train: 'subway', geyser: 'onsen' };
  for (const h of G.HAZARDS) {
    assert.ok(h.from < h.to);
    assert.equal(G.LAYERS[G.layerIndexAt(h.from)].id, layerOf[h.id]);
    assert.equal(G.LAYERS[G.layerIndexAt(h.to)].id, layerOf[h.id]);
  }
});

test('「お先にどうぞ」と言ったら負け。終わったあとは動かない', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  G.step(g, 0.5, true);
  const events = G.surrender(g);
  assert.deepEqual(events, [{ type: 'over', result: 'surrender' }]);
  assert.equal(g.state, 'over');
  const x = g.player.x;
  assert.deepEqual(G.step(g, 1, true), []);
  assert.equal(g.player.x, x);
  assert.deepEqual(G.surrender(g), []);
});

test('部長に先に地球の中心に着かれたら負け', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  g.opp.floorHp = 0;
  g.player.floorHp = 0;
  g.opp.x = G.GOAL - 0.01;
  g.opp.v = 5;
  g.player.x = G.GOAL - 5; // 自分のほうが高いので失礼度もたまるが、先に部長が着く
  const events = G.step(g, 0.1, false);
  assert.equal(g.result, 'beaten');
  assert.deepEqual(events.at(-1), { type: 'over', result: 'beaten' });
});

test('追い抜き・地層のできごとが起きる', () => {
  const g = G.createGame({ rng: G.makeRng(3) });
  const types = new Set();
  const layers = [];
  const st = { holding: false };
  while (g.state === 'playing') {
    for (const e of G.step(g, 1 / 60, rhythmBot(g, st))) {
      types.add(e.type);
      if (e.type === 'layer') layers.push(e.index);
    }
  }
  assert.ok(types.has('overtake'));
  assert.ok(types.has('stage'));
  assert.ok(types.has('floorBreak'));
  assert.ok(types.has('over'));
  // 地層は 1 から順に 1 回ずつ
  assert.deepEqual(layers, layers.slice().sort((a, b) => a - b));
  assert.equal(new Set(layers).size, layers.length);
  assert.equal(layers[0], 1);
});

test('部長に抜かれることもある', () => {
  let overtaken = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = G.createGame({ rng: G.makeRng(seed) });
    const st = { holding: false };
    while (g.state === 'playing') {
      if (G.step(g, 1 / 60, rhythmBot(g, st)).some((e) => e.type === 'overtaken')) overtaken++;
    }
  }
  assert.ok(overtaken > 0);
});

test('長い dt を渡しても、一度に進むのは 0.25 秒まで', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  G.step(g, 10, true);
  assert.ok(Math.abs(g.time - 0.25) < 1e-9);
});

test('称号', () => {
  assert.equal(G.rankFor(40), '名刺交換の神');
  assert.equal(G.rankFor(47), '伝説の営業');
  assert.equal(G.rankFor(55), 'できる社会人');
  assert.equal(G.rankFor(90), '期待の新人');
});
