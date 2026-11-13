/**
 * 名刺交換・低さバトルの画面（canvas の描画と操作）。ルールは game.js。
 *
 * 座標：
 * - 「ワールド座標」は、床を y = 0 として下向きが正。名刺の y は (x - SURFACE) * PX
 * - 画面は「設計ピクセル」で描き、端末の大きさに合わせて拡大する（scale）
 */
(function () {
  'use strict';

  const G = window.MeishiGame;
  const { SURFACE, GOAL, LAYERS } = G;

  /** x が 1 進むと何ピクセル（設計ピクセル）下がるか。 */
  const PX = 10.5;
  /** 名刺を持つ手の、画面中央からのずれ。 */
  const HAND_GAP = 16;
  const ARM = 34; // 肩から手まで
  const TORSO = 52; // 肩から腰まで
  const LEG = 63; // 腰から足先まで
  const BOW_MAX = 1.75; // お辞儀の最大の角度（ラジアン）

  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 要素 ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('stage');
  const ctx = canvas.getContext('2d');
  const hud = $('hud');
  const depthEl = $('depth');
  const layerEl = $('layer');
  const rudeFill = $('rude-fill');
  const backFill = $('back-fill');
  const oppFill = $('opp-fill');
  const rudeGauge = rudeFill.closest('.gauge');
  const holdBtn = $('hold');
  const toastEl = $('toast');
  const titleScreen = $('title-screen');
  const resultScreen = $('result-screen');

  // ---------- 状態 ----------
  let game = G.createGame();
  let mode = 'title'; // 'title' | 'playing' | 'ending' | 'result'
  let endingTimer = 0; // 結果画面を出すまでのタイマー（setTimeout の ID）
  let camY = -75;
  let shake = 0;
  let particles = [];
  let bubbles = { player: null, opp: null };
  let lastBubbleAt = { player: -9, opp: -9 };
  let now = 0; // 経過時間（秒、描画のアニメーション用）
  let toastTimer = 0;

  const holdPointers = new Set();
  let keyHeld = false;
  const isHolding = () => holdPointers.size > 0 || keyHeld;

  // ---------- 画面の大きさ ----------
  let W = 0, H = 0, scale = 1, VW = 0, VH = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    scale = Math.min(W / 600, H / 400);
    VW = W / scale;
    VH = H / scale;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---------- 便利な関数 ----------
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => t * t * (3 - 2 * t);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const cardWorldY = (x) => (x - SURFACE) * PX;
  const layerWorldY = (i) => (i <= 0 ? -Infinity : cardWorldY(G.xAtDepth(LAYERS[i].from)));
  const toScreenY = (wy) => wy - camY + VH * 0.5;

  /** 決まった値を返す疑似乱数（地層の模様や飾りの位置用）。 */
  function hash(a, b) {
    let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ---------- 地層の見た目 ----------
  const LAYER_LOOK = {
    underfloor: { color: '#a3a39c', dot: '#8a8a83', deco: ['🔌', '🧦', '🪙', '🖇️', '🔩'] },
    parking: { color: '#70727c', dot: '#5f616a', deco: ['🚗', '🚙', '🅿️', '🚐'] },
    subway: { color: '#5d4c3d', dot: '#4c3d31', deco: ['🐀', '🪨'] },
    water: { color: '#4f6475', dot: '#43566a', deco: ['💧', '🐟', '🫧', '🦐'] },
    fossil: { color: '#b38d5d', dot: '#9c7a4f', deco: ['🦴', '🐚', '🦕', '🦖', '🦴'] },
    onsen: { color: '#8c5d3f', dot: '#764d33', deco: ['♨️', '🐒', '♨️', '🦫'] },
    oil: { color: '#3b3131', dot: '#2d2525', deco: ['🛢️', '⛽', '🛢️'] },
    crust: { color: '#5e5864', dot: '#4d4853', deco: ['🪨', '💎', '⛏️', '🪨'] },
    mantle: { color: '#c2410c', dot: '#a3360a', deco: ['🔥', '🌋', '🔥'] },
    outer: { color: '#ee8a0c', dot: '#d97706', deco: ['🔥', '⚙️', '🔥'] },
    inner: { color: '#ffd166', dot: '#f4b942', deco: ['✨', '☀️', '✨'] },
  };

  /** 地層の飾り（絵文字）を、地層ごとに決まった位置に置く。 */
  const DECOS = [];
  for (let i = 1; i < LAYERS.length; i++) {
    const look = LAYER_LOOK[LAYERS[i].id];
    const top = layerWorldY(i);
    const bottom = i + 1 < LAYERS.length ? layerWorldY(i + 1) : cardWorldY(GOAL) + 400;
    const count = Math.max(3, Math.round((bottom - top) / 55));
    for (let k = 0; k < count; k++) {
      const r1 = hash(i, k * 3 + 1);
      const r2 = hash(i, k * 3 + 2);
      const r3 = hash(i, k * 3 + 3);
      DECOS.push({
        emoji: look.deco[k % look.deco.length],
        y: lerp(top + 24, bottom - 18, (k + 0.2 + r1 * 0.6) / count),
        side: k % 2 === 0 ? -1 : 1,
        dist: 110 + r2 * 170, // 画面中央からの距離
        size: 20 + r3 * 14,
        tilt: (r3 - 0.5) * 0.6,
      });
    }
  }

  // ---------- 描画：背景 ----------
  function drawOffice() {
    const top = toScreenY(-420);
    const floor = toScreenY(0);
    if (floor < 0) return;
    const cx = VW / 2;

    // 壁
    ctx.fillStyle = '#ebe5d6';
    ctx.fillRect(0, top, VW, floor - top);
    ctx.fillStyle = '#d8d0bc';
    ctx.fillRect(0, floor - 12, VW, 12); // 幅木

    // 窓（ビルの夜景ではなく昼の街）
    for (const side of [-1, 1]) {
      for (let n = 0; n < 3; n++) {
        const wx = cx + side * (170 + n * 150) - 55;
        const wy = toScreenY(-270);
        ctx.fillStyle = '#b9b19c';
        ctx.fillRect(wx - 5, wy - 5, 120, 110);
        ctx.fillStyle = '#9fd6f5';
        ctx.fillRect(wx, wy, 110, 100);
        // ビル
        for (let b = 0; b < 5; b++) {
          const bh = 25 + hash(n * 7 + (side + 2), b) * 55;
          ctx.fillStyle = b % 2 ? '#7f96b2' : '#93a8c2';
          ctx.fillRect(wx + b * 22, wy + 100 - bh, 20, bh);
        }
        ctx.fillStyle = '#b9b19c';
        ctx.fillRect(wx + 53, wy, 4, 100);
      }
    }

    // 時計
    const clockY = toScreenY(-300);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, clockY, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, clockY);
    ctx.lineTo(cx, clockY - 11);
    ctx.moveTo(cx, clockY);
    ctx.lineTo(cx + 8, clockY + 3);
    ctx.stroke();

    // 標語
    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(cx - 40, toScreenY(-262), 80, 34);
    ctx.fillStyle = '#c0392b';
    ctx.font = '700 13px "M PLUS Rounded 1c", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('低姿勢', cx, toScreenY(-252));
    ctx.fillStyle = '#1f2a4a';
    ctx.font = '700 7px "M PLUS Rounded 1c", sans-serif';
    ctx.fillText('今期スローガン', cx, toScreenY(-237));

    // 観葉植物
    for (const side of [-1, 1]) {
      const px = cx + side * 150;
      ctx.fillStyle = '#b5643b';
      ctx.fillRect(px - 12, floor - 30, 24, 30);
      ctx.fillStyle = '#3f9a52';
      for (let l = 0; l < 5; l++) {
        ctx.beginPath();
        ctx.ellipse(px + (l - 2) * 7, floor - 42 - Math.abs(l - 2) * -4 - 8, 7, 18, (l - 2) * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 床
    ctx.fillStyle = '#8d8778';
    ctx.fillRect(0, floor, VW, 6);
  }

  function drawUnderground() {
    const viewTop = camY - VH * 0.5;
    const viewBottom = camY + VH * 0.5;
    for (let i = 1; i < LAYERS.length; i++) {
      const top = Math.max(layerWorldY(i), 6);
      const bottom = i + 1 < LAYERS.length ? layerWorldY(i + 1) : Infinity;
      if (bottom < viewTop || top > viewBottom) continue;
      const look = LAYER_LOOK[LAYERS[i].id];
      const sTop = toScreenY(Math.max(top, viewTop));
      const sBottom = toScreenY(Math.min(bottom, viewBottom));
      ctx.fillStyle = look.color;
      ctx.fillRect(0, sTop, VW, sBottom - sTop + 1);

      // 地層のつぶつぶ
      ctx.fillStyle = look.dot;
      const step = 22;
      const r0 = Math.floor(Math.max(top, viewTop) / step);
      const r1 = Math.ceil(Math.min(bottom, viewBottom) / step);
      for (let r = r0; r <= r1; r++) {
        for (let k = 0; k < Math.ceil(VW / 60); k++) {
          const hx = hash(r, k + i * 100);
          const wy = r * step + hash(k, r) * step;
          if (wy < top || wy > bottom) continue;
          ctx.beginPath();
          ctx.arc(k * 60 + hx * 60, toScreenY(wy), 1.5 + hx * 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 境目の線
      if (top > viewTop && top > 6) {
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(0, toScreenY(top), VW, 3);
      }

      // 地層ごとの特別な絵
      const id = LAYERS[i].id;
      if (id === 'underfloor') drawPipes(top);
      if (id === 'subway') drawSubway(top, bottom);
      if (id === 'mantle' || id === 'outer' || id === 'inner') drawGlow(top, bottom, id);
    }
  }

  function drawPipes(top) {
    const y1 = toScreenY(top + 40);
    const y2 = toScreenY(top + 95);
    ctx.fillStyle = '#7b8a96';
    ctx.fillRect(0, y1, VW, 10);
    ctx.fillStyle = '#c47a3a';
    ctx.fillRect(0, y2, VW, 7);
    ctx.fillStyle = '#333';
    for (let x = 0; x < VW; x += 80) ctx.fillRect(x, y1 - 2, 6, 14);
  }

  function drawSubway(top, bottom) {
    const mid = (top + bottom) / 2;
    const y = toScreenY(mid - 26);
    ctx.fillStyle = '#2a221c';
    ctx.fillRect(0, y, VW, 52);
    ctx.fillStyle = '#777';
    ctx.fillRect(0, y + 47, VW, 3);
    // 電車
    const period = (VW + 700) / 260;
    const t = (now % period) * 260;
    const tx = t - 400;
    ctx.fillStyle = '#d9dde3';
    ctx.fillRect(tx, y + 8, 360, 38);
    ctx.fillStyle = '#7a3fa0';
    ctx.fillRect(tx, y + 32, 360, 5);
    ctx.fillStyle = '#ffeaa7';
    for (let k = 0; k < 9; k++) ctx.fillRect(tx + 12 + k * 39, y + 14, 26, 14);
    ctx.fillStyle = '#30343b';
    for (let k = 0; k < 9; k++) {
      // つり革につかまる乗客
      ctx.beginPath();
      ctx.arc(tx + 25 + k * 39, y + 22, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawGlow(top, bottom, id) {
    const n = id === 'mantle' ? 9 : 6;
    for (let k = 0; k < n; k++) {
      const wy = lerp(top, Math.min(bottom, cardWorldY(GOAL) + 300), (k + 0.5) / n);
      const sx = (hash(k, 77) * VW + now * (id === 'mantle' ? 12 : 20) * (k % 2 ? 1 : -1)) % (VW + 120) - 60;
      const r = 26 + 10 * Math.sin(now * 1.7 + k);
      const grad = ctx.createRadialGradient(sx, toScreenY(wy), 2, sx, toScreenY(wy), r);
      grad.addColorStop(0, id === 'inner' ? 'rgba(255,255,255,0.8)' : 'rgba(255,214,90,0.7)');
      grad.addColorStop(1, 'rgba(255,214,90,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(sx, toScreenY(wy), r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCenterMark() {
    const y = toScreenY(cardWorldY(GOAL) + 18);
    if (y < -40 || y > VH + 40) return;
    const cx = VW / 2;
    const grad = ctx.createRadialGradient(cx, y, 4, cx, y, 120);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, y, 120, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a2e00';
    ctx.font = '800 13px "M PLUS Rounded 1c", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ 地球の中心 ★', cx, y + 30);
  }

  function drawDecos() {
    const cx = VW / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const d of DECOS) {
      const y = toScreenY(d.y);
      if (y < -40 || y > VH + 40) continue;
      ctx.save();
      ctx.translate(cx + d.side * d.dist, y);
      ctx.rotate(d.tilt);
      ctx.font = `${d.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.fillStyle = '#000';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;
      ctx.fillText(d.emoji, 0, 0);
      ctx.restore();
    }
  }

  /** 掘った穴。 */
  function drawShaft(cardX, x, facing) {
    const bottom = cardWorldY(x) + 18;
    if (bottom <= 4) return;
    const left = facing > 0 ? cardX - 68 : cardX - 10;
    const sTop = toScreenY(0);
    const sBottom = toScreenY(bottom);
    ctx.fillStyle = 'rgba(12, 8, 6, 0.55)';
    ctx.fillRect(left, sTop, 78, sBottom - sTop);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(left, sTop, 3, sBottom - sTop);
    ctx.fillRect(left + 75, sTop, 3, sBottom - sTop);
    // 床の割れ目
    ctx.fillStyle = '#6d675a';
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(left - 4 + k * 22, sTop);
      ctx.lineTo(left + 6 + k * 22, sTop + 7);
      ctx.lineTo(left + 14 + k * 22, sTop);
      ctx.fill();
    }
  }

  // ---------- 描画：人 ----------
  const LOOKS = {
    player: { suit: '#2b3a67', suitDark: '#1d2849', tie: '#3a8ee6', hair: '#1b1b1b', bald: false, width: 17 },
    opp: { suit: '#5c5f66', suitDark: '#43464c', tie: '#d63a2f', hair: '#9a9a9a', bald: true, width: 21 },
  };

  /** 腕の向き（体の傾き θ に合わせて、前に出す → 頭の先に伸ばす）。 */
  function armVec(theta) {
    const t = clamp(theta / Math.PI, 0, 1);
    const dx = lerp(0.96, 0, t);
    const dy = lerp(0.29, 1, t);
    const len = Math.hypot(dx, dy);
    return { x: (dx / len) * ARM, y: (dy / len) * ARM };
  }

  const vec = (theta) => ({ up: { x: Math.sin(theta), y: -Math.cos(theta) }, fwd: { x: Math.cos(theta), y: Math.sin(theta) } });
  const mix = (a, b, t) => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });

  /**
   * 床より上の姿勢（手＝名刺の位置からの相対座標。右向き、y は下向き）。
   * 手の高さ h（床からのピクセル）に合わせて、まず腰からお辞儀し、それでも足りなければひざをつく。
   */
  function floorPose(h) {
    const handH = (th) => LEG + TORSO * Math.cos(th) - armVec(th).y;
    let theta;
    if (h >= handH(0)) theta = 0;
    else if (h <= handH(BOW_MAX)) theta = BOW_MAX;
    else {
      let lo = 0, hi = BOW_MAX;
      for (let k = 0; k < 24; k++) {
        const mid = (lo + hi) / 2;
        if (handH(mid) > h) lo = mid; else hi = mid;
      }
      theta = (lo + hi) / 2;
    }
    const { up, fwd } = vec(theta);
    const a = armVec(theta);
    const S = { x: -a.x, y: -a.y };
    const P = { x: S.x - up.x * TORSO, y: S.y - up.y * TORSO };
    // 足は床（手から h 下）。腰が低いほど足を後ろに引いて、ひざを前に出す
    const hipH = Math.max(0, h - P.y); // 腰の床からの高さ
    const back = Math.sqrt(Math.max(0, LEG * LEG - hipH * hipH)) * 0.92;
    const F = { x: P.x - back, y: h };
    const d = Math.max(1, Math.hypot(F.x - P.x, F.y - P.y));
    const half = Math.min(LEG / 2, d / 2);
    const bend = Math.sqrt(Math.max(0, (LEG / 2) ** 2 - half * half));
    const mid = { x: (P.x + F.x) / 2, y: (P.y + F.y) / 2 };
    // ひざは、腰→足の線から前（+x 側）に出す
    const nx = (F.y - P.y) / d, ny = -(F.x - P.x) / d;
    const K = { x: mid.x + nx * bend, y: mid.y + ny * bend };
    return { theta, S, P, K, F, Hd: { x: S.x + up.x * 17, y: S.y + up.y * 17 }, up, fwd };
  }

  /** 頭から潜る姿勢（腕を頭の先に伸ばして、名刺が先頭）。 */
  function divePose() {
    const S = { x: 0, y: -ARM };
    return { theta: Math.PI, S, P: { x: 0, y: S.y - TORSO }, K: { x: 0, y: S.y - TORSO - LEG / 2 }, F: { x: 0, y: S.y - TORSO - LEG }, Hd: { x: 0, y: S.y + 17 } };
  }

  /** x のときの姿勢。床から 7 だけ下がるあいだに、ひざをついた姿勢から潜る姿勢に変わる。 */
  function poseAt(x) {
    const h = Math.max(0, -cardWorldY(Math.min(x, SURFACE)));
    const a = floorPose(h);
    if (x <= SURFACE) return a;
    const b = divePose();
    const t = smooth(clamp((x - SURFACE) / 7, 0, 1));
    const theta = lerp(a.theta, b.theta, t);
    return Object.assign({ theta, S: mix(a.S, b.S, t), P: mix(a.P, b.P, t), K: mix(a.K, b.K, t), F: mix(a.F, b.F, t), Hd: mix(a.Hd, b.Hd, t) }, vec(theta));
  }

  function drawPerson(who, cardX, x, facing, stamina) {
    const look = LOOKS[who];
    const cy = toScreenY(cardWorldY(x));
    const { theta, S, P, K, F, Hd, up, fwd } = poseAt(x);

    ctx.save();
    ctx.translate(cardX, cy);
    ctx.scale(facing, 1);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 足（2 本）
    ctx.strokeStyle = look.suitDark;
    ctx.lineWidth = 8;
    for (const off of [-2.5, 2.5]) {
      ctx.beginPath();
      ctx.moveTo(P.x + off, P.y);
      ctx.lineTo(K.x + off, K.y);
      ctx.lineTo(F.x + off, F.y);
      ctx.stroke();
    }
    // 靴
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.ellipse(F.x + 4, F.y - 2, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // 胴体
    ctx.strokeStyle = look.suit;
    ctx.lineWidth = look.width;
    ctx.beginPath();
    ctx.moveTo(S.x - up.x * 4, S.y - up.y * 4);
    ctx.lineTo(P.x, P.y);
    ctx.stroke();
    // シャツとネクタイ
    const nx = S.x + fwd.x * (look.width / 2 - 3);
    const ny = S.y + fwd.y * (look.width / 2 - 3);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(nx - up.x * 20, ny - up.y * 20);
    ctx.stroke();
    ctx.strokeStyle = look.tie;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(nx, ny);
    ctx.lineTo(nx - up.x * 18, ny - up.y * 18);
    ctx.stroke();

    // 頭
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(Hd.x, Hd.y, 11, 0, Math.PI * 2);
    ctx.fill();
    // 髪
    ctx.fillStyle = look.hair;
    if (look.bald) {
      // 横だけ残った髪
      ctx.beginPath();
      ctx.arc(Hd.x - fwd.x * 6, Hd.y - fwd.y * 6, 6, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(Hd.x + up.x * 2 - fwd.x * 2, Hd.y + up.y * 2 - fwd.y * 2, 10.5, theta - Math.PI * 1.05, theta + 0.15);
      ctx.fill();
    }
    // 目と口
    const ex = Hd.x + fwd.x * 6 + up.x * 2;
    const ey = Hd.y + fwd.y * 6 + up.y * 2;
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(ex, ey, 1.6, 0, Math.PI * 2);
    ctx.fill();
    if (look.bald) {
      // めがね
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(ex, ey, 3.6, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#8a4b3a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const mx = Hd.x + fwd.x * 7 - up.x * 5;
    const my = Hd.y + fwd.y * 7 - up.y * 5;
    ctx.moveTo(mx - fwd.x * 2.5, my - fwd.y * 2.5);
    ctx.lineTo(mx + fwd.x * 1.5, my + fwd.y * 1.5);
    ctx.stroke();

    // 汗（腰が限界に近いとき）
    if (stamina < 0.3) {
      ctx.fillStyle = '#7fd3ff';
      const n = stamina < 0.15 ? 3 : 1;
      for (let k = 0; k < n; k++) {
        const ph = (now * 2 + k * 0.33) % 1;
        const sx = Hd.x - fwd.x * (8 + k * 4) + up.x * 6;
        const sy = Hd.y - fwd.y * (8 + k * 4) + up.y * 6 + ph * 10;
        ctx.globalAlpha = 1 - ph;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 腕
    ctx.strokeStyle = look.suit;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(S.x, S.y);
    ctx.lineTo(0, 0);
    ctx.stroke();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /** 名刺。 */
  function drawCard(who, cardX, x, facing) {
    const y = toScreenY(cardWorldY(x));
    const w = 32, h = 19;
    const left = facing > 0 ? cardX - 6 : cardX + 6 - w;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(left + 2, y - h / 2 + 2, w, h);
    ctx.fillStyle = '#fffdf7';
    ctx.fillRect(left, y - h / 2, w, h);
    ctx.fillStyle = who === 'player' ? '#2b3a67' : '#d63a2f';
    ctx.fillRect(left, y - h / 2, 3, h);
    ctx.fillStyle = '#333';
    ctx.font = '700 6px "M PLUS Rounded 1c", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(who === 'player' ? '平社員' : '部長', left + 6, y - 3);
    ctx.fillStyle = '#aaa';
    ctx.fillRect(left + 6, y + 3, w - 11, 1.5);
    ctx.fillRect(left + 6, y + 6, w - 16, 1.5);
  }

  // ---------- 描画：ふきだし・粒・小さな地図 ----------
  function say(who, text, duration) {
    bubbles[who] = { text, until: now + (duration || 1.6) };
    lastBubbleAt[who] = now;
  }

  function drawBubble(who, cardX, x) {
    const b = bubbles[who];
    if (!b || now > b.until) return;
    const side = who === 'player' ? -1 : 1;
    ctx.font = '700 12px "M PLUS Rounded 1c", sans-serif';
    const tw = ctx.measureText(b.text).width;
    const bw = tw + 18, bh = 26;
    const ax = cardX + side * 40;
    const ay = toScreenY(cardWorldY(x)) - 70;
    let bx = side < 0 ? ax - bw : ax;
    bx = clamp(bx, 6, VW - bw - 6);
    const by = clamp(ay - bh, 70, VH - bh - 90);
    ctx.fillStyle = '#fffdf7';
    ctx.strokeStyle = '#1f2a4a';
    ctx.lineWidth = 2;
    roundRect(bx, by, bw, bh, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1f2a4a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.text, bx + bw / 2, by + bh / 2 + 1);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function burst(wx, wy, n, color) {
    for (let k = 0; k < n; k++) {
      particles.push({
        x: wx + (Math.random() - 0.5) * 30,
        y: wy,
        vx: (Math.random() - 0.5) * 160,
        vy: -60 - Math.random() * 160,
        life: 0.6 + Math.random() * 0.5,
        size: 2 + Math.random() * 4,
        color,
      });
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life * 2, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, toScreenY(p.y) - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawMiniMap() {
    const x = 18;
    const top = Math.max(96, VH * 0.25);
    const bottom = VH - 80;
    if (bottom - top < 60) return;
    const yOf = (gx) => lerp(top, bottom, clamp(gx / GOAL, 0, 1));
    // 地上
    ctx.fillStyle = '#ebe5d6';
    ctx.fillRect(x - 4, top, 8, yOf(SURFACE) - top);
    for (let i = 1; i < LAYERS.length; i++) {
      const y0 = yOf(G.xAtDepth(LAYERS[i].from));
      const y1 = i + 1 < LAYERS.length ? yOf(G.xAtDepth(LAYERS[i + 1].from)) : bottom;
      ctx.fillStyle = LAYER_LOOK[LAYERS[i].id].color;
      ctx.fillRect(x - 4, y0, 8, y1 - y0);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - 4.5, top - 0.5, 9, bottom - top + 1);
    // 目印
    const mark = (gx, color, side) => {
      const y = yOf(gx);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + side * 6, y);
      ctx.lineTo(x + side * 14, y - 5);
      ctx.lineTo(x + side * 14, y + 5);
      ctx.closePath();
      ctx.fill();
    };
    mark(game.opp.x, '#ff6b5b', 1);
    mark(game.player.x, '#7fc8ff', 1);
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('🌏', x, bottom + 3);
  }

  // ---------- 描画：まとめ ----------
  function render() {
    ctx.save();
    if (shake > 0 && !reduceMotion) {
      ctx.translate((Math.random() - 0.5) * shake * 10, (Math.random() - 0.5) * shake * 10);
    }
    // いちばん奥（オフィスの上の空間）
    ctx.fillStyle = '#ebe5d6';
    ctx.fillRect(-20, -20, VW + 40, VH + 40);

    drawOffice();
    drawUnderground();
    drawCenterMark();
    drawDecos();

    const cx = VW / 2;
    const pX = cx - HAND_GAP;
    const oX = cx + HAND_GAP;
    drawShaft(pX, game.player.x, 1);
    drawShaft(oX, game.opp.x, -1);
    drawPerson('opp', oX, game.opp.x, -1, game.opp.stamina);
    drawPerson('player', pX, game.player.x, 1, game.player.stamina);
    // 低いほうの名刺を手前に
    if (game.player.x >= game.opp.x) {
      drawCard('opp', oX, game.opp.x, -1);
      drawCard('player', pX, game.player.x, 1);
    } else {
      drawCard('player', pX, game.player.x, 1);
      drawCard('opp', oX, game.opp.x, -1);
    }
    drawParticles();
    drawBubble('opp', oX, game.opp.x);
    drawBubble('player', pX, game.player.x);
    ctx.restore();

    if (mode === 'playing' || mode === 'ending') drawMiniMap();
  }

  // ---------- 表示（HUD） ----------
  let lastDepthText = '';
  let lastLayerText = '';
  function updateHud() {
    const p = game.player;
    const dText = G.formatDepth(p.x);
    if (dText !== lastDepthText) {
      depthEl.textContent = dText;
      lastDepthText = dText;
    }
    const layer = LAYERS[G.layerIndexAt(p.x)];
    const lText = `${layer.emoji} ${layer.name}`;
    if (lText !== lastLayerText) {
      layerEl.textContent = lText;
      lastLayerText = lText;
    }
    rudeFill.style.width = `${game.rude * 100}%`;
    rudeGauge.classList.toggle('is-danger', game.rude > 0.7);
    backFill.style.width = `${p.stamina * 100}%`;
    backFill.classList.toggle('is-low', p.stamina < 0.3);
    oppFill.style.width = `${game.opp.stamina * 100}%`;
    oppFill.classList.toggle('is-low', game.opp.stamina < 0.3);
  }

  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add('is-shown');
    toastTimer = 1.8;
  }

  // ---------- できごと ----------
  const PLAYER_LINES = ['いえいえ！', 'こちらこそ！', 'わたくしなど！', 'めっそうもない！', 'いえいえいえ！'];
  const OPP_LINES = ['いえいえ、わたくしなど', 'とんでもございません', 'こちらこそ', 'いえいえいえ', 'どうかお納めを'];

  function handleEvents(events) {
    const cx = VW / 2;
    for (const e of events) {
      if (e.type === 'overtake' && now - lastBubbleAt.player > 1.2) say('player', pick(PLAYER_LINES), 1.2);
      if (e.type === 'overtaken' && now - lastBubbleAt.opp > 1.2) say('opp', pick(OPP_LINES), 1.4);
      if (e.type === 'oppTired') say('opp', 'ハァ…ハァ…', 1.4);
      if (e.type === 'layer') {
        const layer = LAYERS[e.index];
        if (e.index === 1) {
          toast('💥 床をぶち抜いた！');
          shake = 0.8;
          burst(e.by === 'player' ? cx - 40 : cx + 40, 4, 34, '#8d8778');
        } else {
          toast(`${layer.emoji} ${layer.name}に到達`);
        }
        if (layer.line) say('opp', layer.line, 2.2);
      }
      if (e.type === 'over') startEnding(e.result);
    }
  }

  // ---------- 流れ ----------
  function startGame() {
    clearTimeout(endingTimer);
    game = G.createGame();
    mode = 'playing';
    particles = [];
    bubbles = { player: null, opp: null };
    camY = -75;
    titleScreen.hidden = true;
    resultScreen.hidden = true;
    hud.hidden = false;
    holdPointers.clear();
    keyHeld = false;
    holdBtn.classList.remove('is-down');
    say('opp', 'わたくし、こういう者です', 1.8);
    holdBtn.focus({ preventScroll: true });
  }

  const ENDING_LINES = {
    win: ['opp', '……参りました。お先にどうぞ'],
    rude: ['opp', '（この人、失礼だな……）'],
    back: ['player', 'こ、腰が……！'],
    beaten: ['opp', '中心より下はございませんので'],
    surrender: ['player', 'お先にどうぞ……'],
  };

  function startEnding(result) {
    mode = 'ending';
    // タブが裏にあってフレームが止まっていても結果を出せるように、setTimeout で待つ
    clearTimeout(endingTimer);
    endingTimer = setTimeout(showResult, result === 'surrender' ? 1400 : 2200);
    holdPointers.clear();
    keyHeld = false;
    holdBtn.classList.remove('is-down');
    const [who, line] = ENDING_LINES[result];
    say(who, line, 3);
    if (result === 'win') {
      toast('🔥 名刺が 6,000℃ で燃えた');
      burst(VW / 2, cardWorldY(GOAL), 40, '#fff3b0');
    }
    if (result === 'back') {
      toast('💥 グキッ');
      shake = 0.6;
    }
    if (result === 'surrender') setTimeout(() => say('opp', 'では', 2), 600);
  }

  const RESULTS = {
    win: {
      kicker: 'ご契約成立',
      text: '地球の中心で、ついに部長が「お先にどうぞ」と言いました。名刺は 6,000℃ で燃えつきましたが、商談はまとまりました。',
    },
    rude: {
      kicker: '商談失敗',
      title: '失礼な人だと思われた',
      text: '部長より高い位置で、名刺を出しつづけてしまいました。',
    },
    back: {
      kicker: '労災',
      title: 'ぎっくり腰',
      text: '名刺を下げすぎて、腰が限界をむかえました。押しっぱなしは危険です。',
    },
    beaten: {
      kicker: '商談失敗',
      title: '部長が先に地球の中心へ',
      text: 'これより下はありません。あなたの名刺は、もう下げられません。',
    },
    surrender: {
      kicker: 'マナー違反',
      title: '「お先にどうぞ」と言ってしまった',
      text: '部長「では」。部長は平然とあなたの名刺を受け取りました。',
    },
  };

  function showResult() {
    mode = 'result';
    hud.hidden = true;
    const r = RESULTS[game.result];
    $('result-kicker').textContent = r.kicker;
    $('result-title').textContent = game.result === 'win' ? `称号：${G.rankFor(game.time)}` : r.title;
    $('result-text').textContent = r.text;
    const stats = $('result-stats');
    stats.textContent = '';
    const rows = [
      ['とどいた深さ', G.formatDepth(game.player.x)],
      ['かかった時間', `${game.time.toFixed(1)} 秒`],
      ['部長より低かった時間', `${game.lowerTime.toFixed(1)} 秒`],
    ];
    for (const [k, v] of rows) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      stats.append(dt, dd);
    }
    resultScreen.hidden = false;
    $('retry').focus({ preventScroll: true });
  }

  // ---------- ループ ----------
  let lastT = performance.now();
  function frame(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    now += dt;

    if (mode === 'playing') {
      const before = game.player.x;
      const events = G.step(game, dt, isHolding());
      handleEvents(events);
      // 掘っているときの土ぼこり
      if (game.player.x > SURFACE && game.player.x > before && Math.random() < 0.5) {
        const layer = LAYERS[G.layerIndexAt(game.player.x)];
        burst(VW / 2 - HAND_GAP + 8, cardWorldY(game.player.x) + 12, 1, LAYER_LOOK[layer.id].dot);
      }
      updateHud();
    }

    // カメラ：自分の名刺を中心に、部長のほうへ少し寄せる
    const py = cardWorldY(game.player.x);
    const oy = cardWorldY(game.opp.x);
    const target = py + clamp((oy - py) * 0.5, -VH * 0.28, VH * 0.28) + 30;
    camY += (target - camY) * Math.min(1, dt * 6);

    shake = Math.max(0, shake - dt * 1.5);
    updateParticles(dt);
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toastEl.classList.remove('is-shown');
    }

    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ---------- 操作 ----------
  function holdStart(e) {
    if (mode !== 'playing') return;
    e.preventDefault();
    holdPointers.add(e.pointerId);
    holdBtn.classList.add('is-down');
    if (e.currentTarget.setPointerCapture) {
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) { /* 取れなくても動く */ }
    }
  }
  function holdEnd(e) {
    holdPointers.delete(e.pointerId);
    if (!isHolding()) holdBtn.classList.remove('is-down');
  }
  for (const el of [holdBtn, canvas]) {
    el.addEventListener('pointerdown', holdStart);
    el.addEventListener('pointerup', holdEnd);
    el.addEventListener('pointercancel', holdEnd);
    el.addEventListener('lostpointercapture', holdEnd);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' && e.code !== 'ArrowDown') return;
    if (mode !== 'playing') return;
    e.preventDefault();
    keyHeld = true;
    holdBtn.classList.add('is-down');
  });
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space' && e.code !== 'ArrowDown') return;
    if (mode === 'playing') e.preventDefault();
    keyHeld = false;
    if (!isHolding()) holdBtn.classList.remove('is-down');
  });
  window.addEventListener('blur', () => {
    holdPointers.clear();
    keyHeld = false;
    holdBtn.classList.remove('is-down');
  });

  $('start').addEventListener('click', startGame);
  $('retry').addEventListener('click', startGame);
  $('surrender').addEventListener('click', () => {
    if (mode !== 'playing') return;
    handleEvents(G.surrender(game));
  });
})();
