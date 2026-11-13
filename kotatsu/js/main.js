/**
 * 画面と操作。進行は KotatsuGame（game.js）、絵は KotatsuArt（art.js）、効果音は KotatsuSound（sound.js）。
 *
 * ?play でタイトルをとばして始められる（動作確認用）。
 */
(function () {
  'use strict';

  const G = window.KotatsuGame;
  const A = window.KotatsuArt;
  const S = window.KotatsuSound;

  const SETTINGS_KEY = 'kotatsu.settings.v1';
  const BEST_KEY = 'kotatsu.best.v1';

  const $ = (id) => document.getElementById(id);
  const els = {
    title: $('title'),
    game: $('game'),
    cast: $('cast'),
    start: $('start'),
    sound: $('sound'),
    best: $('best'),
    stage: $('stage'),
    clock: $('clock'),
    nightFill: $('night-fill'),
    score: $('score'),
    inside: $('inside'),
    pause: $('pause'),
    heat: $('heat'),
    heatState: $('heat-state'),
    needle: $('thermo-needle'),
    treat: $('treat'),
    treatCount: $('treat-count'),
    banner: $('banner'),
    overlay: $('overlay'),
    dialogKicker: $('dialog-kicker'),
    dialogTitle: $('dialog-title'),
    dialogBody: $('dialog-body'),
    dialogActions: $('dialog-actions'),
  };

  /** 猫のせりふ。 */
  const LINES = {
    normal: ['…トイレ', 'ちょっと散歩', '飽きた', 'なんか呼ばれた', '…にゃ', '水のみたい'],
    hot: ['あつい', 'のぼせた', 'むり、あつい', 'サウナか？'],
    cold: ['さむい', 'ぬるい', 'ここ寒くない？'],
    bird: ['鳥…！', 'ｶｶｶｶｶ…', 'あれ獲れる'],
    fridge: ['今の音…！', 'ごはんの音', 'カシュッて言った'],
    push: ['…', 'なに', 'ぐえ', 'おされた'],
    push2: ['は？', 'さわんな', 'しつこい'],
    push3: ['次やったら出てく', 'もう知らん', 'いい加減にして'],
    flee: ['シャーッ!!'],
    escape: ['いってきます', 'じゃ', 'ちょっと出る'],
    back: ['ただいま', 'やっぱさむい', '…入れて'],
    treat: ['…ゆるす', 'うまっ', 'しあわせ'],
  };

  const EVENT_TEXT = {
    doorbell: 'ピンポーン♪ 宅配便です',
    fridge: '（冷蔵庫の開く音）',
    bird: 'チュンチュン…（窓の外に鳥）',
    hot: 'こたつが熱すぎる！',
  };

  const HEAT_NAMES = { low: '弱', mid: '中', high: '強' };

  let settings = loadSettings();
  let best = loadBest();
  let game = null;
  let view = null; // 猫ごとの表示の状態
  let raf = 0;
  let last = 0;
  let paused = false;
  let treatMode = false;
  let bannerTimer = 0;

  // ---------- 保存 ----------

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      return { sound: s.sound !== false };
    } catch (e) {
      return { sound: true };
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { /* 保存できなくても遊べる */ }
  }

  function loadBest() {
    try {
      return Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch (e) {
      return 0;
    }
  }

  function saveBest(v) {
    try {
      localStorage.setItem(BEST_KEY, String(v));
    } catch (e) { /* 保存できなくても遊べる */ }
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  // ---------- タイトル ----------

  function buildTitle() {
    els.cast.innerHTML = G.CATS.map((c, i) => `<li class="cast-card">
        ${A.portrait({ index: i, coat: c.coat })}
        <span class="cast-name">${c.name}</span>
        <span class="cast-note">${c.note}</span>
      </li>`).join('');
    els.sound.checked = settings.sound;
    S.setEnabled(settings.sound);
    showBest();
  }

  function showBest() {
    els.best.textContent = best ? `自己ベスト：ぬくぬく ${best.toLocaleString()}` : '';
  }

  function showScreen(name) {
    els.title.hidden = name !== 'title';
    els.game.hidden = name !== 'game';
  }

  // ---------- ゲーム ----------

  function startGame() {
    S.unlock();
    cancelAnimationFrame(raf);
    game = G.createGame({ seed: (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0 });
    els.stage.innerHTML = A.scene(game.cats);
    const svg = els.stage.querySelector('svg');
    view = game.cats.map((c) => ({
      el: svg.querySelector(`#cat-${c.index}`),
      bubble: svg.querySelector(`#bubble-${c.side}`),
      off: A.OFF_IN,
      mood: 'normal',
      bubbleTime: 0,
      fleeing: false,
    }));
    svg.querySelectorAll('.hit').forEach((hit) => {
      hit.addEventListener('pointerdown', onCatTap);
    });
    els.glow = svg.querySelector('#glow');
    els.coldTint = svg.querySelector('#cold-tint');
    els.svg = svg;
    paused = false;
    setTreatMode(false);
    hideOverlay();
    hideBanner();
    showScreen('game');
    updateHud();
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused && game.phase === 'play') {
      handleEvents(G.step(game, dt));
    }
    render(paused ? 0 : dt);
    if (game.phase === 'play') {
      raf = requestAnimationFrame(frame);
    } else {
      finish();
    }
  }

  function say(index, text, seconds) {
    const v = view[index];
    if (!v) return;
    const textEl = v.bubble.querySelector('text');
    const box = v.bubble.querySelector('rect');
    textEl.textContent = text;
    const w = Math.max(110, [...text].length * 30 + 48);
    box.setAttribute('x', String(-w / 2));
    box.setAttribute('width', String(w));
    v.bubble.classList.add('is-shown');
    v.bubble.classList.toggle('is-angry', text === LINES.flee[0]);
    v.bubbleTime = seconds || 1.6;
  }

  function showBanner(text) {
    els.banner.textContent = text;
    els.banner.classList.add('is-shown');
    bannerTimer = 2.4;
  }

  function hideBanner() {
    els.banner.classList.remove('is-shown');
    bannerTimer = 0;
  }

  function shake() {
    els.stage.classList.remove('is-shaking');
    void els.stage.offsetWidth;
    els.stage.classList.add('is-shaking');
  }

  function handleEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'peek':
          say(e.cat, pick(LINES[e.why] || LINES.normal));
          if (Math.random() < 0.4) S.mew();
          break;
        case 'escape':
          view[e.cat].fleeing = false;
          say(e.cat, pick(LINES.escape));
          S.escape();
          break;
        case 'flee':
          break; // 押したときに処理する（onCatTap）
        case 'return':
          say(e.cat, pick(LINES.back));
          S.back();
          break;
        case 'event':
          showBanner(EVENT_TEXT[e.kind]);
          if (e.kind === 'doorbell') S.doorbell();
          else if (e.kind === 'fridge') S.fridge();
          else if (e.kind === 'bird') {
            S.bird();
            if (e.cat != null) say(e.cat, pick(LINES.bird));
          }
          break;
        case 'hot':
          showBanner(EVENT_TEXT.hot);
          S.hot();
          break;
        case 'clear':
        case 'over':
          break;
      }
    }
  }

  function onCatTap(ev) {
    ev.preventDefault();
    if (!game || game.phase !== 'play' || paused) return;
    const index = G.SIDES.indexOf(ev.currentTarget.dataset.side);
    if (index < 0) return;
    if (treatMode) {
      const r = G.treat(game, index);
      if (r.type === 'treat') {
        say(index, pick(LINES.treat), 2);
        S.treat();
        setTreatMode(false);
      }
      updateHud();
      return;
    }
    const r = G.push(game, index);
    if (r.type === 'push') {
      const line = r.annoy >= 0.66 ? LINES.push3 : r.annoy >= 0.33 ? LINES.push2 : LINES.push;
      say(index, pick(line), 1.2);
      S.push();
      pop(ev);
    } else if (r.type === 'flee') {
      view[index].fleeing = true;
      say(index, LINES.flee[0], 1.8);
      S.hiss();
      shake();
    }
  }

  /** 押したところに「ぽふっ」を出す。 */
  function pop(ev) {
    const pt = els.svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const ctm = els.svg.getScreenCTM();
    if (!ctm) return;
    const p = pt.matrixTransform(ctm.inverse());
    const t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    t.setAttribute('x', p.x.toFixed(0));
    t.setAttribute('y', p.y.toFixed(0));
    t.setAttribute('class', 'pof');
    t.setAttribute('text-anchor', 'middle');
    t.textContent = 'ぽふっ';
    els.svg.appendChild(t);
    setTimeout(() => t.remove(), 600);
  }

  function moodOf(c, v) {
    if (c.out) return v.fleeing ? 'angry' : 'normal';
    if (c.state === 'content') return 'content';
    if (game.T >= G.HOT) return 'hot';
    if (c.annoy >= 0.6) return 'angry';
    if (c.state === 'rest' && game.T >= G.SWEET) return 'sleepy';
    return 'normal';
  }

  function render(dt) {
    for (const c of game.cats) {
      const v = view[c.index];
      let target;
      let speed;
      if (c.out) {
        target = A.OFF_GONE;
        speed = v.fleeing ? 900 : 260;
      } else {
        target = A.offsetFor(c.progress);
        // 外から戻ってくるときは歩いて、押し戻されたときはすばやく
        speed = v.off > A.OFF_OUT + 5 ? 420 : 1300;
      }
      const d = target - v.off;
      const stepMax = speed * dt;
      v.off = Math.abs(d) <= stepMax ? target : v.off + Math.sign(d) * stepMax;
      v.el.setAttribute('transform', A.catTransform(c.side, v.off));
      const walking = Math.abs(d) > 1 && (c.out || v.off > A.OFF_OUT - 5);
      v.el.classList.toggle('is-walking', walking);
      v.el.classList.toggle('is-shivering', !c.out && game.T < G.COLD);
      const mood = moodOf(c, v);
      if (mood !== v.mood) {
        v.mood = mood;
        v.el.setAttribute('data-mood', mood);
      }
      if (v.bubbleTime > 0) {
        v.bubbleTime -= dt;
        if (v.bubbleTime <= 0) v.bubble.classList.remove('is-shown');
      }
    }
    if (bannerTimer > 0) {
      bannerTimer -= dt;
      if (bannerTimer <= 0) hideBanner();
    }
    // こたつの光と寒さ
    els.glow.setAttribute('opacity', (0.08 + game.T * 0.7).toFixed(3));
    const cold = Math.max(0, (G.COLD + 0.1 - game.T) / (G.COLD + 0.1));
    els.coldTint.setAttribute('opacity', (cold * 0.28).toFixed(3));
    updateHud();
  }

  function updateHud() {
    els.clock.textContent = G.clockText(game.time);
    els.nightFill.style.width = ((game.time / G.DURATION) * 100).toFixed(1) + '%';
    els.score.textContent = Math.floor(game.score).toLocaleString();
    els.inside.textContent = String(G.insideCount(game));
    els.needle.style.left = (game.T * 100).toFixed(1) + '%';
    let state = 'ふつう';
    let cls = '';
    if (game.T >= G.HOT) { state = '熱すぎ！'; cls = 'is-hot'; }
    else if (game.T >= G.SWEET) { state = 'ぬくぬく'; cls = 'is-sweet'; }
    else if (game.T < G.COLD) { state = 'さむい'; cls = 'is-cold'; }
    if (els.heatState.textContent !== state) els.heatState.textContent = state;
    els.heatState.className = 'heat-state ' + cls;
    for (const b of els.heat.querySelectorAll('button')) {
      const on = b.dataset.heat === game.heat;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    }
    els.treatCount.textContent = '×' + game.treats;
    els.treat.disabled = game.treats <= 0;
  }

  function setHeat(level) {
    if (!game || game.phase !== 'play') return;
    if (game.heat !== level) S.click();
    G.setHeat(game, level);
    updateHud();
  }

  function setTreatMode(on) {
    treatMode = !!on && !!game && game.treats > 0;
    els.treat.setAttribute('aria-pressed', String(treatMode));
    els.treat.classList.toggle('is-on', treatMode);
    els.stage.classList.toggle('is-treat-mode', treatMode);
  }

  // ---------- 一時停止・結果 ----------

  function showOverlay(kicker, title, bodyHtml, actions) {
    els.dialogKicker.textContent = kicker;
    els.dialogTitle.textContent = title;
    els.dialogBody.innerHTML = bodyHtml;
    els.dialogActions.innerHTML = '';
    actions.forEach((a, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn' + (i === 0 ? ' btn--primary' : '');
      b.textContent = a.label;
      b.addEventListener('click', a.onClick);
      els.dialogActions.appendChild(b);
    });
    els.overlay.hidden = false;
    const first = els.dialogActions.querySelector('button');
    if (first) first.focus();
  }

  function hideOverlay() {
    els.overlay.hidden = true;
  }

  function pause() {
    if (!game || game.phase !== 'play' || paused) return;
    paused = true;
    showOverlay('一時停止', 'ひと休み', `<p class="dialog-text">いま ${G.clockText(game.time)}。猫たちはおとなしく待っています（たぶん）。</p>`, [
      { label: 'つづける', onClick: resume },
      { label: 'タイトルへ', onClick: toTitle },
    ]);
  }

  function resume() {
    if (!paused) return;
    paused = false;
    hideOverlay();
    last = performance.now();
  }

  function toTitle() {
    cancelAnimationFrame(raf);
    paused = false;
    hideOverlay();
    hideBanner();
    showBest();
    showScreen('title');
  }

  function finish() {
    setTreatMode(false);
    const score = Math.floor(game.score);
    const clear = game.phase === 'clear';
    let isBest = false;
    if (clear && score > best) {
      best = score;
      saveBest(best);
      isBest = true;
    }
    if (clear) S.clear();
    else S.over();
    const s = game.stats;
    const rows = [
      ['押し戻した回数', s.pushes + ' 回'],
      ['おやつ', s.treats + ' 個'],
      ['出ていかれた', s.escapes + ' 回'],
      ['怒らせた', s.flees + ' 回'],
      ['ぬくぬく温度だった時間', Math.round((s.sweetTime / G.DURATION) * 100) + '%'],
      ['電気代', '約 ' + Math.max(1, Math.round(game.cost)) + ' 円'],
    ];
    const body = `
      <p class="result-rank">称号：<b>${G.rank(score, game.phase)}</b></p>
      <p class="result-score">ぬくぬく <b>${score.toLocaleString()}</b>${isBest ? '<span class="result-best">自己ベスト！</span>' : ''}</p>
      <dl class="result-stats">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
    const kicker = clear ? '7:00' : G.clockText(game.time);
    const title = clear ? '朝になった。' : 'こたつが空っぽに…';
    setTimeout(() => {
      showOverlay(kicker, title, body, [
        { label: 'もう一晩', onClick: startGame },
        { label: 'タイトルへ', onClick: toTitle },
      ]);
    }, clear ? 400 : 1200);
  }

  // ---------- 操作 ----------

  els.start.addEventListener('click', startGame);
  els.sound.addEventListener('change', () => {
    settings.sound = els.sound.checked;
    S.setEnabled(settings.sound);
    saveSettings();
    if (settings.sound) S.click();
  });
  els.pause.addEventListener('click', pause);
  els.heat.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-heat]');
    if (b) setHeat(b.dataset.heat);
  });
  els.treat.addEventListener('click', () => {
    if (!game || game.phase !== 'play' || paused) return;
    setTreatMode(!treatMode);
  });
  document.addEventListener('keydown', (e) => {
    if (els.game.hidden || !game) return;
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      if (paused) resume();
      else pause();
      return;
    }
    if (paused || game.phase !== 'play') return;
    if (e.key === '1') setHeat('low');
    else if (e.key === '2') setHeat('mid');
    else if (e.key === '3') setHeat('high');
    else if (e.key === 't' || e.key === 'T') setTreatMode(!treatMode);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });

  buildTitle();
  if (/[?&]play\b/.test(location.search)) startGame();
  else showScreen('title');
})();
