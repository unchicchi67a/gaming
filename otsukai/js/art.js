/**
 * おつかいゲームの絵。画像ファイルは使わず、SVG の文字列を返す。
 *
 * 品物・お店の外観・町の絵は「おみせやさんごっこ」の omiseyasan/js/art.js（ShopArt）を使い、
 * ここではこのゲームだけで使う絵を描く。
 * - Art.mother()：お母さん（うさぎ。ShopArt.customer の絵にエプロンを足す）。表情は CSS クラスで切り替える
 * - Art.house()：おうち（ShopArt.storefront と同じ大きさ。地図にならべる）
 * - Art.basket()：買いものかご
 * - Art.flower()：「できた」のスタンプ
 *
 * 文字列を返すだけなので、Node.js からも読み込める。
 */
(function (root) {
  'use strict';

  const ShopArt = (typeof module === 'object' && module.exports)
    ? require('../../omiseyasan/js/art.js')
    : root.ShopArt;

  const LINE = '#4a3b33';
  const sw = (w) => `stroke="${LINE}" stroke-width="${w || 3}" stroke-linejoin="round" stroke-linecap="round"`;

  /** お母さん。うさぎのお客さんの絵に、エプロンと髪かざりを足す。 */
  function mother() {
    const apron = `
      <g class="m-apron">
        <path d="M74 176c8 6 18 9 26 9s18-3 26-9l6 64H68z" fill="#fff" ${sw(3)}/>
        <path d="M68 240l3-26h58l3 26" fill="#ffd9e2" ${sw(2.5)}/>
        <path d="M84 200h32v14H84z" fill="#ffd9e2" ${sw(2.5)}/>
        <path d="M74 176l-10-12M126 176l10-12" ${sw(3)}/>
      </g>`;
    const ribbon = `
      <g class="m-ribbon" transform="translate(132 58) rotate(18)">
        <path d="M0 0l-18-11v22zM0 0l18-11v22z" fill="#ff8fab" ${sw(2.5)}/>
        <circle r="5" fill="#ffd23f" ${sw(2.5)}/>
      </g>`;
    return ShopArt.customer('rabbit')
      .replace('<g class="c-head">', `${apron}<g class="c-head">`)
      .replace('<g class="c-eyes-open">', `${ribbon}<g class="c-eyes-open">`);
  }

  /** おうち（viewBox は ShopArt.storefront と同じ 0 0 220 250）。 */
  function house() {
    return `<svg viewBox="0 0 220 250" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <ellipse cx="110" cy="242" rx="98" ry="7" fill="#000" opacity=".14"/>
      <rect x="150" y="30" width="26" height="50" fill="#d9a073" ${sw(4)}/>
      <rect x="30" y="104" width="160" height="136" fill="#fff4dd" ${sw(4)}/>
      <path d="M10 112L110 24l100 88z" fill="#ef6f5c" ${sw(4)}/>
      <path d="M48 96l62-54 62 54" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".35"/>
      <rect x="46" y="130" width="54" height="48" rx="6" fill="#bfe6fb" ${sw(3.5)}/>
      <path d="M73 130v48M46 154h54" ${sw(3)}/>
      <path d="M52 172l24-28" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>
      <rect x="120" y="140" width="52" height="100" rx="8" fill="#b9784a" ${sw(3.5)}/>
      <circle cx="160" cy="192" r="5" fill="#ffd23f" ${sw(2.5)}/>
      <path d="M128 160h36" stroke="#9c6430" stroke-width="3" stroke-linecap="round"/>
      <path d="M40 232c8-14 22-14 30 0M150 232c8-14 22-14 30 0" fill="#7cc76a" ${sw(3)}/>
      <path d="M30 240h160" ${sw(4)}/>
    </svg>`;
  }

  /** 買いものかご（横長。中身は HTML で上に重ねる）。 */
  function basket() {
    let weave = '';
    for (let x = 34; x <= 186; x += 19) weave += `M${x} 58l${(x - 110) * 0.08} 50`;
    return `<svg viewBox="0 0 220 120" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14 46h192l-16 66H30z" fill="#e3a764" ${sw(4)}/>
      <path d="${weave}" fill="none" stroke="#c4843f" stroke-width="3" stroke-linecap="round"/>
      <path d="M22 76h176M26 94h168" stroke="#c4843f" stroke-width="3"/>
      <rect x="8" y="38" width="204" height="18" rx="7" fill="#f3c98b" ${sw(4)}/>
    </svg>`;
  }

  /** 「できた」のお花のスタンプ（おみせやさんごっこのスタンプと同じ絵）。 */
  function flower() {
    return ShopArt.stamp();
  }

  const Art = { mother, house, basket, flower };

  if (typeof module === 'object' && module.exports) module.exports = Art;
  root.OtsukaiArt = Art;
})(typeof self !== 'undefined' ? self : this);
