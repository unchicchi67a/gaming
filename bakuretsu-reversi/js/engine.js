/**
 * 爆裂リバーシのルールエンジン。
 *
 * ルール：
 * - 打てるマスは通常のリバーシと同じ（相手の石を 1 つ以上はさめるマスだけ）
 * - 打つと、まず通常のリバーシと同じように、はさんだ石を裏返す
 * - そのあと「爆風」で、打ったマスのまわり 8 マスにある石を、色に関係なくすべて裏返す
 *   （はさんで裏返したばかりの石も、隣にあればもう一度裏返って元の色に戻る。空きマスは変わらない）
 * - オプションの「連鎖爆裂」では、爆風で裏返った石が新しい色で相手の石をはさんでいれば、それも裏返す。
 *   裏返った石がさらに別の石をはさめば続けて裏返し、変化がなくなるまでくり返す（getChain を参照）
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
   * 連鎖爆裂：sources（爆風で裏返った石）から始めて、連鎖で裏返る石を段階ごとに求め、盤面に反映する。
   * 戻り値は段階ごとの石の一覧の配列（例：[[1 段目の石...], [2 段目の石...]]）。連鎖しなければ []。
   *
   * - 各段階では、直前の段階で裏返った石それぞれについて、今の色で 8 方向にはさめる相手の石を探す
   *   （通常のリバーシで、その石を置いたときと同じ判定）。見つかった石をまとめて裏返し、次の段階の起点にする
   * - 同じ段階の判定は、その段階を始めたときの盤面で行う（判定の順番で結果が変わらないように）
   * - 連鎖で一度裏返った石は、その手のあいだはもう裏返らない（行ったり来たりして終わらなくなるのを防ぐ）
   */
  function getChain(b, sources) {
    const waves = [];
    const done = new Set();
    let from = sources;
    while (from.length > 0) {
      const wave = new Set();
      for (const s of from) {
        const me = b[s];
        const opp = 3 - me;
        for (const d of DIRS) {
          let q = s + d;
          while (b[q] === opp) q += d;
          if (b[q] !== me) continue;
          for (let x = s + d; x !== q; x += d) if (!done.has(x)) wave.add(x);
        }
      }
      if (wave.size === 0) break;
      const flipped = [...wave];
      for (const q of flipped) {
        b[q] = 3 - b[q];
        done.add(q);
      }
      waves.push(flipped);
      from = flipped;
    }
    return waves;
  }

  /**
   * 盤面を直接書き換えて着手する。
   * 打てないマスなら盤面を変えずに null を返す。
   * 打てたら { flips, blast, chain } を返す
   * （flips：はさんで裏返した石、blast：爆風で裏返した石、chain：連鎖で裏返した石の段階ごとの一覧）。
   * chain を true にすると連鎖爆裂ルールで着手する（false なら chain は常に []）。
   * 戻り値は undoMove に渡すと着手を取り消せる。
   */
  function applyMove(b, pos, player, chain) {
    const flips = getFlips(b, pos, player);
    if (flips.length === 0) return null;
    b[pos] = player;
    for (const q of flips) b[q] = player;
    const blast = getBlast(b, pos);
    for (const q of blast) b[q] = 3 - b[q];
    return { flips, blast, chain: chain ? getChain(b, blast) : [] };
  }

  /** applyMove を取り消す。 */
  function undoMove(b, pos, player, move) {
    for (let i = move.chain.length - 1; i >= 0; i--) {
      for (const q of move.chain[i]) b[q] = 3 - b[q];
    }
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
    getChain,
    isLegal,
    legalMoves,
    countMoves,
    applyMove,
    undoMove,
    countDiscs,
    isGameOver,
  };
});
