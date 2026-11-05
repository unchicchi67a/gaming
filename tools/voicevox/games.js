/**
 * VOICEVOX で声をつくるゲームの一覧と、声の設定。
 *
 * 声はすべて「VOICEVOX:冥鳴ひまり」（ノーマル）。
 * speaker は VOICEVOX Engine のスタイル ID（GET /speakers で確認できる）。
 */
'use strict';

const path = require('path');

const HIMARI = {
  name: '冥鳴ひまり',
  credit: 'VOICEVOX:冥鳴ひまり',
  speaker: 14,
  // 小さい子が聞き取りやすいよう少しゆっくり、抑揚を少し大きめにする
  speedScale: 0.92,
  pitchScale: 0,
  intonationScale: 1.15,
  volumeScale: 1.0,
  prePhonemeLength: 0.1,
  postPhonemeLength: 0.15,
};

const GAMES = {
  'three-little-pigs': {
    dir: 'three-little-pigs',
    global: 'PigsVoiceLines',
    sources: ['js/main.js'],
    voice: HIMARI,
  },
  omiseyasan: {
    dir: 'omiseyasan',
    global: 'ShopVoiceLines',
    sources: ['js/main.js'],
    voice: HIMARI,
    placeholders() {
      const Items = require(path.join(__dirname, '..', '..', 'omiseyasan', 'js', 'items.js'));
      const items = Items.SHOPS.flatMap((s) => s.items.map((i) => i.name));
      const shops = Items.SHOPS.map((s) => s.name);
      return [
        { match: /^itemName\(/, values: items },
        { match: /^shop\.name$/, values: shops },
        { match: /^name$/, values: items },
      ];
    },
  },
};

module.exports = GAMES;
