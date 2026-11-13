/**
 * こたつの部屋と猫の絵（SVG 文字列）。画像ファイルは使わない。
 *
 * 部屋を真上から見た 1000 × 1000 の座標で描く。まん中にこたつがあり、
 * 猫はふとんの 4 辺（s：手前、e：右、n：奥、w：左）からそれぞれ出てくる。
 * 猫はふとんより先に描くので、ふとんの下にいる部分はかくれる。
 *
 * 猫の絵は「外向きが +y」の向きで描き、辺ごとに回して置く。顔だけは逆に回して、
 * どの辺の猫もこちらを向いて見えるようにしている。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KotatsuArt = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIZE = 1000;
  const FUTON = { x0: 280, y0: 280, x1: 720, y1: 720 };
  /** 猫の大きさ（ボスだけ少し大きい）。 */
  const CAT_SCALE = 0.82;
  const BOSS_SCALE = 0.92;
  const INK = '#3a2a28';

  /**
   * 辺ごとの置き方。hx, hy：ふとんのふちの、猫が出てくる点。angle：猫を回す角度。
   * bubble：吹き出しの位置。hit：タッチを受ける範囲 [x, y, 幅, 高さ]。
   */
  const SLOTS = {
    s: { hx: 500, hy: FUTON.y1, angle: 0, bubble: [690, 830], hit: [390, 660, 220, 340] },
    e: { hx: FUTON.x1, hy: 500, angle: -90, bubble: [860, 392], hit: [660, 390, 340, 220] },
    n: { hx: 500, hy: FUTON.y0, angle: 180, bubble: [310, 170], hit: [390, 0, 220, 340] },
    w: { hx: FUTON.x0, hy: 500, angle: 90, bubble: [140, 392], hit: [0, 390, 340, 220] },
  };

  /** 猫を外向きにずらす量。OFF_IN：奥にいる（見えない）、OFF_OUT：出きった、OFF_GONE：画面の外。 */
  const OFF_IN = -92;
  const OFF_OUT = 200;
  const OFF_GONE = 760;

  function offsetFor(progress) {
    return OFF_IN + (OFF_OUT - OFF_IN) * Math.max(0, Math.min(1, progress));
  }

  function catTransform(side, off) {
    const s = SLOTS[side];
    return `translate(${s.hx} ${s.hy}) rotate(${s.angle}) translate(0 ${off.toFixed(1)})`;
  }

  /** 毛の色。 */
  const COATS = {
    white: { fur: '#f7f3ec', shade: '#e4dccf', ear: '#f1b3b3', eye: '#3b2f2f', pupil: null, nose: '#e88a96', ink: INK },
    tabby: { fur: '#e3aa6a', shade: '#c98a4a', ear: '#f0a9a0', eye: '#3b2f2f', pupil: null, nose: '#c9665f', ink: INK, stripe: '#a86a34' },
    black: { fur: '#302b33', shade: '#25212a', ear: '#7a5560', eye: '#f2c94c', pupil: '#17131a', nose: '#5e4048', ink: '#141016' },
    calico: { fur: '#f8f2e6', shade: '#e6dccb', ear: '#f1b3b3', eye: '#3b2f2f', pupil: null, nose: '#e88a96', ink: INK, patchA: '#e2893a', patchB: '#3b3434' },
  };

  function catBody(cat, c) {
    const i = cat.index;
    let marks = '';
    if (c.stripe) {
      marks = `<g clip-path="url(#body-clip-${i})" stroke="${c.stripe}" stroke-width="9" fill="none" stroke-linecap="round">
        <path d="M-56 -30 Q0 -18 56 -30"/><path d="M-56 -66 Q0 -54 56 -66"/><path d="M-56 -102 Q0 -90 56 -102"/><path d="M-56 -138 Q0 -126 56 -138"/>
      </g>`;
    } else if (c.patchA) {
      marks = `<g clip-path="url(#body-clip-${i})">
        <ellipse cx="-34" cy="-110" rx="40" ry="34" fill="${c.patchA}"/>
        <ellipse cx="38" cy="-60" rx="34" ry="44" fill="${c.patchB}"/>
        <ellipse cx="-20" cy="-30" rx="18" ry="16" fill="${c.patchA}"/>
      </g>`;
    }
    return `<g class="cat-body">
      <path class="tail" d="M6 -150 C 14 -190, 52 -196, 44 -238" fill="none" stroke="${c.ink}" stroke-width="22" stroke-linecap="round">
        <animateTransform attributeName="transform" type="rotate" values="-10 6 -150;12 6 -150;-10 6 -150" dur="2.6s" repeatCount="indefinite"/>
      </path>
      <path class="tail" d="M6 -150 C 14 -190, 52 -196, 44 -238" fill="none" stroke="${c.patchB || c.fur}" stroke-width="15" stroke-linecap="round">
        <animateTransform attributeName="transform" type="rotate" values="-10 6 -150;12 6 -150;-10 6 -150" dur="2.6s" repeatCount="indefinite"/>
      </path>
      <ellipse cx="0" cy="-74" rx="54" ry="90" fill="${c.fur}" stroke="${c.ink}" stroke-width="4"/>
      ${marks}
      <ellipse cx="-24" cy="66" rx="15" ry="12" fill="${c.fur}" stroke="${c.ink}" stroke-width="4"/>
      <ellipse cx="24" cy="66" rx="15" ry="12" fill="${c.fur}" stroke="${c.ink}" stroke-width="4"/>
    </g>`;
  }

  function catHead(cat, c) {
    const i = cat.index;
    let marks = '';
    if (c.stripe) {
      marks = `<g stroke="${c.stripe}" stroke-width="6" stroke-linecap="round">
        <path d="M-12 -37 L-9 -24"/><path d="M0 -39 L0 -25"/><path d="M12 -37 L9 -24"/>
        <path d="M-44 4 L-34 6"/><path d="M44 4 L34 6"/>
      </g>`;
    } else if (c.patchA) {
      marks = `<g clip-path="url(#head-clip-${i})">
        <ellipse cx="-30" cy="-26" rx="30" ry="26" fill="${c.patchA}"/>
        <ellipse cx="34" cy="-30" rx="26" ry="24" fill="${c.patchB}"/>
      </g>`;
    }
    const eye = (x) => {
      const pupil = c.pupil ? `<ellipse cx="${x}" cy="-2" rx="2.6" ry="7" fill="${c.pupil}"/>` : '';
      return `<ellipse cx="${x}" cy="-2" rx="7" ry="9" fill="${c.eye}"/>${pupil}<circle cx="${x + 2.5}" cy="-5.5" r="2.3" fill="#fff"/>`;
    };
    const line = `stroke="${c.ink}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
    return `<g class="cat-head">
      <path d="M-42 -12 L-36 -66 L-6 -40 Z" fill="${c.patchA || c.fur}" stroke="${c.ink}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M42 -12 L36 -66 L6 -40 Z" fill="${c.patchB || c.fur}" stroke="${c.ink}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M-33 -22 L-31 -52 L-15 -39 Z" fill="${c.ear}"/>
      <path d="M33 -22 L31 -52 L15 -39 Z" fill="${c.ear}"/>
      <ellipse cx="0" cy="0" rx="48" ry="41" fill="${c.fur}"/>
      ${marks}
      <ellipse cx="0" cy="0" rx="48" ry="41" fill="none" stroke="${c.ink}" stroke-width="4"/>
      <g class="eyes eyes-normal">${eye(-17)}${eye(17)}</g>
      <g class="eyes eyes-sleepy"><path d="M-25 0 L-10 0" ${line}/><path d="M25 0 L10 0" ${line}/></g>
      <g class="eyes eyes-content"><path d="M-25 2 Q-17 -9 -9 2" ${line}/><path d="M25 2 Q17 -9 9 2" ${line}/></g>
      <g class="eyes eyes-angry">
        <path d="M-27 -14 L-9 -6" ${line}/><path d="M27 -14 L9 -6" ${line}/>
        <ellipse cx="-16" cy="1" rx="6" ry="4" fill="${c.eye}"/><ellipse cx="16" cy="1" rx="6" ry="4" fill="${c.eye}"/>
      </g>
      <g class="eyes eyes-hot">
        <path d="M-25 -9 L-11 -1 L-25 7" ${line}/><path d="M25 -9 L11 -1 L25 7" ${line}/>
        <ellipse cx="-29" cy="15" rx="9" ry="5" fill="#f07a7a" opacity="0.6"/><ellipse cx="29" cy="15" rx="9" ry="5" fill="#f07a7a" opacity="0.6"/>
        <path d="M44 -36 Q50 -26 44 -20 Q38 -26 44 -36 Z" fill="#8fd0f4" stroke="${INK}" stroke-width="2.5"/>
      </g>
      <path d="M-6 9 L6 9 L0 15 Z" fill="${c.nose}"/>
      <path class="mouth" d="M-11 19 Q-5 25 0 18 Q5 25 11 19" ${line} stroke-width="3"/>
      <g stroke="${c.ink}" stroke-width="2" opacity="0.6" stroke-linecap="round">
        <path d="M-24 11 L-56 4"/><path d="M-24 17 L-56 20"/><path d="M24 11 L56 4"/><path d="M24 17 L56 20"/>
      </g>
    </g>`;
  }

  function catSVG(cat) {
    const c = COATS[cat.coat] || COATS.white;
    const a = SLOTS[cat.side].angle;
    const scale = cat.id === 'boss' ? BOSS_SCALE : CAT_SCALE;
    return `<g class="cat cat--${cat.id}" id="cat-${cat.index}" data-mood="normal" transform="${catTransform(cat.side, OFF_IN)}">
      <g class="cat-wiggle"><g transform="scale(${scale})">
        ${catBody(cat, c)}
        <g transform="translate(0 30) rotate(${-a})">${catHead(cat, c)}</g>
      </g></g>
    </g>`;
  }

  function catDefs(cats) {
    return cats
      .map((cat) => `<clipPath id="body-clip-${cat.index}"><ellipse cx="0" cy="-74" rx="54" ry="90"/></clipPath>
        <clipPath id="head-clip-${cat.index}"><ellipse cx="0" cy="0" rx="48" ry="41"/></clipPath>`)
      .join('');
  }

  /** 四畳半の畳（真上から）。 */
  function floor() {
    const mats = [
      [0, 0, 333, 667, 'v'],
      [333, 0, 667, 333, 'h'],
      [667, 333, 333, 667, 'v'],
      [0, 667, 667, 333, 'h'],
      [333, 333, 334, 334, 'h'],
    ];
    return mats
      .map(([x, y, w, h, dir]) => `<rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" fill="url(#tatami-${dir})"/>
        <rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - 8}" fill="none" stroke="#3d5236" stroke-width="12"/>`)
      .join('');
  }

  function table() {
    const mikan = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#f39a1e" stroke="${INK}" stroke-width="3.5"/>
      <circle cx="${x - r * 0.3}" cy="${y - r * 0.3}" r="${r * 0.25}" fill="#ffc46b"/>
      <path d="M${x} ${y - r + 2} q6 -10 14 -6" fill="none" stroke="#4f7d3a" stroke-width="4" stroke-linecap="round"/>`;
    return `<g class="table" transform="translate(500 500) scale(0.8) translate(-500 -500)">
      <rect x="318" y="318" width="364" height="364" rx="10" fill="#7a4b28" transform="translate(8 10)"/>
      <rect x="318" y="318" width="364" height="364" rx="10" fill="#b5804a" stroke="${INK}" stroke-width="5"/>
      <g stroke="#9c6a39" stroke-width="3" fill="none" opacity="0.7">
        <path d="M330 372 C 420 362, 520 384, 670 370"/><path d="M330 452 C 430 446, 540 462, 670 448"/>
        <path d="M330 540 C 440 532, 520 552, 670 538"/><path d="M330 620 C 420 612, 530 630, 670 616"/>
      </g>
      <g class="basket">
        <ellipse cx="438" cy="452" rx="78" ry="72" fill="#8f6a3a" transform="translate(5 6)"/>
        <ellipse cx="438" cy="452" rx="78" ry="72" fill="#d8b47c" stroke="${INK}" stroke-width="4"/>
        <ellipse cx="438" cy="452" rx="62" ry="56" fill="none" stroke="#b48e58" stroke-width="5" stroke-dasharray="8 6"/>
        ${mikan(412, 430, 26)}${mikan(464, 438, 25)}${mikan(426, 482, 25)}${mikan(474, 488, 22)}
      </g>
      <g class="cup">
        <circle cx="592" cy="418" r="32" fill="#5d7a5a" stroke="${INK}" stroke-width="4"/>
        <circle cx="592" cy="418" r="22" fill="#c3c97a"/>
        <g class="steam" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.7">
          <path d="M584 404 q-8 -12 0 -24 q8 -12 0 -24"><animate attributeName="opacity" values="0;0.8;0" dur="2.4s" repeatCount="indefinite"/></path>
          <path d="M600 406 q-8 -12 0 -24 q8 -12 0 -24"><animate attributeName="opacity" values="0;0.8;0" dur="2.4s" begin="1.2s" repeatCount="indefinite"/></path>
        </g>
      </g>
      <g class="remote" transform="rotate(18 590 566)">
        <rect x="572" y="516" width="38" height="104" rx="10" fill="#3d3b45" stroke="${INK}" stroke-width="4"/>
        <circle cx="591" cy="536" r="6" fill="#e0574f"/>
        <g fill="#8d8a99"><rect x="580" y="554" width="9" height="7" rx="2"/><rect x="594" y="554" width="9" height="7" rx="2"/>
        <rect x="580" y="568" width="9" height="7" rx="2"/><rect x="594" y="568" width="9" height="7" rx="2"/>
        <rect x="580" y="582" width="9" height="7" rx="2"/><rect x="594" y="582" width="9" height="7" rx="2"/></g>
      </g>
      <g class="peel" transform="translate(408 600) rotate(-12)">
        <path d="M0 -30 L9 -9 L30 -8 L12 6 L18 28 L0 15 L-18 28 L-12 6 L-30 -8 L-9 -9 Z" fill="#f39a1e" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
        <circle r="10" fill="#fbe2b0"/>
      </g>
    </g>`;
  }

  function futon() {
    const { x0, y0, x1, y1 } = FUTON;
    const w = x1 - x0;
    return `<g class="futon">
      <rect x="${x0}" y="${y0}" width="${w}" height="${w}" rx="44" fill="#16182b" opacity="0.45" transform="translate(10 14)"/>
      <rect x="${x0}" y="${y0}" width="${w}" height="${w}" rx="44" fill="url(#futon-pattern)" stroke="${INK}" stroke-width="5"/>
      <rect x="${x0 + 16}" y="${y0 + 16}" width="${w - 32}" height="${w - 32}" rx="32" fill="none" stroke="#c9a65a" stroke-width="3" stroke-dasharray="12 9" opacity="0.75"/>
    </g>`;
  }

  function bubbles() {
    return Object.keys(SLOTS)
      .map((side) => {
        const [x, y] = SLOTS[side].bubble;
        return `<g class="bubble" id="bubble-${side}" transform="translate(${x} ${y})">
          <rect class="bubble-box" x="-100" y="-34" width="200" height="68" rx="22"/>
          <text class="bubble-text" x="0" y="11" text-anchor="middle"></text>
        </g>`;
      })
      .join('');
  }

  function hits() {
    return Object.keys(SLOTS)
      .map((side) => {
        const [x, y, w, h] = SLOTS[side].hit;
        return `<rect class="hit" id="hit-${side}" data-side="${side}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
      })
      .join('');
  }

  /** 部屋全体。cats は KotatsuGame の g.cats。 */
  function scene(cats) {
    return `<svg class="room" viewBox="0 0 ${SIZE} ${SIZE}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="こたつと猫">
      <defs>
        <pattern id="tatami-h" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#cfc48d"/><path d="M0 3 H12 M0 9 H12" stroke="#bfb37b" stroke-width="2"/>
        </pattern>
        <pattern id="tatami-v" width="12" height="12" patternUnits="userSpaceOnUse">
          <rect width="12" height="12" fill="#cfc48d"/><path d="M3 0 V12 M9 0 V12" stroke="#bfb37b" stroke-width="2"/>
        </pattern>
        <pattern id="futon-pattern" width="60" height="60" patternUnits="userSpaceOnUse">
          <rect width="60" height="60" fill="#2f3f6e"/>
          <g fill="none" stroke="#47599a" stroke-width="3">
            <circle cx="0" cy="0" r="30"/><circle cx="60" cy="0" r="30"/><circle cx="0" cy="60" r="30"/><circle cx="60" cy="60" r="30"/><circle cx="30" cy="30" r="30"/>
          </g>
        </pattern>
        <radialGradient id="glow-grad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.55" stop-color="#ff9a3c" stop-opacity="1"/>
          <stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.72">
          <stop offset="0.5" stop-color="#140c18" stop-opacity="0"/>
          <stop offset="1" stop-color="#140c18" stop-opacity="0.6"/>
        </radialGradient>
        ${catDefs(cats)}
      </defs>
      <g class="floor">${floor()}</g>
      <rect class="glow" id="glow" x="170" y="170" width="660" height="660" fill="url(#glow-grad)" opacity="0.3"/>
      <g class="cats">${cats.map(catSVG).join('')}</g>
      ${futon()}
      ${table()}
      <rect class="cold-tint" id="cold-tint" width="${SIZE}" height="${SIZE}" fill="#6aa8d8" opacity="0" pointer-events="none"/>
      <rect width="${SIZE}" height="${SIZE}" fill="url(#vignette)" pointer-events="none"/>
      <g class="bubbles">${bubbles()}</g>
      <g class="hits">${hits()}</g>
    </svg>`;
  }

  /** タイトルの猫紹介に使う顔だけの絵。 */
  function portrait(cat) {
    const c = COATS[cat.coat] || COATS.white;
    const key = { index: 'p' + cat.index };
    return `<svg class="portrait" viewBox="-62 -74 124 124" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs><clipPath id="head-clip-${key.index}"><ellipse cx="0" cy="0" rx="48" ry="41"/></clipPath></defs>
      <g data-mood="normal" class="cat">${catHead(key, c)}</g>
    </svg>`;
  }

  return {
    SIZE,
    FUTON,
    SLOTS,
    OFF_IN,
    OFF_OUT,
    OFF_GONE,
    COATS,
    offsetFor,
    catTransform,
    scene,
    portrait,
  };
});
