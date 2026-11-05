/**
 * 画面制御。物語の進行（story.js）の出来事に合わせて、絵を動かし、語りを再生する。
 *
 * - 舞台（SVG）のどこをタッチしても、その場面の操作（つくる・ふーっ・おみず）になる
 * - マイクを ON にすると、息の「ふーっ」でもオオカミが吹く（タッチでも遊べる）
 * - 語りやアニメーションの再生中は操作を受け付けない（busy）
 */
(function () {
  'use strict';

  const Story = window.PigsStory;
  const Breath = window.PigsBreath;
  const Art = window.PigsArt;
  const Sound = window.PigsSound;
  const Voice = window.PigsVoice;
  const Mic = window.PigsMic;

  const NS = 'http://www.w3.org/2000/svg';
  const G = Art.GROUND;
  const HOUSE_X = Art.HOUSE_X;
  const PIG_S = 0.85;
  const WOLF_S = 0.9;
  const WOLF_X = 232;
  const PILE_X = 225;
  /** どの画面の形でも必ず見えるようにする範囲（ワールド座標）。 */
  const ZONE = { x: 130, y: 110, w: 660, h: 560 };

  /** 家ごとの、家をつくるこぶたと、そこにいるこぶたの位置。 */
  const HOUSE_PIGS = {
    straw: { builder: 1, pigs: [[1, 690]] },
    wood: { builder: 2, pigs: [[2, 672], [1, 752]] },
    brick: { builder: 3, pigs: [[3, 650], [2, 712], [1, 774]] },
  };
  const INDOOR_PIGS = [[3, 640], [2, 705], [1, 770]];


  const $ = (id) => document.getElementById(id);
  const svg = $('svg');
  const stage = $('stage');
  const layer = {
    bg: $('l-bg'), props: $('l-props'), actors: $('l-actors'),
    front: $('l-front'), fx: $('l-fx'), hint: $('l-hint'),
  };
  const ui = {
    title: $('title'), end: $('end'), confirm: $('confirm'), topbar: $('topbar'),
    prompt: $('prompt'), dots: $('dots'), meter: $('meter-fill'),
    caption: $('caption'), line: $('line'), bubble: $('bubble'), bubbleLine: $('bubble-line'),
    fade: $('fade'), toast: $('toast'), micNote: $('mic-note'),
    optMic: $('opt-mic'), optVoice: $('opt-voice'), optText: $('opt-text'), optSound: $('opt-sound'),
    btnMic: $('btn-mic'), btnSound: $('btn-sound'),
  };

  // ------------------------------------------------------------ 設定

  const SETTINGS_KEY = 'three-little-pigs-settings';
  const settings = Object.assign({ mic: false, voice: true, text: false, sound: true, muted: false, voiceName: '' }, loadSettings());

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
  function applyAudioSettings() {
    Voice.setEnabled(settings.voice && !settings.muted);
    Sound.setEnabled(settings.sound && !settings.muted);
  }

  // ------------------------------------------------------------ 状態

  let state = Story.createState();
  let busy = false;
  let interactive = false;
  let runId = 0;
  let hintTimer = 0;
  let bubbleTimer = 0;
  /** 吹き出しを出しているキャラクター（画面の大きさが変わったら付け直す）。 */
  let bubbleWho = null;
  let toastTimer = 0;
  /** いまの場面のキャラクターや小道具。 */
  let A = {};
  const detector = Breath.createBreathDetector();
  const CANCEL = { cancelled: true };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (a, b) => a + Math.random() * (b - a);

  /**
   * 演出（語りとアニメーション）を 1 本再生する。
   * タイトルに戻ったときなどに runId が変わると、次の待ちで CANCEL を投げて止まる。
   */
  function play(fn) {
    const id = ++runId;
    const alive = () => id === runId;
    const chk = () => { if (!alive()) throw CANCEL; };
    const d = {
      alive,
      chk,
      async wait(ms) { await sleep(ms); chk(); },
      async say(who, text) {
        chk();
        if (who === 'narrator') showCaption(text);
        else showBubble(who, text);
        await Voice.say(text, who);
        chk();
        await sleep(220);
        chk();
        // せりふの吹き出しは、キャラクターが動き出す前に消す（操作を待つときは showPrompt で残す）
        if (who !== 'narrator') scheduleHideBubble(700);
      },
      async all(list) { await Promise.all(list); chk(); },
      async run(p) { await p; chk(); },
    };
    busy = true;
    hidePrompt();
    hideBubble();
    return Promise.resolve()
      .then(() => fn(d))
      .catch((e) => { if (e !== CANCEL) console.error(e); })
      .finally(() => { if (alive()) busy = false; });
  }

  // ------------------------------------------------------------ 画面の大きさ

  /** ZONE がかならず収まり、余ったぶんは空と地面が広がるように viewBox を決める。 */
  function fit() {
    const w = stage.clientWidth || window.innerWidth;
    const h = stage.clientHeight || window.innerHeight;
    if (!w || !h) return;
    const s = Math.min(w / ZONE.w, h / ZONE.h);
    const vw = w / s;
    const vh = h / s;
    const x0 = ZONE.x + ZONE.w / 2 - vw / 2;
    // 縦に余るとき（縦長の画面）は、空を多めに見せて地面を画面の下寄りにする
    const y0 = ZONE.y - (vh - ZONE.h) * 0.68;
    svg.setAttribute('viewBox', `${x0.toFixed(1)} ${y0.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}`);
    if (bubbleWho) placeBubble(bubbleWho);
  }

  function toWorld(clientX, clientY) {
    const m = svg.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  // ------------------------------------------------------------ SVG の部品とアニメーション

  const tf = (p) => `translate(${p.x}px, ${p.y}px) scale(${p.s})`;

  function el(parent, cls, html, x, y, s) {
    const g = document.createElementNS(NS, 'g');
    if (cls) g.setAttribute('class', cls);
    g.innerHTML = html || '';
    parent.appendChild(g);
    if (x !== undefined) place(g, x, y, s);
    return g;
  }

  function place(g, x, y, s) {
    g._pos = { x, y, s: s === undefined ? (g._pos ? g._pos.s : 1) : s };
    g.style.transform = tf(g._pos);
  }

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

  function moveTo(g, x, y, ms, easing, s) {
    const from = Object.assign({}, g._pos);
    const to = { x, y, s: s === undefined ? from.s : s };
    g._pos = to;
    return tween(g, [{ transform: tf(from) }, { transform: tf(to) }], { duration: ms, easing: easing || 'ease-in-out' });
  }

  /** 山なりにジャンプして移動する。 */
  function jumpTo(g, x, y, height, ms) {
    const from = Object.assign({}, g._pos);
    const to = { x, y, s: from.s };
    const mid = { x: (from.x + x) / 2, y: Math.min(from.y, y) - height, s: from.s };
    g._pos = to;
    return tween(g, [
      { transform: tf(from), easing: 'ease-out' },
      { transform: tf(mid), offset: 0.5, easing: 'ease-in' },
      { transform: tf(to) },
    ], { duration: ms, easing: 'linear' });
  }

  async function walkTo(g, x, ms) {
    g.classList.add('walking');
    await moveTo(g, x, g._pos.y, ms, 'linear');
    g.classList.remove('walking');
  }

  function hop(g, height) {
    const body = g && g.querySelector('.a-body');
    return tween(body, [
      { translate: '0 0' }, { translate: `0 ${-(height || 26)}px`, offset: 0.4 }, { translate: '0 0' },
    ], { duration: 420, easing: 'ease-out' });
  }

  function face(g, dir) {
    const flip = g && g.querySelector('.a-flip');
    if (flip) flip.style.scale = dir < 0 ? '-1 1' : '1 1';
  }

  function fadeOut(g, ms) {
    return tween(g, [{ opacity: 1 }, { opacity: 0 }], { duration: ms || 300 });
  }

  // ------------------------------------------------------------ キャラクター

  function addPig(n, x, mood) {
    const g = el(layer.actors, 'actor pig', Art.pig(n), x, G, PIG_S);
    if (mood) g.classList.add('pig--' + mood);
    A['pig' + n] = g;
    return g;
  }

  function pigs() {
    return [A.pig1, A.pig2, A.pig3].filter(Boolean);
  }

  function pigMood(g, mood) {
    if (!g) return;
    g.classList.remove('pig--happy', 'pig--scared');
    if (mood) g.classList.add('pig--' + mood);
  }

  function addWolf(x, y, s) {
    A.wolf = el(layer.actors, 'actor wolf', Art.wolf(), x, y === undefined ? G : y, s || WOLF_S);
    return A.wolf;
  }

  function wolfMood() {
    if (!A.wolf) return;
    // 表情（wolf--*）だけを入れ替える。ばんそうこうは一度はったら残す
    for (const c of Array.from(A.wolf.classList)) {
      if (c.startsWith('wolf--') && c !== 'wolf--bandage') A.wolf.classList.remove(c);
    }
    for (const m of arguments) A.wolf.classList.add('wolf--' + m);
    A.wolf.style.removeProperty('--puff');
  }

  // ------------------------------------------------------------ 場面の絵

  function clearWorld() {
    for (const k of Object.keys(layer)) layer[k].innerHTML = '';
    layer.bg.classList.remove('boiling');
    layer.props.classList.remove('boiling');
    layer.front.classList.remove('boiling');
    A = {};
  }

  /** そとの場面。builtCount 個までパーツを表示した家を置く（-1 なら家なし）。 */
  function renderOutdoor(type, builtCount) {
    clearWorld();
    layer.bg.innerHTML = Art.outdoor();
    if (type) {
      A.house = el(layer.props, 'house-shake', Art.house(type));
      A.house.querySelectorAll('.piece').forEach((p) => {
        if (Number(p.dataset.i) >= builtCount) p.style.opacity = '0';
      });
    }
  }

  function renderIndoor() {
    clearWorld();
    layer.bg.innerHTML = Art.indoor();
    layer.props.innerHTML = Art.fireplaceBack();
    layer.front.innerHTML = Art.fireplaceFront();
    A.water = layer.props.querySelector('.water');
    A.fire = layer.props.querySelector('.fire');
    A.water.style.setProperty('--fill', '0');
  }

  // ------------------------------------------------------------ ヒント・語り

  /** 語り（地の文）。設定の「もじ」が OFF のときは読み上げだけにする。 */
  function showCaption(text) {
    hideBubble();
    if (!settings.text) {
      hideCaption();
      return;
    }
    ui.line.textContent = text;
    ui.caption.hidden = false;
    ui.caption.classList.remove('speak');
    void ui.caption.offsetWidth;
    ui.caption.classList.add('speak');
  }

  function hideCaption() {
    ui.caption.hidden = true;
  }

  /** 話しているキャラクター（いなければ家）の SVG 要素を返す。 */
  function speakers(who) {
    const visible = (g) => g && g.isConnected && g.style.opacity !== '0';
    let list = who === 'pigs' ? pigs() : [A[who]];
    list = list.filter(visible);
    if (!list.length && A.house) list = [A.house];
    return list;
  }

  function showBubble(who, text) {
    hideCaption();
    clearTimeout(bubbleTimer);
    ui.bubbleLine.textContent = text;
    ui.bubble.className = 'bubble ' + who;
    ui.bubble.hidden = false;
    bubbleWho = who;
    placeBubble(who);
  }

  /** 吹き出しをキャラクターの頭の上に置く。上に入らないときは画面の中に収める。 */
  function placeBubble(who) {
    const list = speakers(who);
    if (!list.length) {
      ui.bubble.hidden = true;
      return;
    }
    const app = ui.bubble.offsetParent || document.body;
    const box = app.getBoundingClientRect();
    let left = Infinity, right = -Infinity, top = Infinity;
    for (const g of list) {
      const r = g.getBoundingClientRect();
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      top = Math.min(top, r.top);
    }
    const cx = (left + right) / 2 - box.left;
    const w = ui.bubble.offsetWidth;
    const h = ui.bubble.offsetHeight;
    const margin = 10;
    const x = Math.max(margin, Math.min(box.width - w - margin, cx - w / 2));
    const y = Math.max(64, top - box.top - h - 18);
    ui.bubble.style.left = x + 'px';
    ui.bubble.style.top = y + 'px';
    // しっぽは話している人の真上を指す
    ui.bubble.style.setProperty('--tail', Math.max(24, Math.min(w - 24, cx - x)) + 'px');
  }

  function hideBubble() {
    clearTimeout(bubbleTimer);
    ui.bubble.hidden = true;
    bubbleWho = null;
  }

  function scheduleHideBubble(ms) {
    clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(hideBubble, ms);
  }

  /** 目印（あと何回か・マイクの音量）を出して、操作を待つ。 */
  function showPrompt(firstTime) {
    const scene = Story.currentScene(state);
    const kind = scene.kind;
    const micMode = kind === 'blow' && Mic.active;
    // 「タッチしてね」などの最後のせりふは、操作するまで残しておく
    clearTimeout(bubbleTimer);
    const total = Story.required(scene);
    let dots = '';
    for (let i = 0; i < total; i++) dots += `<i class="${i < state.count ? 'on' : ''}"></i>`;
    ui.dots.innerHTML = total > 1 ? dots : '';
    ui.prompt.className = 'prompt glass' + (micMode ? ' mic' : '');
    ui.meter.style.height = '0%';
    ui.prompt.hidden = !micMode && total <= 1;
    interactive = true;
    detector.reset();
    scheduleHint(firstTime ? 400 : 5000);
  }

  function hidePrompt() {
    interactive = false;
    ui.prompt.hidden = true;
    hideHint();
  }

  /** さわってほしいもの（わらの山・オオカミ・水さし）。 */
  function hintTarget() {
    const kind = Story.currentScene(state).kind;
    if (kind === 'build' && A.pile) return { g: A.pile, x: PILE_X, y: G - 45, r: 120 };
    if (kind === 'blow' && A.wolf) return { g: A.wolf, x: A.wolf._pos.x, y: G - 100, r: 125 };
    if (kind === 'fill' && A.pitcher) return { g: A.pitcher, x: A.pitcher._pos.x + 20, y: A.pitcher._pos.y - 40, r: 90 };
    return null;
  }

  /** しばらく操作がないと、さわってほしいものを光らせて、ぴょこぴょこ動かす。 */
  function scheduleHint(delay) {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      const t = interactive && !busy ? hintTarget() : null;
      if (!t) return;
      layer.hint.innerHTML = '';
      el(layer.hint, '', Art.beckon(t.r), t.x, t.y, 1);
      t.g.classList.add('beckon');
    }, delay);
  }

  function hideHint() {
    clearTimeout(hintTimer);
    layer.hint.innerHTML = '';
    for (const g of [A.pile, A.wolf, A.pitcher]) if (g) g.classList.remove('beckon');
  }

  function toast(text) {
    ui.toast.textContent = text;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 3500);
  }

  // ------------------------------------------------------------ 効果

  function burst(x, y, count, kind) {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + rand(-0.3, 0.3);
      const dist = rand(50, 110);
      const html = kind === 'heart' ? Art.heart() : Art.star(['#fff3b8', '#ffe0e6', '#e0f3ff', '#eaf7da'][i % 4]);
      const g = el(layer.fx, '', html, x, y, rand(0.8, 1.3));
      const to = { x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist * 0.8, s: 0.2 };
      tween(g, [
        { transform: tf(g._pos), opacity: 1 },
        { transform: tf(to), opacity: 0 },
      ], { duration: rand(600, 900), easing: 'cubic-bezier(.2,.7,.4,1)' }).then(() => g.remove());
    }
  }

  function floatHearts(x, y, count) {
    for (let i = 0; i < count; i++) {
      const g = el(layer.fx, '', Art.heart(), x + rand(-40, 40), y, rand(0.9, 1.4));
      const from = g._pos;
      const to = { x: from.x + rand(-30, 30), y: from.y - rand(80, 140), s: from.s };
      tween(g, [
        { transform: tf(from), opacity: 0 },
        { transform: tf(from), opacity: 1, offset: 0.15 },
        { transform: tf(to), opacity: 0 },
      ], { duration: rand(1300, 1900), delay: i * 220, easing: 'ease-out' }).then(() => g.remove());
    }
  }

  function twinkle(p) {
    const g = el(layer.fx, '', Art.star('#fff8c4'), p.x, p.y, 0.9);
    tween(g, [
      { transform: tf(g._pos), opacity: 1 },
      { transform: tf({ x: p.x, y: p.y - 40, s: 0.3 }), opacity: 0 },
    ], { duration: 600 }).then(() => g.remove());
  }

  function confetti(count) {
    const vb = svg.viewBox.baseVal;
    const colors = ['#f4b6be', '#f3d27a', '#a9d6ef', '#b9dca0', '#d4c4f0', '#f6c49a'];
    for (let i = 0; i < count; i++) {
      const g = document.createElementNS(NS, 'rect');
      const w = rand(10, 18);
      g.setAttribute('x', (vb.x + rand(0, vb.width)).toFixed(1));
      g.setAttribute('y', (vb.y - 30).toFixed(1));
      g.setAttribute('width', w.toFixed(1));
      g.setAttribute('height', (w * 0.55).toFixed(1));
      g.setAttribute('rx', '2');
      g.setAttribute('fill', colors[i % colors.length]);
      g.setAttribute('class', 'fx-item');
      layer.fx.appendChild(g);
      const drop = vb.height + 60;
      tween(g, [
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: `translate(${rand(-80, 80).toFixed(0)}px, ${drop.toFixed(0)}px) rotate(${rand(360, 1080).toFixed(0)}deg)` },
      ], { duration: rand(2600, 4200), delay: rand(0, 1800), easing: 'linear' }).then(() => g.remove());
    }
  }

  /** オオカミの口から家に向かって風を吹かせる。 */
  function gust() {
    const w = A.wolf;
    const x = w._pos.x + 88 * w._pos.s;
    const y = w._pos.y - 128 * w._pos.s;
    const g = el(layer.fx, '', Art.wind(), x, y, 1);
    const gusts = g.querySelectorAll('.gust');
    const runs = Array.from(gusts).map((p, i) => tween(p, [
      { strokeDashoffset: '260', opacity: 0.95 },
      { strokeDashoffset: '-260', opacity: 0.2 },
    ], { duration: 850, delay: i * 90, easing: 'ease-out' }));
    return Promise.all(runs).then(() => g.remove());
  }

  // ------------------------------------------------------------ タイトル

  function showTitle() {
    runId++;
    Voice.cancel();
    busy = false;
    hidePrompt();
    hideCaption();
    hideBubble();
    state = Story.createState();
    ui.topbar.hidden = true;
    ui.end.hidden = true;
    ui.confirm.hidden = true;
    ui.title.hidden = false;
    renderOutdoor(null);
    // タイトルの文字やボタンと重ならないよう、こぶたは左右に分けて置く
    [[1, 215], [2, 715], [3, 790]].forEach(([n, x], i) => {
      const p = addPig(n, x, 'happy');
      p.classList.add('bounce');
      p.querySelector('.a-body').style.animationDelay = `${-i * 0.18}s`;
    });
    tween(ui.fade, [{ opacity: Number(getComputedStyle(ui.fade).opacity) || 0 }, { opacity: 0 }], { duration: 300 });
  }

  function startStory(fromScene) {
    Sound.unlock();
    Voice.unlock();
    applyAudioSettings();
    if (settings.mic && Mic.supported()) {
      Mic.start().then((ok) => {
        if (!ok) {
          toast('マイクが つかえないので、タッチで あそんでね');
        }
        updateMicUI();
      });
    }
    ui.title.hidden = true;
    ui.end.hidden = true;
    ui.topbar.hidden = false;
    updateMicUI();

    const id = fromScene && fromScene !== 'title' ? fromScene : null;
    if (id) {
      state = Story.createState(id);
      play((d) => enterScene(d, id, true));
      return;
    }
    state = Story.act(Story.createState(), 'start').state;
    play(intro);
  }

  /** 途中の場面から始める（デバッグ用の ?scene= と、もういっかい）。 */
  function enterScene(d, id, jumped) {
    switch (id) {
      case 'straw-build': return enterBuild(d, 'straw');
      case 'wood-build': return enterBuild(d, 'wood');
      case 'brick-build': return enterBuild(d, 'brick');
      case 'straw-blow': return enterBlow(d, 'straw', jumped);
      case 'wood-blow': return enterBlow(d, 'wood', jumped);
      case 'brick-blow': return enterBlow(d, 'brick', jumped);
      case 'pot-fill': return enterFill(d);
      case 'ending': return enterEnding(d);
    }
    return null;
  }

  // ------------------------------------------------------------ 物語の流れ

  async function transition(d, render) {
    await d.run(tween(ui.fade, [{ opacity: 0 }, { opacity: 1 }], { duration: 320 }));
    hideBubble();
    render();
    await d.run(tween(ui.fade, [{ opacity: 1 }, { opacity: 0 }], { duration: 420 }));
  }

  async function intro(d) {
    await transition(d, () => {
      renderOutdoor(null);
      [1, 2, 3].forEach((n, i) => addPig(n, 380 + i * 90, 'happy').classList.add('bounce'));
    });
    await d.say('narrator', 'むかし むかし、3びきの こぶたが いました。');
    pigs().forEach((p) => p.classList.remove('bounce'));
    await d.say('narrator', 'おおきく なった こぶたたちは、じぶんの おうちを つくる ことに しました。');
    pigs().forEach((p) => pigMood(p, null));
    Sound.run();
    await d.all([walkTo(A.pig1, 1150, 1400), walkTo(A.pig2, 1200, 1300), walkTo(A.pig3, 1250, 1200)]);
    await enterBuild(d, 'straw');
  }

  const BUILD_LINES = {
    straw: ['1ぴきめの こぶたは、わらで おうちを つくります。', 'わらを タッチしてね！'],
    wood: ['2ひきめの こぶたは、きで おうちを つくります。', 'きを タッチしてね！'],
    brick: ['3びきめの こぶたは、レンガで おうちを つくります。じかんは かかるけど、とっても じょうぶ！', 'レンガを タッチしてね！'],
  };

  async function enterBuild(d, type) {
    const cfg = HOUSE_PIGS[type];
    const scene = Story.SCENES.find((s) => s.kind === 'build' && s.house === type);
    const arrivals = [];
    await transition(d, () => {
      renderOutdoor(type, 0);
      A.pile = el(layer.props, 'actor pile', `<g class="a-body">${Art.pile(type, scene.pieces)}</g>`, PILE_X, G, 1);
      cfg.pigs.forEach(([n, x]) => {
        if (n === cfg.builder) {
          addPig(n, x);
        } else {
          addPig(n, -140 - arrivals.length * 70, 'scared');
          arrivals.push([n, x]);
        }
      });
    });
    if (arrivals.length) {
      Sound.run();
      await d.all(arrivals.map(([n, x], i) => walkTo(A['pig' + n], x, 1500 + i * 150)));
      arrivals.forEach(([n]) => pigMood(A['pig' + n], null));
    }
    const [narration, ask] = BUILD_LINES[type];
    await d.say('narrator', narration);
    hop(A['pig' + cfg.builder]);
    await d.say('pig' + cfg.builder, ask);
    showPrompt(true);
  }

  async function onPiece(d, ev) {
    hideHint();
    const pc = A.house.querySelector(`.piece[data-i="${ev.index}"]`);
    const item = A.pile && A.pile.querySelector(`.pile-item[data-k="${ev.index}"]`);
    Sound.place(ev.house);
    if (item) {
      tween(item, [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: 'translate(0, -50px) scale(.3)', opacity: 0 },
      ], { duration: 280, easing: 'ease-in' });
    }
    if (pc) {
      pc.style.opacity = '';
      tween(pc, [
        { transform: 'translate(0, -110px) scale(.9)', opacity: 0 },
        { transform: 'translate(0, 0) scale(1.06, .92)', opacity: 1, offset: 0.65 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      ], { duration: 440, easing: 'ease-in' }).then(() => {
        const b = pc.getBBox();
        burst(b.x + b.width / 2, b.y + b.height, 5, 'star');
      });
    }
    hop(A['pig' + HOUSE_PIGS[ev.house].builder], 18);
    await d.wait(ev.index + 1 >= ev.total ? 500 : 170);
  }

  const BUILT_LINES = {
    straw: 'できた！ わらの おうち！',
    wood: 'できた！ きの おうちは じょうぶだよ！',
    brick: 'できた！ レンガの おうち！',
  };

  async function onBuilt(d, type) {
    const builder = A['pig' + HOUSE_PIGS[type].builder];
    Sound.built();
    burst(HOUSE_X, 400, 12, 'star');
    pigs().forEach((p) => { pigMood(p, 'happy'); p.classList.add('bounce'); });
    if (A.pile) fadeOut(A.pile, 400);
    await d.say('pig' + HOUSE_PIGS[type].builder, BUILT_LINES[type]);
    pigs().forEach((p) => { pigMood(p, null); p.classList.remove('bounce'); });
    void builder;
    await enterBlow(d, type, false);
  }

  const WOLF_COMES = {
    straw: 'そこへ、おなかを すかせた おおかみが やってきました。',
    wood: 'また おおかみが やってきました。',
    brick: 'またまた おおかみが やってきました。',
  };

  async function enterBlow(d, type, jumped) {
    const cfg = HOUSE_PIGS[type];
    if (jumped) {
      await transition(d, () => {
        renderOutdoor(type, 99);
        cfg.pigs.forEach(([n, x]) => addPig(n, x));
      });
    } else if (A.pile) {
      A.pile.remove();
      A.pile = null;
    }
    addWolf(-260);
    Sound.wolfIn();
    await d.run(walkTo(A.wolf, WOLF_X, 2000));
    await d.say('narrator', WOLF_COMES[type]);
    // こぶたたちは あわてて おうちの なかへ
    pigs().forEach((p) => pigMood(p, 'scared'));
    Sound.run();
    await d.all(pigs().map((p, i) => walkTo(p, HOUSE_X + i * 6, 600 + i * 120)));
    await d.all(pigs().map((p) => fadeOut(p, 200)));
    const many = type !== 'straw';
    await d.say('wolf', many ? 'こぶたくんたち、いれておくれ！' : 'こぶたくん、いれておくれ！');
    await d.say(many ? 'pigs' : 'pig1', 'いやだよー！');
    await d.say('wolf', 'それなら、こんな おうち ふきとばしてやる！');
    if (type === 'straw') {
      await d.say('narrator', Mic.active
        ? 'おおかみに なって、マイクに ふーっ！ って いきを ふきかけてね。タッチでも いいよ。'
        : 'おおかみを タッチして、ふーっ！ って ふきとばそう！');
    } else {
      await d.say('narrator', 'みんなも いっしょに、ふーっ！');
    }
    showPrompt(true);
  }

  async function blowAction(d) {
    hideHint();
    wolfMood('puff');
    Sound.inhale();
    await d.wait(380);
    wolfMood('blow');
    Sound.whoosh();
    const wind = gust();
    await d.wait(380);
    return wind;
  }

  async function onShake(d, ev) {
    await blowAction(d);
    Sound.wobble();
    await d.run(tween(A.house, [
      { rotate: '0deg' }, { rotate: '-3deg' }, { rotate: '3deg' }, { rotate: '-2deg' }, { rotate: '1deg' }, { rotate: '0deg' },
    ], { duration: 800 }));
    wolfMood();
    await d.say('narrator', ev.index === 0 ? 'ぐらぐら！ もう すこし！ もういっかい ふーっ！' : 'もういっかい ふーっ！');
    showPrompt(false);
  }

  async function onBlownAway(d, type) {
    await blowAction(d);
    Sound.crash();
    A.house.querySelectorAll('.piece').forEach((p, i) => {
      tween(p, [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${rand(500, 900).toFixed(0)}px, ${rand(-420, -160).toFixed(0)}px) rotate(${rand(-540, 540).toFixed(0)}deg)`, opacity: 0 },
      ], { duration: rand(1000, 1500), delay: i * 40, easing: 'cubic-bezier(.25,.6,.4,1)' });
    });
    // かくれていた こぶたが あらわれる
    pigs().forEach((p, i) => {
      place(p, HOUSE_X - 20 + i * 50, G);
      pigMood(p, 'scared');
      tween(p, [{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    });
    await d.wait(900);
    wolfMood();
    const many = type !== 'straw';
    await d.say('narrator', many ? 'きの おうちも、ふきとんで しまいました！' : 'わらの おうちは、ふきとんで しまいました！');
    await d.say(many ? 'pigs' : 'pig1', many ? 'にげろー！' : 'たすけてー！');
    Sound.run();
    await d.all(pigs().map((p, i) => walkTo(p, 1150 + i * 60, 900 + i * 100)));
    await d.say('wolf', 'まてー！');
    await d.run(walkTo(A.wolf, 1300, 1300));
    await d.say('narrator', many
      ? '2ひきの こぶたは、3びきめの こぶたの ところへ にげました。'
      : '1ぴきめの こぶたは、2ひきめの こぶたの ところへ にげました。');
    await enterBuild(d, many ? 'brick' : 'wood');
  }

  async function onHolds(d, ev) {
    await blowAction(d);
    Sound.boing();
    await d.run(tween(A.house, [
      { rotate: '0deg' }, { rotate: '-.6deg' }, { rotate: '.6deg' }, { rotate: '0deg' },
    ], { duration: 400 }));
    wolfMood();
    if (ev.index === 0) {
      await d.say('narrator', 'あれれ？ レンガの おうちは びくとも しないよ！');
      await d.say('wolf', 'ぐぬぬ… もういっかい！');
    } else {
      await d.say('wolf', 'まだまだ！ もっと つよく ふーっ！');
    }
    showPrompt(false);
  }

  async function onGaveUp(d) {
    await blowAction(d);
    Sound.boing();
    await d.run(tween(A.house, [
      { rotate: '0deg' }, { rotate: '-.6deg' }, { rotate: '.6deg' }, { rotate: '0deg' },
    ], { duration: 400 }));
    wolfMood('tired');
    Sound.tired();
    await d.say('narrator', 'なんど ふいても、レンガの おうちは ふきとびません！');
    await d.say('wolf', 'はあ、はあ… こうなったら、えんとつから はいってやる！');
    wolfMood();
    // やねに のぼって えんとつへ
    await d.run(walkTo(A.wolf, 330, 600));
    A.wolf.classList.add('airborne');
    Sound.climb();
    await d.run(jumpTo(A.wolf, 410, 334, 90, 650));
    A.wolf.classList.add('walking');
    await d.run(moveTo(A.wolf, 462, 294, 450, 'linear'));
    await d.run(moveTo(A.wolf, 494, 312, 350, 'linear'));
    A.wolf.classList.remove('walking');
    await d.say('narrator', 'たいへん！ おおかみが やねに のぼったよ！');
    await d.say('pig3', 'いまの うちに、おなべに おゆを わかそう！');
    await enterFill(d);
  }

  async function enterFill(d) {
    await transition(d, () => {
      renderIndoor();
      INDOOR_PIGS.forEach(([n, x]) => addPig(n, x));
      A.pitcher = el(layer.actors, 'actor pitcher', Art.pitcher(), 290, 392, 1);
    });
    await d.say('narrator', 'こぶたたちは、だんろに おおきな おなべを かけました。');
    hop(A.pig3);
    await d.say('pig3', 'おみずを タッチして、おなべに いれてね！');
    showPrompt(true);
  }

  async function onPour(d, ev) {
    hideHint();
    const body = A.pitcher.querySelector('.a-body');
    Sound.pour();
    const tilt = tween(body, [
      { rotate: '0deg' }, { rotate: '42deg', offset: 0.3 }, { rotate: '42deg', offset: 0.75 }, { rotate: '0deg' },
    ], { duration: 900, easing: 'ease-in-out' });
    await d.wait(260);
    const stream = el(layer.fx, '', `<path d="M366 368 C384 380 392 400 398 420" fill="none" stroke="#6ec6ff" stroke-width="12" stroke-linecap="round" stroke-dasharray="100" stroke-dashoffset="100"/>`);
    const path = stream.firstChild;
    await d.run(tween(path, [{ strokeDashoffset: '100' }, { strokeDashoffset: '0' }], { duration: 180, easing: 'ease-in' }));
    A.water.style.setProperty('--fill', ((ev.index + 1) / ev.total).toFixed(2));
    burst(400, 418, 5, 'star');
    await d.wait(260);
    await d.run(tween(path, [{ strokeDashoffset: '0' }, { strokeDashoffset: '-100' }], { duration: 160 }));
    stream.remove();
    await d.run(tilt);
    pigs().forEach((p, i) => setTimeout(() => hop(p, 14), i * 80));
  }

  async function onBoiling(d) {
    layer.bg.classList.add('boiling');
    layer.props.classList.add('boiling');
    layer.front.classList.add('boiling');
    A.fire.classList.add('big');
    Sound.boil();
    fadeOut(A.pitcher, 400);
    await d.wait(600);
    await d.say('narrator', 'ぐつぐつ ぐつぐつ… おゆが わいたよ！');
    pigs().forEach((p) => pigMood(p, 'happy'));
    await d.say('wolf', 'よーし、えんとつから はいるぞー！');
    // おおかみが えんとつを すべりおりてくる。だんろの口より上（えんとつの中）は見えないよう切り抜く
    const chute = el(layer.actors, '', '');
    chute.setAttribute('clip-path', 'url(#fireplace-opening)');
    addWolf(420, 200, 0.85);
    chute.appendChild(A.wolf);
    A.wolf.classList.add('airborne');
    pigs().forEach((p) => pigMood(p, 'scared'));
    Sound.slide();
    await d.run(moveTo(A.wolf, 420, 488, 800, 'cubic-bezier(.5,0,1,1)'));
    Sound.splash();
    burst(420, 420, 10, 'star');
    wolfMood('hot');
    await d.wait(250);
    Sound.hot();
    face(A.wolf, -1);
    layer.actors.appendChild(A.wolf);
    chute.remove();
    const jump = jumpTo(A.wolf, 215, G, 230, 850);
    setTimeout(() => A.wolf && A.wolf.classList.remove('airborne'), 800);
    await d.run(jump);
    await d.say('wolf', 'あちちちちちー！！');
    Sound.run();
    for (let i = 0; i < 2; i++) {
      face(A.wolf, 1);
      await d.run(walkTo(A.wolf, 290, 380));
      face(A.wolf, -1);
      await d.run(walkTo(A.wolf, 190, 380));
    }
    face(A.wolf, 1);
    await d.say('narrator', 'おおかみは、おしりを やけどして しまいました。');
    await enterEnding(d);
  }

  async function enterEnding(d) {
    // なかなおりは、そとの レンガの おうちの まえで
    await transition(d, () => {
      renderOutdoor('brick', 99);
      addWolf(WOLF_X, G, WOLF_S);
      wolfMood('sorry');
      INDOOR_PIGS.forEach(([n, x]) => addPig(n, x));
    });
    await d.say('wolf', 'いたたた… こぶたくんたち、いじわるして ごめんなさい。');
    await d.say('pig3', 'もう いじわる しない？');
    await d.say('wolf', 'しない しない！ やくそく する！');
    await d.say('pig1', 'じゃあ、ゆるして あげる！');
    Sound.run();
    await d.run(walkTo(A.pig1, 352, 1300));
    hop(A.pig1);
    Sound.sparkle();
    A.wolf.classList.add('wolf--bandage');
    burst(WOLF_X - 30, G - 45, 6, 'star');
    await d.say('pig1', 'ばんそうこう、はって あげるね。');
    await d.say('pig2', 'おおかみさんも、いっしょに あそぼう！');
    wolfMood('happy');
    Sound.happy();
    floatHearts(WOLF_X + 20, G - 170, 5);
    pigs().forEach((p) => pigMood(p, 'happy'));
    [A.wolf, A.pig1, A.pig3, A.pig2].forEach((g, i) => {
      g.classList.add('bounce');
      g.querySelector('.a-body').style.animationDelay = `${-i * 0.15}s`;
    });
    confetti(40);
    floatHearts(HOUSE_X, 380, 6);
    await d.say('narrator', 'それから みんなは、なかよく くらしました。');
    floatHearts(HOUSE_X + 120, 380, 5);
    await d.say('narrator', 'めでたし、めでたし。');
    Sound.fanfare();
    confetti(50);
    hideCaption();
    hideBubble();
    ui.end.hidden = false;
  }


  // ------------------------------------------------------------ 操作

  function act(action) {
    const res = Story.act(state, action);
    if (!res.events.length) return;
    state = res.state;
    const find = (type) => res.events.find((e) => e.type === type);
    play(async (d) => {
      const piece = find('piece');
      if (piece) await onPiece(d, piece);
      if (find('built')) return onBuilt(d, find('built').house);
      if (find('shake')) return onShake(d, find('shake'));
      if (find('blownAway')) return onBlownAway(d, find('blownAway').house);
      if (find('gaveUp')) return onGaveUp(d);
      if (find('holds')) return onHolds(d, find('holds'));
      const pour = find('pour');
      if (pour) await onPour(d, pour);
      if (find('boiling')) return onBoiling(d);
      if (Story.isInteractive(state)) showPrompt(false);
      return null;
    });
  }

  function onStageTap(e) {
    if (e && e.isPrimary === false) return;
    Sound.unlock();
    if (!ui.title.hidden || !ui.end.hidden || !ui.confirm.hidden) return;
    if (busy || !interactive) {
      if (e && e.clientX !== undefined) twinkle(toWorld(e.clientX, e.clientY));
      return;
    }
    act(Story.currentScene(state).kind === 'blow' ? 'blow' : 'tap');
  }

  stage.addEventListener('pointerdown', onStageTap);
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if ((e.key === ' ' || e.key === 'Enter') && e.target === document.body) {
      e.preventDefault();
      onStageTap(null);
    }
  });

  // マイクの音量は、雑音を学習するためにいつも判定器へ渡す
  Mic.onLevel((level, time) => {
    const r = detector.feed(level, time);
    if (!interactive || busy || Story.currentScene(state).kind !== 'blow') return;
    ui.meter.style.height = Math.round(r.strength * 100) + '%';
    if (A.wolf) A.wolf.style.setProperty('--puff', (r.strength * 0.9).toFixed(2));
    if (r.blow) act('blow');
  });

  // ------------------------------------------------------------ ボタン

  function micUnavailableReason() {
    if (Mic.supported()) return '';
    if (!window.isSecureContext) return 'マイクを使うには、https または localhost で開いてください。タッチでも遊べます。';
    return 'このブラウザではマイクが使えません。タッチで遊べます。';
  }

  function updateMicUI() {
    const reason = micUnavailableReason();
    ui.optMic.disabled = !!reason;
    ui.optMic.setAttribute('aria-pressed', String(!reason && settings.mic));
    ui.micNote.textContent = reason || (settings.mic ? 'はじめると、マイクの使用許可を聞かれます。' : '');
    ui.btnMic.classList.toggle('on', Mic.active);
    ui.btnMic.classList.toggle('off', !Mic.active);
    ui.btnMic.classList.toggle('unavailable', !!reason);
    ui.btnMic.setAttribute('aria-pressed', String(Mic.active));
    if (interactive) showPrompt(false);
  }

  function updateSoundUI() {
    ui.optVoice.setAttribute('aria-pressed', String(settings.voice));
    ui.optText.setAttribute('aria-pressed', String(settings.text));
    ui.optSound.setAttribute('aria-pressed', String(settings.sound));
    ui.btnSound.classList.toggle('off', settings.muted);
    ui.btnSound.setAttribute('aria-pressed', String(!settings.muted));
  }

  ui.optMic.addEventListener('click', () => {
    settings.mic = !settings.mic;
    saveSettings();
    updateMicUI();
  });
  ui.optVoice.addEventListener('click', () => {
    settings.voice = !settings.voice;
    saveSettings();
    applyAudioSettings();
    updateSoundUI();
    updateVoiceUI();
  });
  ui.optText.addEventListener('click', () => {
    settings.text = !settings.text;
    saveSettings();
    updateSoundUI();
  });
  ui.optSound.addEventListener('click', () => {
    settings.sound = !settings.sound;
    saveSettings();
    applyAudioSettings();
    updateSoundUI();
    Sound.tap();
  });

  ui.btnMic.addEventListener('click', async () => {
    const reason = micUnavailableReason();
    if (reason) {
      toast(reason);
      return;
    }
    if (Mic.active) {
      Mic.stop();
      settings.mic = false;
    } else {
      const ok = await Mic.start();
      settings.mic = ok;
      if (!ok) toast('マイクが つかえないので、タッチで あそんでね');
    }
    saveSettings();
    updateMicUI();
  });

  ui.btnSound.addEventListener('click', () => {
    settings.muted = !settings.muted;
    saveSettings();
    applyAudioSettings();
    updateSoundUI();
  });

  const DEBUG_SCENE = (() => {
    const id = new URLSearchParams(location.search).get('scene');
    return Story.SCENES.some((s) => s.id === id) ? id : null;
  })();

  $('btn-start').addEventListener('click', () => startStory(DEBUG_SCENE));
  $('btn-again').addEventListener('click', () => {
    ui.end.hidden = true;
    state = Story.act(state, 'restart').state;
    play((d) => enterBuild(d, 'straw'));
  });
  $('btn-to-title').addEventListener('click', showTitle);
  $('btn-home').addEventListener('click', () => { ui.confirm.hidden = false; });
  $('btn-continue').addEventListener('click', () => { ui.confirm.hidden = true; });
  $('btn-quit').addEventListener('click', showTitle);

  // ------------------------------------------------------------ 読み上げの声

  const voicePick = $('voice-pick');
  const voiceSelect = $('voice-select');

  function updateVoiceUI() {
    const names = Voice.voices;
    voicePick.hidden = names.length === 0 || !settings.voice;
    const auto = '<option value="">おまかせ</option>';
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
    Voice.say('むかし むかし、3びきの こぶたが いました。', 'narrator');
  });

  // ------------------------------------------------------------ はじまり

  $('defs').innerHTML = Art.defs();
  updateVoiceUI();

  if ('ResizeObserver' in window) new ResizeObserver(fit).observe(stage);
  window.addEventListener('resize', fit);
  fit();
  applyAudioSettings();
  updateSoundUI();
  updateMicUI();
  showTitle();

  // 日本語の読み上げ音声がない端末では、語りを文字で出すよう案内する
  setTimeout(() => {
    if (!Voice.available && settings.voice) {
      ui.optVoice.title = 'この端末には日本語の読み上げ音声がありません。お話の文章を見るには「もじ」を ON にしてください。';
    }
  }, 1500);
})();
