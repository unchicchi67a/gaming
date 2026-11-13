'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/game.js');

const DT = 1 / 60;

/** ゲームを最後まで（または limit 秒まで）すすめる。bot(g, state) が押すかどうかを返す。 */
function play(bot, seed, limit = 300) {
  const g = G.createGame({ rng: G.makeRng(seed) });
  const st = { holding: false };
  while (g.state === 'playing' && g.time < limit) G.step(g, DT, bot(g, st));
  return g;
}

const won = (g) => ['win', 'center', 'oppBack'].includes(g.result);

/**
 * 人が遊ぶのに近いボット。部長に抜かれたら、間が少したってから target(g) まで下げる。
 * 腰が尽きそうになったら手を離す。
 */
function makeBot(wait, target) {
  return (g, st) => {
    const p = g.player;
    const o = g.opp;
    if (st.holding) {
      if (p.x >= st.target || p.stamina < 0.03) st.holding = false;
      return st.holding;
    }
    if (p.x - o.x <= g.tuning.tolerance && g.ma >= wait) {
      st.holding = true;
      st.target = target(g);
    }
    return st.holding;
  };
}

/** 部長の腰を est と見積もって、部長が返せない深さまで下げられるならトドメを狙う。むりなら少しだけ下げる。 */
function killOrSmall(g, est) {
  const p = g.player;
  const o = g.opp;
  const t = g.tuning;
  for (let target = Math.max(p.x, o.x + t.tolerance + 0.5); target < G.GOAL; target += 1) {
    const myCost = G.costToReach(g, p, target, t.playerVmax, t.drain);
    if (myCost > p.stamina - 0.03) break;
    const bossCost = G.costToReach(g, o, target + t.tolerance + 0.5, t.oppV, t.oppDrain);
    if (bossCost > est + t.oppRecover * (myCost / t.drain) + 0.05) return target + 0.5;
  }
  return G.reachIn(o.x, 0.4, t.playerVmax, t);
}

const FACE_EST = { calm: 0.8, sweat: 0.45, tired: 0.2 };
const smallBot = makeBot(0.2, (g) => G.reachIn(g.opp.x, 0.4, g.tuning.playerVmax, g.tuning));
const bigBot = makeBot(0.6, (g) => G.reachIn(g.opp.x, 1.4, g.tuning.playerVmax, g.tuning));
const readerBot = makeBot(0.9, (g) => killOrSmall(g, FACE_EST[g.opp.face]));

function winRate(bot, n, rank) {
  let wins = 0;
  for (let seed = 1; seed <= n; seed++) {
    const g = G.createGame({ rng: G.makeRng(seed), rank });
    const st = { holding: false };
    while (g.state === 'playing' && g.time < 300) G.step(g, DT, bot(g, st));
    if (won(g)) wins++;
  }
  return wins / n;
}

/** 部長がしばらく動かないようにする（諦めたことにする）。 */
function freezeOpp(g) {
  g.opp.mode = 'wait';
  g.opp.plan = 'concede';
}

// ---------- 深さと地層 ----------

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

// ---------- 動きと腰 ----------

test('速さ：床より上はゆっくり、地下は深いほど速い。reachIn と travelTime は逆の関係', () => {
  const t = G.TUNING;
  assert.ok(G.speedFactor(10, t) < 1);
  assert.ok(G.speedFactor(G.SURFACE + 60, t) > G.speedFactor(G.SURFACE + 10, t));
  for (const x of [0, 12, G.SURFACE, G.SURFACE + 40]) {
    const to = G.reachIn(x, 0.8, t.playerVmax, t);
    assert.ok(Math.abs(G.travelTime(x, to, t.playerVmax, t) - 0.8) < 1e-6, `x=${x}`);
  }
});

test('押しつづけるほど腰の減りが増え、止まると少しずつ回復する', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  freezeOpp(g);
  g.player.x = G.SURFACE;
  g.player.floorHp = 0;
  const s0 = g.player.stamina;
  G.step(g, 0.25, true);
  const first = s0 - g.player.stamina;
  for (let i = 0; i < 4; i++) G.step(g, 0.25, true);
  const s1 = g.player.stamina;
  G.step(g, 0.25, true);
  const later = s1 - g.player.stamina;
  assert.ok(later > first * 1.5, `はじめ ${first}、あと ${later}`);
  // 止まると回復する
  const s2 = g.player.stamina;
  for (let i = 0; i < 8; i++) G.step(g, 0.25, false);
  assert.ok(g.player.stamina > s2);
});

