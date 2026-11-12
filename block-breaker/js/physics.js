/**
 * ブロックくずしの動き（ボール・バー・ブロックの当たり判定）。
 *
 * 画面に触れない純粋なロジックで、ブラウザと Node.js の両方から読み込める。
 * 盤面は 600 × 800 の座標（左上が原点、下向きが +y）で計算し、描くときに画面の大きさに合わせる。
 *
 * 使い方：
 *   const g = createGame({ level, speed, paddle, lives });
 *   const events = step(g, dt, { targetX, move, launch });   // 毎フレーム呼ぶ
 *   nextLevel(g);                                            // クリアのあと、次のレベルへ
 *
 * g.phase は 'ready'（ボールがバーにのっている）/ 'play' / 'clear' / 'over'。
 * step が返す events は、効果音や演出のためのできごとの一覧。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./levels.js'));
  } else {
    root.BlockPhysics = factory(root.BlockLevels);
  }
})(typeof self !== 'undefined' ? self : this, function (L) {
  'use strict';

  const W = 600;
  const H = 800;
  const BALL_R = 8;
  const BASE_SPEED = 420; // px/秒（Lv1・普通）
  const MAX_ACCEL = 1.25; // バーに当たるたびに少し速くなる。その上限（はじめの何倍まで）
  const ACCEL_PER_HIT = 1.01;
  const PADDLE_BASE_W = 100;
  const PADDLE_H = 14;
  const PADDLE_Y = 740; // バーのまん中の y
  const PADDLE_KEY_SPEED = 760; // キー操作のときのバーの速さ（px/秒）
  const MAX_BOUNCE = (60 * Math.PI) / 180; // バーのはしに当たったときの最大の角度
  const MIN_VY_RATIO = 0.28; // ボールが真横に近い向きで行き来しつづけないように、縦の速さの下限
  const BRICK_TOP = 80;
  const BRICK_SIDE = 20;
  const BRICK_GAP = 4;
  const BRICK_H = 22;
  const BRICK_W = (W - BRICK_SIDE * 2 - BRICK_GAP * (L.COLS - 1)) / L.COLS;
  const SCORE_HIT = 10;
  const SCORE_BREAK = 40;

  function createGame(opts) {
    const o = opts || {};
    const speed = L.SPEEDS[o.speed] || L.SPEEDS.normal;
    const paddle = L.PADDLES[o.paddle] || L.PADDLES.normal;
    const g = {
      W,
      H,
      speedKey: L.SPEEDS[o.speed] ? o.speed : 'normal',
      speedFactor: speed.factor,
      paddle: {
        x: W / 2,
        y: PADDLE_Y,
        w: Math.round(PADDLE_BASE_W * paddle.factor),
        h: PADDLE_H,
      },
      lives: o.lives || 3,
      score: 0,
      level: L.clampLevel(o.level || 1),
      bricks: [],
      balls: [],
      phase: 'ready',
      time: 0,
    };
    loadLevel(g, g.level);
    return g;
  }

  /** レベルのブロックを並べ、ボールをバーにのせる。 */
  function loadLevel(g, lv) {
    const def = L.generateLevel(lv);
    g.level = def.level;
    g.levelDef = def;
    g.baseSpeed = BASE_SPEED * g.speedFactor * def.ballSpeed;
    g.bricks = [];
    def.grid.forEach((row, r) => {
      row.forEach((b, c) => {
        if (!b) return;
        g.bricks.push({
          x: BRICK_SIDE + c * (BRICK_W + BRICK_GAP),
          y: BRICK_TOP + r * (BRICK_H + BRICK_GAP),
          w: BRICK_W,
          h: BRICK_H,
          row: r,
          col: c,
          hp: b.hp,
          maxHp: b.hp,
          steel: b.steel,
          alive: true,
        });
      });
    });
    resetBall(g);
  }

  function resetBall(g) {
    g.speed = g.baseSpeed;
    g.balls = [{ x: g.paddle.x, y: g.paddle.y - g.paddle.h / 2 - BALL_R, vx: 0, vy: 0, r: BALL_R, stuck: true, offset: 0 }];
    g.phase = 'ready';
  }

  function nextLevel(g) {
    if (g.level >= L.MAX_LEVEL) return false;
    loadLevel(g, g.level + 1);
    return true;
  }

  function remainingBricks(g) {
    let n = 0;
    for (const b of g.bricks) if (b.alive && !b.steel) n++;
    return n;
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** ボールの速さを g.speed にそろえ、縦の速さが小さすぎれば直す。 */
  function normalize(g, ball) {
    let len = Math.hypot(ball.vx, ball.vy) || 1;
    let vx = ball.vx / len;
    let vy = ball.vy / len;
    if (Math.abs(vy) < MIN_VY_RATIO) {
      vy = (vy < 0 ? -1 : 1) * MIN_VY_RATIO;
      vx = (vx < 0 ? -1 : 1) * Math.sqrt(1 - vy * vy);
    }
    ball.vx = vx * g.speed;
    ball.vy = vy * g.speed;
  }

  /** バーで打ち返す。当たった位置で角度が変わる（まん中は真上、はしほど横向き）。 */
  function bounceOnPaddle(g, ball) {
    const p = g.paddle;
    const rel = clamp((ball.x - p.x) / (p.w / 2), -1, 1);
    const angle = rel * MAX_BOUNCE;
    g.speed = Math.min(g.baseSpeed * MAX_ACCEL, g.speed * ACCEL_PER_HIT);
    ball.vx = Math.sin(angle) * g.speed;
    ball.vy = -Math.cos(angle) * g.speed;
    ball.y = p.y - p.h / 2 - ball.r;
  }

  function launch(g, ball) {
    ball.stuck = false;
    // まっすぐ上だと単調なので、バーのどこにのっているかで少しななめに出す
    const rel = ball.offset / (g.paddle.w / 2);
    const angle = clamp(rel * MAX_BOUNCE, -MAX_BOUNCE, MAX_BOUNCE) || (12 * Math.PI) / 180;
    ball.vx = Math.sin(angle) * g.speed;
    ball.vy = -Math.cos(angle) * g.speed;
    g.phase = 'play';
  }

  /** 円と長方形が重なっていれば、押し出す向き（法線）と重なりの深さを返す。 */
  function circleRect(ball, b) {
    const cx = clamp(ball.x, b.x, b.x + b.w);
    const cy = clamp(ball.y, b.y, b.y + b.h);
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > ball.r * ball.r) return null;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      return { nx: dx / d, ny: dy / d, depth: ball.r - d };
    }
    // ボールの中心が長方形の中に入っている：いちばん近い辺から外へ出す
    const left = ball.x - b.x;
    const right = b.x + b.w - ball.x;
    const top = ball.y - b.y;
    const bottom = b.y + b.h - ball.y;
    const m = Math.min(left, right, top, bottom);
    if (m === top) return { nx: 0, ny: -1, depth: top + ball.r };
    if (m === bottom) return { nx: 0, ny: 1, depth: bottom + ball.r };
    if (m === left) return { nx: -1, ny: 0, depth: left + ball.r };
    return { nx: 1, ny: 0, depth: right + ball.r };
  }

  /** ボールを 1 小ステップぶん動かし、壁・バー・ブロックとの当たりを処理する。 */
  function moveBall(g, ball, dt, events) {
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // 壁
    if (ball.x < ball.r) {
      ball.x = ball.r;
      ball.vx = Math.abs(ball.vx);
      events.push({ type: 'wall' });
    } else if (ball.x > W - ball.r) {
      ball.x = W - ball.r;
      ball.vx = -Math.abs(ball.vx);
      events.push({ type: 'wall' });
    }
    if (ball.y < ball.r) {
      ball.y = ball.r;
      ball.vy = Math.abs(ball.vy);
      events.push({ type: 'wall' });
    }

    // バー（上の面だけで打ち返す。下に抜けかけたボールは拾わない）
    const p = g.paddle;
    if (
      ball.vy > 0 &&
      ball.y + ball.r >= p.y - p.h / 2 &&
      ball.y <= p.y + p.h / 2 &&
      ball.x >= p.x - p.w / 2 - ball.r &&
      ball.x <= p.x + p.w / 2 + ball.r
    ) {
      bounceOnPaddle(g, ball);
      events.push({ type: 'paddle', x: ball.x, y: ball.y });
      return;
    }

    // ブロック：いちばん深く重なったものに 1 つだけ当てる（2 つ同時に当てると向きが 2 回変わってしまう）
    let hit = null;
    let hitInfo = null;
    for (const b of g.bricks) {
      if (!b.alive) continue;
      if (ball.x + ball.r < b.x || ball.x - ball.r > b.x + b.w) continue;
      if (ball.y + ball.r < b.y || ball.y - ball.r > b.y + b.h) continue;
      const info = circleRect(ball, b);
      if (info && (!hitInfo || info.depth > hitInfo.depth)) {
        hit = b;
        hitInfo = info;
      }
    }
    if (!hit) return;

    ball.x += hitInfo.nx * hitInfo.depth;
    ball.y += hitInfo.ny * hitInfo.depth;
    // 法線の向きの速さを反転（ブロックから離れる向きにする）
    const dot = ball.vx * hitInfo.nx + ball.vy * hitInfo.ny;
    if (dot < 0) {
      ball.vx -= 2 * dot * hitInfo.nx;
      ball.vy -= 2 * dot * hitInfo.ny;
    }
    normalize(g, ball);

    const cx = hit.x + hit.w / 2;
    const cy = hit.y + hit.h / 2;
    if (hit.steel) {
      events.push({ type: 'steel', x: cx, y: cy });
      return;
    }
    hit.hp--;
    g.score += SCORE_HIT;
    if (hit.hp > 0) {
      events.push({ type: 'hit', x: cx, y: cy, brick: hit });
      return;
    }
    hit.alive = false;
    g.score += SCORE_BREAK * hit.maxHp;
    events.push({ type: 'break', x: cx, y: cy, brick: hit });
    if (remainingBricks(g) === 0) {
      g.phase = 'clear';
      events.push({ type: 'clear' });
    }
  }

  /**
   * 時間を dt 秒進める。
   * input.targetX：指やマウスの位置（バーのまん中をそこへ動かす。null ならキー操作）
   * input.move：キー操作の向き（-1 / 0 / 1）
   * input.launch：ボールを打ち出す
   */
  function step(g, dt, input) {
    const events = [];
    const inp = input || {};
    if (g.phase === 'clear' || g.phase === 'over') return events;
    g.time += dt;

    const p = g.paddle;
    if (inp.targetX != null) p.x = inp.targetX;
    else if (inp.move) p.x += inp.move * PADDLE_KEY_SPEED * dt;
    p.x = clamp(p.x, p.w / 2, W - p.w / 2);

    for (const ball of g.balls) {
      if (!ball.stuck) continue;
      ball.x = clamp(p.x + ball.offset, ball.r, W - ball.r);
      ball.y = p.y - p.h / 2 - ball.r;
      if (inp.launch) {
        launch(g, ball);
        events.push({ type: 'launch' });
      }
    }

    // すり抜けないよう、1 回に進む距離がボールの半径の半分以下になるように分ける
    const maxMove = g.speed * dt;
    const n = Math.max(1, Math.ceil(maxMove / (BALL_R * 0.5)));
    const sub = dt / n;
    for (let i = 0; i < n && g.phase === 'play'; i++) {
      for (const ball of g.balls) {
        if (ball.stuck) continue;
        moveBall(g, ball, sub, events);
        if (g.phase === 'clear') return events;
      }
      g.balls = g.balls.filter((ball) => ball.y - ball.r <= H);
      if (g.balls.length === 0) {
        g.lives--;
        events.push({ type: 'lost' });
        if (g.lives <= 0) {
          g.lives = 0;
          g.phase = 'over';
          g.balls = [];
          events.push({ type: 'over' });
        } else {
          resetBall(g);
        }
        break;
      }
    }
    return events;
  }

  return {
    W,
    H,
    BALL_R,
    BASE_SPEED,
    MAX_ACCEL,
    PADDLE_BASE_W,
    PADDLE_Y,
    BRICK_TOP,
    BRICK_W,
    BRICK_H,
    SCORE_HIT,
    SCORE_BREAK,
    createGame,
    loadLevel,
    nextLevel,
    remainingBricks,
    step,
  };
});
