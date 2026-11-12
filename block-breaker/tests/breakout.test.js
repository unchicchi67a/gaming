'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../js/levels.js');
const P = require('../js/physics.js');

const ALL_LEVELS = Array.from({ length: L.MAX_LEVEL }, (_, i) => i + 1);

function countBricks(def) {
  let bricks = 0;
  let steel = 0;
  let hp = 0;
  for (const row of def.grid) {
    for (const b of row) {
      if (!b) continue;
      if (b.steel) steel++;
      else {
        bricks++;
        hp += b.hp;
      }
    }
  }
  return { bricks, steel, hp };
}

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

/** ボールを追いかけて、バーのいろいろな位置で打ち返す自動操作。 */
function autoplay(g, maxSeconds, seed) {
  const rng = seeded(seed);
  const dt = 1 / 60;
  let aim = 0;
  let lastVy = 0;
  for (let t = 0; t < maxSeconds; t += dt) {
    const ball = g.balls[0];
    const launch = g.phase === 'ready';
    let targetX = g.paddle.x;
    if (ball && !ball.stuck) {
      // 上向きから下向きに変わったら、次に当てる位置を選びなおす
      if (lastVy <= 0 && ball.vy > 0) aim = (rng() * 1.6 - 0.8) * (g.paddle.w / 2);
      lastVy = ball.vy;
      targetX = ball.x - aim;
    }
    P.step(g, dt, { targetX, launch });
    if (g.phase === 'clear' || g.phase === 'over') break;
  }
  return g;
}

test('レベルは 1〜100 に丸められる', () => {
  assert.equal(L.clampLevel(0), 1);
  assert.equal(L.clampLevel(-5), 1);
  assert.equal(L.clampLevel(101), 100);
  assert.equal(L.clampLevel(42.4), 42);
  assert.equal(L.clampLevel('7'), 7);
  assert.equal(L.clampLevel('abc'), 1);
});

test('同じレベルはいつも同じ並びになる', () => {
  for (const lv of [1, 15, 37, 100]) {
    assert.deepEqual(L.generateLevel(lv), L.generateLevel(lv));
  }
});

test('すべてのレベルに、こわせるブロックがある', () => {
  for (const lv of ALL_LEVELS) {
    const def = L.generateLevel(lv);
    assert.ok(countBricks(def).bricks > 0, `Lv${lv}`);
    assert.equal(def.grid.length, def.rows);
    for (const row of def.grid) assert.equal(row.length, L.COLS);
  }
});

test('ブロックのかたさは 1〜そのレベルの上限、鉄は Lv15 から', () => {
  for (const lv of ALL_LEVELS) {
    const def = L.generateLevel(lv);
    for (const row of def.grid) {
      for (const b of row) {
        if (!b) continue;
        if (b.steel) {
          assert.ok(lv >= 15, `Lv${lv} に鉄がある`);
        } else {
          assert.ok(b.hp >= 1 && b.hp <= def.maxHp, `Lv${lv} hp=${b.hp}`);
        }
      }
    }
  }
  assert.ok(ALL_LEVELS.some((lv) => countBricks(L.generateLevel(lv)).steel > 0), '鉄のブロックがどこかで出る');
});

test('すべてのこわせるブロックに、鉄を通らずにボールが届く', () => {
  for (const lv of ALL_LEVELS) {
    const def = L.generateLevel(lv);
    const reached = L.reachableCells(def.grid);
    def.grid.forEach((row, r) => {
      row.forEach((b, c) => {
        if (b && !b.steel) assert.ok(reached[r][c], `Lv${lv} (${r},${c})`);
      });
    });
  }
});

test('レベルが上がるほど難しくなる（段数・かたさ・ボールの速さ）', () => {
  const p1 = L.levelParams(1);
  const p50 = L.levelParams(50);
  const p100 = L.levelParams(100);
  assert.ok(p1.rows < p50.rows && p50.rows <= p100.rows);
  assert.ok(p1.maxHp < p50.maxHp && p50.maxHp < p100.maxHp);
  assert.ok(p1.ballSpeed < p50.ballSpeed && p50.ballSpeed < p100.ballSpeed);
  assert.equal(p1.ballSpeed, 1);
  assert.ok(Math.abs(p100.ballSpeed - 1.6) < 1e-9);
  // 10 レベルごとの合計のかたさ（ブロックの数 × かたさ）が増えていく
  const sums = [];
  for (let s = 1; s <= 91; s += 10) {
    let total = 0;
    for (let lv = s; lv < s + 10; lv++) total += countBricks(L.generateLevel(lv)).hp;
    sums.push(total);
  }
  for (let i = 1; i < sums.length; i++) assert.ok(sums[i] > sums[i - 1], `合計のかたさ ${sums.join(', ')}`);
  for (const lv of ALL_LEVELS) {
    const p = L.levelParams(lv);
    assert.ok(p.rows >= 4 && p.rows <= L.MAX_ROWS);
  }
});

