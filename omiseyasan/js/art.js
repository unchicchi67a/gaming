/**
 * 絵。画像ファイルは使わず、SVG の文字列を返す。
 *
 * - Art.item(id)：品物（viewBox 0 0 100 100）
 * - Art.customer(id)：お客さん（viewBox 0 0 200 240、上半身。下はカウンターにかくれる）
 *   表情は CSS クラスで切り替える（.customer--happy / .customer--puzzled）
 * - Art.heart() / Art.star()：演出用の小さな絵
 *
 * 文字列を返すだけなので、Node.js からも読み込める（テストで全品物の絵があるか確かめる）。
 */
(function (root) {
  'use strict';

  const LINE = '#4a3b33';
  const sw = (w) => `stroke="${LINE}" stroke-width="${w || 3}" stroke-linejoin="round" stroke-linecap="round"`;

  /** 品物の下に敷く影。 */
  const shadow = (cx, w) => `<ellipse cx="${cx || 50}" cy="91" rx="${w || 30}" ry="5" fill="#000" opacity=".1"/>`;

  const wrap = (body) => `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

  // ------------------------------------------------------------ やおやさん

  const ITEMS = {
    carrot: () => `${shadow(52, 26)}
      <path d="M44 22c-6-10-4-16 2-17-1 6 1 10 4 14 1-7 5-11 11-11-3 5-4 10-6 15" fill="#6fbf5a" ${sw(2.5)}/>
      <path d="M36 28c10-6 26-6 32 2 5 7-6 24-16 40-5 8-9 16-12 18-3 1-4-8-6-18-3-16-7-36 2-42z" fill="#f28c38" ${sw()}/>
      <path d="M42 40h9M44 54h8M47 68h6M56 46h6" fill="none" stroke="#c9631f" stroke-width="2.5" stroke-linecap="round"/>`,

    daikon: () => `${shadow(50, 22)}
      <path d="M50 30c-10-8-14-18-10-25 5 2 8 9 10 15 2-8 6-14 12-15 2 8-2 17-8 23" fill="#79c15c" ${sw(2.5)}/>
      <path d="M44 22c-8-4-14-3-16 2 6 0 10 3 14 7" fill="#8fd06c" ${sw(2.5)}/>
      <path d="M38 30c8-4 18-4 24 0 4 14 2 36-4 50-3 7-6 11-8 11s-5-4-8-11c-6-14-8-36-4-50z" fill="#fbfaf3" ${sw()}/>
      <path d="M38 30c8-4 18-4 24 0 1 6 1 10 0 13-8 3-16 3-24 0-1-4-1-8 0-13z" fill="#d9eec4"/>
      <path d="M38 30c8-4 18-4 24 0" fill="none" ${sw()}/>
      <path d="M45 56h6M49 70h5" fill="none" stroke="#d8d2c2" stroke-width="2.5" stroke-linecap="round"/>`,

    tomato: () => `${shadow(50, 32)}
      <path d="M50 30c20-2 36 12 34 32-2 18-16 28-34 28S16 80 16 62c-2-20 14-34 34-32z" fill="#ec4a3c" ${sw()}/>
      <path d="M30 46c3-5 9-8 14-8" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".6"/>
      <path d="M50 34l-6-8-10 4 8-8-6-8 12 6 4-8 3 9 11-4-7 9 9 6-11 0z" fill="#5ab04a" ${sw(2.5)}/>
      <path d="M50 22v-9" ${sw(3)} fill="none"/>`,

    cabbage: () => `${shadow(50, 34)}
      <circle cx="50" cy="56" r="34" fill="#a7d978" ${sw()}/>
      <path d="M22 70c4-22 18-34 36-36 12 0 20 6 26 14" fill="none" ${sw(2.5)}/>
      <path d="M24 52c8-16 26-22 42-16" fill="none" ${sw(2.5)}/>
      <path d="M50 88c-2-16 0-34 10-48M50 70c-8-4-14-4-20-2M54 58c8-4 14-4 20 0" fill="none" stroke="#e3f3cf" stroke-width="3" stroke-linecap="round"/>`,

    eggplant: () => `${shadow(50, 30)}
      <path d="M58 30c14 4 22 18 20 34-2 16-14 26-28 26S22 82 22 70c0-14 14-16 20-24 4-6 6-18 16-16z" fill="#7a4aa0" ${sw()}/>
      <path d="M34 72c2 6 8 10 14 10" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" opacity=".45"/>
      <path d="M48 36c2-8 8-12 16-12s14 4 16 10c-6-2-10 0-14 4-4-4-12-5-18-2z" fill="#4f9a45" ${sw(2.5)}/>
      <path d="M66 24c0-6 2-10 6-14" ${sw(3)} fill="none"/>`,

    corn: () => `${shadow(52, 26)}
      <path d="M38 34c0-14 6-26 14-26s14 12 14 26v28c0 14-6 26-14 26s-14-12-14-26z" fill="#f7cf3c" ${sw()}/>
      <g fill="none" stroke="#d9a51e" stroke-width="2" stroke-linecap="round">
        <path d="M40 26h24M39 36h26M38 46h28M38 56h28M39 66h26M41 76h22"/>
        <path d="M47 12v74M57 12v74"/>
      </g>
      <path d="M36 50c-12 8-16 24-10 40 8 0 16-6 22-14" fill="#7cc35f" ${sw(2.5)}/>
      <path d="M68 50c12 8 16 24 10 40-8 0-16-6-22-14" fill="#68b04e" ${sw(2.5)}/>`,

    // ---------------------------------------------------------- くだものやさん

    apple: () => `${shadow(50, 32)}
      <path d="M50 32c-8-6-26-8-32 8-6 16 2 36 12 44 7 6 14 6 20 2 6 4 13 4 20-2 10-8 18-28 12-44-6-16-24-14-32-8z" fill="#e6403a" ${sw()}/>
      <path d="M28 48c2-6 6-9 11-10" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".55"/>
      <path d="M50 32c0-8 2-14 6-20" ${sw(3.5)} fill="none"/>
      <path d="M56 22c4-8 14-10 20-8-2 8-10 12-20 8z" fill="#66b84f" ${sw(2.5)}/>`,

    banana: () => `${shadow(52, 34)}
      <path d="M22 30c-4 22 6 44 28 52 14 5 28 2 36-4-2-4-6-4-10-3-20 4-38-10-44-32-2-6-4-12-10-13z" fill="#f8d23c" ${sw()}/>
      <path d="M30 26c0 22 14 40 34 44 10 2 20 0 26-6-2-3-6-4-10-2-18 6-34-6-40-26-2-6-4-10-10-10z" fill="#fde15a" ${sw()}/>
      <path d="M22 30l-2-8 8 0 2 4" fill="#8a6a2e" ${sw(2.5)}/>
      <path d="M86 78l4 2M90 64l4 0" ${sw(3)} fill="none"/>`,

    mikan: () => `${shadow(50, 34)}
      <ellipse cx="50" cy="58" rx="36" ry="31" fill="#f8a02e" ${sw()}/>
      <g fill="#e07f12" opacity=".7">
        <circle cx="34" cy="62" r="1.6"/><circle cx="44" cy="74" r="1.6"/><circle cx="60" cy="70" r="1.6"/>
        <circle cx="70" cy="56" r="1.6"/><circle cx="56" cy="48" r="1.6"/><circle cx="40" cy="48" r="1.6"/>
        <circle cx="66" cy="78" r="1.6"/><circle cx="28" cy="72" r="1.6"/>
      </g>
      <path d="M28 50c3-6 8-10 14-11" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".5"/>
      <path d="M44 30c4 4 8 4 12 0-4-4-8-4-12 0z" fill="#5a9a3e" ${sw(2.5)}/>
      <path d="M54 28c6-8 16-10 22-6-4 8-14 10-22 6z" fill="#6cbc52" ${sw(2.5)}/>`,

    grapes: () => {
      const balls = [[36, 34], [52, 32], [68, 34], [28, 50], [44, 50], [60, 50], [76, 50], [36, 66], [52, 66], [68, 66], [44, 81], [60, 81]];
      return `${shadow(52, 26)}
      ${balls.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5" fill="#8a4fb5" ${sw(2.5)}/><circle cx="${x - 3}" cy="${y - 3}" r="2.6" fill="#fff" opacity=".55"/>`).join('')}
      <path d="M52 24c0-8 2-12 6-16" ${sw(3.5)} fill="none"/>
      <path d="M56 14c8-6 18-4 22 2-8 6-16 4-22-2z" fill="#6cbc52" ${sw(2.5)}/>`;
    },

    strawberry: () => `${shadow(50, 28)}
      <path d="M50 88c-14-6-30-24-30-42 0-12 10-18 30-18s30 6 30 18c0 18-16 36-30 42z" fill="#ef3e4a" ${sw()}/>
      <g fill="#ffe79a">
        <ellipse cx="38" cy="44" rx="2" ry="3"/><ellipse cx="52" cy="42" rx="2" ry="3"/><ellipse cx="66" cy="45" rx="2" ry="3"/>
        <ellipse cx="32" cy="56" rx="2" ry="3"/><ellipse cx="45" cy="56" rx="2" ry="3"/><ellipse cx="58" cy="56" rx="2" ry="3"/><ellipse cx="70" cy="57" rx="2" ry="3"/>
        <ellipse cx="40" cy="68" rx="2" ry="3"/><ellipse cx="53" cy="69" rx="2" ry="3"/><ellipse cx="64" cy="68" rx="2" ry="3"/>
        <ellipse cx="48" cy="80" rx="2" ry="3"/><ellipse cx="57" cy="79" rx="2" ry="3"/>
      </g>
      <path d="M50 32l-14 2 8-8-10-6 14 2 2-10 6 10 12-4-6 10 14 4-14 2z" fill="#5cb048" ${sw(2.5)}/>`,

    watermelon: () => `${shadow(50, 38)}
      <path d="M10 40h80c0 26-18 46-40 46S10 66 10 40z" fill="#4c9a3a" ${sw()}/>
      <path d="M17 40h66c0 21-15 39-33 39S17 61 17 40z" fill="#f4f8e8"/>
      <path d="M21 40h58c0 18-13 34-29 34S21 58 21 40z" fill="#f2545b"/>
      <path d="M10 40h80" ${sw()} fill="none"/>
      <g fill="#3a2c26">
        <ellipse cx="34" cy="50" rx="2" ry="3.2"/><ellipse cx="50" cy="52" rx="2" ry="3.2"/><ellipse cx="66" cy="50" rx="2" ry="3.2"/>
        <ellipse cx="42" cy="62" rx="2" ry="3.2"/><ellipse cx="58" cy="62" rx="2" ry="3.2"/>
      </g>`,

    // ---------------------------------------------------------- パンやさん

    shokupan: () => `${shadow(50, 34)}
      <path d="M22 46c-10-2-12-22 4-26 8-2 14 0 18 2 4-4 18-4 24 0 6-4 16-2 20 4 6 10 0 20-8 20v38H22z" fill="#c8843f" ${sw()}/>
      <path d="M28 46c-6-2-6-14 2-18 6-2 11 0 15 3 4-4 12-4 18 0 6-4 13-3 16 2 4 6 0 13-5 13v36H28z" fill="#fbecc8"/>
      <path d="M38 60c4 2 6 6 4 10M58 56c3 4 3 8 0 11" fill="none" stroke="#ead3a2" stroke-width="2.5" stroke-linecap="round"/>`,

    melonpan: (uid) => `${shadow(50, 36)}
      <path d="M12 66c0-24 18-40 38-40s38 16 38 40c0 10-8 16-38 16S12 76 12 66z" fill="#f4d778" ${sw()}/>
      <clipPath id="mp-clip-${uid}"><path d="M12 66c0-24 18-40 38-40s38 16 38 40c0 10-8 16-38 16S12 76 12 66z"/></clipPath>
      <g clip-path="url(#mp-clip-${uid})" fill="none" stroke="#d9ae46" stroke-width="2.5">
        <path d="M0 50l50 50M10 30l60 60M25 20l60 60M40 15l50 50M55 10l40 40M-5 65l35 35"/>
        <path d="M100 50L50 100M90 30L30 90M75 20L15 80M60 15L10 65M45 10L5 50M105 65L70 100"/>
      </g>
      <path d="M26 46c4-6 10-10 16-11" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" opacity=".55"/>`,

    croissant: () => `${shadow(50, 38)}
      <path d="M10 64c-2-6 4-12 10-10l6-14c2-6 10-8 14-4l4-4c4-4 8-4 12 0l4 4c4-4 12-2 14 4l6 14c6-2 12 4 10 10-2 6-10 6-14 4l-8 4c-4 6-12 6-16 2H46c-4 4-12 4-16-2l-8-4c-4 2-12 2-12-4z" fill="#e2a24d" ${sw()}/>
      <path d="M26 40l6 22M40 32l4 28M56 32l-2 28M70 40l-6 22" fill="none" stroke="#b97627" stroke-width="2.5" stroke-linecap="round"/>
      <path d="M34 42c4-4 8-6 12-6" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".5"/>`,

    donut: () => {
      const sprinkles = [[34, 40, '#7cc6f0', 30], [50, 34, '#fff07a', -20], [66, 40, '#8fd77a', 60], [72, 56, '#7cc6f0', -40], [28, 58, '#fff07a', 10], [40, 70, '#8fd77a', -60], [60, 71, '#fff', 30]];
      return `${shadow(50, 38)}
      <path d="M50 22c22 0 38 14 38 32S72 86 50 86 12 72 12 54s16-32 38-32zm0 22c-7 0-12 4-12 10s5 10 12 10 12-4 12-10-5-10-12-10z" fill="#d9954a" fill-rule="evenodd" ${sw()}/>
      <path d="M50 26c20 0 34 12 34 28 0 6-4 8-8 6-4 6-10 2-14 6-4-2-6-6-12-6s-8 4-12 6c-4-4-10 0-14-6-4 2-8 0-8-6 0-16 14-28 34-28zm0 18c-7 0-12 4-12 10s5 10 12 10 12-4 12-10-5-10-12-10z" fill="#f7a1bf" fill-rule="evenodd" ${sw(2.5)}/>
      ${sprinkles.map(([x, y, c, r]) => `<rect x="${x - 4}" y="${y - 1.6}" width="8" height="3.2" rx="1.6" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`).join('')}`;
    },

    baguette: () => `${shadow(50, 40)}
      <path d="M14 78c-6-6-2-14 8-22l46-40c8-6 16-6 20-2s2 12-6 20L36 76c-8 8-16 8-22 2z" fill="#d79a4c" ${sw()}/>
      <path d="M30 60l10 6M44 46l10 7M58 34l10 7M72 22l8 6" fill="none" stroke="#f7dca4" stroke-width="5" stroke-linecap="round"/>
      <path d="M30 60l10 6M44 46l10 7M58 34l10 7M72 22l8 6" fill="none" stroke="#a96a26" stroke-width="1.6" stroke-linecap="round" opacity=".5"/>`,

    hotdog: () => `${shadow(50, 40)}
      <path d="M8 54c-4 10 2 22 14 24h56c12-2 18-14 14-24-4-6-10-6-16-2H24c-6-4-12-4-16 2z" fill="#e3a453" ${sw()}/>
      <path d="M12 50c-6-8 0-16 10-14h56c10-2 16 6 10 14-2 4-8 6-14 4H26c-6 2-12 0-14-4z" fill="#d6463e" ${sw()}/>
      <path d="M20 44c6-6 10 6 16 0s10 6 16 0 10 6 16 0 10 6 14 0" fill="none" stroke="#fcd34a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M20 64h60" fill="none" stroke="#f6cf8e" stroke-width="4" stroke-linecap="round" opacity=".8"/>`,
  };

  /** 同じ絵を何枚も出すので、clipPath の id が重ならないよう通し番号をつける。 */
  let uidSeq = 0;

  function item(id) {
    const fn = ITEMS[id];
    return fn ? wrap(fn(++uidSeq)) : wrap('');
  }

  // ------------------------------------------------------------ お客さん

  const LOOKS = {
    rabbit: { fur: '#fbf6ee', inner: '#f7b8c4', muzzle: '#ffffff', shirt: '#f39bb4', collar: '#ffffff' },
    bear: { fur: '#b27a4c', inner: '#e3b98d', muzzle: '#ecd1ac', shirt: '#6fb6e8', collar: '#ffffff' },
    cat: { fur: '#f3b867', inner: '#f8c9b0', muzzle: '#fff4e2', shirt: '#8fd18a', collar: '#ffffff' },
    dog: { fur: '#efd8b0', inner: '#a5703f', muzzle: '#fffaf0', shirt: '#f7c84a', collar: '#e8574f' },
    panda: { fur: '#ffffff', inner: '#3b3433', muzzle: '#ffffff', shirt: '#e86f5c', collar: '#ffffff' },
  };

  function ears(id, c) {
    switch (id) {
      case 'rabbit':
        return `<g class="c-ear c-ear--l"><path d="M66 70c-10-24-12-56 2-62 14 2 16 34 14 62z" fill="${c.fur}" ${sw()}/><path d="M70 64c-5-18-6-40 0-46 6 4 7 26 6 46z" fill="${c.inner}"/></g>
                <g class="c-ear c-ear--r"><path d="M134 70c10-24 12-56-2-62-14 2-16 34-14 62z" fill="${c.fur}" ${sw()}/><path d="M130 64c5-18 6-40 0-46-6 4-7 26-6 46z" fill="${c.inner}"/></g>`;
      case 'bear':
      case 'panda': {
        const fill = id === 'panda' ? c.inner : c.fur;
        return `<circle cx="52" cy="66" r="20" fill="${fill}" ${sw()}/><circle cx="148" cy="66" r="20" fill="${fill}" ${sw()}/>
                ${id === 'bear' ? `<circle cx="52" cy="66" r="10" fill="${c.inner}"/><circle cx="148" cy="66" r="10" fill="${c.inner}"/>` : ''}`;
      }
      case 'cat':
        return `<path d="M44 92l6-46 34 22z" fill="${c.fur}" ${sw()}/><path d="M52 82l3-24 18 12z" fill="${c.inner}"/>
                <path d="M156 92l-6-46-34 22z" fill="${c.fur}" ${sw()}/><path d="M148 82l-3-24-18 12z" fill="${c.inner}"/>`;
      default:
        return '';
    }
  }

  /** 犬のたれ耳は顔の上に重ねる。 */
  function frontEars(id, c) {
    if (id !== 'dog') return '';
    return `<path d="M52 78c-14 6-20 30-12 50 10 4 18-6 22-18 2-10 2-22-2-30z" fill="${c.inner}" ${sw()}/>
            <path d="M148 78c14 6 20 30 12 50-10 4-18-6-22-18-2-10-2-22 2-30z" fill="${c.inner}" ${sw()}/>`;
  }

  function faceMarks(id, c) {
    if (id === 'panda') {
      return `<ellipse cx="76" cy="110" rx="15" ry="18" fill="${c.inner}" transform="rotate(-25 76 110)"/>
              <ellipse cx="124" cy="110" rx="15" ry="18" fill="${c.inner}" transform="rotate(25 124 110)"/>`;
    }
    if (id === 'cat') {
      return `<path d="M92 62l2 12M100 60v14M108 62l-2 12" stroke="#d98b38" stroke-width="4" stroke-linecap="round"/>`;
    }
    return '';
  }

  function customer(id) {
    const c = LOOKS[id] || LOOKS.bear;
    const uid = ++uidSeq;
    const panda = id === 'panda';
    const eyeColor = panda ? '#ffffff' : '#3b3433';
    const shine = panda ? '#3b3433' : '#ffffff';
    const whiskers = id === 'cat' || id === 'rabbit'
      ? `<path d="M56 128l-20-4M56 136l-20 4M144 128l20-4M144 136l20 4" stroke="${LINE}" stroke-width="2.2" stroke-linecap="round" opacity=".7"/>`
      : '';
    const nose = id === 'rabbit'
      ? `<path d="M95 124h10l-5 6z" fill="#f08aa0" ${sw(2)}/>`
      : `<ellipse cx="100" cy="125" rx="9" ry="6.5" fill="#3b3433"/><ellipse cx="97" cy="123" rx="3" ry="1.8" fill="#fff" opacity=".6"/>`;
    const head = 'M36 112a64 58 0 1 0 128 0a64 58 0 1 0 -128 0z';
    const body = 'M38 240c0-50 26-76 62-76s62 26 62 76z';
    return `<svg viewBox="0 0 200 240" preserveAspectRatio="xMidYMax meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <clipPath id="c-head-${uid}"><path d="${head}"/></clipPath>
        <clipPath id="c-body-${uid}"><path d="${body}"/></clipPath>
      </defs>
      <g class="c-body">
        <path d="${body}" fill="${c.shirt}"/>
        <g clip-path="url(#c-body-${uid})"><ellipse cx="150" cy="250" rx="70" ry="60" fill="#000" opacity=".1"/></g>
        <path d="${body}" fill="none" ${sw()}/>
        <path d="M80 168l20 18 20-18" fill="${c.collar}" ${sw(2.5)}/>
        <circle cx="100" cy="204" r="4" fill="#fff" ${sw(2)}/><circle cx="100" cy="224" r="4" fill="#fff" ${sw(2)}/>
      </g>
      <g class="c-head">
        ${ears(id, c)}
        <path d="${head}" fill="${c.fur}"/>
        <g clip-path="url(#c-head-${uid})">
          <ellipse cx="128" cy="168" rx="80" ry="40" fill="#000" opacity=".07"/>
          <ellipse cx="74" cy="72" rx="26" ry="12" fill="#fff" opacity=".35" transform="rotate(-20 74 72)"/>
        </g>
        <path d="${head}" fill="none" ${sw()}/>
        ${faceMarks(id, c)}
        ${frontEars(id, c)}
        <ellipse cx="100" cy="132" rx="26" ry="19" fill="${c.muzzle}" ${id === 'dog' || id === 'bear' ? '' : 'opacity="0"'}/>
        <g class="c-eyes-open">
          <g class="c-eye"><ellipse cx="76" cy="108" rx="7" ry="9" fill="${eyeColor}"/><circle cx="78.5" cy="104.5" r="2.6" fill="${shine}"/></g>
          <g class="c-eye"><ellipse cx="124" cy="108" rx="7" ry="9" fill="${eyeColor}"/><circle cx="126.5" cy="104.5" r="2.6" fill="${shine}"/></g>
        </g>
        <g class="c-eyes-happy" fill="none" stroke="${eyeColor}" stroke-width="5" stroke-linecap="round">
          <path d="M67 110q9-11 18 0M115 110q9-11 18 0"/>
        </g>
        <ellipse cx="62" cy="134" rx="10" ry="6" fill="#f59ca8" opacity=".55"/>
        <ellipse cx="138" cy="134" rx="10" ry="6" fill="#f59ca8" opacity=".55"/>
        ${whiskers}
        ${nose}
        <path class="c-mouth-smile" d="M88 136q6 7 12 0q6 7 12 0" fill="none" ${sw(2.6)}/>
        <path class="c-mouth-happy" d="M86 136q14 2 28 0q-2 16-14 16t-14-16z" fill="#e8606f" ${sw(2.6)}/>
        <ellipse class="c-mouth-puzzled" cx="104" cy="142" rx="5" ry="4" fill="#e8606f" ${sw(2.4)}/>
      </g>
      <g class="c-hold">
        <rect class="c-held-box" x="58" y="160" width="84" height="84" fill="none"/>
        <g class="c-held"></g>
        <g class="c-paws">
          <ellipse cx="60" cy="222" rx="15" ry="13" fill="${c.fur === '#ffffff' ? '#3b3433' : c.fur}" ${sw()}/>
          <ellipse cx="140" cy="222" rx="15" ry="13" fill="${c.fur === '#ffffff' ? '#3b3433' : c.fur}" ${sw()}/>
        </g>
      </g>
      <g class="c-question">
        <path d="M168 40c0-10 8-16 16-16s14 6 14 13c0 9-12 10-12 20" fill="none" stroke="#6c8fd8" stroke-width="7" stroke-linecap="round"/>
        <circle cx="186" cy="70" r="4.5" fill="#6c8fd8"/>
      </g>
    </svg>`;
  }

  /** お客さんが受け取った品物を、手もとに描きこむ（SVG の中に入れ子の svg として置く）。 */
  function heldItem(itemId) {
    return item(itemId).replace('<svg ', '<svg x="58" y="160" width="84" height="84" ');
  }

  function heart(color) {
    return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20 35C8 26 3 19 3 12c0-5 4-9 9-9 4 0 7 2 8 6 1-4 4-6 8-6 5 0 9 4 9 9 0 7-5 14-17 23z" fill="${color || '#f47c93'}" stroke="#fff" stroke-width="2.5"/></svg>`;
  }

  function star(color) {
    return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20 3l4.6 10.6L36 15l-8.6 7.8L30 34l-10-6-10 6 2.6-11.2L4 15l11.4-1.4z" fill="${color || '#ffd84a'}" stroke="#fff" stroke-width="2"/></svg>`;
  }

  /** スタンプカードに押す、お花のスタンプ。 */
  function stamp() {
    const petals = [0, 72, 144, 216, 288].map((r) => `<ellipse cx="20" cy="9.5" rx="7" ry="8.5" transform="rotate(${r} 20 20)"/>`).join('');
    return `<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <g fill="#ef5f7a" opacity=".92">${petals}</g>
      <circle cx="20" cy="20" r="6.5" fill="#ffd23f"/>
    </svg>`;
  }

  /** 雲。 */
  function cloud() {
    return `<svg viewBox="0 0 160 70" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M24 62c-14 0-22-8-20-18 2-9 12-13 20-10 2-14 16-24 32-20 6-10 22-14 34-6 10-8 30-4 34 10 14-2 26 8 24 22-1 8-8 12-16 12z" fill="#fff"/>
      <path d="M24 62c-10 0-16-4-18-10 20 4 120 4 148-2-2 8-8 12-16 12z" fill="#dcefff"/>
    </svg>`;
  }

  /** お店の向こうに見える町（横長。画面の幅に合わせて左右が切れる）。 */
  function town() {
    const house = (x, w, h, wall, roof) => `
      <g transform="translate(${x} ${300 - h})">
        <path d="M-8 ${h * 0.38}L${w / 2} -6L${w + 8} ${h * 0.38}z" fill="${roof}" ${sw(3)}/>
        <rect x="0" y="${h * 0.36}" width="${w}" height="${h * 0.64}" fill="${wall}" ${sw(3)}/>
        <rect x="${w * 0.18}" y="${h * 0.52}" width="${w * 0.24}" height="${h * 0.2}" rx="3" fill="#bfe6fb" ${sw(2.5)}/>
        <rect x="${w * 0.58}" y="${h * 0.6}" width="${w * 0.24}" height="${h * 0.4}" rx="3" fill="#b9784a" ${sw(2.5)}/>
      </g>`;
    const tree = (x, s) => `
      <g transform="translate(${x} 300) scale(${s})">
        <rect x="-6" y="-34" width="12" height="34" fill="#a8703f" ${sw(3)}/>
        <circle cx="0" cy="-58" r="30" fill="#7cc76a" ${sw(3)}/>
        <circle cx="-10" cy="-66" r="9" fill="#a3dc8c"/>
      </g>`;
    return `<svg viewBox="0 0 1200 340" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M0 230C160 170 300 190 420 220S700 160 860 200 1100 170 1200 210V340H0z" fill="#b5e3a0"/>
      <path d="M0 260C200 220 360 250 520 250S860 220 1200 250V340H0z" fill="#9dd68a"/>
      ${tree(120, 1)}${house(190, 110, 130, '#fff1d6', '#ef8a6c')}${tree(345, .85)}
      ${house(420, 90, 110, '#e3f1ff', '#6fa8dc')}${tree(560, 1.1)}
      ${house(640, 120, 140, '#fde4ec', '#e57a9a')}${tree(800, .9)}
      ${house(870, 100, 120, '#fff7c9', '#e8a74a')}${tree(1020, 1)}${tree(1090, .8)}
      <rect x="0" y="296" width="1200" height="44" fill="#f2dcb3"/>
      <path d="M0 296h1200" ${sw(3)}/>
      <path d="M40 318h60M220 326h40M480 314h70M760 324h50M1000 316h60" stroke="#e0c595" stroke-width="5" stroke-linecap="round"/>
    </svg>`;
  }

  /** タイトル画面で選ぶ、お店の外観。 */
  const FRONT = {
    yaoya: { awning: '#57b947', wall: '#fff4dd', sign: '#f3c98b' },
    kudamono: { awning: '#ff9a2e', wall: '#fff4e8', sign: '#ffe3a6' },
    panya: { awning: '#a8643a', wall: '#fff6ea', sign: '#f6d7a8' },
  };

  function storefront(shopId, itemIds) {
    const f = FRONT[shopId] || FRONT.yaoya;
    // ななめのひさしを 6 本のしまに分け、下のふちを波形にする
    let awning = '';
    for (let i = 0; i < 6; i++) {
      const t0 = 34 + i * 25.33;
      const t1 = t0 + 25.33;
      const b0 = 8 + i * 34;
      const b1 = b0 + 34;
      const col = i % 2 ? '#fff' : f.awning;
      awning += `<path d="M${t0} 52H${t1}L${b1} 98a17 17 0 0 1-34 0z" fill="${col}" ${sw(3.5)}/>`;
    }
    const goods = (itemIds || []).slice(0, 3).map((id, i) =>
      item(id).replace('<svg ', `<svg x="${36 + i * 50}" y="138" width="48" height="48" `)).join('');
    return `<svg viewBox="0 0 220 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="110" cy="242" rx="98" ry="7" fill="#000" opacity=".14"/>
      <rect x="16" y="90" width="188" height="150" fill="${f.wall}" ${sw(4)}/>
      <rect x="30" y="126" width="160" height="72" rx="6" fill="#dff3ff" ${sw(3.5)}/>
      <path d="M36 134h40" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".8"/>
      ${goods}
      <rect x="22" y="192" width="176" height="20" rx="5" fill="#e3a764" ${sw(3.5)}/>
      <path d="M26 203h168" stroke="#c4843f" stroke-width="2.5"/>
      ${awning}
      <path d="M70 8v18M150 8v18" ${sw(3)}/>
      <rect x="44" y="18" width="132" height="34" rx="10" fill="${f.sign}" ${sw(4)}/>
      <path d="M16 240h188" ${sw(4)}/>
    </svg>`;
  }

  const Art = {
    ITEM_IDS: Object.keys(ITEMS),
    CUSTOMER_IDS: Object.keys(LOOKS),
    item,
    customer,
    heldItem,
    heart,
    star,
    stamp,
    cloud,
    town,
    storefront,
  };

  if (typeof module === 'object' && module.exports) module.exports = Art;
  root.ShopArt = Art;
})(typeof self !== 'undefined' ? self : this);
