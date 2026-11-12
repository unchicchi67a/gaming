/**
 * ブロックくずしの画面（タイトルの設定・描画・操作）。
 * ルールと動きは levels.js / physics.js にあり、ここでは画面に関わることだけを行う。
 */
(function () {
  'use strict';

  const L = window.BlockLevels;
  const P = window.BlockPhysics;
  const Sound = window.BlockSound;

  const SETTINGS_KEY = 'blockbreaker.settings.v1';
  const BEST_KEY = 'blockbreaker.best.v1';

  // かたさ（残りの回数）ごとの色
  const HP_COLORS = [null, '#3dbe5b', '#34a9f5', '#8a63e8', '#ef3340', '#ffc93c'];
  const INK = '#1e2a4a';
  const STEEL = '#aeb6c8';

  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- 保存 ----------

  function loadJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch (e) {
      return null;
    }
  }
  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* 保存できなくても遊べる */
    }
  }

  let settings = L.normalizeSettings(loadJSON(SETTINGS_KEY));
  let best = loadJSON(BEST_KEY) || { level: 0, score: 0 };

  // ---------- タイトル（設定） ----------

  const levelInput = $('level');

  function setLevel(lv) {
    settings.level = L.clampLevel(lv);
    levelInput.value = settings.level;
    saveJSON(SETTINGS_KEY, settings);
    renderLevelInfo();
  }

  function renderLevelInfo() {
    const lv = settings.level;
    $('level-value').textContent = lv;
    levelInput.style.setProperty('--fill', ((lv - 1) / (L.MAX_LEVEL - 1)) * 100 + '%');
    const d = L.describeLevel(lv);
    const facts = [
      `ブロック <b>${d.bricks}</b> こ（${d.rows}段）`,
      `かたさ 最大 <b>${d.maxHp}</b> 回`,
      d.steel ? `鉄のブロック <b>${d.steel}</b> こ` : '鉄のブロック なし',
      `ボールの速さ <b>×${(d.ballSpeed * L.SPEEDS[settings.speed].factor).toFixed(2)}</b>`,
    ];
    $('level-facts').innerHTML = facts.map((f) => `<li>${f}</li>`).join('');
    drawPreview(lv);
  }

  function drawPreview(lv) {
    const canvas = $('preview');
    const dpr = window.devicePixelRatio || 1;
    const cw = 114;
    const ch = 74;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const def = L.generateLevel(lv);
    const pad = 6;
    const gap = 1.5;
    const bw = (cw - pad * 2 - gap * (L.COLS - 1)) / L.COLS;
    const bh = Math.min(4.2, (ch - pad * 2 - gap * (L.MAX_ROWS - 1)) / L.MAX_ROWS);
    def.grid.forEach((row, r) => {
      row.forEach((b, c) => {
        if (!b) return;
        ctx.fillStyle = b.steel ? STEEL : HP_COLORS[b.hp];
        ctx.fillRect(pad + c * (bw + gap), pad + r * (bh + gap), bw, bh);
      });
    });
    // バー
    const pw = (P.PADDLE_BASE_W * L.PADDLES[settings.paddle].factor * (cw - pad * 2)) / P.W;
    ctx.fillStyle = '#ef3340';
    ctx.fillRect(cw / 2 - pw / 2, ch - 9, pw, 4);
  }

  function bindRadios(name, key, parse) {
    document.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = String(settings[key]) === input.value;
      input.addEventListener('change', () => {
        if (!input.checked) return;
        settings[key] = parse ? parse(input.value) : input.value;
        saveJSON(SETTINGS_KEY, settings);
        renderLevelInfo();
      });
    });
  }

  function renderBest() {
    $('best').textContent = best.level > 0 ? `これまでの記録：Lv ${best.level} までクリア・最高スコア ${best.score.toLocaleString()}` : '';
  }

  function initTitle() {
    levelInput.min = L.MIN_LEVEL;
    levelInput.max = L.MAX_LEVEL;
    levelInput.value = settings.level;
    levelInput.addEventListener('input', () => setLevel(levelInput.value));
    // 長押しで続けて変えられるようにする
    holdRepeat($('level-down'), () => setLevel(settings.level - 1));
    holdRepeat($('level-up'), () => setLevel(settings.level + 1));
    bindRadios('speed', 'speed');
    bindRadios('paddle', 'paddle');
    bindRadios('lives', 'lives', Number);
    const sound = $('sound');
    sound.checked = settings.sound;
    sound.addEventListener('change', () => {
      settings.sound = sound.checked;
      Sound.setEnabled(settings.sound);
      saveJSON(SETTINGS_KEY, settings);
    });
    Sound.setEnabled(settings.sound);
    $('start').addEventListener('click', () => {
      Sound.unlock();
      startGame(settings.level);
    });
    renderLevelInfo();
    renderBest();
  }

  function holdRepeat(btn, fn) {
    let timer = null;
    const stop = () => {
      clearTimeout(timer);
      timer = null;
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      fn();
      let delay = 380;
      const again = () => {
        fn();
        delay = Math.max(40, delay * 0.8);
        timer = setTimeout(again, delay);
      };
      timer = setTimeout(again, delay);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => btn.addEventListener(t, stop));
    // キーボード（Enter / スペース）での操作
    btn.addEventListener('click', (e) => {
      if (e.detail === 0) fn();
    });
  }

  // ---------- ゲーム ----------

  const canvas = $('canvas');
  const ctx = canvas.getContext('2d');
  const stage = $('stage');

  let game = null;
  let paused = false;
  let running = false;
  let lastTime = 0;
  let scale = 1;
  let particles = [];
  let flashes = new Map(); // ブロック → 光っている残り時間
  let shake = 0;
  let trail = [];
  let endTimer = null;

  const input = { targetX: null, move: 0, launch: false };
  const keys = { left: false, right: false };

  function startGame(lv) {
    game = P.createGame({ level: lv, speed: settings.speed, paddle: settings.paddle, lives: settings.lives });
    $('title').hidden = true;
    $('game').hidden = false;
    resetEffects();
    hideOverlay();
    paused = false;
    resize();
    updateHud();
    if (!running) {
      running = true;
      lastTime = performance.now();
      requestAnimationFrame(frame);
    }
  }

  function resetEffects() {
    particles = [];
    flashes = new Map();
    shake = 0;
    trail = [];
    clearTimeout(endTimer);
    input.targetX = null;
    input.launch = false;
  }

  function backToTitle() {
    running = false;
    game = null;
    clearTimeout(endTimer);
    hideOverlay();
    $('game').hidden = true;
    $('title').hidden = false;
    renderBest();
  }

  function resize() {
    if (!game) return;
    const rect = stage.getBoundingClientRect();
    const style = getComputedStyle(stage);
    const availW = rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const availH = rect.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    scale = Math.max(0.1, Math.min(availW / P.W, availH / P.H));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = Math.floor(P.W * scale) + 'px';
    canvas.style.height = Math.floor(P.H * scale) + 'px';
    canvas.width = Math.floor(P.W * scale * dpr);
    canvas.height = Math.floor(P.H * scale * dpr);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
    draw();
  }

  function updateHud() {
    $('hud-level').textContent = game.level;
    $('hud-score').textContent = game.score.toLocaleString();
    const lives = $('hud-lives');
    if (lives.childElementCount !== game.lives) {
      lives.innerHTML = '<i></i>'.repeat(Math.max(0, game.lives));
      lives.setAttribute('aria-label', `残りのボール ${game.lives}こ`);
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (game && !paused) {
      if (input.targetX == null) input.move = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const events = P.step(game, dt, input);
      input.launch = false;
      handleEvents(events);
      updateEffects(dt);
      updateHud();
    }
    draw();
    requestAnimationFrame(frame);
  }

  function handleEvents(events) {
    for (const e of events) {
      switch (e.type) {
        case 'launch':
          Sound.launch();
          break;
        case 'paddle':
          Sound.paddle();
          break;
        case 'wall':
          Sound.wall();
          break;
        case 'steel':
          Sound.steel();
          break;
        case 'hit':
          Sound.hit(e.brick.hp);
          flashes.set(e.brick, 0.12);
          break;
        case 'break':
          Sound.brk(e.brick.maxHp);
          burst(e.brick);
          break;
        case 'lost':
          Sound.lost();
          if (!reduceMotion) shake = 0.35;
          trail = [];
          break;
        case 'clear':
          Sound.clear();
          recordBest(game.level);
          endTimer = setTimeout(showClear, 700);
          break;
        case 'over':
          Sound.over();
          recordBest(0);
          endTimer = setTimeout(showOver, 700);
          break;
        default:
          break;
      }
    }
  }

  function recordBest(clearedLevel) {
    best = {
      level: Math.max(best.level || 0, clearedLevel),
      score: Math.max(best.score || 0, game.score),
    };
    saveJSON(BEST_KEY, best);
  }

  function burst(brick) {
    const color = HP_COLORS[brick.maxHp];
    const n = reduceMotion ? 4 : 12;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 220;
      particles.push({
        x: brick.x + Math.random() * brick.w,
        y: brick.y + Math.random() * brick.h,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 60,
        life: 0.5 + Math.random() * 0.4,
        max: 0.9,
        size: 5 + Math.random() * 5,
        color,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 14,
      });
    }
  }

  function updateEffects(dt) {
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 600 * dt;
      p.rot += p.spin * dt;
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const [b, t] of flashes) {
      if (t - dt <= 0) flashes.delete(b);
      else flashes.set(b, t - dt);
    }
    shake = Math.max(0, shake - dt);
    const ball = game.balls[0];
    if (ball && !ball.stuck && !reduceMotion) {
      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > 8) trail.shift();
    } else {
      trail = [];
    }
  }

  // ---------- 描画 ----------

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    if (!game) return;
    ctx.save();
    if (shake > 0) {
      const s = shake * 18;
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    // 背景：明るい空色に、白い水玉
    const bg = ctx.createLinearGradient(0, 0, 0, P.H);
    bg.addColorStop(0, '#9fd8ff');
    bg.addColorStop(1, '#e3f4ff');
    ctx.fillStyle = bg;
    ctx.fillRect(-20, -20, P.W + 40, P.H + 40);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    for (let y = 30, row = 0; y < P.H; y += 50, row++) {
      for (let x = row % 2 ? 50 : 25; x < P.W; x += 50) {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (const b of game.bricks) if (b.alive) drawBrick(b);

    // かけら：ふちどりのある小さな四角が、くるくる回りながら落ちる
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, Math.max(0, p.life / p.max) * 1.6);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }

    drawPaddle();
    drawBalls();

    if (game.phase === 'ready' && !paused) {
      const label = 'タップ・スペースで発射';
      const bob = reduceMotion ? 0 : Math.sin(performance.now() / 220) * 4;
      ctx.font = '800 22px "M PLUS Rounded 1c", sans-serif';
      const w = ctx.measureText(label).width + 40;
      const x = P.W / 2 - w / 2;
      const y = P.PADDLE_Y - 120 + bob;
      ctx.fillStyle = INK;
      roundRect(x, y + 4, w, 44, 22);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      roundRect(x, y, w, 44, 22);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, P.W / 2, y + 23);
    }
    ctx.restore();
  }

  /** ツヤのあるプラスチックの部品（ふちどり・下の影・上のつや）を描く。 */
  function plastic(x, y, w, h, r, color) {
    ctx.fillStyle = INK;
    roundRect(x, y + 3, w, h, r);
    ctx.fill();
    ctx.fillStyle = color;
    roundRect(x, y, w, h, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
    roundRect(x + 2, y + h - 6, w - 4, 4, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    roundRect(x + 5, y + 3.5, Math.max(4, w * 0.45), 4, 2);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    roundRect(x, y, w, h, r);
    ctx.stroke();
  }

  function drawBrick(b) {
    const flash = flashes.get(b) || 0;
    const x = b.x + 1;
    const y = b.y;
    const w = b.w - 2;
    const h = b.h - 3;
    if (b.steel) {
      plastic(x, y, w, h, 5, STEEL);
      ctx.fillStyle = INK;
      for (const dx of [7, w - 7]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + h / 2 + 1, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    plastic(x, y, w, h, 6, HP_COLORS[b.hp]);
    // かたいブロックは、残りの回数を白い点で表す
    if (b.hp > 1) {
      const sp = 8;
      const x0 = x + w / 2 - ((b.hp - 1) * sp) / 2;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < b.hp; i++) {
        ctx.beginPath();
        ctx.arc(x0 + i * sp, y + h / 2 + 1.5, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    // ひび（当てて、かたさが減ったブロック）
    if (b.hp < b.maxHp) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      const cx = x + w * 0.22;
      ctx.moveTo(cx, y + 2);
      ctx.lineTo(cx + 5, y + h * 0.45);
      ctx.lineTo(cx - 2, y + h * 0.62);
      ctx.lineTo(cx + 4, y + h - 2);
      if (b.maxHp - b.hp >= 2) {
        const cx2 = x + w * 0.8;
        ctx.moveTo(cx2, y + h - 2);
        ctx.lineTo(cx2 - 4, y + h * 0.5);
        ctx.lineTo(cx2 + 3, y + 2);
      }
      ctx.stroke();
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(flash / 0.12) * 0.75})`;
      roundRect(x, y, w, h, 6);
      ctx.fill();
    }
  }

  function drawPaddle() {
    const p = game.paddle;
    const x = p.x - p.w / 2;
    const y = p.y - p.h / 2;
    plastic(x, y, p.w, p.h + 2, (p.h + 2) / 2, '#ef3340');
    // まん中のしるし（ここで打つと真上に飛ぶ）
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, y + (p.h + 2) / 2 + 0.5, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  function drawBalls() {
    trail.forEach((t, i) => {
      ctx.fillStyle = `rgba(255, 255, 255, ${((i + 1) / (trail.length + 1)) * 0.6})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, P.BALL_R * (0.45 + (i / trail.length) * 0.45), 0, Math.PI * 2);
      ctx.fill();
    });
    for (const ball of game.balls) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(30, 42, 74, 0.18)';
      ctx.beginPath();
      ctx.arc(ball.x + 1.5, ball.y + 2, ball.r * 0.55, 0, Math.PI);
      ctx.fill();
    }
  }

  // ---------- ダイアログ ----------

  function showOverlay(title, text, actions) {
    $('dialog-title').textContent = title;
    $('dialog-text').textContent = text;
    const box = $('dialog-actions');
    box.innerHTML = '';
    actions.forEach((a, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn' + (i === 0 ? ' btn--primary' : '');
      btn.textContent = a.label;
      btn.addEventListener('click', a.fn);
      box.appendChild(btn);
    });
    $('overlay').hidden = false;
    const first = box.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  function hideOverlay() {
    $('overlay').hidden = true;
  }

  function showClear() {
    if (!game) return;
    const score = `スコア ${game.score.toLocaleString()}`;
    if (game.level >= L.MAX_LEVEL) {
      showOverlay('全レベル制覇！', `Lv ${L.MAX_LEVEL} までクリアしました\n${score}`, [{ label: 'タイトルへ', fn: backToTitle }]);
      return;
    }
    showOverlay(`Lv ${game.level} クリア！`, score, [
      {
        label: `Lv ${game.level + 1} へ進む`,
        fn: () => {
          P.nextLevel(game);
          resetEffects();
          hideOverlay();
          updateHud();
        },
      },
      { label: 'タイトルへ', fn: backToTitle },
    ]);
  }

  function showOver() {
    if (!game) return;
    const lv = game.level;
    showOverlay('ゲームオーバー', `Lv ${lv}・スコア ${game.score.toLocaleString()}`, [
      { label: `Lv ${lv} をもう一度`, fn: () => startGame(lv) },
      { label: 'タイトルへ', fn: backToTitle },
    ]);
  }

  function pause() {
    if (!game || paused || game.phase === 'clear' || game.phase === 'over') return;
    paused = true;
    keys.left = keys.right = false;
    showOverlay('一時停止', '', [
      { label: 'つづける', fn: resume },
      { label: 'タイトルへ', fn: backToTitle },
    ]);
  }

  function resume() {
    paused = false;
    hideOverlay();
    lastTime = performance.now();
  }

  // ---------- 操作 ----------

  function toFieldX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * P.W;
  }

  let pointerDown = false;

  stage.addEventListener('pointerdown', (e) => {
    if (!game || paused) return;
    pointerDown = true;
    input.targetX = toFieldX(e.clientX);
    try {
      stage.setPointerCapture(e.pointerId);
    } catch (err) {
      /* なくても動く */
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!game || paused) return;
    // マウスはボタンを押さなくても動かせる。タッチは指が触れているあいだだけ
    if (e.pointerType !== 'mouse' && !pointerDown) return;
    input.targetX = toFieldX(e.clientX);
  });
  const release = (e) => {
    if (!pointerDown) return;
    pointerDown = false;
    // 指をはなしたときに打ち出す（触れた瞬間に打ち出すと、バーを動かす前に飛んでしまうため）
    if (e.type === 'pointerup' && game && !paused && game.phase === 'ready') input.launch = true;
  };
  stage.addEventListener('pointerup', release);
  stage.addEventListener('pointercancel', release);

  document.addEventListener('keydown', (e) => {
    if (!game || $('game').hidden) return;
    const k = e.key;
    if (k === 'Escape' || k === 'p' || k === 'P') {
      if (paused) resume();
      else pause();
      e.preventDefault();
      return;
    }
    if (paused || !$('overlay').hidden) return;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
      keys.left = true;
      input.targetX = null;
      e.preventDefault();
    } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
      keys.right = true;
      input.targetX = null;
      e.preventDefault();
    } else if (k === ' ' || k === 'Enter' || k === 'ArrowUp') {
      if (game.phase === 'ready') input.launch = true;
      e.preventDefault();
    }
  });
  document.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
  });

  $('pause').addEventListener('click', pause);
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  window.addEventListener('blur', () => {
    keys.left = keys.right = false;
  });

  // 動作確認用：?level=<番号> でタイトルをとばして始める
  initTitle();
  const q = new URLSearchParams(location.search).get('level');
  if (q) startGame(L.clampLevel(q));
})();
