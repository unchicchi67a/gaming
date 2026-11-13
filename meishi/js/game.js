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
 * ルール（読み合いのゲーム。名刺交換は「間（ま）」で決まる）：
 * - 押しているあいだ自分の名刺が下がる。押しているあいだは腰ゲージが減り、止まっているあいだは少しずつ回復する
 * - 2 人とも止まると「間」が始まり、間が満ちたときに名刺交換になる。そのとき低いほうが勝ち
 *   - 自分が低いとき：TUNING.maPlayer 秒で交換（そのあいだに部長が下げ返してこなければ勝ち）
 *   - 部長が低いとき：部長が名刺を差し出すまでの秒数は毎回ちがう（oppPatience）。差し出す少し前に「差し出しかける」
 *   - 同じ高さ（tolerance 以内）のまま交換になったら引き分け（お見合い）
 * - 部長の腰ゲージは見えない。顔色（face）で読むが、部長はやせがまんも、疲れたふりもする
 * - 部長は、下げ返すのに腰が足りなさそうなら諦める。あなたが疲れていると、大きく突き放しにくる
 * - 腰ゲージが 0 になったら「ぎっくり腰」で負け（部長がなったら勝ち）
 * - 地下鉄の電車・温泉の間欠泉（HAZARDS）に当たると、気絶して上に押し戻される。部長も当たる
 * - 地球の中心に先に着いたら、その場で勝ち（相手に先に着かれたら負け）
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
    playerVmax: 9, // 押しているときの最高速度（床のすぐ下での x / 秒）
    surfaceSlow: 0.8, // 床より上では、速度をこの割合にする
    surfaceDrain: 0.3, // 床より上（お辞儀と床掘り）では、腰の減りをこの割合にする（地上で決着しすぎないように）
    deepen: 30, // 地下では、床から deepen 進むごとに速さが 1 倍ずつ増える（読み合いが続くほど深く進む）
    accel: 28, // 押しはじめの加速
    decel: 45, // 離したときの減速
    drain: 0.2, // 押しはじめに減る腰ゲージ（1 秒あたり）
    strain: 0.5, // 押しつづけるほど腰の減りが増える（1 秒押しつづけるごとに、減る速さが drain × strain ずつ増える）
    recover: 0.03, // 止まっているあいだに回復する腰ゲージ（1 秒あたり）
    floorTime: 1, // 床を掘りきるのに押しつづける秒数（長いと「床ぎわで大きく突き放す」だけが強くなる）
    layerBonus: 0.15, // 新しい地層に一番乗りしたときに回復する腰ゲージ
    tolerance: 1, // この差までは「同じ高さ」とみなす
    maPlayer: 2, // 自分が低いとき、間ができてから名刺交換になるまでの秒数
    oppPatience: [1.3, 2.6], // 部長が低いとき、部長が名刺を差し出すまでの秒数（毎回ちがう）
    reachLead: 0.7, // 部長が名刺を差し出す何秒前に「差し出しかける」そぶりを見せるか
    oppStart: 4, // 部長は、最初からこれだけ下げている（会釈）
    oppStamina: [0.7, 1.3], // 部長の腰ゲージの最大（毎回ちがう。あなたは 1）
    oppV: 9, // 部長の最高速度
    oppDrain: 0.2,
    oppRecover: 0.03,
    oppReact: [0.35, 1.5], // 間ができてから部長が下げ返しはじめるまでの秒数
    oppMargin: [0.25, 0.55], // 部長が下げ返すとき、あなたより下に行く量（その深さで押しつづける秒数。ふつう）
    oppBigMargin: [1, 1.8], // 大きく突き放すときの量（秒数）
    oppBigBase: 0.12, // 大きく突き放す確率（基本）
    oppBigTired: 0.6, // あなたの腰が減っているほど、この分だけ確率が上がる
    oppBigKeep: 0.35, // トドメにならない突き放しは、これだけ腰が残るときだけする
    oppKill: 0.75, // あなたの腰が少なくて返せなさそうなとき、返せない深さまで突き放す確率
    oppReserve: [0, 0.1], // 部長が残しておきたい腰ゲージ（試合ごとに決まる）
    oppPride: 0.5, // 残しておきたい分を削ってでも、意地で下げ返す確率
    oppBluffCalm: 0.4, // 疲れているのに、余裕の顔をする確率（やせがまん）
    oppBluffTired: 0.2, // 余裕があるのに、疲れた顔をする確率（疲れたふり）
    oppAware: 0.5, // じゃまものに気づいて止まる確率
  };

  /**
   * 相手の役職（難易度）。弱い順。tuning は TUNING を上書きする。
   * 腰の強さ（oppStamina）、トドメを狙う確率（oppKill）、顔のうその多さ（oppBluff*）、
   * 諦めやすさ（oppReserve / oppPride）、名刺を差し出すまでの秒数（oppPatience）で強さを変える。
   */
  const RANKS = [
    {
      id: 'hira', name: '平社員', note: '顔に出やすく、すぐ諦める',
      tuning: { oppStamina: [0.55, 0.85], oppKill: 0.25, oppBluffCalm: 0.05, oppBluffTired: 0.05, oppReserve: [0.1, 0.2], oppPride: 0.2, oppPatience: [2, 2.8] },
    },
    {
      id: 'kakaricho', name: '係長', note: 'まじめで正直',
      tuning: { oppStamina: [0.55, 0.95], oppKill: 0.4, oppBluffCalm: 0.15, oppBluffTired: 0.1, oppReserve: [0.1, 0.2], oppPride: 0.3, oppPatience: [1.7, 2.7] },
    },
    {
      id: 'kacho', name: '課長', note: '少しずつ手ごわくなる',
      tuning: { oppStamina: [0.65, 1.15], oppKill: 0.6, oppBluffCalm: 0.3, oppBluffTired: 0.15, oppReserve: [0.05, 0.15], oppPride: 0.4, oppPatience: [1.5, 2.6] },
    },
    { id: 'bucho', name: '部長', note: 'やせがまんもする', tuning: {} },
    {
      id: 'kyokucho', name: '局長', note: 'タフで、うそが多い',
      tuning: { oppStamina: [0.85, 1.4], oppKill: 0.85, oppBluffCalm: 0.5, oppBluffTired: 0.25, oppReserve: [0, 0.05], oppPride: 0.7, oppPatience: [1.2, 2.4] },
    },
    {
      id: 'shacho', name: '社長', note: '容赦なくトドメを刺してくる',
      tuning: { oppStamina: [1, 1.5], oppKill: 0.95, oppBluffCalm: 0.6, oppBluffTired: 0.3, oppReserve: [0, 0], oppPride: 0.9, oppPatience: [1.1, 2.2], oppReact: [0.3, 1.2] },
    },
  ];
  const DEFAULT_RANK = 'bucho';

  function rankById(id) {
    return RANKS.find((r) => r.id === id) || RANKS.find((r) => r.id === DEFAULT_RANK);
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /** x にいるときの速さの倍率。床より上はゆっくり、地下は深いほど速い。 */
  function speedFactor(x, t) {
    if (x < SURFACE) return t.surfaceSlow;
    return 1 + (x - SURFACE) / t.deepen;
  }

  /** 最高速度 vmax で x0 から x1 まで下げるのにかかる秒数（加速と床を掘る時間はのぞく）。 */
  function travelTime(x0, x1, vmax, t) {
    let time = 0;
    let x = x0;
    if (x < SURFACE && x1 > x) {
      const to = Math.min(x1, SURFACE);
      time += (to - x) / (vmax * t.surfaceSlow);
      x = to;
    }
    if (x1 > x) {
      // 速さが 1 + (x - SURFACE) / deepen に比例するので、かかる秒数は対数になる
      time += (t.deepen / vmax) * Math.log(speedFactor(x1, t) / speedFactor(x, t));
    }
    return time;
  }

  /** x から、vmax で sec 秒押しつづけたときに着く位置。 */
  function reachIn(x, sec, vmax, t) {
    let left = sec;
    let pos = x;
    if (pos < SURFACE) {
      const need = travelTime(pos, SURFACE, vmax, t);
      if (need >= left) return pos + left * vmax * t.surfaceSlow;
      left -= need;
      pos = SURFACE;
    }
    const f = speedFactor(pos, t) * Math.exp((left * vmax) / t.deepen);
    return Math.min(GOAL, SURFACE + (f - 1) * t.deepen);
  }

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

  /** 勝ったときの称号（名刺交換した場所の深さ x から。深いところで勝つほど上）。 */
  function rankFor(x) {
    if (x >= GOAL) return '名刺交換の神';
    if (x >= xAtDepth(8000)) return '伝説の営業';
    if (x >= xAtDepth(40)) return 'できる営業';
    if (x >= SURFACE) return 'できる社会人';
    return '常識ある社会人';
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
    return { x: 0, v: 0, hold: 0, stamina: 1, max: 1, floorHp: 1, stun: 0, stage: 0, hitBy: {} };
  }

  /**
   * 新しいゲームを作る。
   * @param {{ rng?: () => number, rank?: string, tuning?: object }} [opts] rank は相手の役職（RANKS の id）
   */
  function createGame(opts) {
    const o = opts || {};
    const rng = o.rng || Math.random;
    const rank = rankById(o.rank);
    const tuning = Object.assign({}, TUNING, rank.tuning, o.tuning || {});
    const g = {
      rng,
      rank,
      tuning,
      time: 0,
      state: 'playing', // 'playing' | 'over'
      result: null, // 'win' | 'center' | 'oppBack' | 'draw' | 'rude' | 'back' | 'beaten' | 'surrender'
      player: makeMover(),
      opp: Object.assign(makeMover(), {
        mode: 'wait', // 'wait'（止まって考える）| 'push'（下げ返している）
        plan: null, // 今回の考え：null（まだ）| 'answer'（下げ返す）| 'concede'（諦める）
        react: 0, // 下げ返しはじめるまでの残り秒数
        target: 0, // 下げ返すときに目指す x
        big: false, // 大きく突き放すつもりか
        kill: false, // あなたが返せない深さまで突き放すつもりか（トドメ）
        busy: false, // じゃまものが通りすぎるのを待っている（考えごとではない）
        reserve: 0, // 残しておきたい腰ゲージ
        face: 'calm', // 見せている顔：'calm'（余裕）| 'sweat'（汗）| 'tired'（ハァハァ）
        aware: {},
      }),
      hazards: HAZARDS.map(() => ({ phase: 'idle', timer: 0, cycle: 0 })),
      ma: 0, // 間の秒数（だれかが押しているあいだは止まり、どちらが低いかが入れかわると 0 にもどる）
      maLower: null, // いま低いほう：'player' | 'opp' | 'even'
      maLimit: 0, // 何秒で名刺交換になるか
      reached: false, // 部長が名刺を差し出しかけたか
      exchangeX: null, // 名刺交換した場所（低いほうの x）
      lowerTime: 0, // 相手より低かった合計の秒数
      stats: { answers: 0, bigAnswers: 0, concedes: 0, maxMa: 0 },
      deepestLayer: 0, // どちらかが着いたいちばん深い地層
      playerLower: false, // いま自分のほうが低いか（追い抜き・追い抜かれの判定用）
    };
    g.hazards.forEach((h, i) => { h.timer = rand(g, HAZARDS[i].idle); });
    g.opp.reserve = rand(g, tuning.oppReserve);
    // 部長の腰の強さは毎回ちがう（見えないので、顔色から読む）
    g.opp.max = g.opp.stamina = rand(g, tuning.oppStamina);
    // 部長が先に会釈したところから始まる（先に下げたほうが腰の削り合いで損をするので、最初の一手はあなた）
    g.opp.x = tuning.oppStart;
    g.opp.stage = stageIndexAt(g.opp.x);
    rollAwareness(g);
    return g;
  }

  /** 部長が、それぞれのじゃまものに今回気づくかどうかを決める。 */
  function rollAwareness(g) {
    for (const h of HAZARDS) g.opp.aware[h.id] = g.rng() < g.tuning.oppAware;
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

  /**
   * m が止まった状態から target まで下げるのに使う腰ゲージの見こみ。
   * 床より上はゆっくり進み、床が残っていれば掘る時間もかかる。
   */
  function costToReach(g, m, target, vmax, drain) {
    const t = g.tuning;
    if (target <= m.x) return 0;
    const accel = vmax / t.accel / 2; // 加速するあいだの遅れ
    const above = travelTime(m.x, Math.min(target, SURFACE), vmax, t); // 床より上（腰への負担が軽い）
    const below = travelTime(Math.max(m.x, SURFACE), target, vmax, t);
    const floor = target >= SURFACE && m.floorHp > 0 ? m.floorHp * t.floorTime : 0;
    const time = accel + above + below + floor;
    const weight = m.x < SURFACE || m.floorHp > 0 ? t.surfaceDrain : 1; // 加速のぶんは、いまいる場所の重さ
    // 止まっている状態から押しつづけたとき：減る速さが drain × 重さ × (1 + strain × 押した秒数)
    return drain * (accel * weight + (above + floor) * t.surfaceDrain + below + (t.strain * time * time) / 2);
  }

  /** 部長が見せる顔を決める。疲れていても余裕の顔をしたり、余裕があるのに疲れた顔をしたりする。 */
  function chooseFace(g) {
    const o = g.opp;
    const t = g.tuning;
    const honest = o.stamina > 0.6 ? 'calm' : o.stamina > 0.3 ? 'sweat' : 'tired';
    if (honest !== 'calm' && g.rng() < t.oppBluffCalm) return 'calm';
    if (honest === 'calm' && g.rng() < t.oppBluffTired) return 'tired';
    return honest;
  }

  /**
   * あなたが返せなくなる深さ（部長が、あなたの腰ゲージを見て決める）。
   * そこまで下げられたら、あなたは腰が足りなくて下げ返せない。見つからなければ null。
   */
  function killTarget(g, wait) {
    const p = g.player;
    const o = g.opp;
    const t = g.tuning;
    for (let target = o.x + 1; target < GOAL; target += 1) {
      // 部長が動きだすまで（wait 秒）と、下げているあいだに、あなたの腰は少し回復する
      const travel = costToReach(g, o, target, t.oppV, t.oppDrain) / t.oppDrain;
      const cost = costToReach(g, p, target + t.tolerance + 0.5, t.playerVmax, t.drain);
      if (cost > p.stamina + t.recover * (wait + travel) + 0.02) return target;
    }
    return null;
  }

  /** 部長が、あなたに下げ返すか諦めるかを決める。 */
  function decide(g, events) {
    const o = g.opp;
    const p = g.player;
    const t = g.tuning;
    const afford = (target) => {
      const cost = costToReach(g, o, target, t.oppV, t.oppDrain);
      return cost <= o.stamina - o.reserve || (cost < o.stamina - 0.02 && g.rng() < t.oppPride);
    };
    // 下げ返すなら、間が満ちる前に動きだす
    o.react = Math.min(rand(g, t.oppReact), t.maPlayer - 0.25);
    const plans = [];
    // あなたの腰が少なければ、返せない深さまで一気に突き放す
    const kill = killTarget(g, o.react);
    if (kill !== null && kill > p.x + t.tolerance && g.rng() < t.oppKill) plans.push({ target: kill + 0.5, big: true, kill: true });
    // トドメでなくても、ときどき大きく突き放して揺さぶる（腰が十分残るときだけ）
    const bigChance = t.oppBigBase + t.oppBigTired * clamp((0.6 - p.stamina) / 0.6, 0, 1);
    if (g.rng() < bigChance) plans.push({ target: reachIn(p.x, rand(g, t.oppBigMargin), t.oppV, t), big: true });
    plans.push({ target: reachIn(p.x, rand(g, t.oppMargin), t.oppV, t), big: false });
    o.plan = 'concede';
    for (const plan of plans) {
      const target = Math.min(GOAL, Math.max(plan.target, p.x + t.tolerance + 0.5));
      const cost = costToReach(g, o, target, t.oppV, t.oppDrain);
      if (plan.big && !plan.kill && o.stamina - cost < t.oppBigKeep) continue;
      // トドメになるなら、残しておきたい分も使う
      if (plan.kill ? cost < o.stamina - 0.02 : afford(target)) {
        o.plan = 'answer';
        o.target = target;
        o.big = plan.big;
        o.kill = !!plan.kill;
        break;
      }
    }
    if (o.plan === 'concede') g.stats.concedes++;
    events.push({ type: 'oppThink', plan: o.plan });
  }

  /** 自分か部長を、dt 秒ぶん動かす。床では、床を掘りきるまで止まる。 */
  function move(g, m, dt, pushing, vmax, drain, recover, who, events) {
    const t = g.tuning;
    if (m.stun > 0) {
      m.stun = Math.max(0, m.stun - dt);
      m.v = 0;
      m.stamina = Math.min(m.max, m.stamina + recover * dt);
      return;
    }
    if (pushing) {
      m.v = Math.min(vmax, m.v + t.accel * dt);
      const weight = m.x < SURFACE || m.floorHp > 0 ? t.surfaceDrain : 1; // 床を掘るのもお辞儀のうち
      m.stamina -= drain * (weight + t.strain * m.hold) * dt;
      m.hold += dt;
    } else {
      m.v = Math.max(0, m.v - t.decel * dt);
      if (m.v === 0) {
        m.hold = 0; // 止まったら、腰の負担はリセット
        m.stamina = Math.min(m.max, m.stamina + recover * dt);
      }
    }
    const speed = m.v * speedFactor(m.x, t);
    let nx = Math.min(GOAL, m.x + speed * dt);
    if (m.floorHp > 0 && nx >= SURFACE) {
      nx = SURFACE;
      if (pushing) {
        m.floorHp = Math.max(0, m.floorHp - dt / t.floorTime);
        if (m.floorHp === 0) events.push({ type: 'floorBreak', who });
      } else {
        m.v = 0;
      }
    }
    m.x = nx;
  }

  /**
   * 部長の動き。自分のほうが低くないと気が済まないが、腰には限界がある。
   * あなたが止まるのを待ってから、下げ返すか諦めるかを決める。
   * @returns {boolean} 部長が押しているか
   */
  function stepOpp(g, dt, playerStill, events) {
    const o = g.opp;
    const p = g.player;
    const t = g.tuning;
    const oppLower = o.x - p.x > t.tolerance;
    let pushing = false;
    o.busy = false;

    if (o.stun > 0) {
      o.mode = 'wait';
      o.plan = null;
    } else if (o.mode === 'push') {
      if (o.x >= o.target || o.x >= GOAL) {
        o.mode = 'wait';
        o.plan = null;
        o.face = chooseFace(g);
        events.push({ type: 'oppDone', big: o.big });
      } else if (dangerAhead(g, o.x)) {
        o.busy = true; // 気づいたので、通りすぎるまで待つ
      } else {
        pushing = true;
      }
    } else if (oppLower) {
      o.plan = null; // 自分のほうが低いので、待つだけ
    } else if (!playerStill) {
      // あなたがまだ動いているので、どこまで下げるか見てから決める
      if (o.plan !== null && g.player.x - o.x > t.tolerance) o.plan = null;
    } else {
      if (o.plan === null) {
        o.face = chooseFace(g);
        decide(g, events);
      }
      if (o.plan === 'answer') {
        o.react -= dt;
        if (o.react <= 0) {
          o.mode = 'push';
          g.stats.answers++;
          if (o.big) g.stats.bigAnswers++;
          events.push({ type: 'oppAnswer', big: o.big, kill: o.kill });
          pushing = !dangerAhead(g, o.x);
          o.busy = !pushing;
        }
      }
    }
    move(g, o, dt, pushing, t.oppV, t.oppDrain, t.oppRecover, 'opp', events);
    return pushing;
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
          if (who === 'opp') {
            g.opp.mode = 'wait';
            g.opp.plan = null;
          }
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

  /**
   * 間をすすめ、満ちたら名刺交換にする。
   * だれかが押しているあいだは止まる（0 にはもどらない）。どちらが低いかが入れかわったときだけ 0 にもどる。
   * そのため、ちょこちょこ押して間をのばすことはできない。
   */
  function stepMa(g, dt, still, events) {
    const t = g.tuning;
    const diff = g.player.x - g.opp.x;
    const lower = diff > t.tolerance ? 'player' : diff < -t.tolerance ? 'opp' : 'even';
    if (lower !== g.maLower) {
      g.maLower = lower;
      g.ma = 0;
      g.maLimit = lower === 'opp' ? rand(g, t.oppPatience) : t.maPlayer;
      g.reached = false;
    }
    if (!still) return;
    if (g.ma === 0) events.push({ type: 'maStart', lower, limit: lower === 'opp' ? null : g.maLimit });
    g.ma += dt;
    g.stats.maxMa = Math.max(g.stats.maxMa, g.ma);
    if (g.maLower === 'opp' && !g.reached && g.ma >= g.maLimit - t.reachLead) {
      g.reached = true;
      events.push({ type: 'oppReach' });
    }
    if (g.ma >= g.maLimit) {
      g.exchangeX = Math.max(g.player.x, g.opp.x);
      finish(g, g.maLower === 'player' ? 'win' : g.maLower === 'opp' ? 'rude' : 'draw', events);
    }
  }

  function stepOnce(g, dt, holding, events) {
    const p = g.player;
    const t = g.tuning;
    g.time += dt;

    move(g, p, dt, holding, t.playerVmax, t.drain, t.recover, 'player', events);
    const playerStill = !holding && p.v === 0 && p.stun === 0;
    const oppPushing = stepOpp(g, dt, playerStill, events);
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
      const by = p.x >= g.opp.x ? 'player' : 'opp';
      // 新しい地層に一番乗りすると、腰が少し回復する（深く潜るほど得をする）
      const m = g[by];
      const bonus = Math.min(t.layerBonus, m.max - m.stamina);
      m.stamina += bonus;
      events.push({ type: 'layer', index: layer, by, bonus });
    }

    // どちらが低いか
    const diff = p.x - g.opp.x;
    if (diff < -t.tolerance) {
      if (g.playerLower) events.push({ type: 'overtaken' });
      g.playerLower = false;
    } else if (diff > t.tolerance) {
      g.lowerTime += dt;
      if (!g.playerLower) events.push({ type: 'overtake' });
      g.playerLower = true;
    }

    // 勝ち負け（地球の中心・腰）
    if (p.x >= GOAL) {
      g.exchangeX = GOAL;
      return finish(g, 'center', events);
    }
    if (g.opp.x >= GOAL) return finish(g, 'beaten', events);
    if (p.stamina <= 0) {
      p.stamina = 0;
      return finish(g, 'back', events);
    }
    if (g.opp.stamina <= 0) {
      g.opp.stamina = 0;
      return finish(g, 'oppBack', events);
    }

    // 間
    const oppStill = !oppPushing && !g.opp.busy && g.opp.v === 0 && g.opp.stun === 0;
    stepMa(g, dt, playerStill && oppStill, events);
  }

  /**
   * ゲームを dt 秒すすめる。
   * @param {object} g createGame の戻り値
   * @param {number} dt 秒
   * @param {boolean} holding 「さげる」を押しているか
   * @returns {Array<object>} このあいだに起きたできごと
   *   - { type: 'overtake' }：自分のほうが低くなった
   *   - { type: 'overtaken' }：部長のほうが低くなった
   *   - { type: 'oppThink', plan }：部長が下げ返すか（'answer'）諦めるか（'concede'）を決めた（画面には出さない）
   *   - { type: 'oppAnswer', big, kill }：部長が下げ返しはじめた（big は大きく突き放すつもりか、kill はトドメのつもりか）
   *   - { type: 'oppDone', big }：部長が下げ返しおわった
   *   - { type: 'maStart', lower, limit }：間ができた（lower は低いほう。limit は交換までの秒数。部長が低いときは null）
   *   - { type: 'oppReach' }：部長が名刺を差し出しかけた（もうすぐ交換）
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
    RANKS,
    DEFAULT_RANK,
    rankById,
    depthAt,
    xAtDepth,
    layerIndexAt,
    stageIndexAt,
    formatDepth,
    rankFor,
    speedFactor,
    travelTime,
    reachIn,
    costToReach,
    makeRng,
    createGame,
    step,
    surrender,
  };
});
