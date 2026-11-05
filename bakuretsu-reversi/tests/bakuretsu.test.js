'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

const { BLACK, WHITE, EMPTY, toPos } = E;

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

/** 2 つの思考関数で 1 局打ち、最終盤面を返す。 */
function playGame(chooseBlack, chooseWhite) {
  const b = E.createBoard();
  let turn = BLACK;
  let passes = 0;
  let plies = 0;
  while (passes < 2) {
    const move = (turn === BLACK ? chooseBlack : chooseWhite)(b, turn);
    if (move == null) {
      assert.equal(E.countMoves(b, turn), 0, 'null を返すのは打てる場所がないときだけ');
      passes++;
    } else {
      assert.ok(E.isLegal(b, move, turn), '合法手を返す');
      E.applyMove(b, move, turn);
      passes = 0;
      plies++;
    }
    turn = 3 - turn;
    assert.ok(plies <= 60, '1 手ごとに空きマスが 1 つ減る');
  }
  return b;
}

/** 盤を空にして、指定した石だけを置く。stones は { 'r,c': BLACK | WHITE }。 */
function boardWith(stones) {
  const b = E.createBoard();
  for (const s of E.SQUARES) b[s] = EMPTY;
  for (const [key, color] of Object.entries(stones)) {
    const [r, c] = key.split(',').map(Number);
    b[toPos(r, c)] = color;
  }
  return b;
}

const byPos = (x, y) => x - y;

test('初手：はさんだ石は爆風で元に戻り、まわりの石がすべて裏返る', () => {
  const b = E.createBoard();
  const before = E.cloneBoard(b);
  // 黒が (2,3) に打つと (3,3) の白をはさむ。まわり 8 マスの石は (3,3) 白と (3,4) 黒
  const move = E.applyMove(b, toPos(2, 3), BLACK);
  assert.deepEqual(move.flips, [toPos(3, 3)]);
  assert.deepEqual(move.blast.sort(byPos), [toPos(3, 3), toPos(3, 4)]);
  assert.equal(b[toPos(2, 3)], BLACK, '打った石は自分の色のまま');
  assert.equal(b[toPos(3, 3)], WHITE, 'はさんで黒にした石が爆風で白に戻る');
  assert.equal(b[toPos(3, 4)], WHITE, '自分の黒石も爆風で白になる');
  assert.equal(b[toPos(4, 3)], BLACK, '爆風の外は変わらない');
  assert.equal(b[toPos(4, 4)], WHITE);
  assert.deepEqual(E.countDiscs(b), { black: 2, white: 3, empty: 59 });
  E.undoMove(b, toPos(2, 3), BLACK, move);
  assert.deepEqual(b, before);
});

test('爆風は離れた位置の「はさんだ石」には届かない', () => {
  // 黒が (0,0) に打つと、右へ (0,1)(0,2) の白をはさむ。(0,1) は爆風で白に戻り、(0,2) は黒のまま
  const b = boardWith({ '0,1': WHITE, '0,2': WHITE, '0,3': BLACK, '1,1': BLACK });
  const move = E.applyMove(b, toPos(0, 0), BLACK);
  assert.deepEqual(move.flips.sort(byPos), [toPos(0, 1), toPos(0, 2)]);
  assert.equal(b[toPos(0, 0)], BLACK);
  assert.equal(b[toPos(0, 1)], WHITE);
  assert.equal(b[toPos(0, 2)], BLACK);
  assert.equal(b[toPos(1, 1)], WHITE, '隣の自分の石は白になる');
  assert.equal(b[toPos(1, 0)], EMPTY, '空きマスは爆風で変わらない');
});

test('隅に打つと爆風は盤の外に出ない（3 マスだけ）', () => {
  const b = boardWith({ '0,1': BLACK, '1,0': WHITE, '1,1': WHITE, '2,2': BLACK });
  const move = E.applyMove(b, toPos(0, 0), BLACK);
  assert.deepEqual(move.flips, [toPos(1, 1)]);
  assert.deepEqual(move.blast.sort(byPos), [toPos(0, 1), toPos(1, 0), toPos(1, 1)].sort(byPos));
  assert.equal(b[toPos(0, 1)], WHITE);
  assert.equal(b[toPos(1, 0)], BLACK);
  assert.equal(b[toPos(1, 1)], WHITE);
  assert.equal(b[toPos(2, 2)], BLACK);
  for (let i = 0; i < 100; i++) {
    if (!E.SQUARES.includes(i)) assert.equal(b[i], E.WALL, '壁は書き換えない');
  }
});

test('打てないマスへの着手は null を返し、盤面を変えない', () => {
  const b = E.createBoard();
  const before = E.cloneBoard(b);
  assert.equal(E.applyMove(b, toPos(0, 0), BLACK), null);
  assert.equal(E.applyMove(b, toPos(3, 3), BLACK), null, '石のあるマス');
  assert.deepEqual(b, before);
});

test('打てるマスは通常のリバーシと同じ（はさめるマスだけ）', () => {
  const b = E.createBoard();
  const moves = E.legalMoves(b, BLACK).sort(byPos);
  assert.deepEqual(moves, [toPos(2, 3), toPos(3, 2), toPos(4, 5), toPos(5, 4)].sort(byPos));
});

