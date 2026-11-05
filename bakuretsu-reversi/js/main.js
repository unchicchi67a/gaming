/**
 * 画面制御（タイトル画面・対局画面）。
 */
(function () {
  'use strict';

  const E = window.ReversiEngine;
  const AI = window.ReversiAI;
  const Sound = window.ReversiSound;
  const { BLACK, WHITE, EMPTY } = E;

  const STORAGE_KEY = 'bakuretsu-reversi.settings.v1';
  const FLIP_MS = 420; // CSS の .disc の transition と合わせる
  const FLIP_STAGGER_MS = 60; // 置いた石から離れるほど遅れて裏返す
  const BLAST_GAP_MS = 120; // はさんで裏返し終わってから爆発するまでの間
  const BLAST_FX_MS = 650; // CSS の爆発エフェクト（.blast-fx）の長さと合わせる
  const COLS = 'abcdefgh';

  const TIERS = {
    easy: 'やさしい',
    normal: 'ふつう',
    hard: 'むずかしい',
    max: 'さいきょう',
  };

  /** レベルごとの名前と目安（js/ai.js の LEVELS の設定と対応させる）。 */
  const LEVELS = [
    null,
    { name: 'ルール練習', tier: 'easy', desc: 'でたらめに打ちます。ルールを覚えたい人向け。' },
    { name: 'はじめて', tier: 'easy', desc: '石がたくさん増える手を選びがち。ときどき適当に打ちます。' },
    { name: '入門', tier: 'easy', desc: '角などの大事なマスを意識しますが、先読みはしません。判断にムラがあります。' },
    { name: '初級', tier: 'normal', desc: '2手先まで読みます。まだミスは多めです。' },
    { name: '初級＋', tier: 'normal', desc: '2手先まで読み、相手の打てる場所を減らす作戦も使います。' },
    { name: '中級', tier: 'normal', desc: '3手先まで読み、ミスはほとんどしません。リバーシに慣れてきた人向け。' },
    { name: '中級＋', tier: 'hard', desc: '4手先まで読みます。終盤の残り8マスからは最後まで読み切ります。' },
    { name: '上級', tier: 'hard', desc: '5手先まで読みます。残り10マスから読み切ります。かなり手ごわいです。' },
    { name: '上級＋', tier: 'max', desc: '6手先まで読みます。残り12マスから読み切ります。' },
    { name: '最強', tier: 'max', desc: '最大8手先まで読みます。残り14マスから読み切る本気モードです。' },
  ];

  const $ = (id) => document.getElementById(id);
  const els = {
    titleScreen: $('title-screen'),
    titleInner: $('title-inner'),
    gameScreen: $('game-screen'),
    menu: $('menu'),
    levelGrid: $('level-grid'),
    levelField: $('level-field'),
    levelNum: $('level-num'),
    levelName: $('level-name'),
    levelTier: $('level-tier'),
    levelDesc: $('level-desc'),
    levelDown: $('level-down'),
    levelUp: $('level-up'),
    sideField: $('side-field'),
    board: $('board'),
    tray: $('tray'),
    status: $('status'),
    toast: $('toast'),
    playerBlack: $('player-black'),
    playerWhite: $('player-white'),
    avatarBlack: $('avatar-black'),
    avatarWhite: $('avatar-white'),
    nameBlack: $('name-black'),
    nameWhite: $('name-white'),
    countBlack: $('count-black'),
    countWhite: $('count-white'),
    undoBtn: $('undo-btn'),
    titleBtn: $('title-btn'),
    result: $('result'),
    confetti: $('confetti'),
    resultAvatar: $('result-avatar'),
    resultTitle: $('result-title'),
    resultScore: $('result-score'),
    againBtn: $('again-btn'),
    viewBtn: $('view-btn'),
    resultTitleBtn: $('result-title-btn'),
  };

  /* ---------- 設定 ---------- */

  const settings = loadSettings();

  function loadSettings() {
    const defaults = { mode: 'cpu', level: 3, side: 'black', hints: true, sound: true };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && typeof saved === 'object') {
        if (saved.mode === 'cpu' || saved.mode === 'pvp') defaults.mode = saved.mode;
        if (Number.isInteger(saved.level) && saved.level >= 1 && saved.level <= AI.MAX_LEVEL) {
          defaults.level = saved.level;
        }
        if (saved.side === 'black' || saved.side === 'white') defaults.side = saved.side;
        if (typeof saved.hints === 'boolean') defaults.hints = saved.hints;
        if (typeof saved.sound === 'boolean') defaults.sound = saved.sound;
      }
    } catch (e) {
      // 保存領域が使えない環境では既定値のまま
    }
    return defaults;
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // 保存できなくても動作には影響しない
    }
  }

  const isCpuMode = () => settings.mode === 'cpu';
  const humanColor = () => (settings.side === 'black' ? BLACK : WHITE);
  const cpuColor = () => 3 - humanColor();
  const opponent = () => LEVELS[settings.level];

  /* ---------- タイトル画面 ---------- */

  function buildMenu() {
    for (let lv = 1; lv <= AI.MAX_LEVEL; lv++) {
      const info = LEVELS[lv];
      const label = document.createElement('label');
      label.className = 'level-seg';
      label.dataset.tier = info.tier;
      label.style.setProperty('--i', String(lv));
      label.innerHTML =
        `<input type="radio" name="level" value="${lv}" aria-label="レベル${lv} ${info.name}（${TIERS[info.tier]}）">` +
        '<span class="bar"></span>';
      els.levelGrid.appendChild(label);
    }
    const f = els.menu.elements;
    f.mode.value = settings.mode;
    f.level.value = String(settings.level);
    f.side.value = settings.side;
    f.hints.checked = settings.hints;
    f.sound.checked = settings.sound;
    Sound.setEnabled(settings.sound);
    updateMenu();

    els.menu.addEventListener('change', () => {
      settings.mode = f.mode.value;
      settings.level = Number(f.level.value);
      settings.side = f.side.value;
      settings.hints = f.hints.checked;
      settings.sound = f.sound.checked;
      Sound.setEnabled(settings.sound);
      saveSettings();
      updateMenu();
    });

    const stepLevel = (delta) => {
      const next = Math.min(AI.MAX_LEVEL, Math.max(1, settings.level + delta));
      if (next === settings.level) return;
      f.level.value = String(next);
      els.menu.dispatchEvent(new Event('change'));
    };
    els.levelDown.addEventListener('click', () => stepLevel(-1));
    els.levelUp.addEventListener('click', () => stepLevel(1));

    els.menu.addEventListener('submit', (e) => {
      e.preventDefault();
      Sound.unlock();
      startGame();
    });
  }

  function updateMenu() {
    const info = opponent();
    els.levelNum.textContent = String(settings.level);
    els.levelName.textContent = info.name;
    els.levelTier.textContent = TIERS[info.tier];
    els.levelTier.style.setProperty('--tier', `var(--tier-${info.tier})`);
    els.levelDesc.textContent = info.desc;
    els.levelDown.disabled = settings.level <= 1;
    els.levelUp.disabled = settings.level >= AI.MAX_LEVEL;
    // 選んだレベルまでのバーに色を付ける
    for (const seg of els.levelGrid.children) {
      seg.classList.toggle('on', Number(seg.querySelector('input').value) <= settings.level);
    }
    const cpu = isCpuMode();
    els.levelField.disabled = !cpu;
    els.sideField.disabled = !cpu;
    fitTitle();
  }

  /* ---------- 盤面の DOM ---------- */

  const cells = new Map(); // pos -> { cell, wrap, disc }
  let blastFx = null; // 爆発のエフェクト（盤の上に重ねる）

  function buildBoard() {
    for (const pos of E.SQUARES) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.pos = String(pos);
      const wrap = document.createElement('div');
      wrap.className = 'disc-wrap empty';
      const disc = document.createElement('div');
      disc.className = 'disc';
      disc.innerHTML = '<div class="face black"></div><div class="face white"></div>';
      wrap.appendChild(disc);
      cell.appendChild(wrap);
      els.board.appendChild(cell);
      cells.set(pos, { cell, wrap, disc });
    }
    const stars = document.createElement('div');
    stars.className = 'star-points';
    stars.setAttribute('aria-hidden', 'true');
    stars.innerHTML = '<span></span><span></span><span></span><span></span>';
    els.board.appendChild(stars);

    blastFx = document.createElement('div');
    blastFx.className = 'blast-fx';
    blastFx.setAttribute('aria-hidden', 'true');
    blastFx.hidden = true;
    els.board.appendChild(blastFx);

    els.board.addEventListener('click', (e) => {
      const cell = e.target.closest('.cell');
      if (cell) onCellClick(Number(cell.dataset.pos));
    });
  }

  /* ---------- 対局の状態 ---------- */

  const game = {
    board: E.createBoard(),
    turn: BLACK,
    lastMove: null,
    over: false,
    history: [], // 各着手後の局面（先頭は初期局面）
    token: 0, // 進行中の CPU 思考・タイマーを無効化するための世代番号
    timers: [],
    animating: false, // はさむ → 爆発のアニメーション中は次の手を受け付けない
  };

  function snapshot() {
    return { board: E.cloneBoard(game.board), turn: game.turn, lastMove: game.lastMove };
  }

  function restore(snap) {
    game.board = E.cloneBoard(snap.board);
    game.turn = snap.turn;
    game.lastMove = snap.lastMove;
    game.over = E.isGameOver(game.board);
  }

  /** 世代を進め、予約済みの処理（CPU の着手・トースト等）をすべて取り消す。 */
  function cancelPending() {
    game.token++;
    for (const t of game.timers) clearTimeout(t);
    game.timers = [];
    game.animating = false;
    hideBlastFx();
  }

  function later(fn, ms) {
    const token = game.token;
    const id = setTimeout(() => {
      game.timers = game.timers.filter((t) => t !== id);
      if (token === game.token) fn();
    }, ms);
    game.timers.push(id);
  }

  function isHumanTurn() {
    return !game.over && !game.animating && (!isCpuMode() || game.turn === humanColor());
  }

  function playerName(color) {
    if (isCpuMode()) return color === humanColor() ? 'きみ' : `CPU Lv.${settings.level}`;
    return color === BLACK ? 'くろ' : 'しろ';
  }

  /* ---------- 進行 ---------- */

  function setPlayerCard(color) {
    const avatar = color === BLACK ? els.avatarBlack : els.avatarWhite;
    const name = color === BLACK ? els.nameBlack : els.nameWhite;
    const discClass = color === BLACK ? 'black' : 'white';
    avatar.innerHTML = `<span class="mini ${discClass}"></span>`;
    name.textContent = playerName(color);
  }

  function startGame() {
    cancelPending();
    game.board = E.createBoard();
    game.turn = BLACK;
    game.lastMove = null;
    game.over = false;
    game.history = [snapshot()];

    setPlayerCard(BLACK);
    setPlayerCard(WHITE);
    hideResult();
    hideToast();
    els.titleScreen.hidden = true;
    els.gameScreen.hidden = false;
    render({ instant: true });
    Sound.start();
    if (isCpuMode() && game.turn === cpuColor()) scheduleCpu(800);
  }

  function goToTitle() {
    cancelPending();
    hideResult();
    hideToast();
    els.gameScreen.hidden = true;
    els.titleScreen.hidden = false;
    fitTitle();
  }

  function onCellClick(pos) {
    if (!isHumanTurn()) return;
    if (!E.isLegal(game.board, pos, game.turn)) return;
    playMove(pos);
  }

  /**
   * 着手する。画面では 2 段階で見せる。
   * 1. 置いた石からはさんだ石を、距離に応じて順に裏返す
   * 2. 置いたマスで爆発し、まわり 8 マスの石をいっせいに裏返す
   */
  function playMove(pos) {
    const player = game.turn;
    const before = E.cloneBoard(game.board);
    const move = E.applyMove(game.board, pos, player);
    if (!move) return;
    game.lastMove = pos;

    // 1 段階目の盤面（はさんだ石だけ裏返した状態）
    const sandwiched = before;
    sandwiched[pos] = player;
    for (const q of move.flips) sandwiched[q] = player;

    const [r0, c0] = E.toRowCol(pos);
    const delays = new Map();
    let maxDelay = 0;
    for (const q of move.flips) {
      const [r, c] = E.toRowCol(q);
      const d = (Math.max(Math.abs(r - r0), Math.abs(c - c0)) - 1) * FLIP_STAGGER_MS;
      delays.set(q, d);
      if (d > maxDelay) maxDelay = d;
    }

    Sound.place();
    for (const d of new Set(delays.values())) Sound.flip(d + FLIP_MS / 2);

    game.turn = 3 - player;
    const passed = resolvePass();
    game.history.push(snapshot());
    game.animating = true;
    render({ placed: pos, delays, board: sandwiched });

    const blastAt = maxDelay + FLIP_MS + BLAST_GAP_MS;
    later(() => {
      showBlastFx(pos);
      Sound.blast(move.blast.length);
      render({ blasted: new Set(move.blast) });
      later(hideBlastFx, BLAST_FX_MS);
    }, blastAt);

    const animMs = blastAt + Math.max(FLIP_MS, BLAST_FX_MS);
    later(() => {
      game.animating = false;
      render();
      if (game.over) {
        later(showResult, 300);
        return;
      }
      if (passed) {
        showToast(`${playerName(passed)}は おける ばしょが ないので パス！`);
        Sound.pass();
      }
      if (isCpuMode() && game.turn === cpuColor()) scheduleCpu(passed ? 1400 : 300);
    }, animMs);
  }

  /** 置いたマスを中心に爆発のエフェクトを出す（盤の 1 マス＝ 12.5%）。 */
  function showBlastFx(pos) {
    const [r, c] = E.toRowCol(pos);
    blastFx.hidden = true;
    blastFx.style.left = `${(c + 0.5) * 12.5}%`;
    blastFx.style.top = `${(r + 0.5) * 12.5}%`;
    void blastFx.offsetWidth; // アニメーションを再始動させる
    blastFx.hidden = false;
    els.tray.classList.remove('shake');
    void els.tray.offsetWidth;
    els.tray.classList.add('shake');
  }

  function hideBlastFx() {
    if (blastFx) blastFx.hidden = true;
    els.tray.classList.remove('shake');
    for (const { cell } of cells.values()) cell.classList.remove('blasted');
  }

  /**
   * 手番側に打てる場所がなければパスして手番を戻す。両者打てなければ終局にする。
   * パスした側の色を返す（パスがなければ null）。
   */
  function resolvePass() {
    if (E.countMoves(game.board, game.turn) > 0) return null;
    if (E.countMoves(game.board, 3 - game.turn) === 0) {
      game.over = true;
      return null;
    }
    const passed = game.turn;
    game.turn = 3 - passed;
    return passed;
  }

  function scheduleCpu(delay) {
    updateStatus();
    updateUndoButton();
    later(() => {
      const token = game.token;
      const move = AI.chooseMove(game.board, game.turn, settings.level);
      if (token !== game.token) return;
      if (move != null) playMove(move);
    }, delay);
  }

  /** 一手戻す先の履歴インデックス。戻せなければ -1。 */
  function undoTarget() {
    const last = game.history.length - 1;
    if (last < 1) return -1;
    if (!isCpuMode()) return last - 1;
    // CPU 戦では、あなたの手番だった直前の局面まで戻す
    for (let i = last - 1; i >= 0; i--) {
      if (game.history[i].turn === humanColor()) return i;
    }
    return -1;
  }

  function undo() {
    const target = undoTarget();
    if (target < 0) return;
    cancelPending();
    game.history.length = target + 1;
    restore(game.history[target]);
    hideResult();
    hideToast();
    Sound.undo();
    render();
  }

  /* ---------- 描画 ---------- */

  function render(opts) {
    const o = opts || {};
    const delays = o.delays || new Map();
    const board = o.board || game.board; // アニメーションの途中は、途中の盤面を見せる
    const blasted = o.blasted || null;
    if (o.instant) els.board.classList.add('instant');

    const hints =
      settings.hints && isHumanTurn() ? new Set(E.legalMoves(game.board, game.turn)) : new Set();

    for (const [pos, { cell, wrap, disc }] of cells) {
      const v = board[pos];
      if (v === EMPTY) {
        wrap.classList.add('empty');
        wrap.classList.remove('pop');
      } else {
        // 非表示（display: none）の間に色を設定するので、新しく置いた石は裏返らない
        disc.style.transitionDelay = `${delays.get(pos) || 0}ms`;
        disc.classList.toggle('is-white', v === WHITE);
        wrap.classList.remove('empty');
        if (pos === o.placed) {
          wrap.classList.remove('pop');
          void wrap.offsetWidth; // アニメーションを再始動させる
          wrap.classList.add('pop');
        }
      }
      if (blasted) cell.classList.toggle('blasted', blasted.has(pos));
      cell.classList.toggle('hint', hints.has(pos));
      cell.classList.toggle('last', pos === game.lastMove);
      cell.setAttribute('aria-label', cellLabel(pos, v, hints.has(pos)));
    }

    if (o.instant) {
      void els.board.offsetWidth;
      els.board.classList.remove('instant');
    }

    const count = E.countDiscs(board);
    els.countBlack.textContent = String(count.black);
    els.countWhite.textContent = String(count.white);
    els.playerBlack.classList.toggle('active', !game.over && game.turn === BLACK);
    els.playerWhite.classList.toggle('active', !game.over && game.turn === WHITE);
    updateStatus();
    updateUndoButton();
  }

  function cellLabel(pos, v, hint) {
    const [r, c] = E.toRowCol(pos);
    const name = `${COLS[c]}${r + 1}`;
    if (v === BLACK) return `${name} くろ`;
    if (v === WHITE) return `${name} しろ`;
    return hint ? `${name} おけるよ` : name;
  }

  /** 吹き出しのセリフ。話している側（手番側）にしっぽを向ける。 */
  function updateStatus() {
    const bubble = els.status;
    bubble.classList.toggle('from-white', game.turn === WHITE);
    bubble.classList.remove('thinking');
    bubble.textContent = '';

    if (game.over) {
      bubble.textContent = `おしまい！ ${resultText()}`;
      return;
    }
    if (isCpuMode() && game.turn === cpuColor()) {
      const dots = document.createElement('span');
      dots.className = 'dots';
      dots.setAttribute('aria-hidden', 'true');
      bubble.classList.add('thinking');
      bubble.append('CPUが かんがえちゅう', dots);
      return;
    }
    if (isCpuMode()) {
      bubble.textContent = `きみの ばんだよ！（${game.turn === BLACK ? 'くろ' : 'しろ'}）`;
    } else {
      bubble.textContent = `${game.turn === BLACK ? 'くろ' : 'しろ'}の ばんだよ！`;
    }
  }

  function updateUndoButton() {
    els.undoBtn.disabled = undoTarget() < 0;
  }

  /** 勝者の色（引き分けは 0）。 */
  function winner() {
    const { black, white } = E.countDiscs(game.board);
    if (black === white) return 0;
    return black > white ? BLACK : WHITE;
  }

  function resultText() {
    const w = winner();
    if (w === 0) return 'ひきわけ！';
    if (isCpuMode()) return w === humanColor() ? 'きみの かち！' : 'CPUの かち';
    return w === BLACK ? 'くろの かち！' : 'しろの かち！';
  }

  function showResult() {
    const { black, white } = E.countDiscs(game.board);
    const w = winner();
    const humanWon = !isCpuMode() ? w !== 0 : w === humanColor();

    if (w === 0) {
      els.resultAvatar.textContent = '🤝';
      els.resultTitle.textContent = 'ひきわけ！';
    } else if (isCpuMode()) {
      if (humanWon) els.resultAvatar.textContent = '🏆';
      else els.resultAvatar.innerHTML = `<span class="mini ${cpuColor() === BLACK ? 'black' : 'white'}"></span>`;
      els.resultTitle.textContent = humanWon ? 'やったね！\nきみの かち！' : 'CPUの かち！';
    } else {
      els.resultAvatar.innerHTML = `<span class="mini ${w === BLACK ? 'black' : 'white'}"></span>`;
      els.resultTitle.textContent = resultText();
    }
    els.resultScore.textContent = `くろ ${black} たい ${white} しろ`;
    els.againBtn.textContent = humanWon || w === 0 ? 'もういっかい' : 'リベンジする！';
    els.result.hidden = false;
    els.againBtn.focus();

    if (w === 0) Sound.draw();
    else if (humanWon) Sound.win();
    else Sound.lose();
    if (humanWon) throwConfetti();
  }

  function throwConfetti() {
    const colors = ['#ffc93c', '#ff6b5b', '#4cc56f', '#3fa3f0', '#ffffff', '#ff9d2e'];
    els.confetti.innerHTML = '';
    for (let i = 0; i < 36; i++) {
      const piece = document.createElement('span');
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = colors[i % colors.length];
      piece.style.animationDuration = `${1.8 + Math.random() * 1.6}s`;
      piece.style.animationDelay = `${Math.random() * 0.5}s`;
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      els.confetti.appendChild(piece);
    }
  }

  function hideResult() {
    els.result.hidden = true;
    els.confetti.innerHTML = '';
  }

  let toastTimer = null;
  function showToast(text) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 1800);
  }

  function hideToast() {
    clearTimeout(toastTimer);
    els.toast.hidden = true;
  }

  /* ---------- 1 画面に収める ---------- */

  const supportsZoom = 'zoom' in document.documentElement.style;

  /**
   * タイトル画面が画面の高さに収まらないときは、全体を縮小して 1 画面に収める。
   * （対局画面は CSS のコンテナクエリで盤の大きさを合わせている）
   */
  function fitTitle() {
    if (!supportsZoom || els.titleScreen.hidden) return;
    const inner = els.titleInner;
    inner.style.zoom = '1';
    const available = els.titleScreen.clientHeight;
    const needed = inner.scrollHeight;
    if (needed <= available || available === 0) return;
    // 小さくなりすぎると読めないので 0.6 倍までにとどめ、それ以下はスクロールさせる
    inner.style.zoom = String(Math.max(0.6, Math.floor((available / needed) * 1000) / 1000));
  }

  let fitFrame = 0;
  function requestFit() {
    cancelAnimationFrame(fitFrame);
    fitFrame = requestAnimationFrame(fitTitle);
  }

  /* ---------- 初期化 ---------- */

  buildMenu();
  buildBoard();
  els.undoBtn.addEventListener('click', undo);
  els.titleBtn.addEventListener('click', goToTitle);
  els.againBtn.addEventListener('click', startGame);
  els.viewBtn.addEventListener('click', hideResult);
  els.resultTitleBtn.addEventListener('click', goToTitle);
  window.addEventListener('resize', requestFit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(requestFit);
  fitTitle();
})();