test('腰の見こみ（costToReach）は、じっさいに押したときとだいたい合う', () => {
  for (const [x, floorHp, sec] of [[0, 1, 1], [10, 1, 2.5], [G.SURFACE + 5, 0, 1.2], [G.SURFACE + 60, 0, 0.6]]) {
    const g = G.createGame({ rng: G.makeRng(1), tuning: { layerBonus: 0 } }); // 地層の一番乗りで回復しないように
    freezeOpp(g);
    g.opp.x = G.GOAL - 1; // じゃまにならないところへ
    g.player.x = x;
    g.player.floorHp = floorHp;
    const target = G.reachIn(x, sec, g.tuning.playerVmax, g.tuning);
    const est = G.costToReach(g, g.player, target, g.tuning.playerVmax, g.tuning.drain);
    const s0 = g.player.stamina;
    while (g.player.x < target && g.state === 'playing') G.step(g, DT, true);
    const used = s0 - g.player.stamina;
    assert.ok(Math.abs(used - est) < Math.max(0.03, est * 0.15), `x=${x}：見こみ ${est.toFixed(3)}、じっさい ${used.toFixed(3)}`);
  }
});

test('押しっぱなしだと、ぎっくり腰で負け', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = play(() => true, seed);
    assert.equal(g.result, 'back');
    assert.equal(g.player.stamina, 0);
  }
});

// ---------- 間（ま）と名刺交換 ----------

test('はじめは部長が先に会釈していて、何もしないと部長が名刺を差し出して負け（その前にそぶりを見せる）', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const g = G.createGame({ rng: G.makeRng(seed) });
    assert.ok(g.opp.x > g.player.x + g.tuning.tolerance);
    const types = [];
    while (g.state === 'playing') for (const e of G.step(g, DT, false)) types.push(e.type);
    assert.equal(g.result, 'rude');
    assert.ok(g.time <= g.tuning.oppPatience[1] + 0.05);
    assert.ok(types.indexOf('oppReach') >= 0 && types.indexOf('oppReach') < types.indexOf('over'));
  }
});

test('自分が低いまま間が満ちたら勝ち。名刺交換した場所が記録される', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  g.player.x = 12;
  g.opp.x = 8;
  g.opp.stamina = 0.01; // 下げ返せない
  while (g.state === 'playing') G.step(g, DT, false);
  assert.equal(g.result, 'win');
  assert.equal(g.exchangeX, 12);
  assert.ok(Math.abs(g.time - g.tuning.maPlayer) < 0.05);
});

test('同じ高さのまま間が満ちたら、お見合いで引き分け', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  g.player.x = 10;
  g.opp.x = 10.5;
  g.opp.stamina = 0.01;
  while (g.state === 'playing') G.step(g, DT, false);
  assert.equal(g.result, 'draw');
});

test('押しているあいだ間は止まるが、0 にはもどらない（どちらが低いかが入れかわったときだけもどる）', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  g.tuning.oppPatience = [5, 5];
  for (let i = 0; i < 60; i++) G.step(g, DT, false); // 1 秒待つ
  assert.ok(g.ma > 0.9);
  const ma = g.ma;
  G.step(g, 0.1, true); // 少しだけ押す（まだ部長のほうが低い）
  assert.ok(g.opp.x - g.player.x > g.tuning.tolerance);
  assert.ok(Math.abs(g.ma - ma) < 1e-9, '押しているあいだに間が進んだか、もどった');
  // 抜くと 0 にもどる
  while (g.player.x <= g.opp.x + g.tuning.tolerance) G.step(g, DT, true);
  assert.equal(g.ma, 0);
});

// ---------- 部長 ----------

test('部長は、下げ返す腰がないと諦める', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  g.player.x = 15;
  g.opp.x = 8;
  g.opp.stamina = 0.05;
  const events = G.step(g, DT, false);
  assert.deepEqual(events.find((e) => e.type === 'oppThink'), { type: 'oppThink', plan: 'concede' });
});

test('部長は、あなたの腰が少ないと、返せない深さまで突き放してくる', () => {
  let kills = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const g = G.createGame({ rng: G.makeRng(seed) });
    g.player.x = 12;
    g.player.stamina = 0.08;
    g.opp.x = 10;
    g.opp.max = g.opp.stamina = 1.2;
    let answer = null;
    while (!answer && g.state === 'playing') answer = G.step(g, DT, false).find((e) => e.type === 'oppAnswer');
    if (answer && answer.kill) {
      kills++;
      const cost = G.costToReach(g, g.player, g.opp.target + g.tuning.tolerance, g.tuning.playerVmax, g.tuning.drain);
      assert.ok(cost > g.player.stamina, '突き放しても、あなたが返せる深さだった');
    }
  }
  assert.ok(kills >= 12, `突き放した回数 ${kills} / 20`);
});

