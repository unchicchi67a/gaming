/**
 * 絵。キャラクター・家・背景・小物は画像（img/*.webp）で、SVG の <image> として置く。
 * 汗やなみだ、湯気、炎、風、ハートなどの効果だけは SVG で描く。
 *
 * 画像は Stable Diffusion XL で作った、水彩と色えんぴつの絵本風のイラスト。
 * 作り方は README の「絵について」を参照。
 *
 * 座標は「ワールド座標」で、地面の高さが GROUND（y=540）。
 * キャラクターは足元が原点 (0, 0) になるように描き、画面側で translate して置く。
 * 表情は、表情ごとの画像を重ねておき、CSS クラスで見せる画像を切り替える
 * （例：.wolf--hot のときだけ wolf-hot.webp が見える）。
 */
(function (root) {
  'use strict';

  const GROUND = 540;
  const HOUSE_X = 470;
  const DIR = 'img/';

  const line = (w, c) =>
    `fill="none" stroke="${c || '#2e3a46'}" stroke-width="${w || 3}" stroke-linecap="round" stroke-linejoin="round"`;

  /** 画像を置く。(x, y) は左上、w×h はワールド座標での大きさ。 */
  const img = (file, x, y, w, h, extra) =>
    `<image href="${DIR}${file}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" preserveAspectRatio="none"${extra ? ' ' + extra : ''}/>`;

  // ---------------------------------------------------------------- 画像の寸法
  //
  // px は画像の大きさ（ピクセル）、foot は足元（または家の土台）の画像上の位置、
  // height はワールド座標での高さ。

  const SPRITES = {
    pig: { px: [243, 420], foot: [124, 419.5], height: 175 },
    wolf: { px: [284, 460], foot: [172.5, 459.5], height: 235 },
  };

  /** 足元を原点にしたときの、画像の左上と大きさ。 */
  function placeSprite(sp) {
    const k = sp.height / sp.px[1];
    return { x: -sp.foot[0] * k, y: -sp.foot[1] * k, w: sp.px[0] * k, h: sp.px[1] * k };
  }

  /** こぶたの表情（クラス名の末尾と画像名の末尾）。n はふつうの顔。 */
  const PIG_FACES = ['n', 'happy', 'scared'];
  const WOLF_FACES = ['n', 'puff', 'blow', 'tired', 'hot', 'sorry', 'happy'];

  /** おおかみの口の位置（足元からの相対座標）。ここから風が出る。 */
  const WOLF_MOUTH = { x: 14, y: -150 };

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
    return `
${rad('g-shadow', [[0, '#2a3a20', 0.32], [0.6, '#2a3a20', 0.14], [1, '#2a3a20', 0]])}
${rad('g-blush', [[0, '#ff8f9a', 0.65], [1, '#ff8f9a', 0]])}
${rad('g-glow', [[0, '#fff7d6', 0.95], [0.35, '#ffefc0', 0.45], [1, '#ffefc0', 0]])}
${rad('g-fireglow', [[0, '#ffb35c', 0.7], [0.5, '#ff9b45', 0.25], [1, '#ff9b45', 0]])}
${rad('g-water', [[0, '#c4ecff'], [0.7, '#6ec0ea'], [1, '#3d93c9']], 0.45, 0.4, 0.6)}
${rad('g-flame', [[0, '#fff3b0'], [0.45, '#ffc14d'], [1, '#f2703a']], 0.5, 0.85, 0.8)}
${rad('g-beckon', [[0, '#fff8d2', 0.75], [0.55, '#fff3b8', 0.35], [1, '#fff3b8', 0]])}
${lin('g-heart', [[0, '#ff9fae'], [1, '#e8667e']])}
${lin('g-fade-v', [[0, '#000'], [0.06, '#fff'], [0.94, '#fff'], [1, '#000']])}
${lin('g-fade-h', [[0, '#000'], [0.04, '#fff'], [0.96, '#fff'], [1, '#000']], 1, 0)}
<filter id="f-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
<filter id="f-haze" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2.5"/></filter>`;
  }

  const shadow = (rx, ry) => `<ellipse class="shadow" cx="0" cy="0" rx="${rx}" ry="${ry}"/>`;
  const drop = (x, y, s) =>
    `<path transform="translate(${x} ${y}) scale(${s || 1})" d="M0 -9 q9 13 0 18 q-9 -5 0 -18 Z" fill="#b5e0f5" stroke="#7fb8d6" stroke-width="1.3"/>`;

  /** 表情ごとの画像を重ねる。ふつうの顔の画像だけ face-n、ほかは face-<表情>。 */
  function faces(name, list, box) {
    return list.map((f) => img(`${name}${f === 'n' ? '' : '-' + f}.webp`, box.x, box.y, box.w, box.h, `class="face face-${f}"`)).join('');
  }

  // ---------------------------------------------------------------- こぶた

  function pig(n) {
    const b = placeSprite(SPRITES.pig);
    return `
${shadow(52, 8)}
<g class="a-body">
  ${faces('pig' + n, PIG_FACES, b)}
  <g class="p-sweat">${drop(36, -152)}${drop(46, -132, 0.7)}</g>
</g>`;
  }

  // ---------------------------------------------------------------- おおかみ

  function wolf() {
    const b = placeSprite(SPRITES.wolf);
    return `
${shadow(62, 9)}
<g class="a-flip"><g class="a-body">
  ${faces('wolf', WOLF_FACES, b)}
  <g class="w-bandage">
    <rect x="-44" y="-86" width="34" height="11" rx="5" fill="#f6dcc0" stroke="#d2b088" stroke-width="1.4" transform="rotate(35 -27 -80.5)"/>
    <rect x="-44" y="-86" width="34" height="11" rx="5" fill="#f6dcc0" stroke="#d2b088" stroke-width="1.4" transform="rotate(-35 -27 -80.5)"/>
    <circle cx="-27" cy="-80.5" r="2" fill="#e3c39d"/>
  </g>
  <g class="w-sweat">${drop(52, -205)}${drop(64, -184, 0.7)}</g>
  <g class="w-tear">${drop(-14, -160, 0.8)}${drop(40, -160, 0.8)}</g>
  <g class="w-hot">
    <path class="w-steam" d="M-62 -78 q-6 -8 0 -16 q6 -8 0 -16 M-46 -80 q-6 -8 0 -16 q6 -8 0 -16" ${line(4, 'rgba(255,255,255,.9)')}/>
  </g>
</g></g>`;
  }

  // ---------------------------------------------------------------- 家
  //
  // 1 枚の絵を横に切り分けて「パーツ」にする（下から data-i=0,1,...）。
  // つくる場面ではパーツが下から順に積み上がり、ふきとぶ場面ではばらばらに飛んでいく。
  // base は土台（地面に接するところ）の画像上の高さ、cuts はパーツの境目（画像の上端 0 〜 下端 1）。

  const HOUSE_IMG = {
    // windows：ノックのあと、こぶたがのぞく窓（画像上の中心と大きさ、形、のぞくこぶた）。上から SVG で描き足す。
    // わらの家は絵に窓がないので、家ができたら出す。木とレンガの家は絵の窓に重ね、のぞくときだけ出す（overlay）。
    // door：オオカミがノックする戸の位置（画像上）。
    straw: {
      px: [560, 510], base: 498, width: 280, cuts: [0.82, 0.62, 0.42, 0.24],
      door: [272, 350],
      windows: [{ cx: 412, cy: 360, w: 128, h: 108, shape: 'arch', pig: 1 }],
    },
    wood: {
      px: [560, 586], base: 560, width: 290, cuts: [0.8, 0.66, 0.52, 0.38, 0.22],
      door: [315, 370], overlay: true,
      windows: [
        { cx: 191, cy: 328, w: 96, h: 126, shape: 'rect', pig: 2 },
        { cx: 431, cy: 327, w: 84, h: 98, shape: 'rect', pig: 1 },
      ],
    },
    brick: {
      px: [560, 569], base: 530, width: 280, cuts: [0.86, 0.75, 0.64, 0.53, 0.42, 0.28, 0.14],
      door: [343, 400], overlay: true,
      windows: [
        { cx: 92, cy: 360, w: 100, h: 140, shape: 'arch', pig: 3 },
        { cx: 465, cy: 380, w: 96, h: 140, shape: 'arch', pig: 2 },
        { cx: 86, cy: 205, w: 64, h: 92, shape: 'arch', pig: 1 },
      ],
    },
  };

  /** 家の絵の、ワールド座標での位置と大きさ。 */
  function houseBox(type) {
    const h = HOUSE_IMG[type];
    const k = h.width / h.px[0];
    return { x: HOUSE_X - h.width / 2, y: GROUND + 6 - h.base * k, w: h.width, h: h.px[1] * k };
  }

  /** 画像上の点を、ワールド座標に直す。 */
  function housePoint(type, px, py) {
    const b = houseBox(type);
    const k = b.w / HOUSE_IMG[type].px[0];
    return { x: b.x + px * k, y: b.y + py * k, k };
  }

  /** 窓の、ワールド座標での中心と大きさ、形、のぞくこぶたの番号。 */
  function windowBoxes(type) {
    return (HOUSE_IMG[type].windows || []).map((win) => {
      const p = housePoint(type, win.cx, win.cy);
      return { cx: p.x, cy: p.y, w: win.w * p.k, h: win.h * p.k, shape: win.shape, pig: win.pig };
    });
  }

  /** オオカミがノックする戸の位置（ワールド座標）。 */
  function doorPoint(type) {
    const [px, py] = HOUSE_IMG[type].door;
    const p = housePoint(type, px, py);
    return { x: p.x, y: p.y };
  }

  /** 窓をのぞく絵の上に描き足すか（true なら、のぞくまで窓を出さない）。 */
  function windowOverlay(type) {
    return !!HOUSE_IMG[type].overlay;
  }

  /**
   * 窓。中は暗い部屋で、.win-slot に入れたもの（のぞくこぶた）は窓の形で切り抜かれる。
   * 窓の枠は家の材料に合わせる（わら・木は木の枠、レンガは白い枠）。
   */
  function houseWindow(type, w, i) {
    const f = (v) => v.toFixed(1);
    const x0 = w.cx - w.w / 2, x1 = w.cx + w.w / 2, y0 = w.cy - w.h / 2, y1 = w.cy + w.h / 2;
    const ys = y0 + w.w * 0.35;
    const shape = w.shape === 'rect'
      ? `M${f(x0)} ${f(y0)} H${f(x1)} V${f(y1)} H${f(x0)} Z`
      : `M${f(x0)} ${f(y1)} V${f(ys)} Q${f(x0)} ${f(y0)} ${f(w.cx)} ${f(y0)} Q${f(x1)} ${f(y0)} ${f(x1)} ${f(ys)} V${f(y1)} Z`;
    const frame = type === 'brick' ? ['#8fa79a', '#eef3ec'] : ['#8a6238', '#d9b27a'];
    const sill = type === 'brick' ? ['#e9e4dc', '#9a948a'] : ['#b98a55', '#7a5530'];
    const id = `win-${type}-${i}`;
    return `<g class="house-window" data-pig="${w.pig}">
  <defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${shape}"/></clipPath>
  ${rad(id + '-dark', [[0, '#6b5038'], [1, '#2e2219']], 0.5, 0.35, 0.75)}</defs>
  <path d="${shape}" fill="url(#${id}-dark)"/>
  <g class="win-slot" clip-path="url(#${id})"></g>
  <path d="${shape}" fill="none" stroke="${frame[0]}" stroke-width="5" stroke-linejoin="round"/>
  <path d="${shape}" fill="none" stroke="${frame[1]}" stroke-width="1.5" stroke-linejoin="round" opacity=".8"/>
  <rect x="${f(x0 - 5)}" y="${f(y1 - 2)}" width="${f(w.w + 10)}" height="6" rx="3" fill="${sill[0]}" stroke="${sill[1]}" stroke-width="1.5"/>
</g>`;
  }

  /** レンガの家のやねを、おおかみがえんとつまでのぼる道すじ（足元の位置）。 */
  const ROOF_PATH = [[426, 362], [483, 356], [524, 364]];

  function house(type) {
    const b = houseBox(type);
    const edges = [1, ...HOUSE_IMG[type].cuts, 0];
    let clips = '';
    let pieces = '';
    for (let i = 0; i < edges.length - 1; i++) {
      // 下端・上端のパーツは、画像のはみ出しも含むよう少し広めに切る
      const y0 = i === edges.length - 2 ? b.y - 40 : b.y + b.h * edges[i + 1];
      const y1 = i === 0 ? b.y + b.h + 40 : b.y + b.h * edges[i];
      const id = `hp-${type}-${i}`;
      clips += `<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="${b.x - 40}" y="${y0.toFixed(1)}" width="${b.w + 80}" height="${(y1 - y0 + 0.6).toFixed(1)}"/></clipPath>`;
      pieces += `<g class="piece" data-i="${i}" data-x="${HOUSE_X}" data-y="${Math.min(y1, GROUND).toFixed(0)}" clip-path="url(#${id})">${img(`house-${type}.webp`, b.x, b.y, b.w, b.h)}</g>`;
    }
    return `<defs>${clips}</defs><ellipse cx="${HOUSE_X}" cy="${GROUND + 4}" rx="168" ry="17" fill="url(#g-shadow)"/>${pieces}${windowBoxes(type).map((w, i) => houseWindow(type, w, i)).join('')}`;
  }

  // ---------------------------------------------------------------- 材料の山（上から順に data-k=0,1,...）

  const ITEMS = {
    straw: { file: 'item-straw.webp', w: 78, h: 44 },
    wood: { file: 'item-log.webp', w: 86, h: 43 },
    brick: { file: 'item-brick.webp', w: 42, h: 33 },
  };

  function pile(type, n) {
    const it = ITEMS[type];
    const wrap = (x, y, k) =>
      `<g transform="translate(${x} ${y})"><g class="pile-item" data-k="${k}">${img(it.file, -it.w / 2, -it.h / 2, it.w, it.h)}</g></g>`;
    let pos;
    if (type === 'straw') {
      pos = [[0, -84], [-30, -52], [30, -52], [-60, -18], [0, -18], [60, -18]].slice(-n);
    } else if (type === 'wood') {
      // 2 列に積む
      pos = [];
      for (let k = 0; k < n; k++) pos.push([(k % 2 ? 40 : -40) + (Math.floor(k / 2) % 2) * 8, -21 - Math.floor(k / 2) * 32]);
    } else {
      pos = [];
      [3, 3, 2].forEach((count, r) => {
        for (let i = 0; i < count; i++) pos.push([(i - (count - 1) / 2) * 44 + (r % 2) * 5, -15 - r * 25]);
      });
      pos = pos.slice(0, n);
    }
    // 上にあるものから順に番号をつけ（タッチで上から取っていく）、下にあるものから描く
    const order = pos.map((p, i) => [p, i]).sort((a, b) => a[0][1] - b[0][1]);
    const items = order.map(([[x, y]], k) => wrap(x, y, k)).reverse();
    return `<ellipse class="shadow" cx="0" cy="0" rx="78" ry="9"/>${items.join('')}`;
  }

  // ---------------------------------------------------------------- 背景
  //
  // 背景の絵は横 1440×縦 832。画面の形によって見える範囲が変わるので、
  // 絵のふちはぼかし、そのまわりは絵のふちに近い色でぬっておく。

  const BG_W = 1260;
  const BG_X = HOUSE_X - 640;

  /** 背景の絵を置く。horizon は、画像上で GROUND に合わせる高さ（ピクセル）。 */
  function backdrop(file, horizon, top, bottom) {
    const k = BG_W / 1440;
    const y = GROUND - horizon * k;
    const h = 832 * k;
    return `
<defs>
  <mask id="m-bg" maskUnits="userSpaceOnUse" x="${BG_X}" y="${y}" width="${BG_W}" height="${h}">
    <rect x="${BG_X}" y="${y}" width="${BG_W}" height="${h}" fill="url(#g-fade-v)"/>
  </mask>
  <mask id="m-bg2" maskUnits="userSpaceOnUse" x="${BG_X}" y="${y}" width="${BG_W}" height="${h}">
    <rect x="${BG_X}" y="${y}" width="${BG_W}" height="${h}" fill="url(#g-fade-h)"/>
  </mask>
</defs>
<rect x="-3000" y="-3000" width="7000" height="${3000 + y + h / 2}" fill="${top}"/>
<rect x="-3000" y="${y + h / 2}" width="7000" height="3000" fill="${bottom}"/>
<g mask="url(#m-bg2)"><g mask="url(#m-bg)">${img(file, BG_X, y, BG_W, h)}</g></g>`;
  }

  function outdoor() {
    return backdrop('outdoor.webp', 600, '#96c2d8', '#7c9c5d');
  }

  // ---------------------------------------------------------------- へやの中とだんろ

  /** だんろの絵。opening はたき口（上の角がまるいアーチ）の画像上の範囲 [左, 上, 右, 下]。 */
  const FIREPLACE = { file: 'fireplace.webp', px: [549, 695], opening: [160, 392, 390, 690], base: 690, width: 300 };
  const FP_X = 420;
  /** おなべの絵。rim は口（水面）の画像上の中心と半径 [cx, cy, rx, ry]。 */
  const POT = { file: 'pot.webp', px: [400, 268], rim: [200, 38, 152, 21], width: 170, top: 400 };

  function fireplaceBox() {
    const f = FIREPLACE;
    const k = f.width / f.px[0];
    const x = FP_X - f.width / 2;
    const y = GROUND + 4 - f.base * k;
    const [ox0, oy0, ox1, oy1] = f.opening;
    return {
      x, y, w: f.width, h: f.px[1] * k,
      open: { x0: x + ox0 * k, y0: y + oy0 * k, x1: x + ox1 * k, y1: y + oy1 * k },
    };
  }

  function indoor() {
    const o = fireplaceBox().open;
    const r = Math.min(60, (o.x1 - o.x0) / 2);
    return `${backdrop('indoor.webp', 680, '#e5d1c0', '#d7ae91')}
<defs>
  <clipPath id="fireplace-opening" clipPathUnits="userSpaceOnUse">
    <path d="M${o.x0} 700 V${o.y0 + r} Q${o.x0} ${o.y0} ${o.x0 + r} ${o.y0} H${o.x1 - r} Q${o.x1} ${o.y0} ${o.x1} ${o.y0 + r} V700 Z"/>
  </clipPath>
</defs>
<ellipse class="room-glow" cx="${FP_X}" cy="470" rx="420" ry="300" fill="url(#g-fireglow)"/>`;
  }

  /** だんろ（なべの後ろ側まで）。おおかみはこの手前・なべの前面の奥に入る。 */
  function fireplaceBack() {
    const b = fireplaceBox();
    const o = b.open;
    const cx = (o.x0 + o.x1) / 2;
    return `
${img(FIREPLACE.file, b.x, b.y, b.w, b.h)}
<rect class="hearth-glow" x="${o.x0 + 6}" y="${o.y0 + 6}" width="${o.x1 - o.x0 - 12}" height="${o.y1 - o.y0 - 10}" rx="30" fill="url(#g-fireglow)" opacity=".6"/>
<g class="fire" transform="translate(${cx - 420} 10)">
  <rect x="368" y="518" width="104" height="15" rx="7" fill="#7b4c2f" transform="rotate(-8 420 526)"/>
  <rect x="368" y="518" width="104" height="15" rx="7" fill="#946039" transform="rotate(8 420 526)"/>
  <ellipse cx="420" cy="520" rx="60" ry="16" fill="#ffb04f" opacity=".55" filter="url(#f-soft)"/>
  <path class="flame f1" d="M420 524 C380 520 382 480 404 462 C404 482 414 486 416 476 C414 456 428 440 440 432 C436 456 462 470 456 500 C454 518 440 524 420 524 Z" fill="url(#g-flame)"/>
  <path class="flame f2" d="M420 522 C400 520 398 498 410 486 C412 498 418 500 420 494 C420 482 428 474 434 470 C434 486 446 494 442 508 C440 518 432 522 420 522 Z" fill="#fff0b0" opacity=".85"/>
</g>`;
  }

  /** おなべ（前面）と水面・あわ・湯気。おおかみがすべりおりると、この奥に入る。 */
  function fireplaceFront() {
    const k = POT.width / POT.px[0];
    const x = FP_X - POT.width / 2;
    const [rx, ry, rr, rv] = POT.rim;
    const cx = x + rx * k;
    const cy = POT.top + ry * k;
    return `
${img(POT.file, x, POT.top, POT.width, POT.px[1] * k)}
<ellipse class="water" cx="${cx}" cy="${cy}" rx="${(rr * k).toFixed(1)}" ry="${(rv * k).toFixed(1)}" fill="url(#g-water)"/>
<g class="bubbles" fill="#eaf8ff" transform="translate(${cx - 420} ${cy - 423})">
  <circle class="bub b1" cx="392" cy="422" r="5"/><circle class="bub b2" cx="430" cy="420" r="6"/><circle class="bub b3" cx="455" cy="425" r="4"/>
</g>
<g class="steam" ${line(8, 'rgba(255,255,255,.75)')} transform="translate(${cx - 420} ${cy - 423})">
  <path class="st s1" d="M392 400 q-12 -18 0 -34 q12 -18 0 -34"/>
  <path class="st s2" d="M426 396 q-12 -18 0 -34 q12 -18 0 -34"/>
  <path class="st s3" d="M458 402 q-12 -18 0 -34 q12 -18 0 -34"/>
</g>`;
  }

  /** 水さし。そそぎ口は右上。 */
  function pitcher() {
    const w = 84;
    const h = w * 240 / 224;
    return `<ellipse class="shadow" cx="0" cy="40" rx="34" ry="6" opacity=".6"/>
    <g class="a-body">${img('pitcher.webp', -w / 2, 40 - h, w, h)}</g>`;
  }

  /** 先に読みこんでおく画像（表情を切り替えたときに一瞬消えないように）。 */
  function images() {
    const list = [];
    for (const n of [1, 2, 3]) for (const f of PIG_FACES) list.push(`pig${n}${f === 'n' ? '' : '-' + f}.webp`);
    for (const f of WOLF_FACES) list.push(`wolf${f === 'n' ? '' : '-' + f}.webp`);
    for (const t of Object.keys(HOUSE_IMG)) list.push(`house-${t}.webp`);
    for (const t of Object.keys(ITEMS)) list.push(ITEMS[t].file);
    list.push('outdoor.webp', 'indoor.webp', FIREPLACE.file, POT.file, 'pitcher.webp');
    return list.map((f) => DIR + f);
  }

  // ---------------------------------------------------------------- ヒントと効果

  /** さわってほしいものの後ろに出す、やわらかい光ときらきら（r は光の半径）。 */
  function beckon(r) {
    const sparkle = (x, y, k, d) => `<g transform="translate(${x} ${y})"><path class="bk-star" style="animation-delay:${d}s" transform="scale(${k})" d="M0 -13 Q2 -2 13 0 Q2 2 0 13 Q-2 2 -13 0 Q-2 -2 0 -13 Z" fill="#fff8c4"/></g>`;
    return `<g class="beckon-fx">
      <circle class="bk-glow" r="${r}" fill="url(#g-beckon)"/>
      <circle class="bk-ring" r="${r * 0.8}" fill="none" stroke="#fff" stroke-width="4"/>
      ${sparkle(-r * 0.75, -r * 0.55, 1.1, 0)}
      ${sparkle(r * 0.8, -r * 0.3, 0.9, 0.35)}
      ${sparkle(-r * 0.2, -r * 0.95, 0.8, 0.7)}
      ${sparkle(r * 0.45, r * 0.55, 0.7, 1.05)}
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
    GROUND, HOUSE_X, WOLF_MOUTH, ROOF_PATH, windowBoxes, windowOverlay, doorPoint,
    defs, pig, wolf, house, pile, outdoor, indoor, fireplaceBack, fireplaceFront, pitcher,
    beckon, wind, heart, star, images,
  };
})(typeof self !== 'undefined' ? self : this);
