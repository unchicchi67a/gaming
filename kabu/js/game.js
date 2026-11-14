/**
 * おおきなかぶ とばし のゲームロジック（描画なし）。
 *
 * 昔話「おおきなかぶ」のように、おじいさん → おばあさん → まご → いぬ → ねこ → ねずみ の順に
 * 仲間を呼んでかぶを引っぱり、ぬけたかぶを届け先まで飛ばす。
 *
 * ルール：
 * - おじいさんは 1 人だけ。ほかの種類は、ボタンを押しているあいだ集まってくる（押すほど増える）。
 *   人間は 1 人ずつ、動物は押しているほど速く（何倍かのペースで）増える
 * - 1 人（1 匹）ごとに強さの段階（TIERS）がある。見た目で順番はわかるが、何倍かは見せない。
 *   どの段階が来るかはランダム
 * - 力 ＝ 種類ごとの強さの合計を、すべての種類でかけ算したもの
 * - 種類ごとに「うんとこしょ」で引っぱる。ねずみが来るまでは根っこが切れず、かぶはぬけない。
 *   そのかわり、かぶの動き方（hint）で「あとどれくらい力が要るか」がわかる（ステージが進むほどあいまい）
 * - ねずみで引っぱると根っこが切れて、かぶが飛ぶ。飛ぶ距離 ＝ FLY_UNIT × (力 / かぶの重さ − 1)。
 *   力が重さ以下なら、ぬけない
 * - 届け先との誤差が、届け先までの距離の tol（割合）以内ならクリア
 *
 * ブラウザ（window.KabuGame）と Node.js（require）の両方から読み込める。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.KabuGame = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 強さの段階（弱い順）。値は「ふつう」を 1 としたときの力。 */
  const TIERS = [0.25, 0.55, 1, 1.7, 3];
  /** 段階ごとの出やすさ（ばらつきが小さいとき / 大きいとき）。ステージの spread で混ぜる。 */
  const TIER_WEIGHTS_NARROW = [0.08, 0.22, 0.4, 0.22, 0.08];
  const TIER_WEIGHTS_WIDE = [0.2, 0.2, 0.2, 0.2, 0.2];

  /**
   * 呼ぶ順番。
   * - human：押しているあいだ every 秒ごとに 1 人ずつ来る（最初の 1 人は押した瞬間）
   * - animal：押しているあいだ、数（+1）が毎秒 e^rate 倍のペースで増える
   * - max：それ以上は来ない
   */
  const SPECIES = [
    { id: 'grandpa', name: 'おじいさん', kind: 'fixed', max: 1, tierNames: ['ガリガリ', 'ほそめ', 'ふつう', 'がっしり', 'ムキムキ'] },
    { id: 'grandma', name: 'おばあさん', kind: 'human', every: 0.45, max: 10, tierNames: ['ガリガリ', 'ほそめ', 'ふつう', 'がっしり', 'ムキムキ'] },
    { id: 'child', name: 'まご', kind: 'human', every: 0.45, max: 10, tierNames: ['ひょろひょろ', 'ほそめ', 'ふつう', 'わんぱく', 'ムキムキ'] },
    { id: 'dog', name: 'いぬ', kind: 'animal', rate: 1.1, max: 2000, tierNames: ['子いぬ', '小型犬', 'ふつう', '大型犬', 'ムキムキ犬'] },
    { id: 'cat', name: 'ねこ', kind: 'animal', rate: 1.2, max: 5000, tierNames: ['子ねこ', 'ほそねこ', 'ふつう', 'でかねこ', 'ムキムキねこ'] },
    { id: 'mouse', name: 'ねずみ', kind: 'animal', rate: 1.0, max: 5000, tierNames: ['赤ちゃん', 'ちびねずみ', 'ふつう', 'まるまる', 'ムキムキねずみ'] },
  ];

  /** 力が重さの 2 倍のとき、かぶが飛ぶ距離（メートル）。 */
  const FLY_UNIT = 1;

  /**
   * ステージ。places からひとつがランダムに届け先になる（dist はメートル）。
   * - tol：クリアになる誤差（届け先までの距離に対する割合）
   * - noise：かぶの動き方（ヒント）のぶれ（10 の何乗か、の標準偏差）
   * - spread：強さの段階のばらつき（0 = ふつうが多い、1 = どの段階も同じくらい）
   * - weight：かぶの重さの範囲（見た目の大きさに出る）
   */
  const STAGES = [
    { places: [{ name: '台所のおなべ', emoji: '🍲', dist: 5 }, { name: '井戸', emoji: '🪣', dist: 7 }, { name: 'にわとり小屋', emoji: '🐔', dist: 9 }], tol: 0.5, noise: 0.05, spread: 0, weight: [12, 18] },
    { places: [{ name: '小川', emoji: '🏞️', dist: 35 }, { name: 'となりの畑', emoji: '🌾', dist: 50 }], tol: 0.45, noise: 0.06, spread: 0.1, weight: [12, 18] },
    { places: [{ name: '村の市場', emoji: '🧺', dist: 300 }, { name: '丘の上のお寺', emoji: '🛕', dist: 450 }], tol: 0.4, noise: 0.07, spread: 0.2, weight: [11, 19] },
    { places: [{ name: '峠の茶屋', emoji: '🍡', dist: 2500 }, { name: 'となり村', emoji: '🏘️', dist: 4000 }], tol: 0.4, noise: 0.08, spread: 0.3, weight: [11, 19] },
    { places: [{ name: '港町', emoji: '⚓', dist: 30000 }, { name: 'お城', emoji: '🏯', dist: 45000 }], tol: 0.35, noise: 0.1, spread: 0.4, weight: [10, 20] },
    { places: [{ name: '雪山のてっぺん', emoji: '🏔️', dist: 300000 }, { name: 'みやこ', emoji: '🏙️', dist: 500000 }], tol: 0.35, noise: 0.12, spread: 0.5, weight: [10, 20] },
    { places: [{ name: '海のむこうの島', emoji: '🏝️', dist: 3000000 }, { name: '砂漠の国', emoji: '🐫', dist: 5000000 }], tol: 0.3, noise: 0.14, spread: 0.6, weight: [10, 22] },
    { places: [{ name: '地球の裏側', emoji: '🌏', dist: 20000000 }, { name: '南極', emoji: '🐧', dist: 15000000 }], tol: 0.3, noise: 0.16, spread: 0.7, weight: [10, 22] },
    { places: [{ name: '月', emoji: '🌕', dist: 384000000 }], tol: 0.25, noise: 0.18, spread: 0.8, weight: [10, 25] },
    { places: [{ name: '火星', emoji: '🔴', dist: 78000000000 }], tol: 0.25, noise: 0.2, spread: 0.9, weight: [10, 25] },
  ];

  /**
   * かぶの動き方（ヒント）。gap は「あと何ケタ（10 の何乗倍）力が要るか」（ぶれ込み）。
   * 上から順に、gap が min 以上なら、その動き方になる。
   */
  const HINTS = [
    { min: 9, id: 'silent', text: 'しーん……' },
    { min: 6, id: 'still', text: 'ぴくりともしない' },
    { min: 4.5, id: 'twitch', text: 'ピクッ……' },
    { min: 3.3, id: 'budge', text: 'ぐらっ' },
    { min: 2.5, id: 'wobble', text: 'ぐらぐら' },
    { min: 1.8, id: 'wobble2', text: 'ぐらぐらぐら！' },
    { min: 1.2, id: 'creak', text: 'メリッ' },
    { min: 0.7, id: 'creak2', text: 'メリメリ……！' },
    { min: 0.3, id: 'creak3', text: 'メリメリメリッ！！' },
    { min: -0.15, id: 'near', text: 'ミシミシッ！ 根っこが切れそう' },
    { min: -Infinity, id: 'over', text: 'ブチブチッ！？ 根っこが悲鳴をあげている' },
  ];

  /** 決まった種から乱数を作る（テスト用）。 */
  function makeRng(seed) {
    let s = seed >>> 0 || 1;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(rng) {
    const u = Math.max(rng(), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }

  function tierWeights(spread) {
    return TIER_WEIGHTS_NARROW.map((w, i) => w + (TIER_WEIGHTS_WIDE[i] - w) * spread);
  }

  function rollTier(g) {
    let r = g.rng();
    for (let i = 0; i < g.weights.length; i++) {
      r -= g.weights[i];
      if (r < 0) return i;
    }
    return g.weights.length - 1;
  }

  /** 画面に 1 人ずつ描く人数（それより多い分は、数だけ数える）。 */
  const SHOW_MAX = 80;

  /**
   * ゲームを作る。
   * - stage：ステージ番号（0 から）
   * - place：届け先の番号（省略するとランダム）
   * - rng：乱数（省略すると Math.random）
   */
  function createGame(opts = {}) {
    const rng = opts.rng || Math.random;
    const stageIndex = Math.max(0, Math.min(STAGES.length - 1, opts.stage | 0));
    const stage = STAGES[stageIndex];
    const placeIndex = opts.place != null ? opts.place : Math.floor(rng() * stage.places.length);
    const place = stage.places[placeIndex];
    const weight = stage.weight[0] + (stage.weight[1] - stage.weight[0]) * rng();
    const g = {
      rng,
      stageIndex,
      stage,
      placeIndex,
      place,
      target: place.dist,
      tol: stage.tol,
      weight,
      weights: tierWeights(stage.spread),
      phase: 0, // いま呼んでいる種類（SPECIES の番号）
      state: 'calling', // 'calling' | 'done'
      groups: SPECIES.map((sp) => ({
        id: sp.id,
        count: 0,
        grow: 0, // 押した長さから決まる「来るはずの数」（count はこれを切り上げた数まで増える）
        sum: 0, // 強さの合計
        tierCounts: [0, 0, 0, 0, 0],
        shown: [], // 画面に描く人（来た順の段階）
      })),
      hints: [], // 種類ごとのヒント
      arrivals: [], // 直前の hold で来た人（画面の演出用。読んだら空にしてよい）
      result: null,
    };
    // おじいさんは最初からいる
    addMember(g, 0);
    return g;
  }

  function addMember(g, phase) {
    const grp = g.groups[phase];
    const tier = rollTier(g);
    grp.count++;
    grp.sum += TIERS[tier];
    grp.tierCounts[tier]++;
    if (grp.shown.length < SHOW_MAX) grp.shown.push(tier);
    if (g.arrivals.length < 200) g.arrivals.push({ phase, tier });
    return tier;
  }

  /** 今の種類が、これ以上来られるか。 */
  function canCall(g) {
    if (g.state !== 'calling') return false;
    const sp = SPECIES[g.phase];
    return sp.kind !== 'fixed' && g.groups[g.phase].count < sp.max;
  }

  /** 呼ぶボタンを押しているあいだ、毎フレーム呼ぶ。来た人数を返す。 */
  function hold(g, dt) {
    if (!canCall(g)) return 0;
    const sp = SPECIES[g.phase];
    const grp = g.groups[g.phase];
    if (sp.kind === 'human') grp.grow += dt / sp.every;
    else grp.grow = (grp.grow + 1) * Math.exp(sp.rate * dt) - 1;
    grp.grow = Math.min(grp.grow, sp.max);
    const want = Math.min(sp.max, Math.floor(grp.grow) + 1);
    let n = 0;
    while (grp.count < want) {
      addMember(g, g.phase);
      n++;
    }
    return n;
  }

  /** いまの力（まだ来ていない種類は数えない）。 */
  function power(g) {
    let p = 1;
    for (const grp of g.groups) if (grp.count > 0) p *= grp.sum;
    return p;
  }

  /** 届け先までちょうど飛ぶのに要る力。 */
  function neededPower(g) {
    return g.weight * (1 + g.target / FLY_UNIT);
  }

  /** 力 p で飛ぶ距離（ぬけなければ 0）。 */
  function distanceFor(g, p) {
    return p > g.weight ? FLY_UNIT * (p / g.weight - 1) : 0;
  }

  function hintFor(gap) {
    for (const h of HINTS) if (gap >= h.min) return h;
    return HINTS[HINTS.length - 1];
  }

  /** 「うんとこしょ」を押せるか（その種類が 1 人以上いること）。 */
  function canPull(g) {
    return g.state === 'calling' && g.groups[g.phase].count > 0;
  }

  /**
   * うんとこしょ。
   * - ねずみより前：{ type: 'hint', gap, hint, lift }（根っこが切れないので、ぬけない）。次の種類へ進む
   * - ねずみ：{ type: 'final', ... }。g.result にも入れる
   */
  function pull(g) {
    if (!canPull(g)) return null;
    const p = power(g);
    if (g.phase < SPECIES.length - 1) {
      const gap = Math.log10(neededPower(g) / p) + gaussian(g.rng) * g.stage.noise;
      const hint = hintFor(gap);
      const res = { type: 'hint', phase: g.phase, gap, hint, lift: liftFor(gap) };
      g.hints.push(res);
      g.phase++;
      return res;
    }
    const distance = distanceFor(g, p);
    const error = distance - g.target;
    const pulled = distance > 0;
    const clear = pulled && Math.abs(error) <= g.target * g.tol;
    g.state = 'done';
    g.result = { type: 'final', power: p, distance, error, ratio: error / g.target, pulled, clear };
    return g.result;
  }

  /** ヒントのとき、かぶが土から出てくる割合（0〜1。あと少しほど大きい）。 */
  function liftFor(gap) {
    if (gap <= 0) return 1;
    return 1 - gap / (gap + 1.5);
  }

  return {
    TIERS,
    SPECIES,
    STAGES,
    HINTS,
    FLY_UNIT,
    SHOW_MAX,
    makeRng,
    tierWeights,
    createGame,
    canCall,
    hold,
    power,
    neededPower,
    distanceFor,
    hintFor,
    liftFor,
    canPull,
    pull,
  };
});
