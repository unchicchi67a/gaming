/**
 * リバーシのルールエンジン。
 *
 * 盤面は 10x10 の Int8Array（外周 1 マスを壁とする）で表現する。
 * 盤上のマス (row, col) のインデックスは (row + 1) * 10 + (col + 1)。
 * 壁を置くことで、方向ごとの走査で範囲チェックを省略できる。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ReversiEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EMPTY = 0;
  const BLACK = 1;
  const WHITE = 2;
  const WALL = 3;
  const DIRS = [-11, -10, -9, -1, 1, 9, 10, 11];

  /** 盤上の 64 マスのインデックス一覧（左上から右下へ）。 */
  const SQUARES = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) SQUARES.push((r + 1) * 10 + (c + 1));
  }

  function toPos(row, col) {
    return (row + 1) * 10 + (col + 1);
  }

  function toRowCol(pos) {
    return [Math.floor(pos / 10) - 1, (pos % 10) - 1];
  }

  function opponent(player) {
    return 3 - player;
  }

  /** 初期配置の盤面を作る。 */
  function createBoard() {
    const b = new Int8Array(100).fill(WALL);
    for (const s of SQUARES) b[s] = EMPTY;
    b[toPos(3, 3)] = WHITE;
    b[toPos(4, 4)] = WHITE;
    b[toPos(3, 4)] = BLACK;
    b[toPos(4, 3)] = BLACK;
    return b;
  }

  function cloneBoard(b) {
    return new Int8Array(b);
  }

  /** pos に player が打ったときに裏返る石の一覧。打てない場合は空配列。 */
  function getFlips(b, pos, player) {
    if (b[pos] !== EMPTY) return [];
    const opp = 3 - player;
    const flips = [];
    for (const d of DIRS) {
      let q = pos + d;
      let n = 0;
      while (b[q] === opp) {
        q += d;
        n++;
      }
      if (n > 0 && b[q] === player) {
        for (let k = 1; k <= n; k++) flips.push(pos + d * k);
      }
    }
    return flips;
  }

  function isLegal(b, pos, player) {
    if (b[pos] !== EMPTY) return false;
    const opp = 3 - player;
    for (const d of DIRS) {
      let q = pos + d;
      if (b[q] !== opp) continue;
      q += d;
      while (b[q] === opp) q += d;
      if (b[q] === player) return true;
    }
    return false;
  }

  function legalMoves(b, player) {
    const moves = [];
    for (const s of SQUARES) if (isLegal(b, s, player)) moves.push(s);
    return moves;
  }

  function countMoves(b, player) {
    let n = 0;
    for (const s of SQUARES) if (isLegal(b, s, player)) n++;
    return n;
  }

  /** 盤面を直接書き換えて着手する。裏返した石の一覧を返す（undoMove 用）。 */
  function applyMove(b, pos, player) {
    const flips = getFlips(b, pos, player);
    if (flips.length === 0) return flips;
    b[pos] = player;
    for (const q of flips) b[q] = player;
    return flips;
  }

  /** applyMove を取り消す。 */
  function undoMove(b, pos, player, flips) {
    b[pos] = EMPTY;
    const opp = 3 - player;
    for (const q of flips) b[q] = opp;
  }

  function countDiscs(b) {
    let black = 0;
    let white = 0;
    let empty = 0;
    for (const s of SQUARES) {
      if (b[s] === BLACK) black++;
      else if (b[s] === WHITE) white++;
      else empty++;
    }
    return { black, white, empty };
  }

  /** 両者とも打てる場所がなければ終局。 */
  function isGameOver(b) {
    return countMoves(b, BLACK) === 0 && countMoves(b, WHITE) === 0;
  }

  return {
    EMPTY,
    BLACK,
    WHITE,
    WALL,
    SQUARES,
    toPos,
    toRowCol,
    opponent,
    createBoard,
    cloneBoard,
    getFlips,
    isLegal,
    legalMoves,
    countMoves,
    applyMove,
    undoMove,
    countDiscs,
    isGameOver,
  };
});
