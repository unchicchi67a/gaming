/**
 * 名刺交換・低さバトルのゲームロジック（描画なし）。
 *
 * 名刺は相手より低い位置から差し出すのがマナー。相手（取引先の部長）も負けじと下げてくるので、
 * 床をぶち抜き、地層を掘り進み、地球の中心まで下げ合う。
 *
 * 位置は「下げた量」x（0 = 胸の高さ、SURFACE = 床、GOAL = 地球の中心）で表す。
 * 画面ではスクロール量が x に比例し、表示する深さ（メートル）は depthAt(x) で決める。
 * 深くなるほど同じ x でたくさん進むので、地下鉄からマントルまで同じくらいの時間で通り過ぎる。
 *
 * ルール：
 * - 押しているあいだ自分の名刺が下がる。押しているあいだは腰ゲージが減り、離すと回復する
 * - 腰ゲージが 0 になったら「ぎっくり腰」で負け
 * - 相手より名刺が高いあいだは失礼ゲージがたまり、満タンになったら負け（低いあいだは減る）
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
  const SURFACE = 10;
  /** 地球の中心。 */
  const GOAL = 200;
  /** 最初に名刺を持っている高さ（床からのメートル）。 */
  const START_HEIGHT = 1.2;
  /** 地球の半径（メートル）。 */
  const EARTH_RADIUS = 6371000;

  /**
   * x と深さ（メートル）の対応点。あいだは ln(深さ + 0.5) で直線補間する。
   * 地層ごとにだいたい同じ長さになるように置いている。
   */
  const ANCHORS = [
    [10, 0],
    [25, 3],
    [40, 15],
    [55, 40],
    [70, 150],
    [85, 800],
    [100, 2500],
    [115, 8000],
    [130, 35000],
    [160, 2900000],
    [180, 5150000],
    [200, EARTH_RADIUS],
  ];

  /** 地層。from は始まる深さ（メートル）。line は、そこに着いたときの部長のひとこと。 */
  const LAYERS = [
    { id: 'office', name: 'オフィス', emoji: '🏢', from: -Infinity, line: null },
    { id: 'underfloor', name: 'オフィスの床下', emoji: '🔧', from: 0, line: '床、大丈夫ですかね' },
    { id: 'parking', name: '地下駐車場', emoji: '🚗', from: 3, line: 'お車でいらしたんですか' },
    { id: 'subway', name: '地下鉄', emoji: '🚇', from: 15, line: 'あ、終電まだありますね' },
    { id: 'water', name: '地下水脈', emoji: '💧', from: 40, line: 'いいお水ですねえ' },
    { id: 'fossil', name: '化石の地層', emoji: '🦴', from: 150, line: 'この地層、白亜紀ですね' },
    { id: 'onsen', name: '温泉の源泉', emoji: '♨️', from: 800, line: 'いいお湯ですねえ' },
    { id: 'oil', name: '油田', emoji: '🛢️', from: 2500, line: '御社、石油もやってらっしゃる？' },
    { id: 'crust', name: '岩盤', emoji: '🪨', from: 8000, line: '固いですね、こちらの岩盤' },
    { id: 'mantle', name: 'マントル', emoji: '🌋', from: 35000, line: '熱いですね、御社の業界' },
    { id: 'outer', name: '外核', emoji: '🔥', from: 2900000, line: '鉄、溶けてますね' },
    { id: 'inner', name: '内核', emoji: '☀️', from: 5150000, line: 'そろそろ中心ですね' },
  ];

  /** 調整用の値。 */
  const TUNING = {
    playerVmax: 9, // 押しているときの最高速度（x / 秒）
    accel: 28, // 押しはじめの加速
    decel: 45, // 離したときの減速
    drain: 0.24, // 押しているあいだに減る腰ゲージ（1 秒あたり）
    recover: 0.32, // 離しているあいだに回復する腰ゲージ（1 秒あたり）
    rudeUp: 0.2, // 相手より高いあいだにたまる失礼ゲージ（1 秒あたり）
    rudeDown: 0.08, // 相手より低いあいだに減る失礼ゲージ（1 秒あたり）
    tolerance: 0.4, // この差までは「同じ高さ」とみなす
    oppVmin: 8.9, // 部長の速度（浅いところ）
    oppVmax: 10.4, // 部長の速度（地球の中心近く）
    oppDrain: 0.24,
    oppRecover: 0.3,
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
    if (seconds < 37) return '名刺交換の神';
    if (seconds < 42) return '伝説の営業';
    if (seconds < 55) return 'できる社会人';
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
      player: { x: 0, v: 0, stamina: 1 },
      opp: { x: 0, v: 0, stamina: 1, mode: 'rest', react: 0, margin: 2, restUntil: 0.6 },
      rude: 0,
      lowerTime: 0, // 相手より低かった合計の秒数
      deepestLayer: 0, // どちらかが着いたいちばん深い地層
      playerLower: false, // いま自分のほうが低いか（追い抜き・追い抜かれの判定用）
    };
    resetOppPlan(g);
    g.opp.react = 0.8; // 最初は少し様子を見る
    return g;
  }

  function resetOppPlan(g) {
    const o = g.opp;
    o.margin = 1.2 + g.rng() * 2.8;
    o.restUntil = 0.35 + g.rng() * 0.5;
    o.react = 0.25 + g.rng() * 0.45;
  }

  function oppSpeed(g) {
    const t = g.tuning;
    return t.oppVmin + (t.oppVmax - t.oppVmin) * clamp(g.opp.x / GOAL, 0, 1);
  }

  /** 部長の動き。自分のほうが低くないと気が済まないが、腰には限界がある。 */
  function stepOpp(g, dt, events) {
    const o = g.opp;
    const p = g.player;
    const t = g.tuning;
    const want = p.x + o.margin;
    const behind = o.x < want;
    let pushing = false;

    if (o.mode === 'rest') {
      if (behind) {
        o.react -= dt;
        const overtaken = p.x > o.x + t.tolerance;
        if (o.react <= 0 && (o.stamina >= o.restUntil || (overtaken && o.stamina > 0.3))) {
          o.mode = 'push';
        }
      } else {
        o.react = Math.max(o.react, 0.2);
      }
    }
    if (o.mode === 'push') {
      if (!behind || o.stamina < 0.06) {
        o.mode = 'rest';
        if (o.stamina < 0.06) events.push({ type: 'oppTired' });
        resetOppPlan(g);
      } else {
        pushing = true;
      }
    }

    const vmax = oppSpeed(g);
    if (pushing) {
      o.v = Math.min(vmax, o.v + t.accel * dt);
      o.stamina = Math.max(0, o.stamina - t.oppDrain * dt);
    } else {
      o.v = Math.max(0, o.v - t.decel * dt);
      o.stamina = Math.min(1, o.stamina + t.oppRecover * dt);
    }
    o.x = Math.min(GOAL, o.x + o.v * dt);
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

    // 自分
    if (holding) {
      p.v = Math.min(t.playerVmax, p.v + t.accel * dt);
      p.stamina -= t.drain * dt;
    } else {
      p.v = Math.max(0, p.v - t.decel * dt);
      p.stamina = Math.min(1, p.stamina + t.recover * dt);
    }
    p.x = Math.min(GOAL, p.x + p.v * dt);

    // 部長
    stepOpp(g, dt, events);

    // 床をぶち抜いた・新しい地層に着いた
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
   *   - { type: 'layer', index, by }：どちらかが新しい地層に着いた（index は LAYERS の添字）
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
    TUNING,
    depthAt,
    xAtDepth,
    layerIndexAt,
    formatDepth,
    rankFor,
    makeRng,
    createGame,
    step,
    surrender,
  };
});
