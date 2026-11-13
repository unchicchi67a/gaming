/**
 * こたつ（猫をこたつから出さないゲーム）の進行。
 *
 * 画面に触れない純粋なロジックで、ブラウザと Node.js の両方から読み込める。
 *
 * 使い方：
 *   const g = createGame({ seed });
 *   const events = step(g, dt);      // 毎フレーム呼ぶ（dt は秒）
 *   push(g, catIndex);               // 猫を押し戻す
 *   treat(g, catIndex);              // おやつをあげる
 *   setHeat(g, 'low' | 'mid' | 'high');
 *
 * 猫の出ぐあい progress は 0（こたつの奥）〜 1（完全に出た）。1 になると猫は出ていき、
 * しばらくすると戻ってくる。4 匹ぜんぶが外に出たら負け（phase 'over'）、
 * 朝（DURATION 秒）まで耐えたらクリア（phase 'clear'）。
 * step が返す events は、せりふ・効果音・演出のためのできごとの一覧。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KotatsuGame = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 1 晩の長さ（秒）。21:00 から翌 7:00 までをこの時間で進める。 */
  const DURATION = 120;
  const START_MINUTES = 21 * 60;
  const NIGHT_MINUTES = 10 * 60;

  /** 猫。speed は出てくる速さの倍率、temper は押されたときのイライラのたまりやすさ。 */
  const CATS = [
    { id: 'mochi', name: 'もち', coat: 'white', speed: 0.8, temper: 0.8, note: 'のんびり。めったに怒らない' },
    { id: 'komugi', name: 'こむぎ', coat: 'tabby', speed: 1.0, temper: 1.0, note: 'ふつうの猫' },
    { id: 'nori', name: 'のり', coat: 'black', speed: 1.3, temper: 0.9, note: '好奇心のかたまり。すぐ出る' },
    { id: 'boss', name: 'ボス', coat: 'calico', speed: 0.9, temper: 1.5, note: '短気。さわりすぎ注意' },
  ];
  /** 猫がいる辺（s：手前、e：右、n：奥、w：左）。CATS と同じ順。 */
  const SIDES = ['s', 'e', 'n', 'w'];

  /** こたつの温度の設定ごとの、中の温度 T（0〜1）の行き先と変わる速さ（1 秒あたり）。 */
  const HEAT = {
    low: { target: 0.15, rate: 0.07 },
    mid: { target: 0.55, rate: 0.06 },
    high: { target: 1.0, rate: 0.07 },
  };
  /** これ以上は熱すぎて猫が飛び出してくる。 */
  const HOT = 0.88;
  /** HOT から少し下がるまでは「熱い」のまま（行ったり来たりでイベントが続かないように）。 */
  const HOT_RELEASE = 0.84;
  /** これ以上（HOT 未満）が、猫がいちばん落ちつく温度。 */
  const SWEET = 0.65;
  /** これ未満は寒い。 */
  const COLD = 0.3;
  /** 電気代（円 / 時間）。結果画面に出すだけ。 */
  const COST_PER_HOUR = { low: 3, mid: 6, high: 12 };

  const PUSH_BACK = 0.35;
  const PUSH_ANNOY = 0.3;
  const PUSH_MIN = 0.05;
  const STUN_TIME = 0.8;
  const ANNOY_DECAY = 0.035;
  const TREATS = 3;
  const CONTENT_TIME = 10;
  const OUT_MIN = 8;
  const OUT_MAX = 12;
  const RETURN_PROGRESS = 0.2;
  /** 出ぐあいがここを超えたら、猫がひとこと言う。 */
  const PEEK = 0.5;
  const SCORE_PER_CAT = 10;
  const SWEET_BONUS = 1.5;

  const EVENT_KINDS = ['doorbell', 'fridge', 'bird'];
  const EVENT_FIRST = 12;
  const EVENT_GAP_MIN = 14;
  const EVENT_GAP_MAX = 22;
  const DOORBELL_JUMP = 0.25;
  const FRIDGE_TIME = 4;
  const FRIDGE_BOOST = 2.5;
  const BIRD_TIME = 5;
  const BIRD_BOOST = 3;

  /** 再現できる疑似乱数（mulberry32）。 */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /** 動いているときの、出てくる速さ（1 秒あたり）。夜がふけるほど速くなる。 */
  function creepSpeed(time) {
    const k = clamp(time / DURATION, 0, 1);
    return 0.12 + (0.3 - 0.12) * k;
  }

  /** こたつの中の温度 T による、出てくる速さの倍率。寒いと出る、ちょうどいいと出ない、熱すぎると飛び出す。 */
  function heatFactor(T) {
    if (T >= HOT) return 2.6;
    if (T <= 0.5) return 2.0 - 2 * T;
    if (T <= 0.8) return 1 - ((T - 0.5) / 0.3) * 0.55;
    return 0.45;
  }

  function createGame(opts) {
    const o = opts || {};
    const rng = mulberry32(o.seed == null ? 1 : o.seed);
    const cats = CATS.map((c, i) => ({
      id: c.id,
      name: c.name,
      coat: c.coat,
      speed: c.speed,
      temper: c.temper,
      index: i,
      side: SIDES[i],
      progress: 0,
      annoy: 0,
      state: 'rest',
      timer: 1 + rng() * 3,
      out: false,
      outTimer: 0,
      boost: 0,
      peeked: false,
    }));
    return {
      rng,
      cats,
      time: 0,
      phase: 'play',
      reason: null,
      heat: 'mid',
      T: 0.5,
      hot: false,
      treats: TREATS,
      score: 0,
      cost: 0,
      fridge: 0,
      nextEvent: EVENT_FIRST + rng() * 6,
      lastEvent: null,
      stats: { pushes: 0, treats: 0, escapes: 0, flees: 0, events: 0, sweetTime: 0 },
    };
  }

  function insideCount(g) {
    return g.cats.filter((c) => !c.out).length;
  }

  function leave(g, cat, type, events) {
    cat.out = true;
    cat.state = 'out';
    cat.progress = 1;
    cat.annoy = 0;
    cat.boost = 0;
    cat.peeked = false;
    cat.outTimer = OUT_MIN + g.rng() * (OUT_MAX - OUT_MIN);
    if (type === 'flee') g.stats.flees++;
    else g.stats.escapes++;
    events.push({ type, cat: cat.index });
  }

  function startEvent(g, events) {
    const choices = EVENT_KINDS.filter((k) => k !== g.lastEvent);
    const kind = choices[Math.floor(g.rng() * choices.length)];
    g.lastEvent = kind;
    g.stats.events++;
    const ev = { type: 'event', kind };
    if (kind === 'doorbell') {
      for (const c of g.cats) {
        if (c.out || c.state === 'content') continue;
        c.progress = Math.min(0.95, c.progress + DOORBELL_JUMP);
        c.state = 'creep';
        c.timer = 1 + g.rng() * 2;
      }
    } else if (kind === 'fridge') {
      g.fridge = FRIDGE_TIME;
    } else {
      const inside = g.cats.filter((c) => !c.out && c.state !== 'content');
      if (inside.length) {
        const c = inside[Math.floor(g.rng() * inside.length)];
        c.boost = BIRD_TIME;
        c.state = 'creep';
        c.timer = BIRD_TIME;
        ev.cat = c.index;
      }
    }
    events.push(ev);
  }

  function step(g, dt) {
    const events = [];
    if (g.phase !== 'play' || !(dt > 0)) return events;
    g.time += dt;

    // こたつの温度
    const h = HEAT[g.heat];
    g.T = clamp(g.T + clamp(h.target - g.T, -h.rate * dt, h.rate * dt), 0, 1);
    if (!g.hot && g.T >= HOT) {
      g.hot = true;
      events.push({ type: 'hot' });
    } else if (g.hot && g.T < HOT_RELEASE) {
      g.hot = false;
    }
    g.cost += COST_PER_HOUR[g.heat] * (NIGHT_MINUTES / 60) * (dt / DURATION);
    if (g.fridge > 0) g.fridge = Math.max(0, g.fridge - dt);

    // 物音などのイベント
    if (g.time >= g.nextEvent) {
      startEvent(g, events);
      g.nextEvent = g.time + EVENT_GAP_MIN + g.rng() * (EVENT_GAP_MAX - EVENT_GAP_MIN);
    }

    const base = creepSpeed(g.time);
    const hf = heatFactor(g.T);
    const hot = g.T >= HOT;
    for (const c of g.cats) {
      if (c.out) {
        c.outTimer -= dt;
        if (c.outTimer <= 0) {
          c.out = false;
          c.progress = RETURN_PROGRESS;
          c.state = 'rest';
          c.timer = 2 + g.rng() * 2;
          events.push({ type: 'return', cat: c.index });
        }
        continue;
      }
      c.annoy = Math.max(0, c.annoy - ANNOY_DECAY * dt);
      if (c.boost > 0) c.boost = Math.max(0, c.boost - dt);

      if (c.state === 'content' || c.state === 'stun') {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.state = 'rest';
          c.timer = 1 + g.rng() * 2;
        }
      } else if (c.state === 'rest') {
        // 熱すぎるときは、休まずにすぐ動きだす
        c.timer -= hot ? dt * 3 : dt;
        if (c.timer <= 0) {
          c.state = 'creep';
          c.timer = 2 + g.rng() * 3;
        }
      } else if (c.state === 'creep') {
        let speed = base * hf * c.speed;
        if (c.boost > 0) speed *= BIRD_BOOST;
        if (g.fridge > 0) speed *= FRIDGE_BOOST;
        c.progress += speed * dt;
        c.timer -= dt;
        if (c.timer <= 0) {
          c.state = 'rest';
          c.timer = (1.5 + g.rng() * 2.5) / Math.max(1, hf);
        }
      }

      if (!c.peeked && c.progress >= PEEK) {
        c.peeked = true;
        let why = 'normal';
        if (hot) why = 'hot';
        else if (c.boost > 0) why = 'bird';
        else if (g.fridge > 0) why = 'fridge';
        else if (g.T < COLD) why = 'cold';
        events.push({ type: 'peek', cat: c.index, why });
      } else if (c.peeked && c.progress < PEEK - 0.15) {
        c.peeked = false;
      }

      if (c.progress >= 1) leave(g, c, 'escape', events);
    }

    // ぬくぬく度（こたつにいる猫の数 × 時間。ちょうどいい温度だと多め）
    const inside = insideCount(g);
    const sweet = g.T >= SWEET && g.T < HOT;
    g.score += inside * SCORE_PER_CAT * (sweet ? SWEET_BONUS : 1) * dt;
    if (sweet) g.stats.sweetTime += dt;

    if (inside === 0) {
      g.phase = 'over';
      g.reason = 'empty';
      events.push({ type: 'over' });
    } else if (g.time >= DURATION) {
      g.time = DURATION;
      g.phase = 'clear';
      events.push({ type: 'clear' });
    }
    return events;
  }

  /** 猫を押し戻す。返り値の type は 'push' / 'flee'（怒って出ていった）/ 'none'（押せない）。 */
  function push(g, index) {
    const c = g.cats[index];
    if (g.phase !== 'play' || !c || c.out || c.progress < PUSH_MIN) return { type: 'none', cat: index };
    g.stats.pushes++;
    c.progress = Math.max(0, c.progress - PUSH_BACK);
    c.annoy += PUSH_ANNOY * c.temper;
    if (c.annoy >= 1) {
      const events = [];
      leave(g, c, 'flee', events);
      return events[0];
    }
    if (c.state !== 'content') {
      c.state = 'stun';
      c.timer = STUN_TIME;
    }
    return { type: 'push', cat: index, annoy: c.annoy };
  }

  /** おやつをあげる。猫はこたつの奥にもどり、機嫌がなおって、しばらく出てこない。 */
  function treat(g, index) {
    const c = g.cats[index];
    if (g.phase !== 'play' || !c || c.out || g.treats <= 0) return { type: 'none', cat: index };
    g.treats--;
    g.stats.treats++;
    c.progress = 0;
    c.annoy = 0;
    c.boost = 0;
    c.peeked = false;
    c.state = 'content';
    c.timer = CONTENT_TIME;
    return { type: 'treat', cat: index };
  }

  function setHeat(g, level) {
    if (HEAT[level]) g.heat = level;
  }

  /** ゲームの経過時間を時計の表示（例 "21:00"、"7:00"）にする。5 分きざみ。 */
  function clockText(time) {
    const minutes = START_MINUTES + Math.floor((clamp(time, 0, DURATION) / DURATION) * NIGHT_MINUTES / 5) * 5;
    const hh = Math.floor(minutes / 60) % 24;
    const mm = minutes % 60;
    return hh + ':' + String(mm).padStart(2, '0');
  }

  /** 結果の称号。 */
  function rank(score, phase) {
    if (phase === 'over') return '猫に見捨てられし者';
    if (score < 2500) return 'ただの暖房器具';
    if (score < 4000) return '猫の下僕';
    if (score < 5500) return 'こたつ番長';
    if (score < 6600) return 'こたつ奉行';
    return 'こたつの神';
  }

  return {
    DURATION,
    CATS,
    SIDES,
    HEAT,
    HOT,
    SWEET,
    COLD,
    PEEK,
    TREATS,
    EVENT_KINDS,
    mulberry32,
    creepSpeed,
    heatFactor,
    createGame,
    step,
    push,
    treat,
    setHeat,
    insideCount,
    clockText,
    rank,
  };
});