test('設定：おかしな値は初期値にもどる', () => {
  assert.deepEqual(L.normalizeSettings(null), L.DEFAULT_SETTINGS);
  assert.deepEqual(
    L.normalizeSettings({ level: 250, speed: 'turbo', paddle: 'giant', lives: 99, sound: 'yes' }),
    { ...L.DEFAULT_SETTINGS, level: 100 },
  );
  assert.deepEqual(
    L.normalizeSettings({ level: 33, speed: 'fast', paddle: 'small', lives: 5, sound: false }),
    { level: 33, speed: 'fast', paddle: 'small', lives: 5, sound: false },
  );
});

test('速さ：遅い < 普通 < 速い', () => {
  const speeds = ['slow', 'normal', 'fast'].map((s) => P.createGame({ level: 10, speed: s }).baseSpeed);
  assert.ok(speeds[0] < speeds[1] && speeds[1] < speeds[2]);
  assert.equal(P.createGame({ level: 1, speed: 'normal' }).baseSpeed, P.BASE_SPEED);
});

test('バーの大きさ：小さい < 普通 < 大きい < とても大きい', () => {
  const widths = ['small', 'normal', 'large', 'huge'].map((s) => P.createGame({ paddle: s }).paddle.w);
  for (let i = 1; i < widths.length; i++) assert.ok(widths[i] > widths[i - 1]);
  assert.equal(P.createGame({ paddle: 'normal' }).paddle.w, P.PADDLE_BASE_W);
});

test('ボールはバーにのっていて、打ち出すまで動かない', () => {
  const g = P.createGame({ level: 1 });
  assert.equal(g.phase, 'ready');
  P.step(g, 0.5, { targetX: 200 });
  assert.equal(g.phase, 'ready');
  assert.equal(g.balls[0].x, 200);
  const ev = P.step(g, 1 / 60, { targetX: 200, launch: true });
  assert.equal(g.phase, 'play');
  assert.ok(ev.some((e) => e.type === 'launch'));
  assert.ok(g.balls[0].vy < 0, '上に飛ぶ');
});

test('バーは画面の外に出ない', () => {
  const g = P.createGame({ paddle: 'huge' });
  P.step(g, 1 / 60, { targetX: -500 });
  assert.equal(g.paddle.x, g.paddle.w / 2);
  P.step(g, 1 / 60, { targetX: 5000 });
  assert.equal(g.paddle.x, P.W - g.paddle.w / 2);
  P.step(g, 10, { targetX: null, move: -1 });
  assert.equal(g.paddle.x, g.paddle.w / 2);
});

test('バーのまん中で打つと真上、はしで打つとななめに返る', () => {
  for (const [rel, expectSign] of [[0, 0], [0.9, 1], [-0.9, -1]]) {
    const g = P.createGame({ level: 1 });
    g.bricks = [];
    g.phase = 'play';
    const ball = g.balls[0];
    ball.stuck = false;
    ball.x = g.paddle.x + rel * (g.paddle.w / 2);
    ball.y = g.paddle.y - 40;
    ball.vx = 0;
    ball.vy = g.speed;
    const ev = P.step(g, 0.1, { targetX: g.paddle.x });
    assert.ok(ev.some((e) => e.type === 'paddle'));
    assert.ok(ball.vy < 0);
    if (expectSign === 0) assert.ok(Math.abs(ball.vx) < 1e-6);
    else assert.equal(Math.sign(ball.vx), expectSign);
  }
});

test('ボールが壁で跳ね返る', () => {
  const g = P.createGame({ level: 1 });
  g.bricks = [{ x: 0, y: 0, w: 1, h: 1, hp: 1, maxHp: 1, steel: false, alive: false }];
  g.phase = 'play';
  const ball = g.balls[0];
  ball.stuck = false;
  ball.x = 20;
  ball.y = 400;
  ball.vx = -300;
  ball.vy = -300;
  const ev = P.step(g, 0.1, { targetX: g.paddle.x });
  assert.ok(ev.some((e) => e.type === 'wall'));
  assert.ok(ball.vx > 0);
});

test('ブロックに当たると、かたさが減り、0 でこわれる。鉄はこわれない', () => {
  const g = P.createGame({ level: 1 });
  const brick = { x: 250, y: 300, w: 100, h: 20, hp: 2, maxHp: 2, steel: false, alive: true };
  const steel = { x: 250, y: 100, w: 100, h: 20, hp: 0, maxHp: 0, steel: true, alive: true };
  g.bricks = [brick, steel];
  g.phase = 'play';
  const ball = g.balls[0];
  ball.stuck = false;

  const shoot = () => {
    ball.x = 300;
    ball.y = 360;
    ball.vx = 0;
    ball.vy = -g.speed;
    let events = [];
    for (let i = 0; i < 20 && ball.vy < 0; i++) events = events.concat(P.step(g, 1 / 60, { targetX: 100 }));
    return events;
  };

  let ev = shoot();
  assert.ok(ev.some((e) => e.type === 'hit'));
  assert.equal(brick.hp, 1);
  assert.ok(ball.vy > 0, '下に跳ね返る');
  assert.equal(g.score, P.SCORE_HIT);

  ev = shoot();
  assert.ok(ev.some((e) => e.type === 'break'));
  assert.equal(brick.alive, false);
  assert.ok(ev.some((e) => e.type === 'clear'), '鉄だけ残ればクリア');
  assert.equal(g.phase, 'clear');
  assert.equal(steel.alive, true);
  assert.equal(g.score, P.SCORE_HIT * 2 + P.SCORE_BREAK * 2);
});