test('複数方向をまとめて裏返してから爆風が起きる', () => {
  // 中央 (3,3) に黒を打つと、横・縦・斜めの白をはさむ
  const b = boardWith({
    '3,4': WHITE, '3,5': BLACK,
    '4,3': WHITE, '5,3': BLACK,
    '4,4': WHITE, '5,5': BLACK,
    '2,2': WHITE, // はさめない向き
  });
  const move = E.applyMove(b, toPos(3, 3), BLACK);
  assert.deepEqual(move.flips.sort(byPos), [toPos(3, 4), toPos(4, 3), toPos(4, 4)].sort(byPos));
  // はさんだ 3 つは隣なので爆風で白に戻る。はさめなかった (2,2) の白は爆風で黒になる
  assert.equal(b[toPos(3, 4)], WHITE);
  assert.equal(b[toPos(4, 3)], WHITE);
  assert.equal(b[toPos(4, 4)], WHITE);
  assert.equal(b[toPos(2, 2)], BLACK);
  assert.equal(b[toPos(3, 5)], BLACK, '爆風の外');
});

test('ランダムな対局で、着手と取り消しを繰り返しても盤面が元に戻る', () => {
  const rand = seeded(3);
  for (let g = 0; g < 20; g++) {
    const b = E.createBoard();
    const stack = [];
    let turn = BLACK;
    let passes = 0;
    while (passes < 2) {
      const moves = E.legalMoves(b, turn);
      if (moves.length === 0) {
        passes++;
      } else {
        const m = moves[Math.floor(rand() * moves.length)];
        const before = E.cloneBoard(b);
        const move = E.applyMove(b, m, turn);
        stack.push({ m, turn, move, before });
        passes = 0;
      }
      turn = 3 - turn;
    }
    while (stack.length) {
      const { m, turn: t, move, before } = stack.pop();
      E.undoMove(b, m, t, move);
      assert.deepEqual(b, before);
    }
    assert.deepEqual(b, E.createBoard());
  }
});

test('全レベルの CPU が最後まで合法手で対局できる', () => {
  for (let level = 1; level <= AI.MAX_LEVEL; level++) {
    const rand = seeded(level);
    const cpu = (b, p) => AI.chooseMove(b, p, level, { random: rand, timeLimitMs: 150 });
    const final = playGame(cpu, cpu);
    assert.ok(E.isGameOver(final));
  }
});

test('chooseMove は渡した盤面を書き換えない', () => {
  const b = E.createBoard();
  E.applyMove(b, toPos(2, 3), BLACK);
  const before = E.cloneBoard(b);
  AI.chooseMove(b, WHITE, 10, { timeLimitMs: 200 });
  assert.deepEqual(b, before);
});

/** 総当たりで求めた最終石差（手番側から見た値）。 */
function bruteForce(b, p, passed) {
  const moves = E.legalMoves(b, p);
  if (moves.length === 0) {
    if (passed) {
      const c = E.countDiscs(b);
      return p === BLACK ? c.black - c.white : c.white - c.black;
    }
    return -bruteForce(b, 3 - p, true);
  }
  let best = -Infinity;
  for (const m of moves) {
    const mv = E.applyMove(b, m, p);
    best = Math.max(best, -bruteForce(b, 3 - p, false));
    E.undoMove(b, m, p, mv);
  }
  return best;
}

test('終盤の完全読みは総当たりと同じ石差になる手を選ぶ', () => {
  const rand = seeded(7);
  let checked = 0;
  for (let g = 0; g < 6; g++) {
    // ランダムに打ち進めて残り 9 マスの局面を作る
    const b = E.createBoard();
    let turn = BLACK;
    let passes = 0;
    while (E.countDiscs(b).empty > 9 && passes < 2) {
      const m = AI.chooseMove(b, turn, 1, { random: rand });
      if (m == null) passes++;
      else {
        E.applyMove(b, m, turn);
        passes = 0;
      }
      turn = 3 - turn;
    }
    if (E.countMoves(b, turn) < 2) continue;
    const best = bruteForce(E.cloneBoard(b), turn, false);
    const move = AI.chooseMove(b, turn, 10, { timeLimitMs: 5000 });
    const after = E.cloneBoard(b);
    E.applyMove(after, move, turn);
    assert.equal(-bruteForce(after, 3 - turn, false), best);
    checked++;
  }
  assert.ok(checked >= 3, `検証できた局面数 ${checked}`);
});

test('レベル10はレベル1（ランダム）に勝ち越す', () => {
  const rand = seeded(42);
  let wins = 0;
  const games = 4;
  for (let i = 0; i < games; i++) {
    const strong = (b, p) => AI.chooseMove(b, p, 10, { random: rand, timeLimitMs: 150 });
    const weak = (b, p) => AI.chooseMove(b, p, 1, { random: rand });
    const strongIsBlack = i % 2 === 0;
    const final = strongIsBlack ? playGame(strong, weak) : playGame(weak, strong);
    const c = E.countDiscs(final);
    const strongDiscs = strongIsBlack ? c.black : c.white;
    const weakDiscs = strongIsBlack ? c.white : c.black;
    if (strongDiscs > weakDiscs) wins++;
  }
  assert.ok(wins >= games - 1, `勝ち数 ${wins}/${games}`);
});
