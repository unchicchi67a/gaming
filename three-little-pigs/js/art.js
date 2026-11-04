/**
 * 絵（SVG）。画像ファイルは使わず、すべて SVG の文字列として描く。
 *
 * 絵のテーマは「朝の光が差す絵本」。太い輪郭線は使わず、グラデーションの陰影と
 * 地面に落ちるやわらかい影で立体感を出す。グラデーションやぼかしは defs() にまとめ、
 * SVG の先頭に一度だけ置く（場面を描き替えても消えない）。
 *
 * 座標は「ワールド座標」で、地面の高さが GROUND（y=540）。
 * キャラクターは足元が原点 (0, 0) になるように描き、画面側で translate して置く。
 * 表情やポーズは CSS クラスで切り替えられるよう、あらかじめ全部描いておき、
 * 使わないものを CSS で隠す（例：.wolf--puff のときだけほっぺがふくらむ）。
 */
(function (root) {
  'use strict';

  const GROUND = 540;
  const HOUSE_X = 470;

  /** 目・眉・口などの線の色（青みのある墨色）。 */
  const INK = '#2e3a46';

  /** こぶたの服の色（1・2・3 びきめ）。からし・セージ・ブルーグレー。 */
  const PIG_OUTFIT = { 1: '#e2b24a', 2: '#7aac86', 3: '#6f97c4' };

  /** 体のふちに入れる、ごく薄い線。 */
  const edge = (c, w) =>
    `stroke="${c || 'rgba(110,50,60,.22)'}" stroke-width="${w || 2}" stroke-linejoin="round" stroke-linecap="round"`;
  const line = (w, c) =>
    `fill="none" stroke="${c || INK}" stroke-width="${w || 3}" stroke-linecap="round" stroke-linejoin="round"`;

  // ---------------------------------------------------------------- 共通の定義

  const lin = (id, stops, x2, y2) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="${x2 === undefined ? 0 : x2}" y2="${y2 === undefined ? 1 : y2}">${
      stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')
    }</linearGradient>`;
  const rad = (id, stops, cx, cy, r) =>
    `<radialGradient id="${id}" cx="${cx === undefined ? 0.5 : cx}" cy="${cy === undefined ? 0.5 : cy}" r="${r || 0.5}">${
      stops.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}"${a !== undefined ? ` stop-opacity="${a}"` : ''}/>`).join('')
    }</radialGradient>`;

  function defs() {
    const outfits = Object.entries(PIG_OUTFIT).map(([n, c]) =>
      lin(`g-outfit${n}`, [[0, mix(c, '#ffffff', 0.25)], [0.6, c], [1, mix(c, '#3a2a30', 0.25)]])).join('');
    return `
${rad('g-pig', [[0, '#ffe3da'], [0.5, '#f7b7ad'], [1, '#e2928d']], 0.62, 0.3, 0.8)}
${lin('g-pig-limb', [[0, '#f5aea8'], [1, '#d78586']])}
${rad('g-pig-ear', [[0, '#f9b9b2'], [1, '#d67f82']], 0.5, 0.7, 0.7)}
${rad('g-snout', [[0, '#ffcfc9'], [0.7, '#f39c9c'], [1, '#e48a8e']], 0.45, 0.35, 0.65)}
${outfits}
${rad('g-wolf', [[0, '#adb4c2'], [0.55, '#868fa2'], [1, '#626a7d']], 0.62, 0.28, 0.8)}
${rad('g-wolf-light', [[0, '#f6f2ea'], [1, '#cfcac3']], 0.45, 0.35, 0.7)}
${lin('g-wolf-dark', [[0, '#737b8f'], [1, '#4d5468']])}
${lin('g-wolf-tail', [[0, '#5e6679'], [0.7, '#8a93a6'], [1, '#e9e5de']], 1, 0)}
${rad('g-shadow', [[0, '#2a3a20', 0.32], [0.6, '#2a3a20', 0.14], [1, '#2a3a20', 0]])}
${rad('g-blush', [[0, '#ff8f9a', 0.65], [1, '#ff8f9a', 0]])}
${lin('g-straw', [[0, '#f5dc8e'], [1, '#d4a84e']])}
${lin('g-straw-roof', [[0, '#f1d07a'], [0.8, '#d0a046'], [1, '#b48336']])}
${lin('g-wood', [[0, '#d49c66'], [1, '#b07445']])}
${lin('g-wood2', [[0, '#dcaa76'], [1, '#bb8150']])}
${lin('g-wood-roof', [[0, '#8f5a3a'], [1, '#6b3e27']])}
${lin('g-door', [[0, '#7c5236'], [1, '#5a3824']])}
${lin('g-door-green', [[0, '#5f9a73'], [1, '#3f7656']])}
${lin('g-tile', [[0, '#b95a4a'], [1, '#8d3c33']])}
${lin('g-glass', [[0, '#eef8ff'], [1, '#a9d3ea']])}
${lin('g-mortar', [[0, '#efdccb'], [1, '#dcc3ad']])}
${lin('g-eave', [[0, '#2a1c14', 0.35], [1, '#2a1c14', 0]])}
${rad('g-tree', [[0, '#a7d886'], [0.6, '#76b45c'], [1, '#4f8d44']], 0.38, 0.3, 0.75)}
${lin('g-trunk', [[0, '#9b7150'], [1, '#6f4d35']], 1, 0)}
${rad('g-glow', [[0, '#fff7d6', 0.95], [0.35, '#ffefc0', 0.45], [1, '#ffefc0', 0]])}
${rad('g-fireglow', [[0, '#ffb35c', 0.7], [0.5, '#ff9b45', 0.25], [1, '#ff9b45', 0]])}
${rad('g-pot', [[0, '#6a6f7c'], [0.6, '#3b3e48'], [1, '#24262d']], 0.35, 0.3, 0.8)}
${rad('g-water', [[0, '#c4ecff'], [0.7, '#6ec0ea'], [1, '#3d93c9']], 0.45, 0.4, 0.6)}
${rad('g-flame', [[0, '#fff3b0'], [0.45, '#ffc14d'], [1, '#f2703a']], 0.5, 0.85, 0.8)}
${lin('g-pitcher', [[0, '#d6eef8'], [1, '#8fc3dd']], 1, 0)}
${lin('g-heart', [[0, '#ff9fae'], [1, '#e8667e']])}
${lin('g-log', [[0, '#8f5d36'], [0.3, '#c78f5c'], [0.55, '#b87c4b'], [1, '#7a4c2b']])}
${lin('g-log2', [[0, '#9a6640'], [0.3, '#d29a66'], [0.55, '#c08654'], [1, '#845432']])}
${lin('g-shorts', [[0, '#87694f'], [1, '#5e4836']])}
<clipPath id="cp-pig-head" clipPathUnits="userSpaceOnUse"><path d="${PIG_HEAD}"/></clipPath>
<clipPath id="cp-pig-body" clipPathUnits="userSpaceOnUse"><path d="${PIG_BODY}"/></clipPath>
<clipPath id="cp-wolf-head" clipPathUnits="userSpaceOnUse"><path d="${WOLF_HEAD}"/></clipPath>
<clipPath id="cp-wolf-body" clipPathUnits="userSpaceOnUse"><path d="${WOLF_BODY}"/></clipPath>
<filter id="f-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="f-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
<filter id="f-haze" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter>`;
  }

  /** 2 色を t（0〜1）の割合で混ぜる。 */
  function mix(a, b, t) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [r1, g1, b1] = p(a);
    const [r2, g2, b2] = p(b);
    const h = (v) => Math.round(v).toString(16).padStart(2, '0');
    return `#${h(r1 + (r2 - r1) * t)}${h(g1 + (g2 - g1) * t)}${h(b1 + (b2 - b1) * t)}`;
  }

  /** 再現できる疑似乱数（同じ絵を毎回同じように描くため）。 */
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  const shadow = (rx, ry) => `<ellipse class="shadow" cx="0" cy="0" rx="${rx}" ry="${ry}"/>`;

  // ---------------------------------------------------------------- こぶた
  //
  // 光は右上（太陽の方向）から当たる。影は左下側に、ハイライトは右上側に入れる。
  // 線は色えんぴつのような、肌より少し濃い色のやわらかい線にする。

  const PIG_HEAD = 'M0 -154 C25 -154 43 -138 44 -115 C45 -95 31 -78 0 -77 C-31 -78 -45 -95 -44 -115 C-43 -138 -25 -154 0 -154 Z';
  const PIG_BODY = 'M-25 -86 C-40 -78 -47 -56 -43 -36 C-39 -18 -22 -12 0 -12 C22 -12 39 -18 43 -36 C47 -56 40 -78 25 -86 Z';
  const PIG_LINE = 'stroke="#a8605f" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';

  /** こぶたごとの小物（見分けやすくするため）。 */
  function pigAccessory(n) {
    if (n === 1) {
      // 耳に小さな花
      return `<g transform="translate(-42 -146) rotate(-15)">
        ${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-6" rx="4" ry="6" fill="#fff8ee" stroke="#e3c9a8" stroke-width="1" transform="rotate(${a})"/>`).join('')}
        <circle r="3.6" fill="#f2c14e" stroke="#c99a2e" stroke-width="1"/>
      </g>`;
    }
    if (n === 2) {
      // 首にスカーフ
      return `<path d="M-23 -86 Q0 -77 23 -86 L5 -64 Q0 -59 -5 -64 Z" fill="#d97a6c" stroke="#a85548" stroke-width="1.8" stroke-linejoin="round"/>
        <g fill="#f7dcd2">${[[-12, -82], [0, -78], [12, -82], [-4, -70], [5, -72]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7"/>`).join('')}</g>`;
    }
    // ちょうネクタイ
    return `<g transform="translate(0 -79)">
      <path d="M0 0 L-15 -8 Q-18 0 -15 8 Z M0 0 L15 -8 Q18 0 15 8 Z" fill="#3f5f8a" stroke="#2c4566" stroke-width="1.6" stroke-linejoin="round"/>
      <rect x="-4" y="-4.5" width="8" height="9" rx="2.5" fill="#4f71a0" stroke="#2c4566" stroke-width="1.4"/>
      <path d="M-12 -4 L-6 -1 M12 -4 L6 -1" stroke="#7d9bc4" stroke-width="1.2" stroke-linecap="round"/>
    </g>`;
  }

  function pigArm(side) {
    const s = side;
    const arm = `M${-30 * s} -80 C${-44 * s} -74 ${-52 * s} -60 ${-51 * s} -48 C${-50 * s} -41 ${-43 * s} -39 ${-40 * s} -45 C${-39 * s} -55 ${-35 * s} -64 ${-27 * s} -70 Z`;
    const hoof = `M${-51 * s} -48 C${-50 * s} -41 ${-43 * s} -39 ${-40 * s} -45 L${-44 * s} -51 Z`;
    return `<path d="${arm}" fill="url(#g-pig-limb)" ${PIG_LINE}/>
      <path d="${hoof}" fill="#8c5a52"/>
      <path d="M${-46 * s} -48 l${-1 * s} 5" stroke="#6e4440" stroke-width="1.2" stroke-linecap="round"/>`;
  }

  function pigEar(side) {
    const s = side;
    // 耳は外側へたれる（先が少し前に折れる）
    return `<path d="M${-12 * s} -150 C${-26 * s} -164 ${-48 * s} -164 ${-64 * s} -146 C${-60 * s} -134 ${-48 * s} -127 ${-34 * s} -126 Z" fill="url(#g-pig-ear)" ${PIG_LINE}/>
      <path d="M${-18 * s} -147 C${-30 * s} -157 ${-46 * s} -156 ${-56 * s} -145 C${-52 * s} -137 ${-44 * s} -133 ${-34 * s} -132 Z" fill="#e48e8b" opacity=".7"/>
      <path d="M${-64 * s} -146 C${-60 * s} -134 ${-52 * s} -130 ${-46 * s} -129 C${-50 * s} -136 ${-56 * s} -142 ${-64 * s} -146 Z" fill="#c9767a" opacity=".6"/>`;
  }

  function pig(n) {
    const o = PIG_OUTFIT[n];
    const oD = mix(o, '#2e2228', 0.32);
    const oL = mix(o, '#ffffff', 0.45);
    return `
${shadow(46, 8)}
<g class="a-body">
  <path d="M37 -32 c12 -2 14 -14 6 -16 c-7 -2 -7 7 0 6" fill="none" stroke="#c97f80" stroke-width="3" stroke-linecap="round"/>
  <path d="M-27 -20 C-28 -10 -28 -4 -26 0 L-10 0 C-8 -4 -8 -12 -9 -20 Z" fill="url(#g-pig-limb)" ${PIG_LINE}/>
  <path d="M9 -20 C8 -12 8 -4 10 0 L26 0 C28 -4 28 -10 27 -20 Z" fill="url(#g-pig-limb)" ${PIG_LINE}/>
  <path d="M-26.5 -6 H-9.5 L-10 0 H-26 Z M9.5 -6 H26.5 L26 0 H10 Z" fill="#8c5a52"/>
  <path d="M-18 -6 V0 M18 -6 V0" stroke="#5f3b37" stroke-width="1.4"/>
  <path d="${PIG_BODY}" fill="url(#g-pig)" ${PIG_LINE}/>
  <g clip-path="url(#cp-pig-body)">
    <path d="M-20 -92 C-46 -70 -46 -30 -8 -10 L-70 -10 L-70 -92 Z" fill="#cf7b7b" opacity=".3"/>
  </g>
  <path d="M-42.5 -48 C-43 -30 -35 -13 0 -12 C35 -13 43 -30 42.5 -48 C28 -43 -28 -43 -42.5 -48 Z" fill="url(#g-outfit${n})" stroke="${oD}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M-15 -78 C-16 -68 -16 -56 -17 -45 L17 -45 C16 -56 16 -68 15 -78 Z" fill="url(#g-outfit${n})" stroke="${oD}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M-30 -46 C-40 -36 -34 -18 -14 -13 C-30 -22 -34 -34 -30 -46 Z" fill="${oD}" opacity=".3"/>
  <path d="M-12 -75 C-13 -66 -13 -56 -14 -48 M12 -75 C13 -66 13 -56 14 -48 M-38 -43 C-24 -39 24 -39 38 -43 M-2 -40 V-16" fill="none" stroke="${oL}" stroke-width="1.3" stroke-dasharray="3 3" stroke-linecap="round"/>
  <path d="M-8 -67 H8 V-58 Q0 -54 -8 -58 Z" fill="none" stroke="${oD}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M-15 -76 C-18 -82 -21 -86 -25 -88 M15 -76 C18 -82 21 -86 25 -88" stroke="${oD}" stroke-width="5" stroke-linecap="round" fill="none"/>
  <circle cx="-12" cy="-73" r="2.8" fill="#f3e6c8" stroke="${oD}" stroke-width="1.2"/>
  <circle cx="12" cy="-73" r="2.8" fill="#f3e6c8" stroke="${oD}" stroke-width="1.2"/>
  ${n === 2 ? pigAccessory(2) : ''}
  ${pigArm(1)}${pigArm(-1)}
  ${pigEar(1)}${pigEar(-1)}
  <path d="${PIG_HEAD}" fill="url(#g-pig)" ${PIG_LINE}/>
  <g clip-path="url(#cp-pig-head)">
    <path d="M-30 -152 C-58 -120 -46 -84 -4 -75 L-70 -70 L-70 -160 Z" fill="#cf7b7b" opacity=".3"/>
    <ellipse cx="16" cy="-138" rx="15" ry="7.5" fill="#fff" opacity=".4" transform="rotate(20 16 -138)"/>
  </g>
  <path d="M-3 -153 c-3 -8 3 -12 7 -8 c-4 0 -4 4 -2 6 M4 -153 c2 -6 8 -6 9 -1" fill="none" stroke="#c97f80" stroke-width="2.2" stroke-linecap="round"/>
  ${n !== 2 ? pigAccessory(n) : ''}
  <ellipse cx="-27" cy="-96" rx="10" ry="7" fill="url(#g-blush)"/>
  <ellipse cx="27" cy="-96" rx="10" ry="7" fill="url(#g-blush)"/>
  <g class="p-eye p-eye-n">
    <ellipse cx="-15" cy="-118" rx="4.8" ry="5.8" fill="${INK}"/><ellipse cx="15" cy="-118" rx="4.8" ry="5.8" fill="${INK}"/>
    <circle cx="-13.2" cy="-120.5" r="1.8" fill="#fff"/><circle cx="16.8" cy="-120.5" r="1.8" fill="#fff"/>
    <circle cx="-16.4" cy="-115.6" r=".9" fill="#fff" opacity=".7"/><circle cx="13.6" cy="-115.6" r=".9" fill="#fff" opacity=".7"/>
  </g>
  <g class="p-eye p-eye-h"><path d="M-21 -116 q6 -8 12 0" ${line(3)}/><path d="M9 -116 q6 -8 12 0" ${line(3)}/></g>
  <g class="p-eye p-eye-s">
    <ellipse cx="-15" cy="-119" rx="7" ry="8" fill="#fff" stroke="rgba(46,58,70,.4)" stroke-width="1.4"/><ellipse cx="15" cy="-119" rx="7" ry="8" fill="#fff" stroke="rgba(46,58,70,.4)" stroke-width="1.4"/>
    <circle cx="-15" cy="-118" r="3" fill="${INK}"/><circle cx="15" cy="-118" r="3" fill="${INK}"/>
  </g>
  <path d="M-21 -129 q6 -3 11 -1 M10 -130 q6 -2 11 1" ${line(1.8, 'rgba(120,60,60,.55)')}/>
  <ellipse cx="0" cy="-100" rx="17" ry="12.5" fill="url(#g-snout)" stroke="#b86a6c" stroke-width="2"/>
  <path d="M-10 -108 q10 -4.5 20 0" ${line(2, 'rgba(255,255,255,.55)')}/>
  <ellipse cx="-5.5" cy="-99.5" rx="2.6" ry="3.8" fill="#8a3f4c"/>
  <ellipse cx="5.5" cy="-99.5" rx="2.6" ry="3.8" fill="#8a3f4c"/>
  <path class="p-mouth p-mouth-n" d="M-7 -82.5 q7 5 14 0" ${line(2.4, '#7d3b45')}/>
  <path class="p-mouth p-mouth-h" d="M-10 -84 q10 12 20 0 Z" fill="#c4505f" stroke="#8f3443" stroke-width="1.4" stroke-linejoin="round"/>
  <ellipse class="p-mouth p-mouth-s" cx="0" cy="-80" rx="4.5" ry="5.5" fill="#c4505f" stroke="#8f3443" stroke-width="1.4"/>
  <path class="p-sweat" d="M42 -142 q8 12 0 16 q-8 -4 0 -16 Z" fill="#b5e0f5" stroke="#7fb8d6" stroke-width="1.2"/>
</g>`;
  }

  // ---------------------------------------------------------------- おおかみ（右向き）

  const WOLF_HEAD = 'M-18 -138 C-20 -160 -2 -174 20 -172 C34 -171 44 -164 50 -154 C62 -150 78 -146 87 -141 C94 -137 93 -127 85 -123 C74 -118 60 -114 46 -112 C38 -106 26 -102 12 -102 L2 -96 L4 -104 L-8 -100 L-6 -108 L-20 -108 L-12 -116 L-22 -120 L-16 -126 C-18 -130 -18 -134 -18 -138 Z';
  const WOLF_BODY = 'M-14 -106 C-34 -98 -44 -74 -42 -50 C-40 -36 -28 -30 -8 -30 L24 -30 C36 -34 42 -44 40 -62 C38 -82 32 -98 24 -106 Z';
  const WL = 'stroke="#3d4356" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"';

  function wolf() {
    return `
${shadow(62, 9)}
<g class="a-flip"><g class="a-body">
  <path d="M-36 -64 C-62 -64 -86 -80 -96 -108 C-100 -122 -98 -136 -90 -146 L-87 -134 L-79 -142 L-78 -128 L-68 -132 C-68 -116 -60 -102 -48 -96 L-55 -90 C-47 -84 -40 -82 -32 -82 Z" fill="url(#g-wolf-tail)" ${WL}/>
  <path d="M-90 -146 L-87 -134 L-79 -142 L-78 -128 C-84 -128 -92 -134 -90 -146 Z" fill="#efe9df"/>
  <path d="M-84 -112 q-8 -6 -10 -16 M-72 -98 q-10 -4 -14 -12 M-58 -84 q-10 -2 -15 -8" ${line(1.6, 'rgba(40,46,60,.35)')}/>
  <path d="M-32 -36 C-36 -22 -32 -10 -26 -5 L-28 0 L-8 0 C-8 -10 -10 -22 -10 -36 Z" fill="url(#g-wolf-dark)" ${WL}/>
  <path d="${WOLF_BODY}" fill="url(#g-wolf)" ${WL}/>
  <g clip-path="url(#cp-wolf-body)">
    <path d="M-16 -110 C-46 -84 -46 -44 -12 -28 L-70 -28 L-70 -110 Z" fill="#4b5266" opacity=".35"/>
  </g>
  <path d="M4 -106 C22 -102 30 -84 28 -64 L22 -70 L20 -58 L13 -66 L9 -54 L3 -64 C-2 -80 -4 -96 4 -106 Z" fill="url(#g-wolf-light)"/>
  <path d="M8 -98 l4 6 M14 -88 l4 6 M10 -78 l3 6" ${line(1.4, 'rgba(120,110,95,.45)')}/>
  <path d="M-43 -62 C-44 -46 -40 -34 -30 -30 L-4 -30 L2 -40 L8 -30 L32 -30 C40 -36 42 -48 41 -64 C22 -56 -22 -56 -43 -62 Z" fill="url(#g-shorts)" stroke="#4a3a2e" stroke-width="2" stroke-linejoin="round"/>
  <path d="M-40 -58 C-20 -52 20 -52 39 -60" fill="none" stroke="#9c8068" stroke-width="1.2" stroke-dasharray="3 3"/>
  <g transform="translate(18 -46) rotate(8)">
    <rect x="-8" y="-7" width="16" height="13" rx="2" fill="#9a7a52" stroke="#5e4630" stroke-width="1.4"/>
    <path d="M-6 -5 h12 M-6 4 h12 M-6 -5 v9 M6 -5 v9" fill="none" stroke="#e0c9a0" stroke-width="1" stroke-dasharray="2 2"/>
  </g>
  <g class="w-hot">
    <ellipse cx="-32" cy="-46" rx="13" ry="12" fill="#f0656e" opacity=".9" filter="url(#f-soft)"/>
    <path class="w-steam" d="M-40 -66 q-6 -8 0 -16 q6 -8 0 -16 M-24 -68 q-6 -8 0 -16 q6 -8 0 -16" ${line(4, 'rgba(255,255,255,.9)')}/>
  </g>
  <g class="w-bandage">
    <rect x="-49" y="-52" width="34" height="11" rx="5" fill="#f6dcc0" stroke="#d2b088" stroke-width="1.4" transform="rotate(35 -32 -46)"/>
    <rect x="-49" y="-52" width="34" height="11" rx="5" fill="#f6dcc0" stroke="#d2b088" stroke-width="1.4" transform="rotate(-35 -32 -46)"/>
    <circle cx="-32" cy="-46" r="2" fill="#e3c39d"/>
  </g>
  <path d="M8 -36 C8 -22 10 -10 14 -5 L12 0 L34 0 C32 -8 28 -22 28 -36 Z" fill="url(#g-wolf)" ${WL}/>
  <path d="M-29 0 C-30 -5 -24 -7 -18 -7 C-10 -7 -6 -4 -7 0 Z M11 0 C10 -5 16 -7 22 -7 C30 -7 35 -4 35 0 Z" fill="#454b5d"/>
  <path d="M20 -60 C18 -76 14 -92 6 -104" fill="none" stroke="#5c4030" stroke-width="5" stroke-linecap="round"/>
  <circle cx="20" cy="-59" r="2.6" fill="#d7b36a"/>
  <path d="M16 -98 C30 -94 42 -82 44 -68 C46 -60 38 -56 34 -62 C32 -72 24 -82 12 -86 Z" fill="url(#g-wolf)" ${WL}/>
  <path d="M44 -68 C46 -60 38 -56 34 -62 C36 -66 40 -68 44 -68 Z" fill="#454b5d"/>
  <g class="w-ear w-ear-up">
    <path d="M-10 -164 L-22 -204 L6 -170 Z" fill="url(#g-wolf-dark)" ${WL}/>
    <path d="M8 -170 L14 -210 L32 -168 Z" fill="url(#g-wolf)" ${WL}/>
    <path d="M14 -172 L16 -198 L26 -170 Z" fill="#e5b0b4"/>
  </g>
  <g class="w-ear w-ear-down">
    <path d="M-10 -162 L-46 -172 L-2 -170 Z" fill="url(#g-wolf-dark)" ${WL}/>
    <path d="M8 -168 L-26 -188 L28 -166 Z" fill="url(#g-wolf)" ${WL}/>
  </g>
  <path d="${WOLF_HEAD}" fill="url(#g-wolf)" ${WL}/>
  <g clip-path="url(#cp-wolf-head)">
    <path d="M-20 -160 C-30 -130 -10 -104 20 -100 L-40 -96 L-40 -170 Z" fill="#4b5266" opacity=".32"/>
    <path d="M30 -170 C46 -166 56 -158 60 -150 C72 -148 82 -145 88 -141" ${line(6, 'rgba(255,255,255,.22)')}/>
  </g>
  <path d="M46 -124 C60 -126 76 -127 86 -124 C80 -117 62 -114 46 -112 C42 -116 42 -121 46 -124 Z" fill="url(#g-wolf-light)"/>
  <path d="M-4 -110 L-10 -104 L4 -106 Z M-14 -118 L-18 -112 L-6 -114 Z" fill="#c9c4bc"/>
  <path d="M-2 -164 q8 -5 18 -2 M2 -156 q6 -3 12 -1" ${line(1.4, 'rgba(255,255,255,.35)')}/>
  <circle class="w-cheek" cx="56" cy="-118" r="13" fill="url(#g-wolf-light)" stroke="rgba(61,67,86,.4)" stroke-width="1.5"/>
  <path d="M80 -146 C88 -148 96 -144 95 -137 C94 -131 86 -130 81 -133 C77 -136 77 -143 80 -146 Z" fill="#2a2d38"/>
  <ellipse cx="87" cy="-142" rx="3.2" ry="1.8" fill="#fff" opacity=".55"/>
  <g class="w-eye w-eye-n">
    <path d="M18 -148 C22 -156 34 -157 39 -149 C34 -142 22 -141 18 -148 Z" fill="#fffaf0" stroke="#3d4356" stroke-width="1.6"/>
    <circle cx="30" cy="-148.5" r="5" fill="#d99a35"/>
    <circle cx="31" cy="-148.5" r="2.6" fill="#22252e"/>
    <circle cx="32.6" cy="-150.6" r="1.3" fill="#fff"/>
  </g>
  <path class="w-eye w-eye-x" d="M22 -153 L34 -148 L22 -143" ${line(3.2)}/>
  <path class="w-eye w-eye-h" d="M19 -147 q9 -9 19 0" ${line(3.2)}/>
  <path class="w-brow w-brow-sly" d="M15 -159 L41 -152" ${line(4, '#3d4356')}/>
  <path class="w-brow w-brow-sad" d="M18 -153 L39 -162" ${line(4, '#3d4356')}/>
  <g class="w-mouth w-mouth-grin">
    <path d="M48 -114 Q64 -108 83 -121" ${line(2.4)}/>
    <path d="M60 -111.5 l3 7 l4 -7.5 Z" fill="#fffaf0" stroke="#3d4356" stroke-width="1"/>
  </g>
  <ellipse class="w-mouth w-mouth-o" cx="84" cy="-120" rx="5" ry="6" fill="#2a2d38"/>
  <path class="w-mouth w-mouth-sad" d="M50 -112 Q66 -120 82 -117" ${line(2.4)}/>
  <path class="w-mouth w-mouth-smile" d="M48 -117 Q64 -100 83 -121 Z" fill="#b84a5c" stroke="#7d2f3d" stroke-width="1.4" stroke-linejoin="round"/>
  <path class="w-mouth w-mouth-open" d="M48 -117 Q64 -90 85 -121 Z" fill="#8f2f42" stroke="#5e1d2b" stroke-width="1.4" stroke-linejoin="round"/>
  <ellipse class="w-blush" cx="40" cy="-128" rx="10" ry="6" fill="url(#g-blush)"/>
  <path class="w-sweat" d="M-12 -182 q9 13 0 18 q-9 -5 0 -18 Z M-26 -160 q7 10 0 14 q-7 -4 0 -14 Z" fill="#b5e0f5" stroke="#7fb8d6" stroke-width="1.2"/>
  <path class="w-tear" d="M26 -138 q6 10 0 14 q-6 -4 0 -14 Z" fill="#b5e0f5" stroke="#7fb8d6" stroke-width="1.2"/>
</g></g>`;
  }

  // ---------------------------------------------------------------- おうち

  /** パーツを 1 つ包む。i は「何回目のタッチで現れるか」。 */
  const piece = (i, body) => `<g class="piece" data-i="${i}">${body}</g>`;
  const L = HOUSE_X - 110;
  const W = 220;

  /** わらの束（下からふくらんで、上がまるい）。ひもで 1 か所しばる。 */
  function sheaf(rnd, x, w, top, bottom) {
    const mid = x + w / 2;
    let strands = '';
    const count = Math.round(w / 3.2);
    for (let k = 0; k < count; k++) {
      const sx = x + 2 + (k / (count - 1)) * (w - 4);
      const t = top + 6 + Math.abs(sx - mid) / (w / 2) * 7 + rnd() * 3;
      const bend = (sx - mid) * 0.12;
      const tone = rnd() > 0.55 ? 'rgba(255,244,200,.7)' : 'rgba(150,104,34,.45)';
      strands += `<path d="M${sx.toFixed(1)} ${t.toFixed(1)} Q${(sx + bend * 0.3).toFixed(1)} ${((t + bottom) / 2).toFixed(1)} ${(sx + bend).toFixed(1)} ${bottom - 1}" ${line(1.1, tone)}/>`;
    }
    const tieY = top + (bottom - top) * 0.32;
    return `
      <path d="M${x} ${bottom} L${x + 1} ${top + 12} Q${mid} ${top - 8} ${x + w - 1} ${top + 12} L${x + w} ${bottom} Z" fill="url(#g-straw)" stroke="#a97c2e" stroke-width="1.4" stroke-linejoin="round"/>
      ${strands}
      <path d="M${x + 1} ${tieY} Q${mid} ${tieY + 4} ${x + w - 1} ${tieY}" ${line(4, '#94642a')}/>
      <path d="M${x + 2} ${tieY - 1.2} Q${mid} ${tieY + 2.6} ${x + w - 2} ${tieY - 1.2}" ${line(1.2, 'rgba(255,220,160,.6)')}/>`;
  }

  /** ふさふさした屋根のわら（下のふちがぎざぎざ）。 */
  function thatch(rnd, pts, bottomY, x0, x1) {
    let edge = `L${x1} ${bottomY} `;
    for (let x = x1; x > x0; x -= 8) {
      edge += `L${(x - 4).toFixed(0)} ${(bottomY + 5 + rnd() * 7).toFixed(1)} L${(x - 8).toFixed(0)} ${bottomY} `;
    }
    return `M${pts} ${edge}Z`;
  }

  function strawHouse() {
    const rnd = seeded(7);
    const sheaves = (x0, x1, top) => {
      let s = '';
      const n = Math.round((x1 - x0) / 22);
      const w = (x1 - x0) / n;
      for (let k = 0; k < n; k++) s += sheaf(rnd, x0 + k * w, w, top + rnd() * 8, GROUND);
      return s;
    };
    let lowerStrands = '';
    for (let k = 0; k <= 32; k++) {
      const x = 338 + k * 8.25;
      const top = 354;
      lowerStrands += `<path d="M${(HOUSE_X + (x - HOUSE_X) * 0.46).toFixed(1)} ${top.toFixed(1)} L${x.toFixed(1)} ${(412 + rnd() * 6).toFixed(1)}" ${line(1.2, k % 3 ? 'rgba(140,95,30,.4)' : 'rgba(255,240,190,.6)')}/>`;
    }
    let upperStrands = '';
    for (let k = 0; k <= 22; k++) {
      const x = 384 + k * 7.8;
      upperStrands += `<path d="M${(HOUSE_X + (x - HOUSE_X) * 0.08).toFixed(1)} 290 L${x.toFixed(1)} ${(360 + rnd() * 6).toFixed(1)}" ${line(1.2, k % 3 ? 'rgba(140,95,30,.4)' : 'rgba(255,240,190,.6)')}/>`;
    }
    return [
      piece(0, sheaves(L, 440, 392)),
      piece(1, sheaves(500, L + W, 392)),
      piece(2, `
        ${sheaf(rnd, 440, 60, 390, 462)}
        <path d="M440 540 V462 H500 V540" fill="#6d4a26"/>
        <rect x="446" y="468" width="48" height="72" rx="3" fill="url(#g-door)"/>
        ${[480, 492, 504, 516, 528].map((y) => `<path d="M448 ${y} H492" ${line(2, 'rgba(240,210,150,.35)')}/>`).join('')}
        <path d="M458 470 V540 M470 470 V540 M482 470 V540" ${line(1.2, 'rgba(0,0,0,.22)')}/>
        <path d="M440 462 H500" ${line(4, '#94642a')}/>`),
      piece(3, `
        <path d="${thatch(rnd, '328 412 L404 352 L536 352 L612 412', 412, 328, 612)}" fill="url(#g-straw-roof)" stroke="#a97c2e" stroke-width="1.4" stroke-linejoin="round"/>
        ${lowerStrands}
        <path d="M348 414 Q470 430 592 414 L592 422 Q470 440 348 422 Z" fill="url(#g-eave)"/>`),
      piece(4, `
        <path d="${thatch(rnd, `382 362 L${HOUSE_X} 280 L558 362`, 362, 382, 558)}" fill="url(#g-straw-roof)" stroke="#a97c2e" stroke-width="1.4" stroke-linejoin="round"/>
        ${upperStrands}
        <path d="M400 366 Q470 378 540 366 L540 372 Q470 386 400 372 Z" fill="url(#g-eave)" opacity=".7"/>
        <path d="M452 292 C454 270 486 270 488 292 Z" fill="url(#g-straw)" stroke="#a97c2e" stroke-width="1.4"/>
        <path d="M454 288 Q470 294 486 288" ${line(4, '#94642a')}/>`),
    ].join('');
  }

  /** 丸太 1 本（横向き）。両はしに年輪の切り口。 */
  function log(y, x0, x1, tone) {
    const h = 25;
    const r = h / 2;
    let grain = '';
    grain += `<path d="M${x0 + 20} ${y + 8} q40 -2 80 0 M${x0 + 110} ${y + 16} q50 2 90 -1 M${x0 + 60} ${y + 19} q30 1 50 0" ${line(1.1, 'rgba(90,52,24,.35)')}/>`;
    return `
      <rect x="${x0}" y="${y}" width="${x1 - x0}" height="${h}" rx="${r}" fill="url(#${tone})" stroke="#6b4426" stroke-width="1.6"/>
      ${grain}
      <path d="M${x0 + r} ${y + 5} H${x1 - r}" ${line(2, 'rgba(255,230,190,.35)')}/>
      ${[x0 + r, x1 - r].map((cx) => `
        <circle cx="${cx}" cy="${y + r}" r="${r - 1}" fill="#e6c193" stroke="#8b5a32" stroke-width="1.6"/>
        <circle cx="${cx}" cy="${y + r}" r="${r - 5}" fill="none" stroke="#c49563" stroke-width="1.2"/>
        <circle cx="${cx}" cy="${y + r}" r="${r - 8.5}" fill="none" stroke="#c49563" stroke-width="1"/>
        <circle cx="${cx}" cy="${y + r}" r="1.4" fill="#a87547"/>`).join('')}`;
  }

  function woodHouse() {
    const row = (i, k) => {
      const y = GROUND - 50 * (k + 1);
      const off = k % 2 ? 6 : 0;
      return piece(i, log(y, 348 + off, 592 - off, 'g-log2') + log(y + 25, 352 - off, 588 + off, 'g-log'));
    };
    const peak = 284;
    const base = 392;
    const hw = (y) => ((y - peak) / (base - peak)) * 118;
    let boards = '';
    for (let x = HOUSE_X - 112; x <= HOUSE_X + 112; x += 16) {
      const top = peak + (Math.abs(x - HOUSE_X) / 118) * (base - peak);
      boards += `<path d="M${x} ${top.toFixed(1)} V${base}" ${line(1.4, 'rgba(70,40,20,.4)')}/>`;
    }
    return [
      row(0, 0), row(1, 1), row(2, 2),
      piece(3, `
        <path d="M${HOUSE_X - 118} ${base} L${HOUSE_X} ${peak} L${HOUSE_X + 118} ${base} Z" fill="url(#g-wood)"/>
        ${boards}
        <circle cx="${HOUSE_X}" cy="${peak + 52}" r="11" fill="#5a3824" stroke="#3e2516" stroke-width="2"/>
        <path d="M${HOUSE_X} ${peak + 41} V${peak + 63} M${HOUSE_X - 11} ${peak + 52} H${HOUSE_X + 11}" ${line(2, '#8b5a32')}/>
        <path d="M322 ${base + 10} L${HOUSE_X} ${peak - 8}" ${line(18, '#6b4228')}/>
        <path d="M618 ${base + 10} L${HOUSE_X} ${peak - 8}" ${line(18, '#5a3622')}/>
        <path d="M326 ${base + 4} L${HOUSE_X} ${peak - 13}" ${line(3, 'rgba(255,220,180,.3)')}/>
        <path d="M${HOUSE_X} ${peak - 13} L614 ${base + 4}" ${line(3, 'rgba(255,220,180,.4)')}/>
        <rect x="${L}" y="${base + 1}" width="${W}" height="16" fill="url(#g-eave)"/>`),
      piece(4, `
        <rect x="428" y="458" width="58" height="82" rx="3" fill="#4e3020"/>
        <rect x="432" y="462" width="50" height="78" rx="2" fill="url(#g-door)"/>
        <path d="M444.5 462 V540 M457 462 V540 M469.5 462 V540" ${line(1.2, 'rgba(0,0,0,.28)')}/>
        <path d="M434 476 H480 M434 524 H480 M436 522 L478 478" ${line(4, '#6b4228')}/>
        <path d="M434 476 h14 M434 524 h14" ${line(4, '#2f2f35')}/>
        <circle cx="474" cy="502" r="3.6" fill="#c9a24e" stroke="#8a6a2a" stroke-width="1"/>`),
      piece(5, `
        <rect x="504" y="410" width="58" height="50" rx="2" fill="#5a3622"/>
        <rect x="509" y="415" width="48" height="40" rx="1" fill="url(#g-glass)"/>
        <path d="M533 415 V455 M509 435 H557" ${line(3, '#5a3622')}/>
        <path d="M513 450 L527 420" ${line(3, 'rgba(255,255,255,.55)')}/>
        <path d="M486 412 H504 V460 H486 Z M562 412 H580 V460 H562 Z" fill="#7b9c6c" stroke="#4f6a45" stroke-width="1.4"/>
        <path d="M490 420 H500 M490 436 H500 M490 452 H500 M566 420 H576 M566 436 H576 M566 452 H576" ${line(1.4, 'rgba(30,50,25,.4)')}/>
        <rect x="500" y="458" width="66" height="7" rx="2" fill="#6b4228"/>`),
    ].join('');
  }

  function brickHouse() {
    const rnd = seeded(11);
    const tones = ['#c96a4c', '#bd5f44', '#d27858', '#b8593f', '#cc7152', '#c26449', '#a95039', '#d4826a'];
    const rowH = 37.5;
    const brick = (x0, y0, w, h) => {
      const c = tones[Math.floor(rnd() * tones.length)];
      const chip = rnd() > 0.93;
      return `<rect x="${x0.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${c}"/>
        <path d="M${(x0 + 2).toFixed(1)} ${(y0 + h - 1).toFixed(1)} H${(x0 + w - 2).toFixed(1)}" ${line(1.4, 'rgba(70,25,15,.35)')}/>
        <path d="M${(x0 + 2).toFixed(1)} ${(y0 + 1.6).toFixed(1)} H${(x0 + w * 0.6).toFixed(1)}" ${line(1, 'rgba(255,225,200,.4)')}/>
        ${chip ? `<path d="M${(x0 + w - 4).toFixed(1)} ${y0.toFixed(1)} l4 0 l0 3.5 Z" fill="#c9ad94"/>` : ''}`;
    };
    const course = (y, h, offset) => {
      let s = '';
      for (let x = L - offset; x < L + W; x += 44) {
        const x0 = Math.max(x, L) + 1.3;
        const x1 = Math.min(x + 44, L + W) - 1.3;
        if (x1 - x0 > 4) s += brick(x0, y + 1.3, x1 - x0, h - 2.6);
      }
      return s;
    };
    const row = (i, k) => {
      const y = GROUND - rowH * (k + 1);
      const ch = rowH / 2;
      return piece(i, `
        <rect x="${L}" y="${y}" width="${W}" height="${rowH}" fill="url(#g-mortar)"/>
        ${course(y, ch, 0)}${course(y + ch, ch, 22)}
        <rect x="${L}" y="${y}" width="${W}" height="${rowH}" fill="none" stroke="rgba(90,40,25,.35)" stroke-width="1.4"/>`);
    };
    let chimney = '';
    for (let k = 0; k < 7; k++) {
      const y = 272 + k * 14.5;
      chimney += k % 2
        ? brick(520, y, 18, 12) + brick(540, y, 20, 12)
        : brick(520, y, 40, 12);
    }
    const roofTop = 284;
    const roofBase = GROUND - 150 + 6;
    let tiles = '';
    for (let r = 0; r < 4; r++) {
      const y = roofTop + 26 + r * 26;
      const hw = ((y - roofTop) / (roofBase - roofTop)) * 138;
      const x0 = HOUSE_X - hw + 6;
      const x1 = HOUSE_X + hw - 6;
      let d = `M${x0.toFixed(1)} ${y}`;
      for (let x = x0; x < x1 - 1; x += 20) d += ` q10 9 ${Math.min(20, x1 - x).toFixed(1)} 0`;
      tiles += `<path d="${d}" ${line(2, 'rgba(70,20,15,.45)')}/><path d="${d.replace(/ q10 9/g, ' q10 6')}" transform="translate(0 -4)" ${line(1.2, 'rgba(255,200,170,.25)')}/>`;
    }
    let arch = '';
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI - (k / 8) * Math.PI;
      const cx = HOUSE_X;
      const cy = 490;
      const r0 = 30;
      const r1 = 40;
      const x0 = cx + Math.cos(a) * r0;
      const y0 = cy - Math.sin(a) * r0;
      const x1 = cx + Math.cos(a) * r1;
      const y1 = cy - Math.sin(a) * r1;
      arch += `<path d="M${x0.toFixed(1)} ${y0.toFixed(1)} L${x1.toFixed(1)} ${y1.toFixed(1)}" ${line(1.4, 'rgba(70,25,15,.45)')}/>`;
    }
    return [
      row(0, 0), row(1, 1), row(2, 2), row(3, 3),
      piece(5, `
        <rect x="518" y="268" width="44" height="106" fill="url(#g-mortar)"/>
        ${chimney}
        <rect x="518" y="268" width="44" height="106" fill="none" stroke="rgba(90,40,25,.4)" stroke-width="1.4"/>
        <rect x="512" y="256" width="56" height="14" rx="2" fill="#7d3b30" stroke="#5a2a22" stroke-width="1.4"/>
        <path d="M514 259 H566" ${line(1.4, 'rgba(255,200,170,.35)')}/>
        <rect x="518" y="270" width="44" height="6" fill="rgba(40,20,10,.25)"/>`),
      piece(4, `
        <path d="M332 ${roofBase} L${HOUSE_X} ${roofTop} L608 ${roofBase} Z" fill="url(#g-tile)" stroke="#6e2b23" stroke-width="1.6" stroke-linejoin="round"/>
        ${tiles}
        <path d="M${HOUSE_X} ${roofTop + 2} L604 ${roofBase - 2}" ${line(3, 'rgba(255,200,170,.25)')}/>
        <path d="M332 ${roofBase} L${HOUSE_X} ${roofTop} L608 ${roofBase}" ${line(7, '#8c3a30')}/>
        <rect x="324" y="${roofBase - 4}" width="292" height="10" rx="3" fill="#6e3029"/>
        <rect x="${L}" y="${roofBase + 6}" width="${W}" height="16" fill="url(#g-eave)"/>`),
      piece(6, `
        <path d="M430 540 V490 a40 40 0 0 1 80 0 V540 Z" fill="#b7593f"/>
        ${arch}
        <path d="M440 540 V490 a30 30 0 0 1 60 0 V540 Z" fill="#4b2f20"/>
        <path d="M443 540 V490 a27 27 0 0 1 54 0 V540 Z" fill="url(#g-door-green)"/>
        <path d="M456.5 466 V540 M470 463 V540 M483.5 466 V540" ${line(1.2, 'rgba(0,0,0,.25)')}/>
        <circle cx="470" cy="488" r="5" fill="none" stroke="#c9a24e" stroke-width="2"/>
        <circle cx="487" cy="512" r="3.6" fill="#c9a24e" stroke="#8a6a2a" stroke-width="1"/>
        <rect x="436" y="536" width="68" height="6" rx="2" fill="#a99482"/>`),
      piece(7, `
        <rect x="508" y="418" width="58" height="52" rx="3" fill="#f1e4d4" stroke="#b9a48c" stroke-width="1.4"/>
        <rect x="513" y="423" width="48" height="42" rx="2" fill="url(#g-glass)"/>
        <path d="M513 423 q15 20 0 42 M561 423 q-15 20 0 42" fill="#f1b7b5" stroke="#d69391" stroke-width="1.2"/>
        <path d="M537 423 V465 M513 444 H561" ${line(2.4, '#f1e4d4')}/>
        <rect x="502" y="468" width="70" height="16" rx="2" fill="#8b5a32" stroke="#5e3b20" stroke-width="1.4"/>
        ${[512, 524, 537, 550, 562].map((x, i) => `
          <path d="M${x} 468 v-6" ${line(1.6, '#5f9a4a')}/>
          <circle cx="${x}" cy="${461 - (i % 2) * 2}" r="4.6" fill="${['#e26d6d', '#f2c14e', '#e26d6d', '#f6f0e6', '#e26d6d'][i]}" stroke="rgba(80,30,30,.35)" stroke-width="1"/>
          <circle cx="${x}" cy="${461 - (i % 2) * 2}" r="1.4" fill="#fff3c0"/>`).join('')}
        <path d="M506 472 H568" ${line(1.4, 'rgba(255,220,180,.35)')}/>`),
    ].join('');
  }

  const HOUSES = { straw: strawHouse, wood: woodHouse, brick: brickHouse };

  function house(type) {
    return `<ellipse cx="${HOUSE_X}" cy="${GROUND + 2}" rx="168" ry="17" fill="url(#g-shadow)"/>${HOUSES[type]()}`;
  }

  // ---------------------------------------------------------------- 材料の山（上から順に data-k=0,1,...）

  function pile(type, n) {
    const items = [];
    const wrap = (x, y, k, body) => `<g transform="translate(${x} ${y})"><g class="pile-item" data-k="${k}">${body}</g></g>`;
    if (type === 'straw') {
      // 寝かせたわらの束
      const pos = [[0, -84], [-28, -50], [28, -50], [-56, -16], [0, -16], [56, -16]].slice(-n).reverse();
      pos.sort((a, b) => a[1] - b[1]);
      const rnd = seeded(5);
      pos.forEach(([x, y], k) => {
        let strands = '';
        for (let j = 0; j < 7; j++) {
          const yy = -11 + j * 3.6;
          strands += `<path d="M-27 ${yy.toFixed(1)} Q0 ${(yy + rnd() * 2 - 1).toFixed(1)} 27 ${yy.toFixed(1)}" ${line(1, j % 2 ? 'rgba(150,104,34,.45)' : 'rgba(255,244,200,.7)')}/>`;
        }
        items.push(wrap(x, y, k, `
          <path d="M-30 -14 Q-34 0 -30 14 L26 16 Q32 0 26 -16 Z" fill="url(#g-straw)" stroke="#a97c2e" stroke-width="1.4" stroke-linejoin="round"/>
          ${strands}
          <path d="M-4 -15 Q-1 0 -4 15 M6 -15 Q9 0 6 15" ${line(3.4, '#94642a')}/>`));
      });
    } else if (type === 'wood') {
      for (let k = 0; k < n; k++) {
        const y = -13 - (n - 1 - k) * 22;
        const x = ((n - 1 - k) % 2) * 8 - 4;
        items.push(wrap(x, y, k, `
          <rect x="-52" y="-11" width="104" height="22" rx="11" fill="url(#${k % 2 ? 'g-log2' : 'g-log'})" stroke="#6b4426" stroke-width="1.6"/>
          <path d="M-36 -4 q30 -2 56 0 M-20 4 q24 1 44 -1" ${line(1, 'rgba(90,52,24,.35)')}/>
          <circle cx="42" cy="0" r="10" fill="#e6c193" stroke="#8b5a32" stroke-width="1.6"/>
          <circle cx="42" cy="0" r="6" fill="none" stroke="#c49563" stroke-width="1.1"/>
          <circle cx="42" cy="0" r="2.4" fill="none" stroke="#c49563" stroke-width="1"/>`));
      }
    } else {
      const rows = [3, 3, 2];
      const pos = [];
      rows.forEach((count, r) => {
        for (let i = 0; i < count; i++) pos.push([(i - (count - 1) / 2) * 40 + (r % 2) * 4, -11 - r * 21]);
      });
      const tones = ['#c96a4c', '#bd5f44', '#d27858', '#b8593f'];
      pos.slice(0, n).sort((a, b) => a[1] - b[1]).forEach(([x, y], k) => items.push(wrap(x, y, k, `
        <rect x="-19" y="-10" width="38" height="20" rx="2.5" fill="${tones[k % tones.length]}" stroke="#7d3b2a" stroke-width="1.3"/>
        <path d="M-15 -6.5 h22" ${line(1.2, 'rgba(255,220,190,.45)')}/>
        <path d="M-17 8 h34" ${line(1.6, 'rgba(60,20,10,.25)')}/>
        <circle cx="${(k * 7) % 20 - 8}" cy="2" r="1" fill="rgba(80,30,20,.35)"/>`)));
    }
    return `<ellipse class="shadow" cx="0" cy="0" rx="74" ry="9"/>${items.join('')}`;
  }

  // ---------------------------------------------------------------- 背景（そと）

  function cloud(x, y, s, cls) {
    return `<g class="cloud ${cls || ''}" style="transform: translate(${x}px, ${y}px) scale(${s})">
      <g filter="url(#f-haze)" opacity=".92">
        <ellipse cx="0" cy="0" rx="78" ry="22" fill="#fff"/>
        <circle cx="-30" cy="-12" r="26" fill="#fff"/>
        <circle cx="8" cy="-24" r="32" fill="#fff"/>
        <circle cx="42" cy="-8" r="22" fill="#fff"/>
        <ellipse cx="0" cy="8" rx="70" ry="10" fill="#e4eef4"/>
      </g>
    </g>`;
  }

  /** 葉のかたまりの輪郭（でこぼこの円）。 */
  function lumpy(cx, cy, r, bumps, rnd) {
    let d = '';
    const n = bumps * 2;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = r * (i % 2 ? 1.0 + rnd() * 0.06 : 0.9);
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr * 0.92;
      if (i === 0) d += `M${x.toFixed(1)} ${y.toFixed(1)}`;
      else {
        const am = ((i - 0.5) / n) * Math.PI * 2;
        const rc = r * 1.08;
        d += ` Q${(cx + Math.cos(am) * rc).toFixed(1)} ${(cy + Math.sin(am) * rc * 0.92).toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    }
    return d + ' Z';
  }

  function tree(x, s, seed) {
    const rnd = seeded(seed);
    const crown = [[0, -150, 52], [-42, -118, 38], [42, -122, 40], [-18, -186, 34], [24, -184, 32]];
    let back = '';
    let front = '';
    for (const [bx, by, r] of crown) {
      back += `<path d="${lumpy(bx, by, r, 7, rnd)}" fill="#5d9a4b" stroke="#47803a" stroke-width="1.6"/>`;
      front += `<path d="${lumpy(bx + 4, by - 4, r * 0.82, 6, rnd)}" fill="url(#g-tree)"/>`;
    }
    let leaves = '';
    for (let i = 0; i < 16; i++) {
      const lx = rnd() * 110 - 40;
      const ly = -110 - rnd() * 100;
      leaves += `<path d="M${lx.toFixed(0)} ${ly.toFixed(0)} q5 -6 10 0 q-5 6 -10 0 Z" fill="rgba(235,250,200,.35)" transform="rotate(${(rnd() * 80 - 40).toFixed(0)} ${lx.toFixed(0)} ${ly.toFixed(0)})"/>`;
    }
    return `<g transform="translate(${x} ${GROUND}) scale(${s})">
      <ellipse cx="0" cy="2" rx="74" ry="10" fill="url(#g-shadow)"/>
      <path d="M-11 0 C-9 -36 -12 -70 -6 -112 L7 -112 C12 -70 9 -36 13 0 Z" fill="url(#g-trunk)" stroke="#5a3d28" stroke-width="1.6"/>
      <path d="M2 -78 C14 -86 24 -98 30 -118 M-3 -92 C-14 -100 -22 -110 -26 -126" fill="none" stroke="#6f4d35" stroke-width="6" stroke-linecap="round"/>
      <path d="M-4 -20 q2 -20 0 -40 M4 -40 q1 -14 0 -26" ${line(1.2, 'rgba(40,25,15,.35)')}/>
      ${back}${front}${leaves}
      <path d="M-60 -112 Q0 -88 62 -110" ${line(10, 'rgba(30,70,30,.15)')}/>
    </g>`;
  }

  /** 草の葉を何本か。 */
  function tufts(rnd, count, y0, y1) {
    let s = '';
    for (let i = 0; i < count; i++) {
      const x = -700 + rnd() * 2300;
      const y = y0 + rnd() * (y1 - y0);
      const sc = 0.6 + ((y - y0) / (y1 - y0)) * 0.8;
      const c = rnd() > 0.5 ? 'rgba(70,120,50,.45)' : 'rgba(200,235,150,.5)';
      s += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} q${(-3 * sc).toFixed(1)} ${(-10 * sc).toFixed(1)} ${(-6 * sc).toFixed(1)} ${(-14 * sc).toFixed(1)} M${x.toFixed(0)} ${y.toFixed(0)} q${(1 * sc).toFixed(1)} ${(-12 * sc).toFixed(1)} ${(4 * sc).toFixed(1)} ${(-17 * sc).toFixed(1)} M${x.toFixed(0)} ${y.toFixed(0)} q${(4 * sc).toFixed(1)} ${(-8 * sc).toFixed(1)} ${(9 * sc).toFixed(1)} ${(-11 * sc).toFixed(1)}" ${line(1.8 * sc, c)}/>`;
    }
    return s;
  }

  function flower(x, y, color, s) {
    return `<g transform="translate(${x} ${y}) scale(${s || 1})">
      <path d="M0 0 q-2 -8 0 -16" ${line(2, '#5f9a4a')}/>
      <g fill="${color}">
        <ellipse cx="0" cy="-22" rx="3.6" ry="5"/><ellipse cx="-5.5" cy="-17" rx="5" ry="3.6"/>
        <ellipse cx="5.5" cy="-17" rx="5" ry="3.6"/><ellipse cx="-3.5" cy="-11.5" rx="3.6" ry="4.4"/>
        <ellipse cx="3.5" cy="-11.5" rx="3.6" ry="4.4"/>
      </g>
      <circle cx="0" cy="-16" r="2.6" fill="#f6d76b"/>
    </g>`;
  }

  function outdoor() {
    const rnd = seeded(3);
    const flowers = [
      [180, 600, '#f6c2cc', 1], [300, 660, '#fbe6a2', 1.1], [640, 620, '#ffffff', 0.9], [770, 670, '#f6c2cc', 1.2],
      [40, 650, '#fbe6a2', 1], [880, 610, '#d4c4f0', 0.9], [420, 712, '#d4c4f0', 1.3], [-120, 630, '#f6c2cc', 1], [1040, 650, '#fbe6a2', 1],
      [560, 760, '#ffffff', 1.4], [120, 760, '#f6c2cc', 1.4], [900, 760, '#d4c4f0', 1.4],
    ].map(([x, y, c, s]) => flower(x, y, c, s)).join('');
    return `
<defs>
  <linearGradient id="sky" gradientUnits="userSpaceOnUse" x1="0" y1="-260" x2="0" y2="${GROUND}">
    <stop offset="0" stop-color="#7fbfe6"/><stop offset=".5" stop-color="#a9d6ef"/><stop offset=".82" stop-color="#d9edf3"/><stop offset="1" stop-color="#f6ead6"/>
  </linearGradient>
  ${lin('hill-far', [[0, '#bcd5c9'], [1, '#d7e3d0']])}
  ${lin('hill-mid', [[0, '#b2d58c'], [1, '#97c073']])}
  <linearGradient id="meadow" gradientUnits="userSpaceOnUse" x1="0" y1="${GROUND - 8}" x2="0" y2="${GROUND + 420}">
    <stop offset="0" stop-color="#a2cf74"/><stop offset=".4" stop-color="#88bd60"/><stop offset="1" stop-color="#5f9442"/>
  </linearGradient>
</defs>
<rect x="-3000" y="-3000" width="7000" height="3560" fill="url(#sky)"/>
<circle cx="770" cy="190" r="260" fill="url(#g-glow)"/>
<circle cx="770" cy="190" r="44" fill="#fff6d8"/>
${cloud(190, 210, 1.1, 'c1')}${cloud(560, 140, 0.75, 'c2')}${cloud(-260, 240, 1, 'c3')}${cloud(1120, 170, 1.2, 'c1')}${cloud(380, -60, 1, 'c2')}
<path d="M-1200 ${GROUND - 40} Q-900 ${GROUND - 150} -600 ${GROUND - 90} Q-350 ${GROUND - 170} -60 ${GROUND - 100} Q200 ${GROUND - 190} 470 ${GROUND - 110} Q760 ${GROUND - 200} 1040 ${GROUND - 100} Q1300 ${GROUND - 160} 1600 ${GROUND - 80} L1600 ${GROUND} L-1200 ${GROUND} Z" fill="url(#hill-far)"/>
<g opacity=".55">
  <circle cx="-120" cy="${GROUND - 110}" r="22" fill="#a7c4b3"/><circle cx="-90" cy="${GROUND - 118}" r="18" fill="#a7c4b3"/>
  <circle cx="980" cy="${GROUND - 116}" r="24" fill="#a7c4b3"/><circle cx="1012" cy="${GROUND - 108}" r="17" fill="#a7c4b3"/>
  <circle cx="660" cy="${GROUND - 128}" r="14" fill="#a7c4b3"/><circle cx="680" cy="${GROUND - 124}" r="11" fill="#a7c4b3"/>
</g>
<path d="M-1200 ${GROUND - 10} Q-800 ${GROUND - 120} -380 ${GROUND - 50} Q0 ${GROUND - 110} 300 ${GROUND - 40} Q700 ${GROUND - 140} 1100 ${GROUND - 50} Q1400 ${GROUND - 100} 1700 ${GROUND - 30} L1700 ${GROUND} L-1200 ${GROUND} Z" fill="url(#hill-mid)"/>
${tree(60, 0.95, 1)}${tree(890, 0.8, 2)}${tree(-220, 1.1, 3)}${tree(1140, 1, 4)}
<rect x="-3000" y="${GROUND - 8}" width="7000" height="3000" fill="url(#meadow)"/>
<path d="M-3000 ${GROUND - 8} H4000" ${line(3, 'rgba(255,255,220,.35)')}/>
<path d="M300 ${GROUND + 40} Q470 ${GROUND + 20} 640 ${GROUND + 40} Q720 ${GROUND + 120} 900 ${GROUND + 300} L40 ${GROUND + 300} Q220 ${GROUND + 120} 300 ${GROUND + 40} Z" fill="#c9b98a" opacity=".22"/>
${tufts(rnd, 90, GROUND + 10, GROUND + 260)}
${flowers}
`;
  }

  // ---------------------------------------------------------------- 背景（へやの中）とだんろ

  function indoor() {
    let planks = '';
    for (let x = -1200; x < 2200; x += 92) planks += `M${x} ${GROUND} v3000 `;
    return `
<defs>
  <linearGradient id="wall" gradientUnits="userSpaceOnUse" x1="0" y1="-100" x2="0" y2="${GROUND}">
    <stop offset="0" stop-color="#d9bf9c"/><stop offset=".6" stop-color="#efdcc0"/><stop offset="1" stop-color="#e6cba8"/>
  </linearGradient>
  <linearGradient id="floor" gradientUnits="userSpaceOnUse" x1="0" y1="${GROUND}" x2="0" y2="${GROUND + 360}">
    <stop offset="0" stop-color="#b98458"/><stop offset="1" stop-color="#7d5134"/>
  </linearGradient>
  <pattern id="wallpaper" width="64" height="64" patternUnits="userSpaceOnUse">
    <path d="M32 18 q6 8 0 14 q-6 -6 0 -14 Z M0 50 q6 8 0 14 q-6 -6 0 -14 Z M64 50 q6 8 0 14 q-6 -6 0 -14 Z" fill="#d9bc96" opacity=".55"/>
  </pattern>
  <pattern id="bricks" width="44" height="36" patternUnits="userSpaceOnUse">
    <rect width="44" height="36" fill="#d8c0a8"/>
    <rect x="1.2" y="1.2" width="41.6" height="15.6" rx="2.5" fill="#c56a4d"/>
    <rect x="-20.8" y="19.2" width="41.6" height="15.6" rx="2.5" fill="#b95f44"/>
    <rect x="23.2" y="19.2" width="41.6" height="15.6" rx="2.5" fill="#cc7354"/>
  </pattern>
  <clipPath id="fireplace-opening" clipPathUnits="userSpaceOnUse">
    <path d="M318 600 V424 Q318 388 354 388 H486 Q522 388 522 424 V600 Z"/>
  </clipPath>
</defs>
<rect x="-3000" y="-3000" width="7000" height="3560" fill="url(#wall)"/>
<rect x="-3000" y="-3000" width="7000" height="3560" fill="url(#wallpaper)"/>
<rect x="-3000" y="${GROUND - 70}" width="7000" height="70" fill="#d8bb94"/>
<rect x="-3000" y="${GROUND - 74}" width="7000" height="6" fill="#c3a27b"/>
<g>
  <rect x="114" y="230" width="116" height="116" rx="6" fill="#c3a27b"/>
  <rect x="122" y="238" width="100" height="100" rx="3" fill="url(#g-glass)"/>
  <path d="M122 300 q30 -26 56 -8 q24 -16 44 0 V338 H122 Z" fill="#a8cf8a" opacity=".85"/>
  <path d="M172 238 V338 M122 288 H222" ${line(5, '#c3a27b')}/>
  <path d="M130 330 L166 246" ${line(4, 'rgba(255,255,255,.5)')}/>
  <path d="M100 224 q24 64 0 128 L92 352 Q114 288 92 224 Z" fill="#e8a9a4"/>
  <path d="M244 224 q-24 64 0 128 L252 352 Q230 288 252 224 Z" fill="#e8a9a4"/>
  <rect x="86" y="218" width="172" height="8" rx="4" fill="#9c7a58"/>
  <rect x="676" y="246" width="88" height="70" rx="4" fill="#9c7a58"/>
  <rect x="682" y="252" width="76" height="58" rx="2" fill="#f6ecd8"/>
  <path d="M686 304 l20 -26 l14 16 l12 -12 l22 22 Z" fill="#9cc58a"/>
  <circle cx="740" cy="268" r="6" fill="#f3c873"/>
</g>
<rect x="-3000" y="${GROUND}" width="7000" height="3000" fill="url(#floor)"/>
<path d="${planks}" ${line(2, 'rgba(60,35,20,.25)')}/>
<rect x="-3000" y="${GROUND}" width="7000" height="10" fill="rgba(40,20,10,.25)"/>
<ellipse class="room-glow" cx="420" cy="470" rx="420" ry="300" fill="url(#g-fireglow)"/>`;
  }

  /** だんろ（なべの後ろ側まで）。おおかみはこの手前・なべの前面の奥に入る。 */
  function fireplaceBack() {
    return `
<rect x="362" y="-3000" width="116" height="3340" fill="url(#bricks)"/>
<rect x="362" y="-3000" width="116" height="3340" fill="url(#g-eave)" opacity=".0"/>
<path d="M362 -3000 V340 M478 -3000 V340" ${line(4, 'rgba(60,25,15,.25)')}/>
<rect x="280" y="340" width="280" height="200" fill="url(#bricks)"/>
<rect x="258" y="320" width="324" height="24" rx="5" fill="#7a4a30"/>
<rect x="258" y="320" width="324" height="6" rx="3" fill="#9a6644"/>
<rect x="280" y="344" width="280" height="14" fill="rgba(40,20,10,.25)"/>
<path d="M318 540 V424 Q318 388 354 388 H486 Q522 388 522 424 V540 Z" fill="#2c1f1b"/>
<path d="M326 540 V426 Q326 396 356 396 H484 Q514 396 514 426 V540 Z" fill="url(#g-fireglow)" opacity=".6" class="hearth-glow"/>
<g class="fire">
  <rect x="368" y="518" width="104" height="15" rx="7" fill="#7b4c2f" transform="rotate(-8 420 526)"/>
  <rect x="368" y="518" width="104" height="15" rx="7" fill="#946039" transform="rotate(8 420 526)"/>
  <ellipse cx="420" cy="520" rx="60" ry="16" fill="#ffb04f" opacity=".55" filter="url(#f-soft)"/>
  <path class="flame f1" d="M420 524 C380 520 382 480 404 462 C404 482 414 486 416 476 C414 456 428 440 440 432 C436 456 462 470 456 500 C454 518 440 524 420 524 Z" fill="url(#g-flame)"/>
  <path class="flame f2" d="M420 522 C400 520 398 498 410 486 C412 498 418 500 420 494 C420 482 428 474 434 470 C434 486 446 494 442 508 C440 518 432 522 420 522 Z" fill="#fff0b0" opacity=".85"/>
</g>
<path d="M352 422 l-10 -30 M488 422 l10 -30" ${line(5, '#3b3e48')}/>
<ellipse cx="420" cy="422" rx="80" ry="15" fill="#1e2026"/>
<ellipse class="water" cx="420" cy="423" rx="72" ry="11.5" fill="url(#g-water)"/>
<g class="bubbles" fill="#eaf8ff">
  <circle class="bub b1" cx="392" cy="422" r="5"/><circle class="bub b2" cx="430" cy="420" r="6"/><circle class="bub b3" cx="455" cy="425" r="4"/>
</g>`;
  }

  function fireplaceFront() {
    return `
<path d="M340 422 Q338 494 382 502 H458 Q502 494 500 422 A80 15 0 0 1 340 422 Z" fill="url(#g-pot)"/>
<path d="M340 422 A80 15 0 0 0 500 422" ${line(8, '#4d515d')}/>
<path d="M346 426 A74 12 0 0 0 494 426" ${line(2, 'rgba(255,255,255,.18)')}/>
<path d="M360 446 q4 30 26 40" ${line(5, 'rgba(255,255,255,.16)')}/>
<path d="M470 440 q8 30 -8 52" ${line(6, 'rgba(255,170,90,.25)')}/>
<g class="steam" ${line(8, 'rgba(255,255,255,.75)')}>
  <path class="st s1" d="M392 400 q-12 -18 0 -34 q12 -18 0 -34"/>
  <path class="st s2" d="M426 396 q-12 -18 0 -34 q12 -18 0 -34"/>
  <path class="st s3" d="M458 402 q-12 -18 0 -34 q12 -18 0 -34"/>
</g>`;
  }

  function pitcher() {
    return `<ellipse class="shadow" cx="0" cy="40" rx="30" ry="6" opacity=".6"/>
    <g class="a-body">
      <path d="M-26 -54 Q-30 -10 -22 20 Q0 30 22 20 Q30 -10 26 -54 Z" fill="url(#g-pitcher)"/>
      <path d="M26 -50 L54 -68 L52 -55 L28 -36 Z" fill="#a9d3e6"/>
      <path d="M-26 -34 q-26 4 -24 26 q2 16 22 12" ${line(6, '#8fbdd4')}/>
      <ellipse cx="0" cy="-54" rx="26" ry="7" fill="#5fa9d6"/>
      <ellipse cx="-4" cy="-55" rx="14" ry="3" fill="#a5d8f2"/>
      <path d="M-14 -24 q2 22 10 32" ${line(5, 'rgba(255,255,255,.7)')}/>
    </g>`;
  }

  // ---------------------------------------------------------------- ヒントと効果

  function hand() {
    return `<g class="hand">
      <circle class="ring" r="30" fill="rgba(255,255,255,.18)" stroke="#fff" stroke-width="5"/>
      <g class="hand-glove" transform="translate(14 30) rotate(-18)">
        <rect x="-10" y="-34" width="20" height="46" rx="10" fill="#fff" stroke="rgba(46,58,70,.35)" stroke-width="2"/>
        <rect x="-24" y="-2" width="48" height="46" rx="17" fill="#fff" stroke="rgba(46,58,70,.35)" stroke-width="2"/>
        <path d="M-8 6 v10 M4 6 v10" ${line(2, 'rgba(46,58,70,.35)')}/>
      </g>
    </g>`;
  }

  function wind() {
    return `<g class="wind" fill="none" stroke="#fff" stroke-linecap="round" filter="url(#f-haze)">
      <path class="gust g1" stroke-width="7" d="M0 -20 C40 -40 80 0 120 -20 S200 -30 240 -10"/>
      <path class="gust g2" stroke-width="9" d="M0 10 C50 -10 90 30 140 10 S220 0 260 20"/>
      <path class="gust g3" stroke-width="6" d="M0 40 C40 25 80 60 120 40 S190 35 220 50"/>
    </g>`;
  }

  function heart() {
    return `<path d="M0 8 C-18 -6 -14 -22 0 -14 C14 -22 18 -6 0 8 Z" fill="url(#g-heart)"/>
      <ellipse cx="-6" cy="-10" rx="3" ry="2" fill="#fff" opacity=".6"/>`;
  }

  function star(color) {
    return `<path d="M0 -13 Q2 -2 13 0 Q2 2 0 13 Q-2 2 -13 0 Q-2 -2 0 -13 Z" fill="${color || '#fff3b8'}"/>`;
  }

  root.PigsArt = {
    GROUND, HOUSE_X, PIG_OUTFIT,
    defs, pig, wolf, house, pile, outdoor, indoor, fireplaceBack, fireplaceFront, pitcher,
    hand, wind, heart, star,
  };
})(typeof self !== 'undefined' ? self : this);
