/**
 * スマートフォン・タブレットを横向きにしたときに全画面にする。
 *
 * ブラウザの制限で、全画面はユーザーの操作（タッチ）の中でしか始められない。
 * そのため、横向きのときに画面をタッチしたら全画面にし、縦向きに戻したら全画面をやめる。
 * 自分で全画面をやめた（戻る操作など）あとは、次に横向きにし直すまで勝手に全画面にしない。
 *
 * - 対象はタッチ操作の端末（pointer: coarse）だけ。パソコンでは何もしない
 * - iPhone の Safari は全画面の API がないため、この処理は動かない。
 *   ホーム画面に追加して開くと、ブラウザのバーなしで表示される（index.html の apple-mobile-web-app-capable）
 */
(function (root) {
  'use strict';

  const doc = root.document;
  if (!doc || typeof root.matchMedia !== 'function') return;

  const el = doc.documentElement;
  const request = el.requestFullscreen || el.webkitRequestFullscreen;
  const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
  if (!request) return;

  const landscape = root.matchMedia('(orientation: landscape)');
  const touch = root.matchMedia('(pointer: coarse)');
  const current = () => doc.fullscreenElement || doc.webkitFullscreenElement || null;

  let entered = false; // この処理で全画面にしたか
  let declined = false; // 全画面を自分でやめたか（横向きのあいだは、もう全画面にしない）

  function onTap(e) {
    if (!touch.matches || !landscape.matches || current() || declined) return;
    // プルダウンを開く操作のじゃまをしない
    if (e.target && e.target.closest && e.target.closest('select, input, textarea')) return;
    try {
      const p = request.call(el, { navigationUI: 'hide' });
      entered = true;
      if (p && typeof p.catch === 'function') p.catch(() => { entered = false; });
    } catch (err) {
      entered = false;
    }
  }

  function onFullscreenChange() {
    if (current()) return;
    // 縦向きに戻したのでなく、横向きのまま全画面をやめたときは、自分でやめたとみなす
    if (entered && landscape.matches) declined = true;
    entered = false;
  }

  function onOrientationChange() {
    if (landscape.matches) return;
    declined = false;
    if (entered && current() && exit) {
      try {
        const p = exit.call(doc);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (err) { /* 全画面のままでも遊べる */ }
    }
  }

  // タッチのあとの click でも呼ぶ（端末によって、どちらが「操作」とみなされるかがちがうため）
  doc.addEventListener('pointerup', onTap, true);
  doc.addEventListener('click', onTap, true);
  doc.addEventListener('fullscreenchange', onFullscreenChange);
  doc.addEventListener('webkitfullscreenchange', onFullscreenChange);
  if (typeof landscape.addEventListener === 'function') landscape.addEventListener('change', onOrientationChange);
  else if (typeof landscape.addListener === 'function') landscape.addListener(onOrientationChange);
})(typeof self !== 'undefined' ? self : this);
