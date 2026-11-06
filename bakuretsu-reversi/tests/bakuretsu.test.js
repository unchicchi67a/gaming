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

/** 2 つの思考関数で 1 局打ち、最終盤面を返す。followUp が true なら「おいうち」ありのルールで打つ。 */
function playGame(chooseBlack, chooseWhite, followUp) {
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
      E.applyMove(b, move, turn, followUp);
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

test('おいうち：爆風で裏返った石がはさんだ石も裏返る（1 回だけ）', () => {
  // 黒が (4,4) に打つ。(4,5) の白をはさみ、爆風で (4,5) は白に戻り、(3,4) の白が黒になる。
  // 黒になった (3,4) が右上の (2,5) の白を (1,6) の黒ではさむ → おいうちで (2,5) が黒に。
  // 黒になった (2,5) は上の (1,5) の白を (0,5) の黒ではさめるが、おいうちは 1 回だけなので (1,5) は白のまま
  const stones = {
    '4,5': WHITE,
    '4,6': BLACK,
    '3,4': WHITE,
    '2,5': WHITE,
    '1,6': BLACK,
    '1,5': WHITE,
    '0,5': BLACK,
  };

  const plain = boardWith(stones);
  const plainMove = E.applyMove(plain, toPos(4, 4), BLACK);
  assert.deepEqual(plainMove.followUp, [], 'おいうちなしのルールでは起きない');
  assert.equal(plain[toPos(2, 5)], WHITE);

  const b = boardWith(stones);
  const before = E.cloneBoard(b);
  const move = E.applyMove(b, toPos(4, 4), BLACK, true);
  assert.deepEqual(move.flips, [toPos(4, 5)]);
  assert.deepEqual(move.blast.sort(byPos), [toPos(3, 4), toPos(4, 5)]);
  assert.deepEqual(move.followUp, [toPos(2, 5)]);
  assert.equal(b[toPos(3, 4)], BLACK, '爆風で黒に');
  assert.equal(b[toPos(2, 5)], BLACK, 'おいうちで黒に');
  assert.equal(b[toPos(1, 5)], WHITE, 'おいうちで裏返った石からは、もう判定しない');
  assert.equal(b[toPos(4, 5)], WHITE, 'はさんだ石は爆風で白に戻ったまま');
  E.undoMove(b, toPos(4, 4), BLACK, move);
  assert.deepEqual(b, before);
});

test('おいうち：爆風で白になった石は、白として黒の石をはさむ', () => {
  // 黒が (4,4) に打つ（下の (5,4) の白をはさむ）。爆風で (4,3) の黒が白になり、
  // 左の (4,2) の黒を (4,1) の白ではさむ
  const b = boardWith({ '5,4': WHITE, '6,4': BLACK, '4,3': BLACK, '4,2': BLACK, '4,1': WHITE });
  const move = E.applyMove(b, toPos(4, 4), BLACK, true);
  assert.deepEqual(move.followUp, [toPos(4, 2)]);
  assert.equal(b[toPos(4, 3)], WHITE);
  assert.equal(b[toPos(4, 2)], WHITE);
  assert.equal(b[toPos(4, 4)], BLACK);
});

test('おいうち：打った石も、はさまれれば裏返る', () => {
  // 黒が (4,4) に打つ。爆風で (4,3) の黒と (4,5) の黒（はさんだ石）が白になり、
  // 白になった (4,3) と (4,5) が、あいだの (4,4) の黒をはさむ
  const b = boardWith({ '4,5': WHITE, '4,6': BLACK, '4,3': BLACK });
  const move = E.applyMove(b, toPos(4, 4), BLACK, true);
  assert.deepEqual(move.followUp, [toPos(4, 4)]);
  assert.equal(b[toPos(4, 4)], WHITE);
  E.undoMove(b, toPos(4, 4), BLACK, move);
  assert.deepEqual(b, boardWith({ '4,5': WHITE, '4,6': BLACK, '4,3': BLACK }));
});

test('おいうち：判定は爆風の直後の盤面でまとめて行うので、判定の順番によらない', () => {
  // 黒が (4,4) に打つ（下の (5,4) の白をはさむ）。爆風で (3,4) の白が黒に、(4,3) の黒が白になる。
  // 黒になった (3,4) は左下の (4,3)（白）を (5,2) の黒ではさむ。
  // 白になった (4,3) は上の (3,3) の黒を (2,3) の白ではさむ。
  // 爆風で裏返った石どうしで、はさむ側とはさまれる側が入れかわるが、どちらの判定も爆風直後の盤面で行う
  const b = boardWith({ '5,4': WHITE, '6,4': BLACK, '3,4': WHITE, '4,3': BLACK, '5,2': BLACK, '3,3': BLACK, '2,3': WHITE });
  const move = E.applyMove(b, toPos(4, 4), BLACK, true);
  assert.deepEqual(move.blast.sort(byPos), [toPos(3, 3), toPos(3, 4), toPos(4, 3), toPos(5, 4)]);
  // (3,3) も爆風で白になるため、(4,3) が (3,3) をはさむことはない。結果は (4,3) だけが黒に戻る
  assert.deepEqual(move.followUp.sort(byPos), [toPos(4, 3)]);
  assert.equal(b[toPos(4, 3)], BLACK);
  // sources の順番を逆にしても同じ結果になる
  const c = boardWith({ '5,4': WHITE, '6,4': BLACK, '3,4': WHITE, '4,3': BLACK, '5,2': BLACK, '3,3': BLACK, '2,3': WHITE });
  E.applyMove(c, toPos(4, 4), BLACK, false);
  const reversed = E.getFollowUp(c, move.blast.slice().reverse());
  assert.deepEqual(reversed.sort(byPos), move.followUp);
  assert.deepEqual(c, b);
});

test('おいうち：ランダムな対局で、取り消すと元に戻り、判定の順番によらない', () => {
  const rand = seeded(7);
  let followed = 0;
  for (let g = 0; g < 30; g++) {
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
        // 順番を逆にして判定した結果と比べる
        const other = E.cloneBoard(b);
        const plain = E.applyMove(other, m, turn, false);
        const move = E.applyMove(b, m, turn, true);
        E.getFollowUp(other, plain.blast.slice().reverse());
        assert.deepEqual(other, b);
        assert.equal(new Set(move.followUp).size, move.followUp.length, '同じ石は 2 回裏返らない');
        followed += move.followUp.length;
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
  }
  assert.ok(followed > 0, 'ランダムな対局でおいうちが起きている');
});

test('おいうちありのルールでも、全レベルの CPU が最後まで合法手で対局できる', () => {
  for (let level = 1; level <= AI.MAX_LEVEL; level++) {
    const rand = seeded(level + 100);
    const cpu = (b, p) => AI.chooseMove(b, p, level, { random: rand, timeLimitMs: 100, followUp: true });
    const final = playGame(cpu, cpu, true);
    assert.ok(E.isGameOver(final));
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
