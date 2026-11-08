'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Story = require('../js/story.js');
const Breath = require('../js/breath.js');

/** 操作を順番に適用し、最後の状態と全イベントを返す。 */
function run(state, actions) {
  let s = state;
  const events = [];
  for (const a of actions) {
    const r = Story.act(s, a);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

const sceneId = (s) => Story.currentScene(s).id;
const types = (events) => events.map((e) => e.type);
const repeat = (action, n) => Array.from({ length: n }, () => action);

test('物語はタイトルから始まり、はじめるでわらの家づくりに進む', () => {
  const s0 = Story.createState();
  assert.equal(sceneId(s0), 'title');
  assert.equal(Story.isInteractive(s0), false);
  const { state, events } = Story.act(s0, 'start');
  assert.equal(sceneId(state), 'straw-build');
  assert.deepEqual(events, [{ type: 'scene', id: 'straw-build' }]);
  assert.equal(Story.isInteractive(state), true);
});

test('場面の順番が物語どおりになっている', () => {
  assert.deepEqual(Story.SCENES.map((s) => s.id), [
    'title',
    'straw-build', 'straw-blow',
    'wood-build', 'wood-blow',
    'brick-build', 'brick-blow',
    'pot-fill',
    'ending',
  ]);
});

test('家づくり：タッチするたびにパーツが増え、規定回数で完成して次の場面へ', () => {
  const s = Story.createState('straw-build');
  const total = Story.currentScene(s).pieces;
  const before = run(s, repeat('tap', total - 1));
  assert.equal(sceneId(before.state), 'straw-build');
  assert.equal(before.state.count, total - 1);
  assert.deepEqual(before.events.map((e) => e.index), [...Array(total - 1).keys()]);

  const last = Story.act(before.state, 'tap');
  assert.deepEqual(types(last.events), ['piece', 'built', 'scene']);
  assert.equal(last.events[0].index, total - 1);
  assert.equal(sceneId(last.state), 'straw-blow');
  assert.equal(last.state.count, 0);
});

test('家ごとのパーツ数：わら 5・き 6・レンガ 8', () => {
  const pieces = Object.fromEntries(
    Story.SCENES.filter((s) => s.kind === 'build').map((s) => [s.house, s.pieces]),
  );
  assert.deepEqual(pieces, { straw: 5, wood: 6, brick: 8 });
});

test('わらの家は 1 回のふーっで吹き飛ぶ', () => {
  const r = Story.act(Story.createState('straw-blow'), 'blow');
  assert.deepEqual(types(r.events), ['blownAway', 'scene']);
  assert.equal(sceneId(r.state), 'wood-build');
});

test('木の家は 1 回目はぐらぐら、2 回目で吹き飛ぶ', () => {
  const first = Story.act(Story.createState('wood-blow'), 'blow');
  assert.deepEqual(first.events, [{ type: 'shake', house: 'wood', index: 0, total: 2 }]);
  assert.equal(sceneId(first.state), 'wood-blow');
  const second = Story.act(first.state, 'blow');
  assert.deepEqual(types(second.events), ['blownAway', 'scene']);
  assert.equal(sceneId(second.state), 'brick-build');
});

test('レンガの家は何度ふーっとしても吹き飛ばず、3 回でオオカミがあきらめる', () => {
  const { state, events } = run(Story.createState('brick-blow'), repeat('blow', 3));
  assert.deepEqual(types(events), ['holds', 'holds', 'holds', 'gaveUp', 'scene']);
  assert.ok(!types(events).includes('blownAway'));
  assert.equal(sceneId(state), 'pot-fill');
});

test('おなべ：4 回タッチでお湯がわき、エンディングへ', () => {
  const { state, events } = run(Story.createState('pot-fill'), repeat('tap', 4));
  assert.deepEqual(types(events), ['pour', 'pour', 'pour', 'pour', 'boiling', 'scene']);
  assert.equal(sceneId(state), 'ending');
  assert.equal(Story.isInteractive(state), false);
});

test('場面に合わない操作は無視する', () => {
  const cases = [
    ['title', 'tap'], ['title', 'blow'],
    ['straw-build', 'blow'], ['straw-build', 'start'],
    ['wood-blow', 'tap'],
    ['pot-fill', 'blow'],
    ['ending', 'tap'], ['ending', 'start'],
  ];
  for (const [id, action] of cases) {
    const s = Story.createState(id);
    const r = Story.act(s, action);
    assert.equal(r.state, s, `${id} / ${action}`);
    assert.deepEqual(r.events, [], `${id} / ${action}`);
  }
});

test('状態は書き換えられない（act は新しい状態を返す）', () => {
  const s = Story.createState('straw-build');
  Story.act(s, 'tap');
  assert.equal(s.count, 0);
  assert.ok(Object.isFrozen(s));
});

test('最初から最後まで通しで遊べる', () => {
  const actions = ['start'];
  for (const scene of Story.SCENES) {
    if (scene.kind === 'build' || scene.kind === 'fill') actions.push(...repeat('tap', scene.pieces));
    if (scene.kind === 'blow') actions.push(...repeat('blow', scene.blows));
  }
  const { state, events } = run(Story.createState(), actions);
  assert.equal(sceneId(state), 'ending');
  const visited = events.filter((e) => e.type === 'scene').map((e) => e.id);
  assert.deepEqual(visited, Story.SCENES.slice(1).map((s) => s.id));
});

test('エンディングの「もういっかい」でわらの家づくりから、「home」でタイトルに戻る', () => {
  const again = Story.act(Story.createState('ending'), 'restart');
  assert.equal(sceneId(again.state), 'straw-build');
  const home = Story.act(Story.createState('wood-blow'), 'home');
  assert.equal(sceneId(home.state), 'title');
  assert.deepEqual(home.events, [{ type: 'scene', id: 'title' }]);
  const already = Story.createState();
  assert.equal(Story.act(already, 'home').state, already);
});

test('required は場面ごとの必要回数を返す', () => {
  const byId = Object.fromEntries(Story.SCENES.map((s) => [s.id, Story.required(s)]));
  assert.equal(byId.title, 0);
  assert.equal(byId['straw-build'], 5);
  assert.equal(byId['brick-blow'], 3);
  assert.equal(byId['pot-fill'], 4);
  assert.equal(byId.ending, 0);
});

test('知らない場面名はエラーになる', () => {
  assert.throws(() => Story.createState('castle'), /unknown scene/);
});

// ---- ふーっの判定 ----

/** level を dt ミリ秒ごとに n 回入れ、ふーっと判定された時刻の一覧を返す。 */
function feedMany(det, level, n, startTime, dt = 16) {
  const hits = [];
  let t = startTime;
  for (let i = 0; i < n; i++) {
    if (det.feed(level, t).blow) hits.push(t);
    t += dt;
  }
  return { hits, time: t };
}

test('ふーっ：静かな音では判定しない', () => {
  const det = Breath.createBreathDetector();
  const { hits } = feedMany(det, 0.01, 300, 0);
  assert.deepEqual(hits, []);
});

test('ふーっ：大きな音が holdMs 以上つづくと 1 回だけ判定する', () => {
  const det = Breath.createBreathDetector({ holdMs: 150 });
  let t = feedMany(det, 0.01, 30, 0).time;
  const start = t;
  const { hits } = feedMany(det, 0.3, 60, t); // 約 1 秒ふきつづける
  assert.equal(hits.length, 1);
  assert.ok(hits[0] - start >= 150);
});

test('ふーっ：短い音（パチッという音など）は判定しない', () => {
  // 約 64ms の大きな音と静かな時間をくり返す。静かになるたびにリセットされるので判定されない
  const det = Breath.createBreathDetector({ holdMs: 150 });
  let hits = 0;
  let t = 0;
  for (let k = 0; k < 10; k++) {
    const loud = feedMany(det, 0.5, 4, t);
    hits += loud.hits.length;
    const quiet = feedMany(det, 0.01, 10, loud.time);
    hits += quiet.hits.length;
    t = quiet.time;
  }
  assert.equal(hits, 0);
});

test('ふーっ：いったん静かになってから、もう一度ふくと 2 回目を判定する', () => {
  const det = Breath.createBreathDetector({ holdMs: 100, cooldownMs: 500 });
  let t = 0;
  let r = feedMany(det, 0.3, 30, t); t = r.time;
  assert.equal(r.hits.length, 1);
  r = feedMany(det, 0.01, 40, t); t = r.time; // 約 640ms 静か
  r = feedMany(det, 0.3, 30, t);
  assert.equal(r.hits.length, 1);
});

test('ふーっ：うるさい部屋では雑音の大きさを学習し、その程度の音では判定しない', () => {
  const det = Breath.createBreathDetector();
  // 雑音 0.05 がずっと続く部屋（minLevel より大きい）
  const { hits } = feedMany(det, 0.05, 600, 0);
  assert.deepEqual(hits, []);
  assert.ok(det.floor > 0.03, `floor=${det.floor}`);
  assert.ok(det.trigger > 0.1, `trigger=${det.trigger}`);
  // それより十分大きいふーっは判定できる
  const loud = feedMany(det, 0.5, 30, 600 * 16);
  assert.equal(loud.hits.length, 1);
});

test('ふーっ：strength は 0〜1 の範囲で、音が大きいほど大きい', () => {
  const det = Breath.createBreathDetector({ holdMs: 10000 });
  const a = det.feed(0.0, 0).strength;
  const b = det.feed(0.02, 16).strength;
  const c = det.feed(0.9, 32).strength;
  assert.equal(a, 0);
  assert.ok(b > 0 && b < 1);
  assert.equal(c, 1);
  assert.equal(det.feed(NaN, 48).strength, 0);
});

test('ふーっ：スマートフォンのマイクの小さめの息（0.05 前後）でも判定する', () => {
  const det = Breath.createBreathDetector();
  let t = feedMany(det, 0.008, 120, 0).time; // 静かな部屋で約 2 秒
  const { hits } = feedMany(det, 0.05, 30, t); // 約 0.5 秒ふく
  assert.equal(hits.length, 1);
});

test('ふーっ：雑音を学習しても、判定に必要な音量には上限がある', () => {
  const det = Breath.createBreathDetector();
  feedMany(det, 0.2, 600, 0); // ずっとうるさい（判定はされても、雑音の学習は上限で止まる）
  assert.ok(det.floor <= Breath.DEFAULTS.maxFloor + 1e-9, `floor=${det.floor}`);
  assert.ok(det.trigger <= Breath.DEFAULTS.maxFloor * Breath.DEFAULTS.ratio + 1e-9, `trigger=${det.trigger}`);
});

test('ふーっ：マイクを開いた直後は判定せず、雑音を急いで学習する', () => {
  const det = Breath.createBreathDetector();
  // 開いたとたんにテレビの音（0.035）が入っても判定しない
  let r = feedMany(det, 0.035, 120, 0);
  assert.deepEqual(r.hits, []);
  // しばらく音量が届かず（マイクを閉じて）、開き直した直後の大きな音も、最初の warmupMs は判定しない
  det.reset();
  r = feedMany(det, 0.5, 10, r.time + 5000); // 約 160ms
  assert.deepEqual(r.hits, []);
});

test('rms は波形の音量を返す', () => {
  assert.equal(Breath.rms([]), 0);
  assert.equal(Breath.rms([0, 0, 0]), 0);
  assert.equal(Breath.rms([1, -1, 1, -1]), 1);
  assert.ok(Math.abs(Breath.rms([0.5, -0.5]) - 0.5) < 1e-12);
});

// ------------------------------------------------------------ VOICEVOX の音声

test('読み上げるせりふすべてに、VOICEVOX の音声ファイルがある', () => {
  const fs = require('fs');
  const path = require('path');
  const { collectLines } = require('../../tools/voicevox/lines.js');
  const GAMES = require('../../tools/voicevox/games.js');
  const VoiceLines = require('../js/voice-lines.js');
  const lines = collectLines(GAMES['three-little-pigs']);
  assert.ok(lines.length > 0);
  const missing = lines.filter((t) => !VoiceLines.files[t]);
  assert.deepEqual(missing, [], '音声がないせりふがあります。node tools/voicevox/generate.js three-little-pigs を実行してください');
  for (const file of Object.values(VoiceLines.files)) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', VoiceLines.base, file)), `音声ファイルがありません: ${file}`);
  }
  assert.equal(VoiceLines.credit, 'VOICEVOX:冥鳴ひまり');
});

test('絵で使う画像ファイルがすべてある', () => {
  const fs = require('fs');
  const path = require('path');
  const Art = require('../js/art.js').PigsArt;
  const files = Art.images();
  assert.ok(files.length > 0);
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', f)), `画像がありません: ${f}`);
  }
  // 絵の文字列に出てくる画像も、すべて読みこみ対象（images()）に入っている
  const html = [Art.pig(1), Art.pig(2), Art.pig(3), Art.wolf(), Art.house('straw'), Art.house('wood'), Art.house('brick'),
    Art.pile('straw', 5), Art.pile('wood', 6), Art.pile('brick', 8), Art.outdoor(), Art.indoor(),
    Art.fireplaceBack(), Art.fireplaceFront(), Art.pitcher()].join('');
  for (const m of html.matchAll(/href="([^"]+)"/g)) {
    assert.ok(files.includes(m[1]), `先読みの一覧にない画像: ${m[1]}`);
  }
});

test('家の絵は、物語のパーツの数と同じ段に切り分けてある', () => {
  const Art = require('../js/art.js').PigsArt;
  for (const scene of Story.SCENES.filter((s) => s.kind === 'build')) {
    const html = Art.house(scene.house);
    const ids = [...html.matchAll(/class="piece" data-i="(\d+)"/g)].map((m) => Number(m[1]));
    assert.deepEqual(ids, Array.from({ length: scene.pieces }, (_, i) => i), scene.house);
    const items = [...Art.pile(scene.house, scene.pieces).matchAll(/data-k="(\d+)"/g)].map((m) => Number(m[1])).sort((a, b) => a - b);
    assert.deepEqual(items, Array.from({ length: scene.pieces }, (_, i) => i), scene.house);
  }
});
