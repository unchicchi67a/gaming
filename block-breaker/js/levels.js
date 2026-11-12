/**
 * ブロックくずしのステージ（Lv1〜100）と設定値。
 *
 * 画面に触れない純粋なロジックで、ブラウザと Node.js の両方から読み込める。
 * ステージはレベルの番号から決まった手順で作る（同じレベルはいつも同じ並び）。
 *
 * レベルが上がると、次のように難しくなる：
 * - ブロックの段数が増える（4 段 → 12 段）
 * - かたいブロック（何回か当てないとこわれない）が増え、かたさの上限も上がる（1 → 5）
 * - Lv15 から、こわれない鉄のブロックがまじる
 * - ボールの速さが少しずつ上がる（Lv100 で Lv1 の 1.6 倍）
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BlockLevels = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MIN_LEVEL = 1;
  const MAX_LEVEL = 100;
  const COLS = 10;
  const MAX_ROWS = 12;
  const MAX_HP = 5;

  /** 速さの設定。factor はボールの速さの倍率。 */
  const SPEEDS = {
    slow: { label: '遅い', factor: 0.7 },
    normal: { label: '普通', factor: 1 },
    fast: { label: '速い', factor: 1.35 },
  };

  /** バーの大きさの設定。factor はバーの幅の倍率。 */
  const PADDLES = {
    small: { label: '小さい', factor: 0.65 },
    normal: { label: '普通', factor: 1 },
    large: { label: '大きい', factor: 1.4 },
    huge: { label: 'とても大きい', factor: 1.9 },
  };

  /** ボールの数（残機）の設定。 */
  const LIVES = [1, 3, 5];

  const DEFAULT_SETTINGS = { level: 1, speed: 'normal', paddle: 'normal', lives: 3, sound: true };

  function clampLevel(lv) {
    const n = Math.round(Number(lv));
    if (!Number.isFinite(n)) return MIN_LEVEL;
    return Math.min(MAX_LEVEL, Math.max(MIN_LEVEL, n));
  }

  /** 保存されていた設定を確かめ、おかしな値は初期値にもどす。 */
  function normalizeSettings(raw) {
    const s = raw && typeof raw === 'object' ? raw : {};
    return {
      level: s.level == null ? DEFAULT_SETTINGS.level : clampLevel(s.level),
      speed: Object.prototype.hasOwnProperty.call(SPEEDS, s.speed) ? s.speed : DEFAULT_SETTINGS.speed,
      paddle: Object.prototype.hasOwnProperty.call(PADDLES, s.paddle) ? s.paddle : DEFAULT_SETTINGS.paddle,
      lives: LIVES.includes(s.lives) ? s.lives : DEFAULT_SETTINGS.lives,
      sound: typeof s.sound === 'boolean' ? s.sound : DEFAULT_SETTINGS.sound,
    };
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

  /**
   * ブロックの並び方。(r, c) にブロックを置くなら true。
   * レベルの番号で順番に切り替える。
   */
  const PATTERNS = [
    { name: 'full', fn: () => true },
    { name: 'pyramid', fn: (r, c, rows) => Math.abs(c - 4.5) <= ((r + 1) / rows) * 5 + 0.01 },
    { name: 'checker', fn: (r, c) => (r + c) % 2 === 0 || r % 3 === 0 },
    { name: 'diamond', fn: (r, c, rows) => Math.abs(c - 4.5) / 5 + Math.abs(r - (rows - 1) / 2) / (rows / 2) <= 1.05 },
    { name: 'pillars', fn: (r, c) => c % 3 !== 2 },
    { name: 'stripes', fn: (r) => r % 2 === 0 },
    { name: 'frame', fn: (r, c, rows, rng) => r === 0 || r === rows - 1 || c === 0 || c === COLS - 1 || rng() < 0.5 },
    { name: 'scatter', fn: (r, c, rows, rng) => rng() < 0.72 },
    { name: 'wings', fn: (r, c) => Math.abs(c - 4.5) >= 1.5 || r % 2 === 1 },
    { name: 'valley', fn: (r, c, rows) => Math.abs(c - 4.5) >= ((rows - r) / rows) * 3.5 },
  ];

  /** レベルごとの数値（段数・かたさの上限・鉄の割合・かたくなる確率・ボールの速さの倍率）。 */
  function levelParams(lv) {
    const level = clampLevel(lv);
    return {
      level,
      rows: Math.min(MAX_ROWS, 4 + Math.floor((level - 1) / 11)),
      maxHp: Math.min(MAX_HP, 1 + Math.floor((level - 1) / 20)),
      steelRate: level < 15 ? 0 : Math.min(0.14, (level - 14) * 0.0018),
      hardChance: 0.3 + 0.4 * (level / MAX_LEVEL),
      ballSpeed: 1 + ((level - 1) / (MAX_LEVEL - 1)) * 0.6,
      pattern: PATTERNS[(level - 1) % PATTERNS.length].name,
    };
  }

  /**
   * ステージを作る。
   * 戻り値の grid は rows 行 × COLS 列で、各マスは null（なし）か { hp, steel }。
   * 鉄のブロックにかこまれて、ボールが届かないブロックができないようにしてある（ensureReachable）。
   */
  function generateLevel(lv) {
    const p = levelParams(lv);
    const rng = seeded(p.level * 7919 + 13);
    const pattern = PATTERNS[(p.level - 1) % PATTERNS.length];
    const grid = [];
    for (let r = 0; r < p.rows; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        if (!pattern.fn(r, c, p.rows, rng)) {
          row.push(null);
          continue;
        }
        if (p.steelRate > 0 && rng() < p.steelRate) {
          row.push({ hp: 0, steel: true });
          continue;
        }
        let hp = 1;
        for (let k = 1; k < p.maxHp; k++) if (rng() < p.hardChance) hp++;
        // 上のほうの段は少しかたくする
        if (r < p.rows / 3 && hp < p.maxHp) hp++;
        row.push({ hp, steel: false });
      }
      grid.push(row);
    }
    ensureBreakable(grid, p.maxHp);
    ensureReachable(grid, p.maxHp);
    return { ...p, cols: COLS, grid };
  }

  /** こわせるブロックが 1 つもなければ、まん中の下の段に置く。 */
  function ensureBreakable(grid, maxHp) {
    if (grid.some((row) => row.some((b) => b && !b.steel))) return;
    const r = grid.length - 1;
    grid[r][4] = { hp: maxHp, steel: false };
    grid[r][5] = { hp: maxHp, steel: false };
  }

  /**
   * 盤の外（左右・上・下のすきま）から、鉄以外のマスを上下左右にたどって届かないマスを探す。
   * ブロックのすき間はボールより細いので、ななめには通れないものとして考える。
   * 届かないこわせるブロックがあれば、そのまわりの鉄をかたいブロックに変えて、もう一度調べる。
   */
  function ensureReachable(grid, maxHp) {
    const rows = grid.length;
    for (;;) {
      const reached = reachableCells(grid);
      let blocked = false;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < COLS; c++) {
          if (reached[r][c] || isSteel(grid, r, c)) continue;
          if (!grid[r][c]) continue;
          blocked = true;
          for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            if (isSteel(grid, r + dr, c + dc)) grid[r + dr][c + dc] = { hp: maxHp, steel: false };
          }
        }
      }
      if (!blocked) return;
    }
  }

  function isSteel(grid, r, c) {
    return r >= 0 && r < grid.length && c >= 0 && c < COLS && !!grid[r][c] && grid[r][c].steel;
  }

  /** 盤の外から、鉄を通らずに届くマス（true）の表。 */
  function reachableCells(grid) {
    const rows = grid.length;
    const reached = grid.map((row) => row.map(() => false));
    const queue = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        const edge = r === 0 || r === rows - 1 || c === 0 || c === COLS - 1;
        if (edge && !isSteel(grid, r, c)) {
          reached[r][c] = true;
          queue.push([r, c]);
        }
      }
    }
    while (queue.length) {
      const [r, c] = queue.shift();
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= COLS) continue;
        if (reached[nr][nc] || isSteel(grid, nr, nc)) continue;
        reached[nr][nc] = true;
        queue.push([nr, nc]);
      }
    }
    return reached;
  }

  /** タイトル画面に出すレベルの説明。 */
  function describeLevel(lv) {
    const L = generateLevel(lv);
    let bricks = 0;
    let steel = 0;
    for (const row of L.grid) {
      for (const b of row) {
        if (!b) continue;
        if (b.steel) steel++;
        else bricks++;
      }
    }
    return { level: L.level, rows: L.rows, maxHp: L.maxHp, bricks, steel, ballSpeed: L.ballSpeed };
  }

  return {
    MIN_LEVEL,
    MAX_LEVEL,
    COLS,
    MAX_ROWS,
    MAX_HP,
    SPEEDS,
    PADDLES,
    LIVES,
    DEFAULT_SETTINGS,
    PATTERNS,
    clampLevel,
    normalizeSettings,
    levelParams,
    generateLevel,
    reachableCells,
    describeLevel,
  };
});
