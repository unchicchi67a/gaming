/**
 * 爆裂リバーシのルールエンジン。
 *
 * ルール：
 * - 打てるマスは通常のリバーシと同じ（相手の石を 1 つ以上はさめるマスだけ）
 * - 打つと、まず通常のリバーシと同じように、はさんだ石を裏返す
 * - そのあと「爆風」で、打ったマスのまわり 8 マスにある石を、色に関係なくすべて裏返す
 *   （はさんで裏返したばかりの石も、隣にあればもう一度裏返って元の色に戻る。空きマスは変わらない）
 * - オプションの「おいうち」では、爆風で裏返った石が新しい色で相手の石をはさんでいれば、それも裏返す。
 *   判定は 1 回だけで、おいうちで裏返った石からはもう判定しない（getFollowUp を参照）
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

  /** pos のまわり 8 マスのうち、石が置かれているマスの一覧（爆風で裏返るマス）。 */
  function getBlast(b, pos) {
    const blast = [];
    for (const d of DIRS) {
      const q = pos + d;
      if (b[q] === BLACK || b[q] === WHITE) blast.push(q);
    }
    return blast;
  }

  /**
   * おいうち：爆風で裏返った石（sources）それぞれについて、新しい色で 8 方向にはさめる相手の石を探し、
   * まとめて裏返す（通常のリバーシで、その石を置いたときと同じ判定）。裏返した石の一覧を返す。
   *
   * - 判定は 1 回だけ。おいうちで裏返った石が、さらに別の石をはさんでも裏返さない
   * - すべての判定は爆風の直後の盤面で行い、そのあとでまとめて裏返す。
   *   そのため、どの石から判定しても結果は同じになる（判定の途中で盤面が変わらない）
   * - 白の石がはさむのは黒の石、黒の石がはさむのは白の石だけなので、
   *   同じ石を黒にする判定と白にする判定がぶつかることはない
   */
  function getFollowUp(b, sources) {
    const hit = new Set();
    for (const s of sources) {
      const me = b[s];
      const opp = 3 - me;
      for (const d of DIRS) {
        let q = s + d;
        while (b[q] === opp) q += d;
        if (b[q] !== me) continue;
        for (let x = s + d; x !== q; x += d) hit.add(x);
      }
    }
    const flipped = [...hit];
    for (const q of flipped) b[q] = 3 - b[q];
    return flipped;
  }

  /**
   * 盤面を直接書き換えて着手する。
   * 打てないマスなら盤面を変えずに null を返す。
   * 打てたら { flips, blast, followUp } を返す
   * （flips：はさんで裏返した石、blast：爆風で裏返した石、followUp：おいうちで裏返した石）。
   * followUp を true にすると「おいうち」ありのルールで着手する（false なら戻り値の followUp は常に []）。
   * 戻り値は undoMove に渡すと着手を取り消せる。
   */
  function applyMove(b, pos, player, followUp) {
    const flips = getFlips(b, pos, player);
    if (flips.length === 0) return null;
    b[pos] = player;
    for (const q of flips) b[q] = player;
    const blast = getBlast(b, pos);
    for (const q of blast) b[q] = 3 - b[q];
    return { flips, blast, followUp: followUp ? getFollowUp(b, blast) : [] };
  }

  /** applyMove を取り消す。 */
  function undoMove(b, pos, player, move) {
    for (const q of move.followUp) b[q] = 3 - b[q];
    for (const q of move.blast) b[q] = 3 - b[q];
    const opp = 3 - player;
    for (const q of move.flips) b[q] = opp;
    b[pos] = EMPTY;
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
    getBlast,
    getFollowUp,
    isLegal,
    legalMoves,
    countMoves,
    applyMove,
    undoMove,
    countDiscs,
    isGameOver,
  };
});
