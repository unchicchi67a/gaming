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
    assert.ok(plies <= 60);
  }
  return b;
}

test('初期配置と黒の合法手', () => {
  const b = E.createBoard();
  assert.deepEqual(E.countDiscs(b), { black: 2, white: 2, empty: 60 });
  const moves = E.legalMoves(b, BLACK).sort((x, y) => x - y);
  assert.deepEqual(moves, [toPos(2, 3), toPos(3, 2), toPos(4, 5), toPos(5, 4)].sort((x, y) => x - y));
});

test('着手で石が裏返り、undoMove で元に戻る', () => {
  const b = E.createBoard();
  const before = E.cloneBoard(b);
  const flips = E.applyMove(b, toPos(2, 3), BLACK);
  assert.deepEqual(flips, [toPos(3, 3)]);
  assert.equal(b[toPos(3, 3)], BLACK);
  assert.deepEqual(E.countDiscs(b), { black: 4, white: 1, empty: 59 });
  E.undoMove(b, toPos(2, 3), BLACK, flips);
  assert.deepEqual(b, before);
});

test('打てないマスへの着手は盤面を変えない', () => {
  const b = E.createBoard();
  const before = E.cloneBoard(b);
  assert.deepEqual(E.applyMove(b, toPos(0, 0), BLACK), []);
  assert.deepEqual(b, before);
});

test('複数方向をまとめて裏返す', () => {
  const b = E.createBoard();
  for (const s of E.SQUARES) b[s] = EMPTY;
  // 中央 (3,3) に黒を打つと、横・縦・斜めの白が挟まれる
  b[toPos(3, 4)] = WHITE;
  b[toPos(3, 5)] = BLACK;
  b[toPos(4, 3)] = WHITE;
  b[toPos(5, 3)] = BLACK;
  b[toPos(4, 4)] = WHITE;
  b[toPos(5, 5)] = BLACK;
  b[toPos(2, 2)] = WHITE; // 挟めない向き
  const flips = E.applyMove(b, toPos(3, 3), BLACK);
  assert.deepEqual(flips.sort((x, y) => x - y), [toPos(3, 4), toPos(4, 3), toPos(4, 4)].sort((x, y) => x - y));
  assert.equal(b[toPos(2, 2)], WHITE);
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
    const f = E.applyMove(b, m, p);
    best = Math.max(best, -bruteForce(b, 3 - p, false));
    E.undoMove(b, m, p, f);
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