test('部長の顔は、疲れぐあいをだいたい表すが、やせがまんや疲れたふりもする', () => {
  const faces = { tired: {}, fresh: {} };
  for (let seed = 1; seed <= 300; seed++) {
    for (const [key, stamina] of [['tired', 0.2], ['fresh', 1.1]]) {
      const g = G.createGame({ rng: G.makeRng(seed) });
      g.player.x = 8;
      g.opp.x = 6;
      g.opp.stamina = stamina;
      G.step(g, DT, false);
      faces[key][g.opp.face] = (faces[key][g.opp.face] || 0) + 1;
    }
  }
  assert.ok(faces.tired.tired > faces.tired.calm, JSON.stringify(faces));
  assert.ok(faces.tired.calm > 30, 'やせがまんしない');
  assert.ok(faces.fresh.calm > faces.fresh.tired, JSON.stringify(faces));
  assert.ok(faces.fresh.tired > 20, '疲れたふりをしない');
});

test('部長の腰の強さは毎回ちがう', () => {
  const maxes = new Set();
  for (let seed = 1; seed <= 20; seed++) maxes.add(G.createGame({ rng: G.makeRng(seed) }).opp.max.toFixed(2));
  assert.ok(maxes.size > 10);
  for (const m of maxes) assert.ok(Number(m) >= G.TUNING.oppStamina[0] && Number(m) <= G.TUNING.oppStamina[1]);
});

// ---------- 床・地層・じゃまもの ----------

test('床より上では、段階を順に進み、そのたびにできごとが起きる', () => {
  const g = G.createGame({ rng: G.makeRng(1), tuning: { strain: 0 } }); // 押しっぱなしでもぎっくり腰にならないように
  freezeOpp(g);
  g.opp.x = G.GOAL - 1;
  const stages = [];
  while (g.player.x < G.SURFACE && g.state === 'playing') {
    for (const e of G.step(g, DT, true)) {
      if (e.type === 'stage' && e.who === 'player') stages.push(e.index);
    }
  }
  assert.deepEqual(stages, [1, 2, 3, 4, 5, 6]);
  assert.equal(G.SURFACE_STAGES[G.stageIndexAt(G.SURFACE)].name, '床にはりつく');
});

test('床は、floorTime 秒押しつづけないと掘りきれない', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  freezeOpp(g);
  g.player.x = G.SURFACE;
  let broke = null;
  for (let i = 0; i < 600 && broke === null; i++) {
    if (G.step(g, DT, true).some((e) => e.type === 'floorBreak' && e.who === 'player')) broke = g.time;
  }
  assert.ok(Math.abs(broke - G.TUNING.floorTime) < 0.05, `掘りきった時間 ${broke}`);
  assert.equal(g.player.floorHp, 0);
  // 掘りきるまでは床の高さのまま
  const h = G.createGame({ rng: G.makeRng(1) });
  freezeOpp(h);
  h.player.x = G.SURFACE;
  G.step(h, 0.25, true);
  assert.equal(h.player.x, G.SURFACE);
  // 掘りきったあとは下に進める
  G.step(g, 0.2, true);
  assert.ok(g.player.x > G.SURFACE);
});

test('新しい地層に一番乗りすると、腰が少し回復する', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  freezeOpp(g);
  g.player.x = G.SURFACE;
  g.player.floorHp = 0;
  g.player.stamina = 0.5;
  let layer = null;
  while (!layer) layer = G.step(g, DT, true).find((e) => e.type === 'layer');
  assert.equal(layer.by, 'player');
  assert.ok(Math.abs(layer.bonus - G.TUNING.layerBonus) < 1e-9);
});

test('電車には自分も部長も当たり、気絶して押し戻される', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  const train = G.HAZARDS.findIndex((h) => h.id === 'train');
  const h = G.HAZARDS[train];
  for (const m of [g.player, g.opp]) {
    m.floorHp = 0;
    m.x = (h.from + h.to) / 2;
  }
  freezeOpp(g);
  g.hazards[train].phase = 'warn';
  g.hazards[train].timer = 0.001;
  const events = G.step(g, DT, false);
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
  assert.ok(!G.step(g, DT, false).some((e) => e.type === 'hit' && e.who === 'player'));
});

test('じゃまものの区間は、それぞれの地層の中にある', () => {
  const layerOf = { train: 'subway', geyser: 'onsen' };
  for (const h of G.HAZARDS) {
    assert.ok(h.from < h.to);
    assert.equal(G.LAYERS[G.layerIndexAt(h.from)].id, layerOf[h.id]);
    assert.equal(G.LAYERS[G.layerIndexAt(h.to)].id, layerOf[h.id]);
  }
});

// ---------- 勝ち負け ----------

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
  g.player.x = G.GOAL - 5;
  const events = G.step(g, 0.1, false);
  assert.equal(g.result, 'beaten');
  assert.deepEqual(events.at(-1), { type: 'over', result: 'beaten' });
});

