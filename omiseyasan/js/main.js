/**
 * 画面制御。進行（shop.js）の出来事に合わせて、お客さんを動かし、せりふを読み上げる。
 *
 * - タイトルでお店をえらぶと、シャッターが上がって開店。お客さんが来て「〇〇 ください」と言う
 * - 棚の品物をタッチすると、お客さんにわたす（ちがっても失敗にはせず、ほしい品物を光らせる）
 * - わたすたびにスタンプカードへスタンプを押し、全員にわたしたら閉店
 * - せりふや演出の再生中（busy）は、品物をさわっても進まない（ぴょこっと動くだけ）
 * - しばらく操作がないと、注文をもう一度言い、ほしい品物を光らせる
 */
(function () {
  'use strict';

  const Items = window.ShopItems;
  const Game = window.ShopGame;
  const Art = window.ShopArt;
  const Sound = window.ShopSound;
  const Voice = window.ShopVoice;

  const $ = (id) => document.getElementById(id);
  const ui = {
    app: $('app'), hud: $('hud'), stamps: $('stamps'), endStamps: $('end-stamps'),
    street: $('street'), caption: $('caption'), customer: $('customer'),
    bubble: $('bubble'), bubbleItem: $('bubble-item'), bubbleText: $('bubble-text'),
    sign: $('sign'), signText: $('sign-text'),
    shelf: $('shelf'), fx: $('fx'), shutter: $('shutter'),
    title: $('title'), logo: $('logo'), shops: $('shops'),
    settings: $('settings'), end: $('end'), confirm: $('confirm'),
    optSize: $('opt-size'), optPicture: $('opt-picture'), optVoice: $('opt-voice'),
    optSound: $('opt-sound'), optMusic: $('opt-music'), btnSound: $('btn-sound'),
  };

  /** 何もしないでいると、注文をくり返すまでの時間（ミリ秒）。 */
  const IDLE_MS = 8000;

  // ------------------------------------------------------------ 設定

  const SETTINGS_KEY = 'omiseyasan-settings';
  const settings = Object.assign(
    { size: Game.DEFAULT_SHELF, picture: true, voice: true, sound: true, music: true, muted: false, voiceName: '' },
    loadSettings(),
  );
  if (!Game.SHELF_SIZES.includes(settings.size)) settings.size = Game.DEFAULT_SHELF;

  function loadSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }
  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { /* 保存できなくても遊べる */ }
  }

  /** 音の設定を反映する。BGM は、一度でもさわったあと（音を出してよくなってから）だけ流す。 */
  let touched = false;
  function applyAudioSettings() {
    Voice.setEnabled(settings.voice && !settings.muted);
    Sound.setEnabled(settings.sound && !settings.muted);
    if (touched && settings.music && settings.sound && !settings.muted) Sound.startMusic();
    else Sound.stopMusic();
  }

  /** 最初のユーザー操作で、音と読み上げを使えるようにする。 */
  function wake() {
    if (touched) return;
    touched = true;
    Sound.unlock();
    Voice.unlock();
    applyAudioSettings();
  }
  document.addEventListener('pointerdown', wake, true);
  document.addEventListener('keydown', wake, true);

  // ------------------------------------------------------------ 状態

  let state = null;
  let busy = false;
  let interactive = false;
  let transitioning = false;
  let runId = 0;
  let idleTimer = 0;
  let idleCount = 0;
  const CANCEL = { cancelled: true };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const itemName = (id) => Items.item(id).name;

  /**
   * 演出（せりふとアニメーション）を 1 本再生する。
   * タイトルに戻ったときなどに runId が変わると、次の待ちで CANCEL を投げて止まる。
   */
  function play(fn) {
    const id = ++runId;
    const alive = () => id === runId;
    const chk = () => { if (!alive()) throw CANCEL; };
    const d = {
      chk,
      async wait(ms) { await sleep(ms); chk(); },
      async run(p) { await p; chk(); },
      /** 語り。画面のまんなかに帯で出して読み上げる。 */
      async narrate(text) {
        chk();
        hideBubble();
        ui.caption.textContent = text;
        ui.caption.hidden = false;
        await Voice.say(text);
        chk();
        await sleep(250);
        chk();
        ui.caption.hidden = true;
      },
      /** お客さんのせりふ。item を渡すと、吹き出しに品物の絵も出す。吹き出しは次のせりふまで残す。 */
      async say(text, opts) {
        chk();
        const o = opts || {};
        ui.caption.hidden = true;
        showBubble(text, o.item);
        const c = Items.customer(o.customer || currentCustomer());
        await Voice.say(text, { pitch: c ? c.pitch : 1, rate: 0.95 });
        chk();
        await sleep(200);
        chk();
      },
    };
    busy = true;
    stopIdle();
    return Promise.resolve()
      .then(() => fn(d))
      .catch((e) => { if (e !== CANCEL) console.error(e); })
      .finally(() => { if (alive()) busy = false; });
  }

  function currentCustomer() {
    const o = state && Game.currentOrder(state);
    return o ? o.customer : null;
  }

  // ------------------------------------------------------------ アニメーション

  /** Web Animations API で動かし、終わったら最後の値を style に残す。 */
  function tween(target, frames, opts) {
    if (!target || !target.animate) return Promise.resolve();
    const a = target.animate(frames, Object.assign({ duration: 400, easing: 'ease-in-out', fill: 'forwards' }, opts));
    return a.finished.then(() => {
      const last = frames[frames.length - 1];
      for (const k of Object.keys(last)) {
        if (k !== 'offset' && k !== 'easing' && k !== 'composite') target.style[k] = last[k];
      }
      a.cancel();
    }, () => {});
  }

  /** 要素の、.app から見た位置と大きさ。 */
  function rectOf(el) {
    const r = el.getBoundingClientRect();
    const b = ui.app.getBoundingClientRect();
    return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
  }

  /** fx の層に絵を置く。 */
  function fxEl(html, x, y, w, h) {
    const div = document.createElement('div');
    div.innerHTML = html;
    div.style.width = w + 'px';
    div.style.height = (h || w) + 'px';
    div.style.transform = `translate(${x}px, ${y}px)`;
    ui.fx.appendChild(div);
    return div;
  }

  /** 品物を棚からお客さんの手もとへ、くるっと回りながら山なりに飛ばす。 */
  function fly(fromEl, toEl, itemId) {
    const a = rectOf(fromEl);
    const b = rectOf(toEl);
    const size = Math.min(a.w, a.h);
    const sx = a.x + (a.w - size) / 2;
    const sy = a.y + (a.h - size) / 2;
    const s = b.w / size;
    const ex = b.x + (b.w - size) / 2;
    const ey = b.y + (b.h - size) / 2;
    const mx = (sx + ex) / 2;
    const my = Math.min(sy, ey) - Math.max(80, a.h * 0.7);
    const g = fxEl(Art.item(itemId), sx, sy, size);
    const spin = ex < sx ? -1 : 1;
    return tween(g, [
      { transform: `translate(${sx}px, ${sy}px) rotate(0deg) scale(1.1, .9)`, easing: 'ease-out' },
      { transform: `translate(${mx}px, ${my}px) rotate(${spin * 200}deg) scale(${(1 + s) / 2 * 1.15})`, offset: 0.5, easing: 'ease-in' },
      { transform: `translate(${ex}px, ${ey}px) rotate(${spin * 360}deg) scale(${s})` },
    ], { duration: 620, easing: 'linear' }).then(() => g.remove());
  }

  function hearts(el, count) {
    const r = rectOf(el);
    for (let i = 0; i < count; i++) {
      const size = rand(30, 50);
      const x = r.x + r.w * rand(0.1, 0.9) - size / 2;
      const y = r.y + r.h * rand(0.2, 0.5);
      const g = fxEl(Art.heart(pick(['#f47c93', '#ff9fb4', '#ffb84a'])), x, y, size);
      tween(g, [
        { transform: `translate(${x}px, ${y}px) scale(.3)`, opacity: 0 },
        { transform: `translate(${x}px, ${y - 24}px) scale(1.1)`, opacity: 1, offset: 0.2 },
        { transform: `translate(${x + rand(-30, 30)}px, ${y - rand(120, 180)}px) scale(.9)`, opacity: 0 },
      ], { duration: rand(1300, 1800), delay: i * 140, easing: 'ease-out' }).then(() => g.remove());
    }
  }

  function stars(el, count) {
    const r = rectOf(el);
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + rand(-0.3, 0.3);
      const dist = rand(60, 110);
      const size = rand(22, 34);
      const x0 = cx - size / 2;
      const y0 = cy - size / 2;
      const g = fxEl(Art.star(pick(['#ffd23f', '#fff1a8', '#bfe6ff', '#ffc4d3'])), x0, y0, size);
      tween(g, [
        { transform: `translate(${x0}px, ${y0}px) rotate(0deg) scale(1.2)`, opacity: 1 },
        { transform: `translate(${x0 + Math.cos(ang) * dist}px, ${y0 + Math.sin(ang) * dist}px) rotate(180deg) scale(.2)`, opacity: 0 },
      ], { duration: rand(600, 900), easing: 'cubic-bezier(.2,.7,.4,1)' }).then(() => g.remove());
    }
  }

  function confetti(count) {
    const W = ui.app.clientWidth;
    const H = ui.app.clientHeight;
    const colors = ['#ef5f7a', '#ffd23f', '#6cc4ef', '#7cd36a', '#ff9a2e', '#ffffff'];
    for (let i = 0; i < count; i++) {
      const w = rand(10, 18);
      const div = document.createElement('div');
      div.style.width = w + 'px';
      div.style.height = (w * 0.6) + 'px';
      div.style.borderRadius = '2px';
      div.style.background = colors[i % colors.length];
      div.style.boxShadow = '0 0 0 2px rgba(74,59,51,.5)';
      ui.fx.appendChild(div);
      const x = rand(0, W);
      tween(div, [
        { transform: `translate(${x}px, -30px) rotate(0deg)` },
        { transform: `translate(${x + rand(-90, 90)}px, ${H + 40}px) rotate(${rand(360, 1080)}deg)` },
      ], { duration: rand(2600, 4200), delay: rand(0, 1400), easing: 'linear' }).then(() => div.remove());
    }
  }

  // ------------------------------------------------------------ シャッター

  async function shutterDown() {
    ui.shutter.classList.add('down');
    Sound.shutter();
    await tween(ui.shutter, [
      { translate: '0 -102%' }, { translate: '0 3%', offset: 0.8 }, { translate: '0 0' },
    ], { duration: 620, easing: 'cubic-bezier(.5,0,.8,.6)' });
  }

  async function shutterUp() {
    Sound.shutter();
    await tween(ui.shutter, [
      { translate: '0 0' }, { translate: '0 2%', offset: 0.12 }, { translate: '0 -102%' },
    ], { duration: 900, easing: 'cubic-bezier(.4,0,.3,1)' });
    ui.shutter.classList.remove('down');
  }

  // ------------------------------------------------------------ お客さん・吹き出し

  function setMood(mood) {
    ui.customer.classList.remove('customer--happy', 'customer--puzzled');
    if (mood) {
      // 同じ表情でも、もう一度ぴょんっとさせる
      void ui.customer.offsetWidth;
      ui.customer.classList.add('customer--' + mood);
    }
  }

  function showBubble(text, itemId) {
    ui.bubbleItem.innerHTML = itemId && settings.picture ? Art.item(itemId) : '';
    // 分かち書きのスペースのところでだけ改行する（「！」だけが次の行に行かないように）
    ui.bubbleText.innerHTML = '';
    for (const part of text.split(' ')) {
      const span = document.createElement('span');
      span.textContent = part;
      ui.bubbleText.append(span, ' ');
    }
    ui.bubble.hidden = false;
    // 出るたびに、ぽよんと出るアニメーションをやり直す
    ui.bubble.style.animation = 'none';
    void ui.bubble.offsetWidth;
    ui.bubble.style.animation = '';
  }

  function hideBubble() {
    ui.bubble.hidden = true;
  }

  /** お客さんが右から歩いてくる。 */
  async function walkIn(d, customerId) {
    ui.customer.className = 'customer';
    ui.customer.innerHTML = Art.customer(customerId);
    ui.customer.classList.add('customer--walking');
    const dist = ui.street.clientWidth;
    Sound.bell();
    Sound.steps();
    await d.run(tween(ui.customer, [
      { transform: `translateX(${dist}px)` },
      { transform: 'translateX(0)' },
    ], { duration: 1200, easing: 'cubic-bezier(.25,.7,.35,1)' }));
    ui.customer.classList.remove('customer--walking');
  }

  /** お客さんが、品物を持ったまま左へ帰っていく。 */
  async function walkOut(d) {
    hideBubble();
    ui.customer.classList.add('customer--walking');
    Sound.steps();
    const dist = ui.street.clientWidth;
    await d.run(tween(ui.customer, [
      { transform: 'translateX(0)' },
      { transform: `translateX(${-dist}px)` },
    ], { duration: 1100, easing: 'cubic-bezier(.6,0,.8,.6)' }));
    ui.customer.className = 'customer';
    ui.customer.innerHTML = '';
    ui.customer.style.transform = '';
  }

  // ------------------------------------------------------------ 棚・スタンプ

  function tileOf(itemId) {
    return ui.shelf.querySelector(`.tile[data-item="${itemId}"]`);
  }

  function renderShelf() {
    ui.shelf.innerHTML = '';
    ui.shelf.dataset.n = String(state.shelf.length);
    for (const id of state.shelf) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.dataset.item = id;
      b.setAttribute('aria-label', itemName(id));
      b.innerHTML = `<span class="tile-back"></span><span class="tile-art">${Art.item(id)}</span><span class="tile-front"></span><span class="tile-tag">${itemName(id)}</span>`;
      b.addEventListener('click', () => onTile(id, b));
      ui.shelf.appendChild(b);
    }
  }

  function beckon(itemId) {
    clearBeckon();
    const t = tileOf(itemId);
    if (t) t.classList.add('beckon');
  }

  function clearBeckon() {
    ui.shelf.querySelectorAll('.tile.beckon').forEach((t) => t.classList.remove('beckon'));
  }

  function retrigger(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** スタンプカードをかく。fresh 番目のスタンプは、ぽんっと押すアニメーションにする。 */
  function renderStamps(card, fresh) {
    const p = Game.progress(state);
    let html = '';
    for (let i = 0; i < p.total; i++) {
      const on = i < p.served;
      html += `<i class="${on ? 'on' : ''}${i === fresh ? ' new' : ''}">${on ? Art.stamp() : ''}</i>`;
    }
    card.innerHTML = html;
    card.setAttribute('aria-label', `おきゃくさん ${p.served} / ${p.total}`);
  }

  // ------------------------------------------------------------ 操作を待つ

  function waitForTap() {
    interactive = true;
    scheduleIdle();
  }

  function stopIdle() {
    clearTimeout(idleTimer);
  }

  function scheduleIdle() {
    stopIdle();
    idleTimer = setTimeout(() => {
      if (!interactive || busy) return;
      idleCount++;
      play((d) => askAgain(d));
    }, IDLE_MS);
  }

  /** 注文をもう一度言う。2 回目からは、ほしい品物も光らせる。 */
  async function askAgain(d) {
    const order = Game.currentOrder(state);
    if (!order) return;
    await d.say(`${itemName(order.item)} ください！`, { item: order.item });
    if (idleCount >= 2 || state.misses > 0) beckon(order.item);
    waitForTap();
  }

  // ------------------------------------------------------------ お店の流れ

  async function openShop(d) {
    const shop = Items.shop(state.shopId);
    await d.run(shutterUp());
    retrigger(ui.sign, 'swing');
    await d.narrate(`${shop.name}、かいてん！`);
    await nextCustomer(d);
  }

  async function nextCustomer(d) {
    const order = Game.currentOrder(state);
    idleCount = 0;
    await d.wait(250);
    await walkIn(d, order.customer);
    await d.say(pick(['こんにちは！', 'こんにちは！', 'おじゃまします！']));
    await d.say(`${itemName(order.item)} ください！`, { item: order.item });
    waitForTap();
  }

  const THANKS = [
    (name) => `わあい、 ${name}！ ありがとう！`,
    (name) => `${name}、 ありがとう！ うれしいな！`,
    () => 'これこれ！ ありがとう！',
  ];

  async function serve(d, tile, ev, after) {
    clearBeckon();
    hideBubble();
    Sound.give();
    const box = ui.customer.querySelector('.c-held-box');
    await d.run(fly(tile, box, ev.item));
    ui.customer.querySelector('.c-held').innerHTML = Art.heldItem(ev.item);
    ui.customer.classList.add('customer--holding');
    const served = Game.progress(state).served;
    Sound.correct(served - 1);
    setMood('happy');
    stars(box, 10);
    hearts(ui.customer, 5);
    await d.wait(250);
    renderStamps(ui.stamps, served - 1);
    Sound.stamp();
    await d.say(pick(THANKS)(itemName(ev.item)), { customer: ev.customer });
    await d.wait(200);
    await walkOut(d);
    if (after.type === 'closed') await closeShop(d);
    else await nextCustomer(d);
  }

  async function mistake(d, tile, ev) {
    retrigger(tile, 'wiggle');
    Sound.wrong();
    setMood('puzzled');
    await d.say(`それは ${itemName(ev.given)} だね。`);
    setMood(null);
    await d.say(`${itemName(ev.wanted)} は どれかな？`, { item: ev.wanted });
    // ちがう品物をわたしたら、すぐにほしい品物を光らせる
    beckon(ev.wanted);
    waitForTap();
  }

  async function closeShop(d) {
    await d.narrate('きょうの おきゃくさんは、これで おしまい！');
    renderStamps(ui.endStamps, -1);
    ui.end.hidden = false;
    Sound.fanfare();
    confetti(70);
    await d.narrate('おみせやさん、おつかれさま！');
  }

  // ------------------------------------------------------------ 操作

  function onTile(itemId, tile) {
    if (!state || transitioning || !ui.end.hidden || !ui.confirm.hidden) return;
    if (busy || !interactive) {
      retrigger(tile, 'poke');
      Sound.press();
      return;
    }
    const res = Game.give(state, itemId);
    if (!res.events.length) return;
    state = res.state;
    interactive = false;
    const [ev, after] = res.events;
    if (ev.type === 'correct') play((d) => serve(d, tile, ev, after));
    else play((d) => mistake(d, tile, ev));
  }

  /** お客さんや吹き出しをさわると、注文をもう一度言う。 */
  function onCustomerTap() {
    if (!state || busy || !interactive) return;
    play((d) => askAgain(d));
  }

  ui.customer.addEventListener('click', onCustomerTap);
  ui.bubble.addEventListener('click', onCustomerTap);

  // ------------------------------------------------------------ タイトル・開店

  function resetStage() {
    runId++;
    Voice.cancel();
    busy = false;
    interactive = false;
    stopIdle();
    hideBubble();
    ui.caption.hidden = true;
    ui.customer.innerHTML = '';
    ui.customer.style.transform = '';
    ui.customer.className = 'customer';
    ui.fx.innerHTML = '';
  }

  /** シャッターを下ろしてから、画面を入れかえる。 */
  async function behindShutter(swap) {
    if (transitioning) return false;
    transitioning = true;
    try {
      await shutterDown();
      swap();
      await sleep(250);
      return true;
    } finally {
      transitioning = false;
    }
  }

  function showTitle() {
    resetStage();
    state = null;
    ui.app.dataset.shop = '';
    ui.signText.textContent = '';
    ui.shelf.innerHTML = '';
    ui.hud.hidden = true;
    ui.end.hidden = true;
    ui.confirm.hidden = true;
    ui.title.hidden = false;
  }

  async function backToTitle() {
    if (await behindShutter(showTitle)) await shutterUp();
  }

  async function startShop(shopId) {
    const ok = await behindShutter(() => {
      resetStage();
      state = Game.createGame({ shopId, shelfSize: settings.size });
      ui.app.dataset.shop = shopId;
      ui.signText.textContent = Items.shop(shopId).name;
      renderShelf();
      renderStamps(ui.stamps, -1);
      ui.title.hidden = true;
      ui.end.hidden = true;
      ui.confirm.hidden = true;
      ui.hud.hidden = false;
    });
    if (ok) play(openShop);
  }

  function renderTitle() {
    const rows = ['おみせやさん', 'ごっこ'];
    const colors = ['#ffffff', '#ffd23f', '#ff8fa6', '#9be37f', '#ffb04a', '#9fdcff'];
    let i = 0;
    ui.logo.innerHTML = rows.map((row) => `<span class="row">${Array.from(row).map((ch) => {
      const c = colors[i % colors.length];
      return `<span class="ch" style="--i:${i++};--c:${c}" aria-hidden="true">${ch}</span>`;
    }).join('')}</span>`).join('');

    ui.shops.innerHTML = '';
    Items.SHOPS.forEach((shop, n) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'storefront';
      b.style.setProperty('--i', n);
      b.setAttribute('aria-label', shop.name);
      b.innerHTML = `${Art.storefront(shop.id, shop.items.map((it) => it.id))}<span class="storefront-name" aria-hidden="true">${shop.name}</span>`;
      b.addEventListener('click', () => {
        if (transitioning) return;
        Sound.press();
        retrigger(b, 'chosen');
        setTimeout(() => startShop(shop.id), 280);
      });
      ui.shops.appendChild(b);
    });

    const town = Art.town();
    $('town').innerHTML = town;
    $('title-town').innerHTML = town;
    const cloudUrl = `url("data:image/svg+xml,${encodeURIComponent(Art.cloud())}")`;
    document.querySelectorAll('.cloud').forEach((c) => { c.style.backgroundImage = cloudUrl; });
  }

  // ------------------------------------------------------------ 設定

  function renderSizeButtons() {
    ui.optSize.innerHTML = '';
    for (const n of Game.SHELF_SIZES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = String(n);
      b.setAttribute('aria-label', `${n}こ`);
      b.setAttribute('aria-pressed', String(settings.size === n));
      b.addEventListener('click', () => {
        settings.size = n;
        saveSettings();
        Sound.press();
        renderSizeButtons();
      });
      ui.optSize.appendChild(b);
    }
  }

  function updateOptionUI() {
    ui.optPicture.setAttribute('aria-checked', String(settings.picture));
    ui.optVoice.setAttribute('aria-checked', String(settings.voice));
    ui.optSound.setAttribute('aria-checked', String(settings.sound));
    ui.optMusic.setAttribute('aria-checked', String(settings.music));
    ui.optMusic.disabled = !settings.sound;
    ui.btnSound.classList.toggle('off', settings.muted);
    ui.btnSound.setAttribute('aria-pressed', String(!settings.muted));
  }

  function toggle(key, after) {
    return () => {
      settings[key] = !settings[key];
      saveSettings();
      applyAudioSettings();
      updateOptionUI();
      if (after) after();
    };
  }

  ui.optPicture.addEventListener('click', toggle('picture'));
  ui.optVoice.addEventListener('click', toggle('voice', updateVoiceUI));
  ui.optSound.addEventListener('click', toggle('sound', () => Sound.press()));
  ui.optMusic.addEventListener('click', toggle('music'));
  ui.btnSound.addEventListener('click', toggle('muted'));

  $('btn-settings').addEventListener('click', () => {
    ui.settings.hidden = false;
    $('btn-settings-close').focus();
  });
  $('btn-settings-close').addEventListener('click', () => { ui.settings.hidden = true; });
  ui.settings.addEventListener('click', (e) => { if (e.target === ui.settings) ui.settings.hidden = true; });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !ui.settings.hidden) ui.settings.hidden = true;
  });

  $('btn-again').addEventListener('click', () => {
    Sound.press();
    startShop(state ? state.shopId : Items.SHOPS[0].id);
  });
  $('btn-to-title').addEventListener('click', () => { Sound.press(); backToTitle(); });
  $('btn-home').addEventListener('click', () => { Sound.press(); ui.confirm.hidden = false; });
  $('btn-continue').addEventListener('click', () => { Sound.press(); ui.confirm.hidden = true; });
  $('btn-quit').addEventListener('click', () => { Sound.press(); backToTitle(); });

  // ------------------------------------------------------------ 読み上げの声

  const voicePick = $('voice-pick');
  const voiceSelect = $('voice-select');

  function updateVoiceUI() {
    const names = Voice.voices;
    voicePick.hidden = (names.length === 0 && !Voice.recorded) || !settings.voice;
    // 空の値は VOICEVOX の音声（ないときは端末のいちばん自然な声）
    const auto = `<option value="">${Voice.recorded ? '冥鳴ひまり（VOICEVOX）' : 'おまかせ'}</option>`;
    voiceSelect.innerHTML = auto + names.map((n) => {
      const label = n.replace(/^Microsoft\s+/i, '').replace(/\s*-\s*Japanese \(Japan\)/i, '');
      return `<option value="${n.replace(/"/g, '&quot;')}">${label.replace(/</g, '&lt;')}</option>`;
    }).join('');
    voiceSelect.value = names.includes(settings.voiceName) ? settings.voiceName : '';
  }

  Voice.setVoice(settings.voiceName);
  Voice.onVoicesChanged(updateVoiceUI);
  voiceSelect.addEventListener('change', () => {
    settings.voiceName = voiceSelect.value;
    saveSettings();
    Voice.setVoice(settings.voiceName);
    // 選んだ声をその場で試しに聞かせる
    Voice.cancel();
    Voice.say('いらっしゃいませ！');
  });

  // ------------------------------------------------------------ はじまり

  renderTitle();
  renderSizeButtons();
  updateOptionUI();
  updateVoiceUI();
  applyAudioSettings();
  showTitle();

  // 動作確認用：?shop=<お店の id> でタイトルをとばして開店する
  const debugShop = new URLSearchParams(location.search).get('shop');
  if (Items.shop(debugShop)) startShop(debugShop);
})();