test('速いボールでもブロックをすり抜けない', () => {
  const g = P.createGame({ level: 100, speed: 'fast' });
  g.speed = g.baseSpeed * P.MAX_ACCEL;
  const brick = { x: 0, y: 300, w: P.W, h: 22, hp: 1, maxHp: 1, steel: true, alive: true };
  g.bricks = [brick, { x: 0, y: 0, w: 1, h: 1, hp: 1, maxHp: 1, steel: false, alive: true }];
  g.phase = 'play';
  const ball = g.balls[0];
  ball.stuck = false;
  ball.x = 300;
  ball.y = 600;
  ball.vx = 0;
  ball.vy = -g.speed;
  for (let i = 0; i < 30; i++) {
    P.step(g, 1 / 30, { targetX: ball.x });
    assert.ok(ball.y > 300, `y=${ball.y}`);
  }
});

test('ボールを落とすと残りが減り、0 でゲームオーバー', () => {
  const g = P.createGame({ level: 1, lives: 2 });
  const drop = () => {
    P.step(g, 1 / 60, { targetX: 300, launch: true });
    const ball = g.balls[0];
    ball.x = 50;
    ball.y = 780;
    ball.vx = 0;
    ball.vy = 400;
    let events = [];
    for (let i = 0; i < 60 && g.phase === 'play'; i++) events = events.concat(P.step(g, 1 / 60, { targetX: 500 }));
    return events;
  };
  let ev = drop();
  assert.ok(ev.some((e) => e.type === 'lost'));
  assert.equal(g.lives, 1);
  assert.equal(g.phase, 'ready', 'ボールがバーにもどる');
  assert.ok(g.balls[0].stuck);
  ev = drop();
  assert.ok(ev.some((e) => e.type === 'over'));
  assert.equal(g.lives, 0);
  assert.equal(g.phase, 'over');
});

test('クリアのあと、次のレベルへ進める（スコアと残りは引きつぐ）', () => {
  const g = P.createGame({ level: 5, lives: 3 });
  g.score = 1234;
  g.lives = 2;
  g.phase = 'clear';
  assert.equal(P.nextLevel(g), true);
  assert.equal(g.level, 6);
  assert.equal(g.phase, 'ready');
  assert.equal(g.score, 1234);
  assert.equal(g.lives, 2);
  assert.equal(P.remainingBricks(g), countBricks(L.generateLevel(6)).bricks);
  const last = P.createGame({ level: 100 });
  assert.equal(P.nextLevel(last), false);
});

test('自動操作で、いろいろなレベルを最後までクリアできる（ボールが行き来しつづけて終わらないことがない）', () => {
  for (const lv of [1, 7, 15, 33, 50, 66, 88, 100]) {
    for (const speed of ['slow', 'fast']) {
      const g = P.createGame({ level: lv, speed, paddle: 'normal', lives: 1 });
      autoplay(g, 900, lv * 31 + speed.length);
      assert.equal(g.phase, 'clear', `Lv${lv} ${speed}: 残り ${P.remainingBricks(g)} 個`);
    }
  }
});

test('ボールの速さは、どの向きに跳ね返っても一定で、上限をこえない', () => {
  const g = P.createGame({ level: 60, speed: 'fast' });
  const rng = seeded(5);
  const dt = 1 / 60;
  let lastVy = 0;
  let aim = 0;
  for (let i = 0; i < 60 * 60 && g.phase !== 'clear'; i++) {
    const ball = g.balls[0];
    if (!ball.stuck) {
      if (lastVy <= 0 && ball.vy > 0) aim = (rng() * 1.6 - 0.8) * (g.paddle.w / 2);
      lastVy = ball.vy;
    }
    P.step(g, dt, { targetX: ball.stuck ? g.paddle.x : ball.x - aim, launch: true });
    if (!ball.stuck && g.phase === 'play') {
      const v = Math.hypot(ball.vx, ball.vy);
      assert.ok(Math.abs(v - g.speed) < 1e-6, `v=${v} speed=${g.speed}`);
      assert.ok(g.speed <= g.baseSpeed * P.MAX_ACCEL + 1e-9);
      assert.ok(Math.abs(ball.vy) >= v * 0.27, '真横に近い向きにならない');
    }
  }
});

test('index.html が読み込む js ファイルがすべてある', () => {
  const dir = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(srcs.includes('js/fullscreen.js'));
  assert.ok(srcs.indexOf('js/levels.js') < srcs.indexOf('js/physics.js'), 'levels.js を先に読む');
  for (const s of srcs) assert.ok(fs.existsSync(path.join(dir, s)), s);
});
