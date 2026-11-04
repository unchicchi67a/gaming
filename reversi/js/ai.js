/**
 * リバーシの CPU 思考ルーチン（レベル 1〜10）。
 *
 * - レベル 1   : ランダムに打つ
 * - レベル 2   : 多く返せる手を好む（ときどきランダム）
 * - レベル 3〜6: 位置評価（＋着手可能数）による浅い先読み。低いレベルほど判断に揺らぎを入れる
 * - レベル 7〜10: 深い先読み（反復深化 αβ 探索）＋終盤の完全読み
 *
 * 探索は時間制限付きで、制限を超えた場合は直前に読み切った深さの結果を使う。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./engine.js'));
  } else {
    root.ReversiAI = factory(root.ReversiEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  const { EMPTY, BLACK, SQUARES } = E;

  /**
   * レベルごとの設定。
   * depth: 中盤の先読みの深さ / noise: 評価値に加える揺らぎの幅
   * mobility: 着手可能数を評価に含めるか / exact: 残り空きマスがこの数以下なら完全読み
   */
  const LEVELS = [
    null,
    { kind: 'random' },
    { kind: 'greedy', randomRate: 0.4 },
    { depth: 1, noise: 45, mobility: false },
    { depth: 2, noise: 25, mobility: false },
    { depth: 2, noise: 10, mobility: true },
    { depth: 3, noise: 4, mobility: true },
    { depth: 4, noise: 0, mobility: true, exact: 8 },
    { depth: 5, noise: 0, mobility: true, exact: 10 },
    { depth: 6, noise: 0, mobility: true, exact: 12 },
    { depth: 8, noise: 0, mobility: true, exact: 14 },
  ];

  const MAX_LEVEL = LEVELS.length - 1;
  const WIN = 100000;
  const ABORT = { aborted: true };

  const WEIGHT_TABLE = [
    [100, -25, 10, 5, 5, 10, -25, 100],
    [-25, -50, -2, -2, -2, -2, -50, -25],
    [10, -2, 1, -1, -1, 1, -2, 10],
    [5, -2, -1, -1, -1, -1, -2, 5],
    [5, -2, -1, -1, -1, -1, -2, 5],
    [10, -2, 1, -1, -1, 1, -2, 10],
    [-25, -50, -2, -2, -2, -2, -50, -25],
    [100, -25, 10, 5, 5, 10, -25, 100],
  ];
  const WEIGHTS = new Int16Array(100);
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) WEIGHTS[E.toPos(r, c)] = WEIGHT_TABLE[r][c];
  }

  /** 隅と、その隅に隣接するマス（X 打ち・C 打ち）。隅が埋まったら隣接マスの減点をやめる。 */
  const CORNER_GROUPS = [
    [11, 22, 12, 21],
    [18, 27, 17, 28],
    [81, 72, 71, 82],
    [88, 77, 78, 87],
  ];

  function evaluate(b, player, useMobility) {
    const opp = 3 - player;
    let score = 0;
    for (const s of SQUARES) {
      if (b[s] === player) score += WEIGHTS[s];
      else if (b[s] === opp) score -= WEIGHTS[s];
    }
    for (const g of CORNER_GROUPS) {
      if (b[g[0]] === EMPTY) continue;
      for (let i = 1; i < 4; i++) {
        const q = g[i];
        if (b[q] === player) score -= WEIGHTS[q];
        else if (b[q] === opp) score += WEIGHTS[q];
      }
    }
    if (useMobility) {
      score += 8 * (E.countMoves(b, player) - E.countMoves(b, opp));
    }
    return score;
  }

  function discDiff(b, player) {
    const c = E.countDiscs(b);
    return player === BLACK ? c.black - c.white : c.white - c.black;
  }

  /** 終局時の評価。勝敗を最優先し、同じ勝ちなら石差が大きいほうを選ぶ。 */
  function terminalScore(b, player) {
    const d = discDiff(b, player);
    if (d > 0) return WIN + d;
    if (d < 0) return -WIN + d;
    return 0;
  }

  function checkTime(ctx) {
    if ((++ctx.nodes & 1023) === 0 && Date.now() > ctx.deadline) throw ABORT;
  }

  function orderByWeight(moves) {
    return moves.sort((a, b) => WEIGHTS[b] - WEIGHTS[a]);
  }

  function negamax(ctx, b, player, depth, alpha, beta, passed) {
    checkTime(ctx);
    if (depth <= 0) return evaluate(b, player, ctx.mobility);
    const moves = E.legalMoves(b, player);
    if (moves.length === 0) {
      if (passed) return terminalScore(b, player);
      return -negamax(ctx, b, 3 - player, depth, -beta, -alpha, true);
    }
    orderByWeight(moves);
    let best = -Infinity;
    for (const m of moves) {
      const flips = E.applyMove(b, m, player);
      const v = -negamax(ctx, b, 3 - player, depth - 1, -beta, -alpha, false);
      E.undoMove(b, m, player, flips);
      if (v > best) {
        best = v;
        if (v > alpha) {
          alpha = v;
          if (alpha >= beta) break;
        }
      }
    }
    return best;
  }

  /** 相手の着手可能数が少ない手から読む（完全読みの枝刈り効率を上げる）。 */
  function orderByOpponentMobility(b, player, moves) {
    const scored = moves.map((m) => {
      const flips = E.applyMove(b, m, player);
      const n = E.countMoves(b, 3 - player);
      E.undoMove(b, m, player, flips);
      return { m, n };
    });
    scored.sort((x, y) => x.n - y.n || WEIGHTS[y.m] - WEIGHTS[x.m]);
    return scored.map((s) => s.m);
  }

  /** 終盤の完全読み。最終的な石差（手番側から見た値）を返す。 */
  function solve(ctx, b, player, alpha, beta, passed, empties) {
    checkTime(ctx);
    if (empties === 0) return discDiff(b, player);
    let moves = E.legalMoves(b, player);
    if (moves.length === 0) {
      if (passed) return discDiff(b, player);
      return -solve(ctx, b, 3 - player, -beta, -alpha, true, empties);
    }
    if (empties > 6 && moves.length > 1) moves = orderByOpponentMobility(b, player, moves);
    let best = -Infinity;
    for (const m of moves) {
      const flips = E.applyMove(b, m, player);
      const v = -solve(ctx, b, 3 - player, -beta, -alpha, false, empties - 1);
      E.undoMove(b, m, player, flips);
      if (v > best) {
        best = v;
        if (v > alpha) {
          alpha = v;
          if (alpha >= beta) break;
        }
      }
    }
    return best;
  }

  function shuffle(arr, rand) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function pick(arr, rand) {
    return arr[Math.floor(rand() * arr.length)];
  }

  function chooseGreedy(b, player, moves, cfg, rand) {
    if (rand() < cfg.randomRate) return pick(moves, rand);
    let best = -1;
    let candidates = [];
    for (const m of moves) {
      const n = E.getFlips(b, m, player).length;
      if (n > best) {
        best = n;
        candidates = [m];
      } else if (n === best) {
        candidates.push(m);
      }
    }
    return pick(candidates, rand);
  }

  function solveRoot(board, player, moves, empties, deadline) {
    const b = E.cloneBoard(board);
    const ctx = { deadline, nodes: 0 };
    const ordered = orderByOpponentMobility(b, player, moves.slice());
    let bestMove = ordered[0];
    let alpha = -Infinity;
    for (const m of ordered) {
      const flips = E.applyMove(b, m, player);
      const v = -solve(ctx, b, 3 - player, -Infinity, -alpha, false, empties - 1);
      E.undoMove(b, m, player, flips);
      if (v > alpha) {
        alpha = v;
        bestMove = m;
      }
    }
    return bestMove;
  }

  function searchRoot(board, player, moves, cfg, deadline, rand) {
    const ctx = { deadline, nodes: 0, mobility: cfg.mobility };
    let order = orderByWeight(shuffle(moves.slice(), rand));
    let bestMove = order[0];
    for (let depth = 1; depth <= cfg.depth; depth++) {
      const b = E.cloneBoard(board);
      try {
        const scored = [];
        let alpha = -Infinity;
        for (const m of order) {
          const flips = E.applyMove(b, m, player);
          // 揺らぎを入れる場合は全候補の正確な値が必要なので窓を狭めない
          const v =
            cfg.noise > 0
              ? -negamax(ctx, b, 3 - player, depth - 1, -Infinity, Infinity, false)
              : -negamax(ctx, b, 3 - player, depth - 1, -Infinity, -alpha, false);
          E.undoMove(b, m, player, flips);
          if (v > alpha) alpha = v;
          scored.push({ m, v: cfg.noise > 0 ? v + (rand() * 2 - 1) * cfg.noise : v });
        }
        // 安定ソートなので、同点のときは先に最善と判明した手が先頭に残る
        scored.sort((x, y) => y.v - x.v);
        order = scored.map((s) => s.m);
        bestMove = order[0];
      } catch (e) {
        if (e !== ABORT) throw e;
        break;
      }
    }
    return bestMove;
  }

  /**
   * CPU の着手を選ぶ。打てる場所がなければ null。
   * @param {Int8Array} board 盤面（書き換えない）
   * @param {number} player 手番の色
   * @param {number} level 1〜10
   * @param {{timeLimitMs?: number, random?: () => number}} [options]
   */
  function chooseMove(board, player, level, options) {
    const opts = options || {};
    const rand = opts.random || Math.random;
    const timeLimit = opts.timeLimitMs != null ? opts.timeLimitMs : 1500;
    const lv = Math.min(MAX_LEVEL, Math.max(1, Math.round(level) || 1));
    const cfg = LEVELS[lv];

    const moves = E.legalMoves(board, player);
    if (moves.length === 0) return null;
    if (moves.length === 1) return moves[0];

    if (cfg.kind === 'random') return pick(moves, rand);
    if (cfg.kind === 'greedy') return chooseGreedy(board, player, moves, cfg, rand);

    const empties = E.countDiscs(board).empty;
    if (cfg.exact && empties <= cfg.exact) {
      try {
        return solveRoot(board, player, moves, empties, Date.now() + timeLimit);
      } catch (e) {
        if (e !== ABORT) throw e;
        // 時間内に読み切れなければ通常の探索に切り替える
      }
    }
    return searchRoot(board, player, moves, cfg, Date.now() + timeLimit, rand);
  }

  return { chooseMove, evaluate, MAX_LEVEL };
});
