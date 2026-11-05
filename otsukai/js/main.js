/**
 * おつかい できるかな？ — 画面の進行
 *
 * 場面：タイトル → おうち（お母さんがメモをわたす）→ 町の地図 ⇄ お店 → おうち（おしまい）
 * メモは右上のボタンでいつでも見られる。
 */
(function () {
  'use strict';

  const Items = window.ShopItems;
  const ShopArt = window.ShopArt;
  const Art = window.OtsukaiArt;
  const Errand = window.Errand;
  const Sound = window.ShopSound;

  const STORAGE_KEY = 'otsukai.settings.v1';
  const IDLE_HINT_MS = 8000; // 何もしないでいると、行くお店やほしい品物を光らせる
  const SHOP_DONE_MS = 1600; // お店で買いおわってから地図にもどるまで

  const LEVEL_NOTES = [
    '',
    'レベル1：1けんのお店で、1こ買います',
    'レベル2：1けんのお店で、同じものを2〜3こ買います',
    'レベル3：2けんのお店で、1〜2こずつ買います',
    'レベル4：3けんのお店で、いろいろ買います（1けんで2しゅるいのことも）',
  ];

  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const scenes = { title: $('title'), home: $('home'), map: $('map'), shop: $('shop') };

  /* ------------------------------------------------------------ 設定 */

  const settings = loadSettings();

  function loadSettings() {
    const s = { level: Errand.DEFAULT_LEVEL, sound: true, music: true };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        if (Number.isInteger(saved.level)) s.level = Errand.clampLevel(saved.level);
        if (typeof saved.sound === 'boolean') s.sound = saved.sound;
        if (typeof saved.music === 'boolean') s.music = saved.music;
      }
    } catch (e) {
      // 保存領域が使えない環境では既定値のまま
    }
    return s;
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // 保存できなくても遊べる
    }
  }

  /* ------------------------------------------------------------ 状態 */

  let state = null; // Errand の状態
  let scene = 'title';
  let currentShop = null;
  let leaving = false; // お店で買いおわって、地図にもどるまでのあいだ
  let idleTimer = 0;
  let popTimer = 0;
  const timers = new Set();

  function later(fn, ms) {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  }

  function cancelAll() {
    for (const id of timers) clearTimeout(id);
    timers.clear();
    clearTimeout(idleTimer);
    clearTimeout(popTimer);
  }

  const itemName = (id) => (Items.item(id) || { name: '' }).name;
  const shopName = (id) => (Items.shop(id) || { name: '' }).name;

  /* ------------------------------------------------------------ 場面の切りかえ */

  function showScene(name) {
    scene = name;
    for (const [key, el] of Object.entries(scenes)) el.hidden = key !== name;
    $('hud').hidden = name === 'title';
    $('btn-memo').hidden = name === 'title' || name === 'home';
    app.dataset.scene = name;
    app.dataset.shop = name === 'shop' ? currentShop : '';
    $('memo').hidden = true;
    $('count-pop').hidden = true;
    // 前の場面の演出（「できた」のスタンプ・飛んでいる品物）を片づける
    for (const el of $('fx').querySelectorAll('.big-stamp, .flyer')) el.remove();
  }

  function goTitle() {
    cancelAll();
    state = null;
    $('end').hidden = true;
    $('confirm').hidden = true;
    $('fx').innerHTML = '';
    showScene('title');
  }

  /** 新しいおつかいを始める：お母さんがメモをわたす。 */
  function startErrand() {
    cancelAll();
    state = Errand.createErrand({ level: settings.level });
    $('end').hidden = true;
    $('fx').innerHTML = '';
    showScene('home');
    setMom('normal');
    $('home-text').textContent = 'おつかい おねがいね！';
    $('home-memo').hidden = false;
    renderMemo($('home-memo'));
    $('btn-go').hidden = false;
    Sound.bell();
  }

  /* ------------------------------------------------------------ お母さん */

  function setMom(mood) {
    const el = $('home-mom');
    el.classList.remove('mom--happy');
    if (mood === 'happy') {
      void el.offsetWidth; // ぴょんっのアニメーションを最初から
      el.classList.add('mom--happy');
    }
  }

  /* ------------------------------------------------------------ メモ */

  /** メモの中身：お店・品物・数・買った数（○ がうまっていく）。 */
  function renderMemo(container) {
    container.innerHTML = '';
    container.dataset.n = String(state.list.length); // 行の数で並べ方を変える（CSS）
    for (const entry of state.list) {
      const have = state.basket[entry.item];
      const row = document.createElement('div');
      row.className = 'memo-row';
      row.dataset.item = entry.item;
      row.classList.toggle('done', have >= entry.count);
      row.setAttribute('aria-label', `${shopName(entry.shop)}で ${itemName(entry.item)}を ${entry.count}こ`);

      const shop = document.createElement('span');
      shop.className = 'memo-shop';
      shop.dataset.shop = entry.shop;
      shop.innerHTML = ShopArt.storefront(entry.shop, []);

      const pic = document.createElement('span');
      pic.className = 'memo-item';
      pic.innerHTML = ShopArt.item(entry.item);

      const num = document.createElement('span');
      num.className = 'memo-num';
      num.textContent = String(entry.count);

      const slots = document.createElement('span');
      slots.className = 'memo-slots';
      for (let i = 0; i < entry.count; i++) {
        const dot = document.createElement('i');
        if (i < have) dot.className = 'on';
        slots.appendChild(dot);
      }

      const check = document.createElement('span');
      check.className = 'memo-check';
      check.innerHTML = Art.flower();

      row.append(shop, pic, num, slots, check);
      container.appendChild(row);
    }
  }

  function openMemo() {
    if (!state) return;
    Sound.press();
    renderMemo($('memo-card'));
    $('memo').hidden = false;
    $('btn-memo').classList.remove('beckon');
    resetIdle();
  }

  function closeMemo() {
    Sound.press();
    $('memo').hidden = true;
    resetIdle();
  }

  /* ------------------------------------------------------------ 地図 */

  function goMap() {
    cancelAll();
    leaving = false;
    currentShop = null;
    showScene('map');
    renderMap();
    if (state.complete) {
      later(() => {
        Sound.sparkle();
        $('place-home').classList.add('beckon');
      }, 400);
    }
    resetIdle();
  }

  function renderMap() {
    const places = $('places');
    places.innerHTML = '';

    const home = document.createElement('button');
    home.type = 'button';
    home.className = 'place place--home';
    home.id = 'place-home';
    home.setAttribute('aria-label', 'おうち');
    home.innerHTML = `${Art.house()}<span class="place-name">おうち</span>`;
    if (state.complete) {
      const talk = document.createElement('span');
      talk.className = 'place-talk';
      talk.textContent = 'かえろう！';
      home.appendChild(talk);
    }
    home.addEventListener('click', onHome);
    places.appendChild(home);

    Items.SHOPS.forEach((shop, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'place';
      btn.dataset.shop = shop.id;
      btn.style.setProperty('--i', String(i + 1));
      btn.setAttribute('aria-label', shop.name);
      const goods = state.shelves[shop.id].slice(0, 3);
      btn.innerHTML = `${ShopArt.storefront(shop.id, goods)}<span class="place-name">${shop.name}</span>`;
      if (Errand.shopStatus(state, shop.id) === 'done') {
        btn.classList.add('done');
        const mark = document.createElement('span');
        mark.className = 'place-done';
        mark.innerHTML = Art.flower();
        btn.appendChild(mark);
      }
      btn.addEventListener('click', () => enterShop(shop.id, btn));
      places.appendChild(btn);
    });
  }

  function onHome() {
    const home = $('place-home');
    if (state.complete) {
      Sound.tap();
      finish();
      return;
    }
    // まだ買うものがある：おうちがぷるぷるして、メモを見せる
    Sound.wrong();
    home.classList.remove('wiggle');
    void home.offsetWidth;
    home.classList.add('wiggle');
    later(openMemo, 500);
  }

  function enterShop(shopId, btn) {
    cancelAll();
    Sound.tap();
    btn.classList.add('chosen');
    later(() => {
      currentShop = shopId;
      leaving = false;
      showScene('shop');
      renderShop();
      Sound.bell();
      resetIdle();
    }, 280);
  }

  /* ------------------------------------------------------------ お店 */

  function renderShop() {
    $('shop-name').textContent = shopName(currentShop);
    const shelf = $('shelf');
    shelf.innerHTML = '';
    const ids = state.shelves[currentShop];
    shelf.dataset.n = String(ids.length);
    for (const id of ids) {
      const tile = document.createElement('button');
      tile.type = 'button';
      tile.className = 'tile';
      tile.dataset.item = id;
      tile.setAttribute('aria-label', itemName(id));
      tile.innerHTML =
        '<span class="tile-back"></span>' +
        `<span class="tile-art">${ShopArt.item(id)}</span>` +
        '<span class="tile-front"></span>' +
        `<span class="tile-tag">${itemName(id)}</span>`;
      tile.addEventListener('click', () => onTile(id, tile));
      shelf.appendChild(tile);
    }
    renderBasket();
    $('btn-back').classList.remove('beckon');
  }

  /** かごの中身：このおつかいで買ったもの。 */
  function renderBasket(newItem) {
    const box = $('basket-items');
    box.innerHTML = '';
    let lastOfNew = null;
    for (const entry of state.list) {
      for (let i = 0; i < state.basket[entry.item]; i++) {
        const el = document.createElement('span');
        el.className = 'basket-item';
        el.innerHTML = ShopArt.item(entry.item);
        box.appendChild(el);
        if (entry.item === newItem) lastOfNew = el;
      }
    }
    if (lastOfNew) lastOfNew.classList.add('new');
  }

  function clearBeckons() {
    for (const t of document.querySelectorAll('.tile.beckon')) t.classList.remove('beckon');
    $('btn-back').classList.remove('beckon');
    $('btn-memo').classList.remove('beckon');
  }

  function onTile(itemId, tile) {
    if (leaving || !state) return;
    resetIdle();
    const result = Errand.buy(state, currentShop, itemId);
    state = result.state;

    for (const ev of result.events) {
      if (ev.type === 'bought') {
        clearBeckons();
        Sound.give();
        flyToBasket(tile, itemId, () => {
          renderBasket(itemId);
          Sound.correct(Errand.progress(state).got - 1);
        });
        showCount(itemId);
      } else if (ev.type === 'enough') {
        // もうメモの数だけ買ってある
        Sound.wrong();
        wiggle(tile);
        showCount(itemId);
      } else if (ev.type === 'notOnList') {
        // メモにない品物：買わずに、メモとほしい品物を光らせる
        Sound.wrong();
        wiggle(tile);
        bounce($('btn-memo'));
        hint(ev.wanted);
      } else if (ev.type === 'shopDone') {
        leaving = true;
        later(() => {
          Sound.stamp();
          showStamp();
        }, 650);
        later(goMap, SHOP_DONE_MS);
      }
    }
  }

  /** このお店でまだ買う品物を光らせる。なければ「もどる」ボタンを光らせる。 */
  function hint(wanted) {
    clearBeckons();
    if (wanted.length) {
      for (const t of $('shelf').children) {
        if (wanted.includes(t.dataset.item)) t.classList.add('beckon');
      }
    } else {
      $('btn-back').classList.add('beckon');
    }
  }

  function wiggle(el) {
    el.classList.remove('wiggle');
    void el.offsetWidth;
    el.classList.add('wiggle');
  }

  function bounce(el) {
    el.classList.remove('bounce');
    void el.offsetWidth;
    el.classList.add('bounce');
  }

  /** かごの上に「品物と ○○●」を出して、あといくつかを見せる。 */
  function showCount(itemId) {
    const entry = state.list.find((e) => e.item === itemId);
    if (!entry) return;
    const pop = $('count-pop');
    const have = state.basket[itemId];
    let dots = '';
    for (let i = 0; i < entry.count; i++) dots += `<i class="${i < have ? 'on' : ''}"></i>`;
    pop.innerHTML = `<span class="count-item">${ShopArt.item(itemId)}</span><span class="memo-slots">${dots}</span>`;
    pop.classList.toggle('full', have >= entry.count);
    pop.hidden = false;
    pop.classList.remove('show');
    void pop.offsetWidth;
    pop.classList.add('show');
    clearTimeout(popTimer);
    popTimer = setTimeout(() => {
      pop.hidden = true;
    }, 1600);
  }

  /** 買いおわったお店で「できた」のスタンプをどーんと出す。 */
  function showStamp() {
    const s = document.createElement('div');
    s.className = 'big-stamp';
    s.innerHTML = `${Art.flower()}<span>できた！</span>`;
    $('fx').appendChild(s);
    later(() => s.remove(), SHOP_DONE_MS);
  }

  /** 品物がたなから、かごへ飛んでいく。 */
  function flyToBasket(tile, itemId, done) {
    const from = tile.querySelector('.tile-art').getBoundingClientRect();
    const to = $('basket').getBoundingClientRect();
    const size = Math.min(from.width, from.height);
    const el = document.createElement('div');
    el.className = 'flyer';
    el.innerHTML = ShopArt.item(itemId);
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    $('fx').appendChild(el);
    const x0 = from.left + from.width / 2 - size / 2;
    const y0 = from.top + from.height / 2 - size / 2;
    const x1 = to.left + to.width / 2 - size / 2;
    const y1 = to.top + to.height * 0.35 - size / 2;
    const peak = Math.min(y0, y1) - size * 0.6;
    const anim = el.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(1)` },
        { transform: `translate(${(x0 + x1) / 2}px, ${peak}px) scale(.9)`, offset: 0.45 },
        { transform: `translate(${x1}px, ${y1}px) scale(.45)` },
      ],
      { duration: 560, easing: 'cubic-bezier(.4, 0, .6, 1)' }
    );
    anim.onfinish = () => {
      el.remove();
      done();
    };
  }

  /* ------------------------------------------------------------ 何もしないでいるときのヒント */

  function resetIdle() {
    clearTimeout(idleTimer);
    if (!state) return;
    idleTimer = setTimeout(idleHint, IDLE_HINT_MS);
  }

  function idleHint() {
    if (!$('memo').hidden || !state) return;
    if (scene === 'map') {
      if (state.complete) {
        $('place-home').classList.add('beckon');
        return;
      }
      // まだ買うものがあるお店のうち、メモでいちばん上のお店を光らせる
      const target = Errand.shopsToVisit(state).find((id) => Errand.shopStatus(state, id) === 'todo');
      const btn = document.querySelector(`.place[data-shop="${target}"]`);
      if (btn) btn.classList.add('beckon');
    } else if (scene === 'shop' && !leaving) {
      bounce($('btn-memo'));
      hint(Errand.stillNeeded(state, currentShop));
    }
  }

  /* ------------------------------------------------------------ おしまい */

  function finish() {
    cancelAll();
    showScene('home');
    $('hud').hidden = true;
    $('btn-go').hidden = true;
    $('home-text').textContent = 'ありがとう！ たすかったわ';
    $('home-memo').hidden = false;
    renderMemo($('home-memo'));
    setMom('happy');
    Sound.fanfare();
    later(() => {
      $('end').hidden = false;
      throwConfetti();
    }, 1100);
  }

  function throwConfetti() {
    const colors = ['#ffd23f', '#ef5f7a', '#57b947', '#6cc4ef', '#ff9a2e', '#ffffff'];
    const fx = $('fx');
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('span');
      p.className = 'confetti';
      p.style.left = `${Math.random() * 100}%`;
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = `${2 + Math.random() * 1.6}s`;
      p.style.animationDelay = `${Math.random() * 0.6}s`;
      fx.appendChild(p);
    }
  }

  /* ------------------------------------------------------------ 音 */

  function applySound() {
    Sound.setEnabled(settings.sound);
    $('btn-sound').classList.toggle('off', !settings.sound);
    if (settings.sound && settings.music && scene !== 'title') Sound.startMusic();
    else Sound.stopMusic();
  }

  /* ------------------------------------------------------------ 設定画面 */

  function buildSettings() {
    const seg = $('opt-level');
    for (let lv = 1; lv <= Errand.MAX_LEVEL; lv++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(lv);
      b.dataset.level = String(lv);
      b.setAttribute('aria-label', `レベル${lv}`);
      b.addEventListener('click', () => {
        settings.level = lv;
        saveSettings();
        updateSettings();
      });
      seg.appendChild(b);
    }
    const toggle = (id, key) => {
      $(id).addEventListener('click', () => {
        settings[key] = !settings[key];
        saveSettings();
        updateSettings();
      });
    };
    toggle('opt-sound', 'sound');
    toggle('opt-music', 'music');
    updateSettings();
  }

  function updateSettings() {
    for (const b of $('opt-level').children) {
      b.setAttribute('aria-pressed', String(Number(b.dataset.level) === settings.level));
    }
    $('level-note').textContent = LEVEL_NOTES[settings.level];
    $('opt-sound').setAttribute('aria-checked', String(settings.sound));
    $('opt-music').setAttribute('aria-checked', String(settings.music));
    applySound();
  }

  /* ------------------------------------------------------------ タイトル */

  function buildTitle() {
    $('title-town').innerHTML = ShopArt.town();
    $('map-town').innerHTML = ShopArt.town();
    $('title-house').innerHTML = Art.house();
    $('title-mom').innerHTML = Art.mother();
    $('home-mom').innerHTML = Art.mother();
    $('basket-art').innerHTML = Art.basket();
    for (const c of document.querySelectorAll('.cloud')) c.innerHTML = ShopArt.cloud();

    const rows = ['おつかい', 'できるかな？'];
    const colors = ['#ffd23f', '#ff8fab', '#7cd36a', '#6cc4ef', '#ff9a2e'];
    let n = 0;
    $('logo').innerHTML = rows
      .map((row) => `<span class="row">${[...row]
        .map((ch) => `<span class="ch" style="--i:${n};--c:${colors[n++ % colors.length]}">${ch}</span>`)
        .join('')}</span>`)
      .join('');
  }

  /* ------------------------------------------------------------ はじめに */

  buildTitle();
  buildSettings();

  $('btn-start').addEventListener('click', () => {
    Sound.unlock();
    Sound.press();
    startErrand();
    applySound();
  });
  $('btn-go').addEventListener('click', () => {
    Sound.press();
    goMap();
  });
  $('btn-back').addEventListener('click', () => {
    if (leaving) return;
    Sound.press();
    goMap();
  });
  $('btn-memo').addEventListener('click', openMemo);
  $('btn-memo-close').addEventListener('click', closeMemo);
  $('memo').addEventListener('click', (e) => {
    if (e.target === $('memo')) closeMemo();
  });
  $('btn-sound').addEventListener('click', () => {
    settings.sound = !settings.sound;
    saveSettings();
    updateSettings();
    Sound.press();
  });
  $('btn-quit').addEventListener('click', () => {
    Sound.press();
    $('confirm').hidden = false;
  });
  $('btn-quit-yes').addEventListener('click', () => {
    Sound.press();
    goTitle();
    applySound();
  });
  $('btn-quit-no').addEventListener('click', () => {
    Sound.press();
    $('confirm').hidden = true;
  });
  $('btn-again').addEventListener('click', () => {
    Sound.press();
    startErrand();
  });
  $('btn-to-title').addEventListener('click', () => {
    Sound.press();
    goTitle();
    applySound();
  });
  $('btn-settings').addEventListener('click', () => {
    $('settings').hidden = false;
  });
  $('btn-settings-close').addEventListener('click', () => {
    $('settings').hidden = true;
  });

  // 動作確認用：?level=<1〜4> でタイトルをとばして始める
  const q = new URLSearchParams(location.search);
  if (q.has('level')) {
    settings.level = Errand.clampLevel(q.get('level'));
    updateSettings();
    startErrand();
  } else {
    showScene('title');
  }
})();