test('長い dt を渡しても、一度に進むのは 0.25 秒まで', () => {
  const g = G.createGame({ rng: G.makeRng(1) });
  G.step(g, 10, true);
  assert.ok(Math.abs(g.time - 0.25) < 1e-9);
});

test('称号は、名刺交換した場所が深いほど上', () => {
  assert.equal(G.rankFor(10), '常識ある社会人');
  assert.equal(G.rankFor(G.SURFACE + 1), 'できる社会人');
  assert.equal(G.rankFor(G.xAtDepth(100)), 'できる営業');
  assert.equal(G.rankFor(G.xAtDepth(50000)), '伝説の営業');
  assert.equal(G.rankFor(G.GOAL), '名刺交換の神');
});

// ---------- バランス（読み合いになっているか） ----------

test('バランス：何もしない・押しっぱなしでは勝てない', () => {
  for (let seed = 1; seed <= 10; seed++) {
    assert.ok(!won(play(() => false, seed)));
    assert.ok(!won(play(() => true, seed)));
  }
});

test('バランス：顔色を読んでトドメを狙うと、毎回ドカンや毎回ちょっとより勝てる。ただし必勝ではない', () => {
  const n = 120;
  const reader = winRate(readerBot, n);
  const big = winRate(bigBot, n);
  const small = winRate(smallBot, n);
  const msg = `読む ${reader.toFixed(2)}、毎回ドカン ${big.toFixed(2)}、毎回ちょっと ${small.toFixed(2)}`;
  assert.ok(reader > big && reader > small, msg);
  assert.ok(reader >= 0.55 && reader <= 0.85, msg);
  assert.ok(big <= 0.7 && small <= 0.7, msg);
  assert.ok(big >= 0.3 && small >= 0.3, msg);
});

test('相手の役職：6 つあり、指定しないと部長。役職ごとの値が使われる', () => {
  assert.deepEqual(G.RANKS.map((r) => r.name), ['平社員', '係長', '課長', '部長', '局長', '社長']);
  assert.equal(G.createGame({ rng: G.makeRng(1) }).rank.name, '部長');
  assert.equal(G.createGame({ rng: G.makeRng(1), rank: 'nope' }).rank.name, '部長');
  const shacho = G.createGame({ rng: G.makeRng(1), rank: 'shacho' });
  assert.equal(shacho.rank.name, '社長');
  assert.deepEqual(shacho.tuning.oppStamina, G.RANKS.at(-1).tuning.oppStamina);
  assert.ok(shacho.opp.max >= shacho.tuning.oppStamina[0]);
  // 役職で変わるのは相手のことだけ（自分の腰や速さは同じ）
  for (const r of G.RANKS) {
    for (const key of Object.keys(r.tuning)) assert.ok(key.startsWith('opp'), `${r.name} の ${key}`);
  }
});

test('バランス：役職が上がるほど勝ちにくい。平社員はほぼ勝てて、社長でも勝てなくはない', () => {
  const n = 80;
  const rates = G.RANKS.map((r) => winRate(readerBot, n, r.id));
  const msg = G.RANKS.map((r, i) => `${r.name} ${rates[i].toFixed(2)}`).join('、');
  for (let i = 1; i < rates.length; i++) assert.ok(rates[i] <= rates[i - 1] + 0.03, msg);
  assert.ok(rates[0] >= 0.85, msg);
  assert.ok(rates.at(-1) >= 0.05 && rates.at(-1) <= 0.45, msg);
  assert.ok(rates[0] - rates.at(-1) >= 0.5, msg);
});

test('読み合いが続くと、地下の地層まで潜る', () => {
  let deep = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const g = play(readerBot, seed);
    if (g.deepestLayer >= G.LAYERS.findIndex((l) => l.id === 'subway')) deep++;
  }
  assert.ok(deep >= 6, `地下鉄より深く行った試合 ${deep} / 60`);
});

test('追い抜き・追い抜かれ・地層のできごとが起きる', () => {
  const types = new Set();
  for (let seed = 1; seed <= 10; seed++) {
    const g = G.createGame({ rng: G.makeRng(seed) });
    const st = { holding: false };
    const layers = [];
    while (g.state === 'playing') {
      for (const e of G.step(g, DT, readerBot(g, st))) {
        types.add(e.type);
        if (e.type === 'layer') layers.push(e.index);
      }
    }
    // 地層は浅いほうから順に 1 回ずつ
    assert.deepEqual(layers, layers.slice().sort((a, b) => a - b));
    assert.equal(new Set(layers).size, layers.length);
  }
  for (const type of ['overtake', 'overtaken', 'stage', 'oppThink', 'oppAnswer', 'maStart', 'over']) {
    assert.ok(types.has(type), type);
  }
});
