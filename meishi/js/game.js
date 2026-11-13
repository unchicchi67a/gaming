/**
 * 名刺交換・低さバトルのゲームロジック（描画なし）。
 *
 * 名刺は相手より低い位置から差し出すのがマナー。相手（取引先の部長）も負けじと下げてくるので、
 * お辞儀からひざをつき、土下座して、床をぶち抜き、地層を掘り進み、地球の中心まで下げ合う。
 *
 * 位置は「下げた量」x で表す。
 * - 0〜SURFACE：床より上。お辞儀の段階（SURFACE_STAGES）を順に進む
 * - SURFACE：床。床を掘りきる（floorHp を 0 にする）まで、それより下には行けない
 * - SURFACE〜GOAL：地下。表示する深さ（メートル）は depthAt(x) で決める。
 *   深くなるほど同じ x でたくさん進むので、地下鉄からマントルまで同じくらいの時間で通り過ぎる
 *
 * ルール：
 * - 押しているあいだ自分の名刺が下がる。押しているあいだは腰ゲージが減り、離すと回復する
 * - 腰ゲージが 0 になったら「ぎっくり腰」で負け
 * - 相手より名刺が高いあいだは失礼ゲージがたまり、満タンになったら負け（低いあいだは減る）
 * - 地下鉄の電車・温泉の間欠泉（HAZARDS）に当たると、気絶して上に押し戻される。部長も当たる
 * - 先に地球の中心に着いたら勝ち。相手に先に着かれたら負け
 * - 「お先にどうぞ」と言ったら負け
 *
 * ブラウザ（window.MeishiGame）と Node.js（require）の両方から読み込める。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MeishiGame = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 名刺が床に着く位置。 */
  const SURFACE = 30;
  /** 地球の中心。 */
  const GOAL = SURFACE + 190;
  /** 最初に名刺を持っている高さ（床からのメートル）。 */
  const START_HEIGHT = 1.2;
  /** 地球の半径（メートル）。 */
  const EARTH_RADIUS = 6371000;

  /**
   * 床からの x と深さ（メートル）の対応点。あいだは ln(深さ + 0.5) で直線補間する。
   * 地層ごとにだいたい同じ長さになるように置いている。
   */
  const ANCHORS = [
    [0, 0],
    [15, 3],
    [30, 15],
    [45, 40],
    [60, 150],
    [75, 800],
    [90, 2500],
    [105, 8000],
    [120, 35000],
    [150, 2900000],
    [170, 5150000],
    [190, EARTH_RADIUS],
  ].map(([x, d]) => [x + SURFACE, d]);

  /** 床より上の段階。line は、自分が先にその段階になったときの部長のひとこと。 */
  const SURFACE_STAGES = [
    { x: 0, name: '名刺を出す', line: null },
    { x: 4, name: '会釈', line: 'これはご丁寧に' },
    { x: 9, name: '敬礼', line: 'いえいえ、こちらこそ' },
    { x: 14, name: '最敬礼', line: 'とんでもございません' },
    { x: 19, name: 'ひざをつく', line: 'わたくしなどに、そんな' },
    { x: 24.5, name: '土下座', line: 'どうかお顔をお上げください' },
    { x: SURFACE, name: '床にはりつく', line: '床、冷たいですね' },
  ];

  /** 地層。from は始まる深さ（メートル）。line は、そこに着いたときの部長のひとこと。 */
  const LAYERS = [
    { id: 'office', name: 'オフィス', emoji: '🏢', from: -Infinity, line: null },
    { id: 'underfloor', name: 'オフィスの床下', emoji: '🔧', from: 0, line: '床下、ほこりっぽいですね' },
    { id: 'parking', name: '地下駐車場', emoji: '🚗', from: 3, line: 'お車でいらしたんですか' },
    { id: 'subway', name: '地下鉄', emoji: '🚇', from: 15, line: '電車、来ないといいですね' },
    { id: 'water', name: '地下水脈', emoji: '💧', from: 40, line: 'いいお水ですねえ' },
    { id: 'fossil', name: '化石の地層', emoji: '🦴', from: 150, line: 'この地層、白亜紀ですね' },
    { id: 'onsen', name: '温泉の源泉', emoji: '♨️', from: 800, line: 'いいお湯ですねえ' },
    { id: 'oil', name: '油田', emoji: '🛢️', from: 2500, line: '御社、石油もやってらっしゃる？' },
    { id: 'crust', name: '岩盤', emoji: '🪨', from: 8000, line: '固いですね、こちらの岩盤' },
    { id: 'mantle', name: 'マントル', emoji: '🌋', from: 35000, line: '熱いですね、御社の業界' },
    { id: 'outer', name: '外核', emoji: '🔥', from: 2900000, line: '鉄、溶けてますね' },
    { id: 'inner', name: '内核', emoji: '☀️', from: 5150000, line: 'そろそろ中心ですね' },
  ];

  /**
   * じゃまもの。名刺が from〜to（x）にあるときに active になると当たる。
   * idle（何もない）→ warn（予告）→ active（当たる）→ idle をくり返す。
   * 当たると stun 秒気絶し、from より knock だけ上に押し戻される。
   */
  const HAZARDS = [
    { id: 'train', name: '電車', emoji: '🚃', from: 0, to: 0, depthFrom: 22, depthTo: 30, warn: 1.6, active: 1.4, idle: [2.5, 5], stun: 2.2, knock: 2 },
    { id: 'geyser', name: '間欠泉', emoji: '♨️', from: 0, to: 0, depthFrom: 1150, depthTo: 1650, warn: 1.4, active: 1.2, idle: [2.5, 5], stun: 1.6, knock: 6 },
  ];

  /** 調整用の値。 */
  const TUNING = {
    playerVmax: 9, // 押しているときの最高速度（x / 秒）
    surfaceSlow: 0.55, // 床より上では、速度をこの割合にする（地上のやりとりを長く見せる）
    accel: 28, // 押しはじめの加速
    decel: 45, // 離したときの減速
    drain: 0.22, // 押しているあいだに減る腰ゲージ（1 秒あたり）
    recover: 0.34, // 離しているあいだに回復する腰ゲージ（1 秒あたり）
    floorTime: 1.4, // 床を掘りきるのに押しつづける秒数
    rudeUp: 0.1, // 相手より高いあいだにたまる失礼ゲージ（1 秒あたり）
    rudeDown: 0.12, // 相手より低いあいだに減る失礼ゲージ（1 秒あたり）
    tolerance: 1, // この差までは「同じ高さ」とみなす
    oppVmin: 9, // 部長の速度（浅いところ）
    oppVmax: 9.8, // 部長の速度（地球の中心近く）
    oppDrain: 0.24,
    oppRecover: 0.3,
    oppReact: [0.4, 0.9], // 抜かれてから下げはじめるまでの秒数
    oppAware: 0.5, // じゃまものに気づいて止まる確率
  };

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /** x のときの深さ（メートル）。床より上はマイナス（床からの高さ）。 */
  function depthAt(x) {
    if (x < SURFACE) return -START_HEIGHT * (SURFACE - x) / SURFACE;
    if (x >= GOAL) return EARTH_RADIUS;
    for (let i = 0; i < ANCHORS.length - 1; i++) {
      const [x0, d0] = ANCHORS[i];
      const [x1, d1] = ANCHORS[i + 1];
      if (x <= x1) {
        const t = (x - x0) / (x1 - x0);
        const u = Math.log(d0 + 0.5) + t * (Math.log(d1 + 0.5) - Math.log(d0 + 0.5));
        return Math.exp(u) - 0.5;
      }
    }
    return EARTH_RADIUS;
  }

  /** depthAt の逆。深さ（メートル）から x を求める。 */
  function xAtDepth(d) {
    if (d <= 0) return SURFACE - clamp(-d / START_HEIGHT, 0, 1) * SURFACE;
    if (d >= EARTH_RADIUS) return GOAL;
    for (let i = 0; i < ANCHORS.length - 1; i++) {
      const [x0, d0] = ANCHORS[i];
      const [x1, d1] = ANCHORS[i + 1];
      if (d <= d1) {
        const t = (Math.log(d + 0.5) - Math.log(d0 + 0.5)) / (Math.log(d1 + 0.5) - Math.log(d0 + 0.5));
        return x0 + t * (x1 - x0);
      }
    }
    return GOAL;
  }

  for (const h of HAZARDS) {
    h.from = xAtDepth(h.depthFrom);
    h.to = xAtDepth(h.depthTo);
  }

  /** x のときにいる地層のインデックス（LAYERS の添字）。 */
  function layerIndexAt(x) {
    if (x <= SURFACE) return 0;
    const d = depthAt(x);
    let idx = 1;
    for (let i = 1; i < LAYERS.length; i++) {
      if (d >= LAYERS[i].from) idx = i;
    }
    return idx;
  }

  /** x のときの床より上の段階（SURFACE_STAGES の添字）。 */
  function stageIndexAt(x) {
    let idx = 0;
    for (let i = 0; i < SURFACE_STAGES.length; i++) {
      if (x >= SURFACE_STAGES[i].x) idx = i;
    }
    return idx;
  }

  /** 深さの表示（例：「床から 85 cm」「地下 12 m」「地下 1,234 km」）。 */
  function formatDepth(x) {
    if (x >= GOAL) return '地球の中心';
    const d = depthAt(x);
    if (x < SURFACE) return `床から ${Math.round(-d * 100)} cm`;
    if (d < 10) return `地下 ${d.toFixed(1)} m`;
    if (d < 1000) return `地下 ${Math.round(d).toLocaleString('en-US')} m`;
    if (d < 100000) return `地下 ${(d / 1000).toFixed(1)} km`;
    return `地下 ${Math.round(d / 1000).toLocaleString('en-US')} km`;
  }

  /** 勝ったときの称号（かかった秒数から）。 */
  function rankFor(seconds) {
    if (seconds < 44) return '名刺交換の神';
    if (seconds < 50) return '伝説の営業';
    if (seconds < 60) return 'できる社会人';
    return '期待の新人';
  }

  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const rand = (g, [lo, hi]) => lo + g.rng() * (hi - lo);

  function makeMover() {
    return { x: 0, v: 0, stamina: 1, floorHp: 1, stun: 0, stage: 0, hitBy: {} };
  }

  /**
   * 新しいゲームを作る。
   * @param {{ rng?: () => number, tuning?: object }} [opts]
   */
  function createGame(opts) {
    const o = opts || {};
    const rng = o.rng || Math.random;
    const tuning = Object.assign({}, TUNING, o.tuning || {});
    const g = {
      rng,
      tuning,
      time: 0,
      state: 'playing', // 'playing' | 'over'
      result: null, // 'win' | 'rude' | 'back' | 'beaten' | 'surrender'
      player: makeMover(),
      opp: Object.assign(makeMover(), { mode: 'rest', react: 0, margin: 2, restUntil: 0.6, aware: {} }),
      hazards: HAZARDS.map(() => ({ phase: 'idle', timer: 0, cycle: 0 })),
      rude: 0,
      lowerTime: 0, // 相手より低かった合計の秒数
      deepestLayer: 0, // どちらかが着いたいちばん深い地層
      playerLower: false, // いま自分のほうが低いか（追い抜き・追い抜かれの判定用）
    };
    g.hazards.forEach((h, i) => { h.timer = rand(g, HAZARDS[i].idle); });
    rollAwareness(g);
    resetOppPlan(g);
    g.opp.react = 1.2; // 最初は少し様子を見る
    return g;
  }

  function resetOppPlan(g) {
    const o = g.opp;
    o.margin = 1.5 + g.rng() * 2.5;
    o.restUntil = 0.55 + g.rng() * 0.4;
    o.react = rand(g, g.tuning.oppReact);
  }

  /** 部長が、それぞれのじゃまものに今回気づくかどうかを決める。 */
  function rollAwareness(g) {
    for (const h of HAZARDS) g.opp.aware[h.id] = g.rng() < g.tuning.oppAware;
  }

  function oppSpeed(g) {
    const t = g.tuning;
    return t.oppVmin + (t.oppVmax - t.oppVmin) * clamp(g.opp.x / GOAL, 0, 1);
  }

  /** じゃまものが予告中か当たる状態で、x の少し下にあるか（部長が止まるかどうかの判定用）。 */
  function dangerAhead(g, x) {
    for (let i = 0; i < HAZARDS.length; i++) {
      const h = HAZARDS[i];
      const s = g.hazards[i];
      if (s.phase === 'idle' || !g.opp.aware[h.id]) continue;
      if (x < h.to && x > h.from - 3) return h;
    }
    return null;
  }

  /** 自分か部長を、dt 秒ぶん動かす。床では、床を掘りきるまで止まる。 */
  function move(g, m, dt, pushing, vmax, drain, recover, who, events) {
    const t = g.tuning;
    if (m.stun > 0) {
      m.stun = Math.max(0, m.stun - dt);
      m.v = 0;
      m.stamina = Math.min(1, m.stamina + recover * dt);
      return;
    }
    if (pushing) {
      m.v = Math.min(vmax, m.v + t.accel * dt);
      m.stamina -= drain * dt;
    } else {
      m.v = Math.max(0, m.v - t.decel * dt);
      m.stamina = Math.min(1, m.stamina + recover * dt);
    }
    const speed = m.x < SURFACE ? m.v * t.surfaceSlow : m.v;
    let nx = Math.min(GOAL, m.x + speed * dt);
    if (m.floorHp > 0 && nx >= SURFACE) {
      nx = SURFACE;
      if (pushing) {
        m.floorHp = Math.max(0, m.floorHp - dt / t.floorTime);
        if (m.floorHp === 0) events.push({ type: 'floorBreak', who });
      }
    }
    m.x = nx;
  }

  /** 部長の動き。自分のほうが低くないと気が済まないが、腰には限界がある。 */
  function stepOpp(g, dt, events) {
    const o = g.opp;
    const p = g.player;
    const t = g.tuning;
    const want = p.x + o.margin;
    const behind = o.x < want;
    let pushing = false;

    if (o.stun > 0) {
      o.mode = 'rest';
    } else if (o.mode === 'rest') {
      if (behind) {
        o.react -= dt;
        if (o.react <= 0 && o.stamina >= o.restUntil) o.mode = 'push';
      } else {
        o.react = Math.max(o.react, rand(g, t.oppReact));
      }
    }
    if (o.mode === 'push') {
      if (!behind || o.stamina < 0.08) {
        o.mode = 'rest';
        if (o.stamina < 0.08) events.push({ type: 'oppTired' });
        resetOppPlan(g);
      } else if (dangerAhead(g, o.x)) {
        pushing = false; // 気づいたので、通りすぎるまで待つ
      } else {
        pushing = true;
      }
    }
    move(g, o, dt, pushing, oppSpeed(g), t.oppDrain, t.oppRecover, 'opp', events);
  }

  /** じゃまものを進め、当たった人を気絶させて押し戻す。 */
  function stepHazards(g, dt, events) {
    for (let i = 0; i < HAZARDS.length; i++) {
      const h = HAZARDS[i];
      const s = g.hazards[i];
      s.timer -= dt;
      if (s.timer <= 0) {
        if (s.phase === 'idle') {
          s.phase = 'warn';
          s.timer = h.warn;
          events.push({ type: 'hazardWarn', id: h.id });
        } else if (s.phase === 'warn') {
          s.phase = 'active';
          s.timer = h.active;
          s.cycle++;
          events.push({ type: 'hazardStart', id: h.id });
        } else {
          s.phase = 'idle';
          s.timer = rand(g, h.idle);
          g.opp.aware[h.id] = g.rng() < g.tuning.oppAware;
        }
      }
      if (s.phase !== 'active') continue;
      for (const who of ['player', 'opp']) {
        const m = g[who];
        if (m.x >= h.from && m.x <= h.to && m.hitBy[h.id] !== s.cycle) {
          m.hitBy[h.id] = s.cycle;
          m.stun = h.stun;
          m.v = 0;
          m.x = Math.max(SURFACE + 0.01, h.from - h.knock);
          events.push({ type: 'hit', who, id: h.id });
        }
      }
    }
  }

  function finish(g, result, events) {
    g.state = 'over';
    g.result = result;
    g.player.v = 0;
    g.opp.v = 0;
    events.push({ type: 'over', result });
  }

  function stepOnce(g, dt, holding, events) {
    const p = g.player;
    const t = g.tuning;
    g.time += dt;

    move(g, p, dt, holding, t.playerVmax, t.drain, t.recover, 'player', events);
    stepOpp(g, dt, events);
    stepHazards(g, dt, events);

    // 床より上の段階
    for (const who of ['player', 'opp']) {
      const m = g[who];
      const stage = stageIndexAt(m.x);
      if (stage > m.stage) {
        const first = stage > g[who === 'player' ? 'opp' : 'player'].stage;
        m.stage = stage;
        events.push({ type: 'stage', who, index: stage, first });
      }
    }

    // 新しい地層に着いた
    const layer = layerIndexAt(Math.max(p.x, g.opp.x));
    if (layer > g.deepestLayer) {
      g.deepestLayer = layer;
      events.push({ type: 'layer', index: layer, by: p.x >= g.opp.x ? 'player' : 'opp' });
    }

    // どちらが低いか
    const diff = p.x - g.opp.x;
    if (diff < -t.tolerance) {
      g.rude = Math.min(1, g.rude + t.rudeUp * dt);
      if (g.playerLower) events.push({ type: 'overtaken' });
      g.playerLower = false;
    } else if (diff > t.tolerance) {
      g.rude = Math.max(0, g.rude - t.rudeDown * dt);
      g.lowerTime += dt;
      if (!g.playerLower) events.push({ type: 'overtake' });
      g.playerLower = true;
    }

    // 勝ち負け
    if (p.x >= GOAL) return finish(g, 'win', events);
    if (p.stamina <= 0) {
      p.stamina = 0;
      return finish(g, 'back', events);
    }
    if (g.rude >= 1) return finish(g, 'rude', events);
    if (g.opp.x >= GOAL) return finish(g, 'beaten', events);
  }

  /**
   * ゲームを dt 秒すすめる。
   * @param {object} g createGame の戻り値
   * @param {number} dt 秒
   * @param {boolean} holding 「さげる」を押しているか
   * @returns {Array<object>} このあいだに起きたできごと
   *   - { type: 'overtake' }：自分のほうが低くなった
   *   - { type: 'overtaken' }：部長のほうが低くなった
   *   - { type: 'oppTired' }：部長の腰が限界で、ひと休みする
   *   - { type: 'stage', who, index, first }：床より上の新しい段階になった（first は相手より先か）
   *   - { type: 'floorBreak', who }：床を掘りきった
   *   - { type: 'layer', index, by }：どちらかが新しい地層に着いた（index は LAYERS の添字）
   *   - { type: 'hazardWarn', id } / { type: 'hazardStart', id }：じゃまものの予告・到来
   *   - { type: 'hit', who, id }：じゃまものに当たった
   *   - { type: 'over', result }：ゲームが終わった
   */
  function step(g, dt, holding) {
    const events = [];
    let left = Math.min(dt, 0.25); // タブが裏にあったときなどに一気に進まないように
    while (left > 1e-9 && g.state === 'playing') {
      const h = Math.min(left, 1 / 120);
      stepOnce(g, h, holding, events);
      left -= h;
    }
    return events;
  }

  /** 「お先にどうぞ」と言う（負け）。 */
  function surrender(g) {
    const events = [];
    if (g.state === 'playing') finish(g, 'surrender', events);
    return events;
  }

  return {
    SURFACE,
    GOAL,
    START_HEIGHT,
    EARTH_RADIUS,
    LAYERS,
    SURFACE_STAGES,
    HAZARDS,
    TUNING,
    depthAt,
    xAtDepth,
    layerIndexAt,
    stageIndexAt,
    formatDepth,
    rankFor,
    makeRng,
    createGame,
    step,
    surrender,
  };
});
