/**
 * お店と品物、お客さんのデータ。
 *
 * - name は画面に出す名前、読み上げにもそのまま使う
 * - 絵は art.js の Art.item(id) / Art.customer(id) で描く（ここでは id だけを持つ）
 *
 * ブラウザでは window.ShopItems、Node.js では require で読み込める。
 */
(function (root) {
  'use strict';

  const SHOPS = [
    {
      id: 'yaoya',
      name: 'やおやさん',
      items: [
        { id: 'carrot', name: 'にんじん' },
        { id: 'daikon', name: 'だいこん' },
        { id: 'tomato', name: 'トマト' },
        { id: 'cabbage', name: 'キャベツ' },
        { id: 'eggplant', name: 'なす' },
        { id: 'corn', name: 'とうもろこし' },
      ],
    },
    {
      id: 'kudamono',
      name: 'くだものやさん',
      items: [
        { id: 'apple', name: 'りんご' },
        { id: 'banana', name: 'バナナ' },
        { id: 'mikan', name: 'みかん' },
        { id: 'grapes', name: 'ぶどう' },
        { id: 'strawberry', name: 'いちご' },
        { id: 'watermelon', name: 'すいか' },
      ],
    },
    {
      id: 'panya',
      name: 'パンやさん',
      items: [
        { id: 'shokupan', name: 'しょくぱん' },
        { id: 'melonpan', name: 'メロンパン' },
        { id: 'croissant', name: 'クロワッサン' },
        { id: 'donut', name: 'ドーナツ' },
        { id: 'baguette', name: 'フランスパン' },
        { id: 'hotdog', name: 'ホットドッグ' },
      ],
    },
  ];

  /** お客さん。pitch は読み上げの声の高さ（1 が標準）。 */
  const CUSTOMERS = [
    { id: 'rabbit', name: 'うさぎさん', pitch: 1.2 },
    { id: 'bear', name: 'くまさん', pitch: 0.9 },
    { id: 'cat', name: 'ねこさん', pitch: 1.15 },
    { id: 'dog', name: 'いぬさん', pitch: 1.05 },
    { id: 'panda', name: 'パンダさん', pitch: 1.0 },
  ];

  function shop(id) {
    return SHOPS.find((s) => s.id === id) || null;
  }

  function item(id) {
    for (const s of SHOPS) {
      const it = s.items.find((i) => i.id === id);
      if (it) return it;
    }
    return null;
  }

  function customer(id) {
    return CUSTOMERS.find((c) => c.id === id) || null;
  }

  const Items = { SHOPS, CUSTOMERS, shop, item, customer };

  if (typeof module === 'object' && module.exports) module.exports = Items;
  root.ShopItems = Items;
})(typeof self !== 'undefined' ? self : this);
