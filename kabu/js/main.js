/**
 * おおきなかぶ とばし の画面（canvas の描画と操作）。ルールは game.js。
 *
 * - 画面は「設計ピクセル」（横 800 × 縦 450 が入る大きさ）で描き、端末の大きさに合わせて拡大する
 * - 畑の場面：左にかぶ、その右におじいさん、うしろに種類ごとの「列の場所」（SLOTS）があり、
 *   呼んだ仲間はそこにわらわら集まる。大勢になるほど 1 人を小さく、うしろの列まで描く
 * - 飛ぶ場面：横軸が「距離の対数」の地図。1 m〜届け先の先までを 1 画面に入れ、かぶが弧をえがいて飛ぶ
 * - 数（何人・何倍）は画面に出さない。絵の大きさと動きだけで見せる
 */
(function () {
  'use strict';

  const G = window.KabuGame;
  const { SPECIES, STAGES } = G;
  const LAST = SPECIES.length - 1;

  /** ふちどりのこげ茶（style.css の --ink と同じ）。 */
  const INK = '#4a3222';
  const FONT_DISPLAY = '"Mochiy Pop One", "Hiragino Maru Gothic ProN", sans-serif';
  const PROGRESS_KEY = 'kabu.progress.v1';

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 要素 ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('stage');
  const ctx = canvas.getContext('2d');
  const hud = $('hud');
  const storyEl = $('story');
  const callBtn = $('call');
  const callLabel = $('call-label');
  const pullBtn = $('pull');
  const titleScreen = $('title-screen');
  const resultScreen = $('result-screen');

  // ---------- 状態 ----------
  let game = null;
  let stageIndex = 0;
  let placeIndex = null;
  /** 'title' | 'play' | 'pulling' | 'launch' | 'flying' | 'landed' | 'result' */
  let mode = 'title';
  let modeT0 = 0;
  let now = 0;
  let pullRes = null;
  let lift = 0; // かぶが土から出ている割合（表示用）
  let liftTarget = 0;
  let onoma = null; // { text, t0, over }
  let popups = []; // 来た人の上に出る文字
  let particles = [];
  let appear = []; // appear[phase][i] = その人が来た時刻
  let resultTimer = 0;

  const holdPointers = new Set();
  let keyHeld = false;
  const isHolding = () => holdPointers.size > 0 || keyHeld;

  // ---------- 画面の大きさ ----------
  let W = 0, H = 0, scale = 1, VW = 800, VH = 450, OX = 0, GROUND = 320;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    // 縦長の画面では左右を少し切りつめて大きく描く（かぶの左の余白を削り、列の右はしを画面の右にそろえる）
    scale = Math.min(W / 740, H / 450);
    VW = W / scale;
    VH = H / scale;
    OX = VW >= 800 ? (VW - 800) / 2 : VW - 800;
    // 縦長の画面では、地面を下のボタンのすぐ上まで下げる
    GROUND = Math.max(VH / 2 + 95, VH - 300);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- 便利な関数 ----------
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);

  /** 決まった値を返す疑似乱数（並び方や毛の色を毎フレーム同じにするため）。 */
  function hash(a, b) {
    let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  /** 距離（メートル）を読みやすく。1 万 km からは「万 km」「億 km」。 */
  function fmtDist(m) {
    const a = Math.abs(m);
    if (a < 10) return `${a.toFixed(1)} m`;
    if (a < 1000) return `${Math.round(a)} m`;
    const km = a / 1000;
    if (km < 10) return `${km.toFixed(1)} km`;
    if (km < 10000) return `${Math.round(km).toLocaleString('ja-JP')} km`;
    const man = km / 10000;
    if (man < 10000) return `${man < 10 ? man.toFixed(1).replace(/\.0$/, '') : Math.round(man).toLocaleString('ja-JP')}万 km`;
    const oku = man / 10000;
    return `${oku < 10 ? oku.toFixed(1).replace(/\.0$/, '') : Math.round(oku).toLocaleString('ja-JP')}億 km`;
  }

  // ---------- 記録 ----------
  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
      return { cleared: Array.isArray(p.cleared) ? p.cleared : [], best: Array.isArray(p.best) ? p.best : [] };
    } catch (e) {
      return { cleared: [], best: [] };
    }
  }
  function saveProgress(p) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
    } catch (e) { /* 保存できなくても遊べる */ }
  }
  let progress = loadProgress();

  // ---------- 畑の場面の配置（設計ピクセル。OX を足して使う） ----------
  const TURNIP_X = 118;
  const GRANDPA_X = 200;
  /** 種類ごとの列の場所（おじいさん以外）。 */
  const SLOTS = [
    null,
    { from: 228, to: 338 },
    { from: 342, to: 444 },
    { from: 450, to: 562 },
    { from: 566, to: 676 },
    { from: 680, to: 790 },
  ];
  /** 1 人（1 匹）の大きさ（ふつうの段階・1 人だけのとき）。 */
  const BASE = {
    grandpa: { w: 30, h: 84 },
    grandma: { w: 30, h: 80 },
    child: { w: 26, h: 64 },
    dog: { w: 50, h: 38 },
    cat: { w: 44, h: 34 },
    mouse: { w: 30, h: 20 },
  };
  /** 大勢になったときの、かたまり（うしろの影）の色。 */
  const MASS = {
    grandma: '#b8584c',
    child: '#d9a033',
    dog: '#a8733f',
    cat: '#c98a4a',
    mouse: '#8f8f9a',
  };

  /** かぶの半径（重いほど大きい）。 */
  function turnipR() {
    const [a, b] = game.stage.weight;
    return 44 + 18 * clamp((game.weight - a) / (b - a || 1), 0, 1);
  }

  /** 人や動物の並び方。row が大きいほどうしろ（上、小さく）。 */
  function layoutGroup(phase) {
    const grp = game.groups[phase];
    const id = SPECIES[phase].id;
    const n = grp.shown.length;
    const out = [];
    if (phase === 0) {
      if (n) out.push({ i: 0, x: OX + GRANDPA_X, y: GROUND, s: 1, row: 0 });
      return out;
    }
    const slot = SLOTS[phase];
    const base = BASE[id];
    const human = SPECIES[phase].kind === 'human';
    const sf = clamp(1 - (human ? 0.12 : 0.07) * Math.log2(Math.max(n, 1)), human ? 0.5 : 0.52, 1);
    const w = base.w * sf;
    const width = slot.to - slot.from;
    const cols = Math.max(1, Math.floor(width / (w * (human ? 0.72 : 0.62))));
    const rowStep = base.h * sf * (human ? 0.34 : 0.62);
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / cols);
      const col = i % cols;
      const inRow = Math.min(cols, n - row * cols);
      const span = width - w;
      const step = inRow > 1 ? span / (cols - 1) : 0;
      const jitter = (hash(phase * 100 + i, 7) - 0.5) * w * 0.3;
      const x = OX + slot.from + w / 2 + col * step + (row % 2 ? step * 0.5 : 0) + jitter;
      const d = Math.pow(0.93, row);
      out.push({ i, x: Math.min(x, OX + slot.to - w * 0.3), y: GROUND - row * rowStep, s: sf * d, row });
    }
    return out;
  }

  // ---------- 人の絵 ----------
  const HUMAN_LOOK = {
    grandpa: { cloth: '#5b7fb5', pants: '#4b3a2e', scale: 1 },
    grandma: { cloth: '#c9584c', pants: '#6b4a3a', scale: 0.96 },
    child: { cloth: '#f2b632', pants: '#3f6aa0', scale: 0.78 },
  };

  function strokeLimb(x1, y1, x2, y2, width, color) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    ctx.lineWidth = width + 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function circle(x, y, r, fill, stroke = INK, lw = 2) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw;
      ctx.stroke();
    }
  }

  /** 人（左を向いて、かぶのほうへ手をのばしている）。足もとが (x, y)。 */
  function drawHuman(id, tier, x, y, s, lean) {
    const look = HUMAN_LOOK[id];
    const bw = [9, 14, 20, 26, 32][tier];
    const limb = [2.6, 3.6, 5, 6.5, 8.5][tier];
    const skin = tier === 0 ? '#e4dccd' : '#f6c9a0';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean);
    ctx.scale(s * look.scale, s * look.scale);

    // 足（前に踏んばる）
    strokeLimb(0, -30, -11, 0, limb + 1, look.pants);
    strokeLimb(0, -30, 9, 0, limb + 1, look.pants);
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(-13, -1, 6, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(8, -1, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // うしろの腕
    const sh = -54;
    strokeLimb(bw / 2 - 3, sh, -bw / 2 - 18, sh + 6, limb, skin);

    // 胴
    ctx.beginPath();
    if (tier === 4) {
      ctx.moveTo(-bw / 2 - 5, -61);
      ctx.lineTo(bw / 2 + 5, -61);
      ctx.lineTo(bw / 2 - 3, -28);
      ctx.lineTo(-bw / 2 + 3, -28);
      ctx.closePath();
    } else {
      ctx.roundRect(-bw / 2, -60, bw, 33, Math.min(8, bw / 2));
    }
    ctx.fillStyle = tier === 4 ? '#ffffff' : look.cloth;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (tier === 4) {
      // ランニングシャツの色の帯
      ctx.fillStyle = look.cloth;
      ctx.fillRect(-bw / 2 + 1, -40, bw - 2, 5);
    }
    if (tier === 0) {
      // あばら骨
      ctx.strokeStyle = 'rgba(74,50,34,0.55)';
      ctx.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(-bw / 2 + 2, -54 + k * 6);
        ctx.quadraticCurveTo(0, -51 + k * 6, bw / 2 - 2, -54 + k * 6);
        ctx.stroke();
      }
    }

    // 前の腕（かぶのほうへ）
    strokeLimb(-bw / 2 + 3, sh, -bw / 2 - 21, sh + 8, limb, skin);
    if (tier >= 3) circle(-bw / 2 - 7, sh + 1, limb * (tier === 4 ? 0.95 : 0.7), skin, INK, 1.6);
    circle(-bw / 2 - 22, sh + 8, limb * 0.55 + 2, skin, INK, 1.6);

    // 頭
    const hy = -72;
    const hr = id === 'child' ? 12.5 : 11;
    circle(0, hy, hr, skin);
    if (tier === 0) {
      // こけたほほ
      ctx.strokeStyle = 'rgba(74,50,34,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(-4, hy + 3, 4, 0.2, 1.6);
      ctx.stroke();
    }
    // 髪
    if (id === 'grandpa') {
      ctx.fillStyle = '#f4f1ea';
      ctx.beginPath();
      ctx.ellipse(8, hy - 1, 5, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // ひげ
      ctx.beginPath();
      ctx.moveTo(-10, hy + 2);
      ctx.quadraticCurveTo(-8, hy + 16, 2, hy + 10);
      ctx.quadraticCurveTo(-3, hy + 6, -10, hy + 2);
      ctx.fill();
      ctx.stroke();
      // はげ頭の光
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.ellipse(-2, hy - 7, 4, 2, -0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (id === 'grandma') {
      ctx.fillStyle = '#d9d6d0';
      ctx.beginPath();
      ctx.arc(0, hy, hr, Math.PI * 1.05, Math.PI * 2.1);
      ctx.fill();
      ctx.stroke();
      circle(7, hy - 11, 5, '#d9d6d0');
    } else {
      ctx.fillStyle = '#3a2a22';
      ctx.beginPath();
      ctx.arc(0, hy, hr, Math.PI * 0.95, Math.PI * 2.15);
      ctx.fill();
      ctx.stroke();
      circle(9, hy - 5, 4, '#3a2a22');
    }
    if (tier === 4) {
      // はちまき
      ctx.fillStyle = '#e2553f';
      ctx.fillRect(-hr, hy - 6, hr * 2, 4);
      ctx.beginPath();
      ctx.moveTo(hr - 1, hy - 5);
      ctx.lineTo(hr + 8, hy - 9);
      ctx.lineTo(hr + 7, hy - 2);
      ctx.fill();
    }
    // 顔（左向き。力んでいる）
    ctx.fillStyle = INK;
    circle(-5, hy - 1, 1.6, INK, null);
    if (tier === 0) {
      ctx.strokeStyle = 'rgba(74,50,34,0.6)';
      ctx.beginPath();
      ctx.arc(-5, hy + 1.5, 2.5, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-9, hy - 5);
    ctx.lineTo(-3, hy - 4 + (tier >= 3 ? -2 : 0));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-9, hy + 5);
    ctx.lineTo(-4, hy + 5);
    ctx.stroke();
    if (tier !== 0) {
      ctx.fillStyle = 'rgba(232,110,90,0.35)';
      ctx.beginPath();
      ctx.arc(-2, hy + 3, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- 動物の絵 ----------
  const ANIMAL_COLORS = {
    dog: ['#c98a4b', '#e7c08f', '#8b5a34', '#f4efe6'],
    cat: ['#f2a65a', '#a0a0a8', '#4a4444', '#f5f0e6'],
    mouse: ['#a3a3ad', '#bdbdc6', '#8e8478'],
  };
  const TIER_SIZE = [0.62, 0.8, 1, 1.18, 1.38];
  const TIER_THICK = [0.6, 0.8, 1, 1.15, 1.4];

  /** 動物（左向き）。足もとが (x, y)。 */
  function drawAnimal(id, tier, x, y, s, lean, colorSeed) {
    const colors = ANIMAL_COLORS[id];
    const color = colors[Math.floor(colorSeed * colors.length)];
    const L = id === 'dog' ? 34 : id === 'cat' ? 30 : 18;
    const th = TIER_THICK[tier];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(lean * 0.6);
    const k = s * TIER_SIZE[tier];
    ctx.scale(k, k);
    const legH = L * 0.3;
    const by = -legH - L * 0.2 * th;
    // しっぽ
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    if (id === 'mouse') {
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(L * 0.45, by);
      ctx.bezierCurveTo(L * 0.9, by - 2, L * 0.8, by + 10, L * 1.2, by + 4);
      ctx.stroke();
    } else {
      strokeLimb(L * 0.42, by - 2, L * (id === 'cat' ? 0.62 : 0.6), by - L * (id === 'cat' ? 0.55 : 0.3), id === 'cat' ? 3 : 4, color);
    }
    // 足
    const lw = Math.max(2.5, L * 0.1 * th);
    strokeLimb(L * 0.28, by, L * 0.3, 0, lw, color);
    strokeLimb(-L * 0.25, by, -L * 0.42, -1, lw, color); // 前足（踏んばる）
    // 胴
    ctx.beginPath();
    ctx.ellipse(0, by, L * 0.5, L * 0.24 * th, 0, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.stroke();
    if (tier === 4) {
      // 盛りあがった肩
      circle(-L * 0.25, by - L * 0.12, L * 0.18, color, INK, 1.6);
    }
    // 頭
    const hr = L * (tier === 0 ? 0.3 : 0.24);
    const hx = -L * 0.5;
    const hy = by - L * 0.18;
    // 耳
    ctx.fillStyle = color;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    if (id === 'dog') {
      ctx.beginPath();
      ctx.ellipse(hx + hr * 0.6, hy + hr * 0.2, hr * 0.35, hr * 0.7, 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (id === 'cat') {
      for (const dx of [-0.55, 0.35]) {
        ctx.beginPath();
        ctx.moveTo(hx + hr * (dx - 0.3), hy - hr * 0.6);
        ctx.lineTo(hx + hr * dx, hy - hr * 1.45);
        ctx.lineTo(hx + hr * (dx + 0.35), hy - hr * 0.6);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      circle(hx + hr * 0.4, hy - hr * 0.9, hr * 0.75, '#e8c3c8');
    }
    circle(hx, hy, hr, color);
    if (id === 'dog') {
      // 鼻づら
      circle(hx - hr * 0.8, hy + hr * 0.25, hr * 0.42, color, INK, 1.4);
      circle(hx - hr * 1.15, hy + hr * 0.1, hr * 0.16, INK, null);
    } else {
      circle(hx - hr * 0.95, hy + hr * 0.15, hr * 0.13, id === 'mouse' ? '#e07a8a' : INK, null);
    }
    circle(hx - hr * 0.35, hy - hr * 0.15, Math.max(1.3, hr * (tier === 0 ? 0.2 : 0.14)), INK, null);
    if (tier === 4) {
      ctx.fillStyle = '#e2553f';
      ctx.fillRect(hx - hr, hy - hr * 0.55, hr * 2, hr * 0.3);
    }
    ctx.restore();
  }

  // ---------- かぶ ----------
  function drawTurnip(x, cy, R, rot = 0) {
    ctx.save();
    ctx.translate(x, cy);
    ctx.rotate(rot);
    // 葉
    const leaves = [-0.75, -0.35, 0.05, 0.45, 0.8];
    leaves.forEach((a, i) => {
      ctx.save();
      ctx.translate(0, -R * 0.85);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(0, -R * 0.75, R * 0.26, R * 0.75, 0, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 ? '#5aa843' : '#4b9437';
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(40,80,30,0.6)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -R * 1.3);
      ctx.stroke();
      ctx.restore();
    });
    // 根
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, R * 1.1);
    ctx.quadraticCurveTo(R * 0.15, R * 1.4, R * 0.05, R * 1.7);
    ctx.stroke();
    // 実
    ctx.beginPath();
    ctx.moveTo(0, -R);
    ctx.bezierCurveTo(R * 1.3, -R, R * 1.1, R * 0.6, 0, R * 1.15);
    ctx.bezierCurveTo(-R * 1.1, R * 0.6, -R * 1.3, -R, 0, -R);
    const grad = ctx.createLinearGradient(0, -R, 0, R);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(1, '#f1e9de');
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.ellipse(-R * 0.4, -R * 0.35, R * 0.12, R * 0.3, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------- 背景 ----------
  function drawSky(top = '#9ad7f0', bottom = '#e8f6fb') {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VW, VH);
  }

  function drawCloud(x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(x, y, 16 * s, 0, Math.PI * 2);
    ctx.arc(x + 18 * s, y - 8 * s, 20 * s, 0, Math.PI * 2);
    ctx.arc(x + 40 * s, y, 15 * s, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFarmBack() {
    drawSky();
    // お日さま
    circle(OX + 700, GROUND - 230, 26, '#ffd35a', null);
    for (let i = 0; i < 4; i++) {
      const x = ((hash(i, 3) * VW + now * (4 + i * 2)) % (VW + 120)) - 60;
      drawCloud(x, GROUND - 200 - hash(i, 5) * 80, 0.8 + hash(i, 9) * 0.6);
    }
    // 遠くの丘
    ctx.fillStyle = '#a9d68a';
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    for (let x = 0; x <= VW + 40; x += 40) ctx.lineTo(x, GROUND - 40 - Math.sin(x * 0.01) * 18 - Math.sin(x * 0.023) * 10);
    ctx.lineTo(VW, GROUND);
    ctx.fill();
    ctx.fillStyle = '#8cc46c';
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    for (let x = 0; x <= VW + 40; x += 40) ctx.lineTo(x, GROUND - 18 - Math.sin(x * 0.015 + 2) * 8);
    ctx.lineTo(VW, GROUND);
    ctx.fill();
  }

  function drawSoil() {
    ctx.fillStyle = '#b07b4c';
    ctx.fillRect(0, GROUND, VW, VH - GROUND);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(VW, GROUND);
    ctx.stroke();
    // うね
    ctx.strokeStyle = 'rgba(74,50,34,0.25)';
    ctx.lineWidth = 2;
    for (let r = 1; r < 6; r++) {
      const y = GROUND + r * 16;
      if (y > VH) break;
      ctx.beginPath();
      for (let x = 0; x <= VW; x += 30) ctx.lineTo(x, y + Math.sin(x * 0.05 + r) * 2);
      ctx.stroke();
    }
    // 草
    ctx.strokeStyle = '#4f9a3a';
    ctx.lineWidth = 2;
    for (let i = 0; i < 26; i++) {
      const x = hash(i, 11) * VW;
      if (Math.abs(x - (OX + TURNIP_X)) < 60) continue;
      ctx.beginPath();
      ctx.moveTo(x - 4, GROUND + 1);
      ctx.lineTo(x - 6, GROUND - 7);
      ctx.moveTo(x, GROUND + 1);
      ctx.lineTo(x, GROUND - 10);
      ctx.moveTo(x + 4, GROUND + 1);
      ctx.lineTo(x + 6, GROUND - 7);
      ctx.stroke();
    }
  }

  // ---------- 畑の場面 ----------
  function pullLean() {
    if (mode === 'pulling') {
      const t = (now - modeT0) / PULL_TIME;
      return 0.1 + 0.16 * Math.abs(Math.sin(t * Math.PI * 2));
    }
    if (mode === 'launch') return clamp(0.26 + (now - modeT0) * 2.4, 0, 1.3);
    if (mode === 'result' && pullRes && pullRes.type === 'final' && !pullRes.pulled) return 0.05;
    return 0.05 + Math.sin(now * 2) * 0.015;
  }

  function drawGroup(phase, lean) {
    const grp = game.groups[phase];
    const id = SPECIES[phase].id;
    const slots = layoutGroup(phase);
    const human = SPECIES[phase].kind !== 'animal';
    const times = appear[phase] || [];
    // 大勢のときは、うしろにかたまりを描く
    if (grp.count > grp.shown.length && SLOTS[phase]) {
      const slot = SLOTS[phase];
      const extra = Math.log10(grp.count / grp.shown.length + 1);
      const topRow = slots.length ? slots[slots.length - 1].y : GROUND;
      const hgt = Math.min(GROUND - topRow + 14 + extra * 34, GROUND - 95);
      ctx.fillStyle = MASS[id];
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(OX + slot.from - 4, GROUND);
      const bumps = 9;
      for (let b = 0; b <= bumps; b++) {
        const x = OX + slot.from - 4 + ((slot.to - slot.from + 8) * b) / bumps;
        const wob = Math.sin(now * 6 + b * 1.7 + phase) * 2;
        const hh = hgt * (0.82 + 0.18 * Math.sin(b * 1.3 + phase)) + wob;
        ctx.lineTo(x, GROUND - hh);
        // 耳の形のでこぼこ
        if (b < bumps) ctx.lineTo(x + (slot.to - slot.from) / bumps / 2, GROUND - hh - 5);
      }
      ctx.lineTo(OX + slot.to + 4, GROUND);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // 目がたくさん光っている
      ctx.fillStyle = 'rgba(40,25,15,0.7)';
      const eyes = Math.min(40, Math.round(extra * 14));
      for (let e = 0; e < eyes; e++) {
        const ex = OX + slot.from + hash(phase * 31 + e, 2) * (slot.to - slot.from);
        const ey = GROUND - 8 - hash(phase * 31 + e, 3) * (hgt - 14);
        if (Math.sin(now * 3 + e) > -0.9) {
          ctx.beginPath();
          ctx.arc(ex, ey, 1.4, 0, Math.PI * 2);
          ctx.arc(ex + 4, ey, 1.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // うしろの列から描く
    for (let k = slots.length - 1; k >= 0; k--) {
      const p = slots[k];
      const tier = grp.shown[p.i];
      const born = times[p.i] != null ? times[p.i] : -9;
      const age = now - born;
      const pop = age < 0.25 ? easeOut(age / 0.25) * (1 + 0.25 * Math.sin((age / 0.25) * Math.PI)) : 1;
      const bob = Math.sin(now * 5 + p.i) * (mode === 'pulling' ? 0 : 0.8);
      const myLean = lean + (hash(phase * 100 + p.i, 4) - 0.5) * 0.1;
      if (pop <= 0) continue;
      if (human) drawHuman(id, tier, p.x, p.y + bob * 0.3, p.s * pop, myLean);
      else drawAnimal(id, tier, p.x, p.y, p.s * pop, myLean, hash(phase * 100 + p.i, 9));
    }
  }

  function drawFarm() {
    drawFarmBack();
    const R = turnipR();
    const tx = OX + TURNIP_X;
    let cy = lerp(GROUND + R * 0.6, GROUND - R * 0.75, lift);
    let rot = 0;
    if (mode === 'pulling') {
      const t = now - modeT0;
      const closeness = pullRes && pullRes.type === 'hint' ? clamp(1 - pullRes.gap / 8, 0.05, 1) : 1;
      rot = Math.sin(t * 38) * 0.05 * closeness;
      cy += Math.sin(t * 31) * 2 * closeness;
    }
    if (mode === 'launch') {
      const t = now - modeT0;
      cy -= t * t * 900;
      rot = -t * 6;
    }
    if (mode !== 'launch' || cy > -200) drawTurnip(tx, cy, R, rot);
    // 掘れた穴
    if (mode === 'launch') {
      ctx.fillStyle = '#5d3e26';
      ctx.beginPath();
      ctx.ellipse(tx, GROUND + 4, R * 0.9, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    drawSoil();
    if (mode === 'launch') {
      ctx.fillStyle = '#5d3e26';
      ctx.beginPath();
      ctx.ellipse(tx, GROUND + 3, R * 0.9, 7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const lean = pullLean();
    for (let ph = LAST; ph >= 0; ph--) if (game.groups[ph].count > 0) drawGroup(ph, lean);

    // かけ声
    if (mode === 'pulling') {
      const t = (now - modeT0) / PULL_TIME;
      const word = t < 0.5 ? 'うんとこしょ' : 'どっこいしょ';
      const a = clamp(Math.sin(((t % 0.5) / 0.5) * Math.PI) * 1.6, 0, 1);
      bigText(word, OX + 470, GROUND - 190, 40, a, '#ffffff');
    }
    if (onoma) {
      const age = now - onoma.t0;
      if (age < 3.2) {
        const a = clamp(Math.min(age * 6, (3.2 - age) * 2), 0, 1);
        const shake = reduceMotion ? 0 : Math.sin(now * 40) * (onoma.over ? 3 : 1.5);
        const sz = onoma.text.length > 8 ? 26 : 38;
        bigText(onoma.text, OX + TURNIP_X + 120 + shake, GROUND - R * 2.6 - 40, sz, a, onoma.over ? '#ffd0c4' : '#fff8e6', -0.08);
      }
    }
    drawPopups();
  }

  function bigText(text, x, y, size, alpha, fill, rot = 0) {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.font = `${size}px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = INK;
    ctx.strokeText(text, 0, 0);
    ctx.fillStyle = fill;
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  function drawPopups() {
    popups = popups.filter((p) => now - p.t0 < 1.2);
    for (const p of popups) {
      const age = now - p.t0;
      const a = clamp((1.2 - age) * 3, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `14px ${FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = INK;
      ctx.strokeText(p.text, p.x, p.y - age * 30);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - age * 30);
      ctx.restore();
    }
  }

  // ---------- 飛ぶ場面 ----------
  let flight = null; // { dist, maxLog, dur }

  function flightX(d) {
    const left = 60;
    const right = VW - 50;
    return left + (Math.log10(1 + Math.max(0, d)) / flight.maxLog) * (right - left);
  }

  function setupFlight(res) {
    const far = Math.max(game.target * (1 + game.tol), res.distance, 10);
    const maxLog = Math.log10(1 + far) + 0.35;
    flight = { dist: res.distance, maxLog, dur: clamp(2 + maxLog * 0.22, 2.4, 4.6) };
  }

  /** 目盛り（10 m、100 m、1 km…）。 */
  const TICKS = [10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12];

  function drawFlight() {
    const t = mode === 'flying' ? clamp((now - modeT0) / flight.dur, 0, 1) : 1;
    const e = easeOut(t);
    const space = clamp((flight.maxLog - 5) / 4, 0, 1); // 遠いほど、空の上のほうが宇宙になる
    const top = space > 0 ? mix('#9ad7f0', '#0d1636', space) : '#9ad7f0';
    drawSky(top, '#e8f6fb');
    if (space > 0) {
      ctx.fillStyle = `rgba(255,255,255,${0.8 * space})`;
      for (let i = 0; i < 60; i++) {
        const x = hash(i, 21) * VW;
        const y = hash(i, 22) * (GROUND - 120);
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    }
    // 地面
    ctx.fillStyle = '#8cc46c';
    ctx.fillRect(0, GROUND - 6, VW, 6);
    ctx.fillStyle = '#b07b4c';
    ctx.fillRect(0, GROUND, VW, VH - GROUND);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GROUND - 6);
    ctx.lineTo(VW, GROUND - 6);
    ctx.stroke();

    // 目盛り
    ctx.font = `12px ${FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let lastLabel = -Infinity;
    for (const d of TICKS) {
      if (Math.log10(1 + d) > flight.maxLog) break;
      const x = flightX(d);
      const label = x - lastLabel >= 64;
      if (label) lastLabel = x;
      ctx.strokeStyle = 'rgba(74,50,34,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, GROUND - 6);
      ctx.lineTo(x, GROUND + 8);
      ctx.stroke();
      ctx.fillStyle = '#fff8e6';
      if (label) ctx.fillText(fmtDist(d), x, GROUND + 12);
    }

    // OK の範囲
    const lo = flightX(game.target * (1 - game.tol));
    const hi = flightX(game.target * (1 + game.tol));
    ctx.fillStyle = 'rgba(79,154,58,0.35)';
    ctx.fillRect(lo, GROUND - 6 - 160, hi - lo, 160);
    ctx.fillStyle = '#4f9a3a';
    ctx.fillRect(lo, GROUND - 10, hi - lo, 8);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(lo, GROUND - 10, hi - lo, 8);

    // ほかのステージの届け先（小さく）
    ctx.textBaseline = 'alphabetic';
    for (const st of STAGES) {
      for (const pl of st.places) {
        if (pl === game.place || Math.log10(1 + pl.dist) > flight.maxLog) continue;
        ctx.globalAlpha = 0.5;
        ctx.font = '18px sans-serif';
        ctx.fillText(pl.emoji, flightX(pl.dist), GROUND - 10);
        ctx.globalAlpha = 1;
      }
    }
    // 出発点
    ctx.font = '28px sans-serif';
    ctx.fillText('🏡', flightX(0) - 10, GROUND - 8);
    // 届け先
    const tx = flightX(game.target);
    ctx.font = '40px sans-serif';
    ctx.fillText(game.place.emoji, tx, GROUND - 10);
    ctx.font = '24px sans-serif';
    ctx.fillText('🚩', tx + 18, GROUND - 46);
    ctx.font = `14px ${FONT_DISPLAY}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = INK;
    ctx.strokeText(game.place.name, tx, GROUND - 176);
    ctx.fillStyle = '#fff8e6';
    ctx.fillText(game.place.name, tx, GROUND - 176);

    // かぶ
    const endX = flightX(flight.dist);
    const x = lerp(flightX(0), endX, e);
    const arcH = clamp(70 + flight.maxLog * 22, 80, GROUND - 70);
    const y = GROUND - 14 - 4 * arcH * e * (1 - e);
    const d = Math.pow(10, e * Math.log10(1 + flight.dist)) - 1;
    // 軌跡
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.setLineDash([4, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let k = 0; k <= 30; k++) {
      const ee = (e * k) / 30;
      const px = lerp(flightX(0), endX, ee);
      const py = GROUND - 14 - 4 * arcH * ee * (1 - ee);
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    drawTurnip(x, y, 12, mode === 'flying' ? now * 9 : 0.3);
    // 距離
    bigText(fmtDist(d), clamp(x, 70, VW - 70), y - 46, 20, 1, '#ffffff');
    drawParticles();
  }

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16);
    const pb = parseInt(b.slice(1), 16);
    const ch = (p, s) => (p >> s) & 255;
    const c = (s) => Math.round(lerp(ch(pa, s), ch(pb, s), t));
    return `rgb(${c(16)},${c(8)},${c(0)})`;
  }

  function drawParticles() {
    particles = particles.filter((p) => now - p.t0 < p.life);
    for (const p of particles) {
      const age = now - p.t0;
      const k = age / p.life;
      ctx.fillStyle = `rgba(176,123,76,${1 - k})`;
      ctx.beginPath();
      ctx.arc(p.x + p.vx * age, p.y + p.vy * age + 60 * age * age, p.r * (1 - k * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      particles.push({ x, y, vx: (Math.random() - 0.5) * 140, vy: -Math.random() * 90, r: 3 + Math.random() * 4, t0: now, life: 0.8 + Math.random() * 0.4 });
    }
  }

  // ---------- 進行 ----------
  const PULL_TIME = 1.5;
  const LAUNCH_TIME = 0.9;

  function setMode(m) {
    mode = m;
    modeT0 = now;
    updateUI();
  }

  function startStage(s, place) {
    clearTimeout(resultTimer);
    stageIndex = s;
    game = G.createGame({ stage: s, place: place == null ? undefined : place });
    placeIndex = game.placeIndex;
    appear = SPECIES.map(() => []);
    appear[0][0] = -9;
    lift = 0;
    liftTarget = 0;
    onoma = null;
    pullRes = null;
    popups = [];
    particles = [];
    flight = null;
    holdPointers.clear();
    keyHeld = false;
    titleScreen.hidden = true;
    resultScreen.hidden = true;
    hud.hidden = false;
    $('goal-stage').textContent = `ステージ ${s + 1}`;
    $('goal-emoji').textContent = game.place.emoji;
    $('goal-name').textContent = game.place.name;
    $('goal-dist').textContent = fmtDist(game.target);
    $('goal-range').textContent = `OK：${fmtDist(game.target * (1 - game.tol))}〜${fmtDist(game.target * (1 + game.tol))}`;
    setStory('おじいさんが、かぶを ぬこうとしています。<strong>うんとこしょ！</strong>');
    setMode('play');
  }

  function setStory(html) {
    storyEl.innerHTML = html;
  }

  function promptFor(phase) {
    const sp = SPECIES[phase];
    if (phase === LAST) return `さいごは <strong>${sp.name}</strong>。ねずみが来たら根っこが切れる、これが本番！`;
    return `<strong>${sp.name}</strong>を よぼう！`;
  }

  function onPull() {
    if (mode !== 'play' || !G.canPull(game) || isHolding()) return;
    pullRes = G.pull(game);
    onoma = null;
    setStory('うんとこしょ、どっこいしょ。');
    setMode('pulling');
  }

  function finishPull() {
    const res = pullRes;
    if (res.type === 'hint') {
      liftTarget = res.lift;
      onoma = { text: res.hint.text, t0: now, over: res.hint.id === 'over' };
      const sp = SPECIES[game.phase];
      setStory(`それでも かぶは ぬけません。<br>${promptFor(game.phase)}`);
      if (sp) appear[game.phase] = [];
      setMode('play');
      return;
    }
    if (res.pulled) {
      dust(OX + TURNIP_X, GROUND, 24);
      setStory('<strong>すっぽーん！</strong>');
      setMode('launch');
    } else {
      onoma = { text: 'しーん……', t0: now, over: false };
      setStory('それでも かぶは ぬけませんでした……');
      setMode('result');
      resultTimer = setTimeout(showResult, 1500);
    }
  }

  function showResult() {
    const r = game.result;
    const name = game.place.name;
    const stamp = $('result-stamp');
    const title = $('result-title');
    const text = $('result-text');
    const stats = $('result-stats');
    let ok = r.clear;
    if (!r.pulled) {
      stamp.textContent = 'ぬけない';
      title.textContent = 'ぬけない…';
      text.textContent = 'ねずみまでそろったのに、かぶはぬけませんでした。力がたりなかったみたい。';
    } else if (r.clear) {
      const perfect = Math.abs(r.ratio) < 0.05;
      stamp.textContent = perfect ? 'ぴったり' : 'とどいた';
      title.textContent = perfect ? 'ぴったり！' : 'とどいた！';
      text.textContent = `かぶが ${name} に とどきました。`;
    } else if (r.error > 0) {
      stamp.textContent = 'とびすぎ';
      title.textContent = 'とびすぎ…';
      text.textContent = `${name} を ${fmtDist(r.error)} こえて、とんでいってしまった。`;
    } else {
      stamp.textContent = 'とどかず';
      title.textContent = 'とどかない…';
      text.textContent = `${name} の ${fmtDist(-r.error)} 手前に おちてしまった。`;
    }
    stamp.className = `stamp ${ok ? 'is-ok' : 'is-ng'}`;
    // スタンプのアニメーションをやり直す
    void stamp.offsetWidth;
    const rows = [['とどけさき', `${game.place.emoji} ${name}（${fmtDist(game.target)}）`]];
    if (r.pulled) {
      rows.push(['とんだ距離', fmtDist(r.distance)]);
      rows.push(['ずれ', `${r.error >= 0 ? '+' : '−'}${fmtDist(r.error)}（${r.error >= 0 ? '+' : '−'}${Math.abs(r.ratio * 100).toFixed(r.ratio * 100 < 10 ? 1 : 0)}%）`]);
    }
    stats.innerHTML = '';
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      stats.append(dt, dd);
    }

    if (ok) {
      progress.cleared[stageIndex] = true;
      const prev = progress.best[stageIndex];
      if (prev == null || Math.abs(r.ratio) < prev) progress.best[stageIndex] = Math.abs(r.ratio);
      saveProgress(progress);
    }
    const next = $('next');
    const retry = $('retry');
    const hasNext = ok && stageIndex < STAGES.length - 1;
    next.hidden = !hasNext;
    retry.className = `btn ${hasNext ? 'btn-sub' : 'btn-main'}`;
    $('to-title').classList.toggle('is-wide', !hasNext);
    hud.hidden = true;
    resultScreen.hidden = false;
    setMode('result');
    (hasNext ? next : retry).focus({ preventScroll: true });
  }

  // ---------- 画面の部品の更新 ----------
  function updateUI() {
    if (!game) return;
    const playing = mode === 'play';
    const sp = SPECIES[game.phase];
    const showCall = game.state === 'calling' && sp && sp.kind !== 'fixed';
    callBtn.hidden = !showCall;
    if (showCall) {
      const full = !G.canCall(game);
      callLabel.textContent = full ? `${sp.name}は もういっぱい` : `${sp.name}を よぶ`;
      callBtn.disabled = !playing || full;
    }
    pullBtn.hidden = mode === 'flying' || mode === 'landed' || mode === 'launch' || game.state === 'done' && mode !== 'pulling';
    pullBtn.disabled = !playing || !G.canPull(game) || isHolding();
    const final = game.phase === LAST && game.state === 'calling';
    pullBtn.classList.toggle('is-final', final && G.canPull(game) && playing);
    pullBtn.innerHTML = final ? 'うんとこしょ！<span class="pull-note">本番</span>' : 'うんとこしょ！';
    callBtn.classList.toggle('is-down', isHolding() && playing);
  }

  // ---------- タイトル ----------
  function buildStageGrid() {
    const grid = $('stage-grid');
    grid.innerHTML = '';
    STAGES.forEach((st, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `btn stage-card${progress.cleared[i] ? ' is-clear' : ''}`;
      const dists = st.places.map((p) => p.dist);
      const lo = Math.min(...dists);
      const hi = Math.max(...dists);
      const best = progress.best[i];
      b.innerHTML = `<span class="stage-no">ステージ ${i + 1}</span>
        <span class="stage-emoji">${st.places.map((p) => p.emoji).join('')}</span>
        <span class="stage-dist">${lo === hi ? fmtDist(lo) : `${fmtDist(lo)}〜`}</span>
        <span class="stage-best">${best != null ? `ベスト ずれ ${(best * 100).toFixed(best < 0.1 ? 1 : 0)}%` : ''}</span>`;
      b.setAttribute('aria-label', `ステージ ${i + 1}：${st.places.map((p) => p.name).join('、')}${progress.cleared[i] ? '（クリア）' : ''}`);
      b.addEventListener('click', () => startStage(i));
      grid.append(b);
    });
  }

  function showTitle() {
    clearTimeout(resultTimer);
    buildStageGrid();
    hud.hidden = true;
    resultScreen.hidden = true;
    titleScreen.hidden = false;
    mode = 'title';
    setupDemo();
  }

  /** タイトルのうしろに出す畑（みんなが少しずつ集まったところ）。 */
  function setupDemo() {
    game = G.createGame({ stage: 3 });
    const secs = [0, 1.6, 1.2, 2.2, 2.6, 0];
    for (let ph = 0; ph < LAST; ph++) {
      for (let t = 0; t < secs[ph]; t += 1 / 30) G.hold(game, 1 / 30);
      G.pull(game);
    }
    game.arrivals.length = 0;
    appear = SPECIES.map((_, ph) => game.groups[ph].shown.map(() => -9));
    flight = null;
    onoma = null;
    pullRes = null;
    lift = liftTarget = 0.3;
  }

  // ---------- ループ ----------
  let last = performance.now();
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    now += dt;

    if (mode === 'play' && isHolding() && G.canCall(game)) {
      G.hold(game, dt);
      for (const a of game.arrivals) {
        if (SPECIES[a.phase].kind === 'human') {
          const pos = layoutGroup(a.phase);
          const p = pos[pos.length - 1];
          if (p) {
            const names = SPECIES[a.phase].tierNames;
            popups.push({ text: names[a.tier], x: p.x, y: p.y - 90 * p.s, t0: now, color: a.tier >= 3 ? '#ffd35a' : a.tier <= 1 ? '#d6e4ff' : '#ffffff' });
          }
        }
      }
      // 同じフレームで来た人の appear を正しくつける
      const grp = game.groups[game.phase];
      for (let i = 0; i < grp.shown.length; i++) if (appear[game.phase][i] == null) appear[game.phase][i] = now;
      if (game.arrivals.length) {
        if (grp.count === 1) setStory(`${SPECIES[game.phase].name}が きてくれた。もっと よぶ？ それとも <strong>うんとこしょ！</strong>`);
        game.arrivals.length = 0;
        updateUI();
      }
    }
    lift = lerp(lift, liftTarget, 1 - Math.exp(-dt * 4));

    if (mode === 'pulling' && now - modeT0 >= PULL_TIME) finishPull();
    if (mode === 'launch' && now - modeT0 >= LAUNCH_TIME) {
      setupFlight(game.result);
      setMode('flying');
    }
    if (mode === 'flying' && now - modeT0 >= flight.dur) {
      const x = flightX(flight.dist);
      dust(x, GROUND - 8, 18);
      setMode('landed');
      resultTimer = setTimeout(showResult, 1100);
    }

    ctx.clearRect(0, 0, VW, VH);
    if (game) {
      if (flight && (mode === 'flying' || mode === 'landed' || (mode === 'result' && game.result && game.result.pulled))) drawFlight();
      else drawFarm();
    }
    requestAnimationFrame(frame);
  }

  // ---------- 操作 ----------
  function holdStart(e) {
    if (mode !== 'play' || !G.canCall(game)) return;
    e.preventDefault();
    holdPointers.add(e.pointerId);
    try {
      callBtn.setPointerCapture(e.pointerId);
    } catch (err) { /* なくても動く */ }
    updateUI();
  }
  function holdEnd(e) {
    if (holdPointers.delete(e.pointerId)) updateUI();
  }
  callBtn.addEventListener('pointerdown', holdStart);
  callBtn.addEventListener('pointerup', holdEnd);
  callBtn.addEventListener('pointercancel', holdEnd);
  callBtn.addEventListener('lostpointercapture', holdEnd);
  callBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  pullBtn.addEventListener('click', onPull);

  window.addEventListener('keydown', (e) => {
    if (mode !== 'play') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat && G.canCall(game)) {
        keyHeld = true;
        updateUI();
      }
    } else if (e.code === 'Enter' || e.code === 'ArrowUp') {
      e.preventDefault();
      onPull();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && keyHeld) {
      keyHeld = false;
      updateUI();
    }
  });
  window.addEventListener('blur', () => {
    holdPointers.clear();
    keyHeld = false;
    updateUI();
  });

  $('random').addEventListener('click', () => startStage(Math.floor(Math.random() * STAGES.length)));
  $('retry').addEventListener('click', () => startStage(stageIndex, placeIndex));
  $('next').addEventListener('click', () => startStage(stageIndex + 1));
  $('to-title').addEventListener('click', showTitle);
  $('quit').addEventListener('click', showTitle);

  if (/[?&]debug\b/.test(location.search)) {
    window.__game = () => game;
    window.__mode = () => mode;
  }

  showTitle();
  requestAnimationFrame(frame);
})();
