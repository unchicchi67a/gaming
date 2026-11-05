#!/usr/bin/env node
/**
 * VOICEVOX Engine でせりふの音声ファイル（MP3）をつくる。
 *
 * 使い方（README.md も参照）:
 *   docker run --rm -d -p 50021:50021 voicevox/voicevox_engine:cpu-latest
 *   node tools/voicevox/generate.js            # すべてのゲーム
 *   node tools/voicevox/generate.js omiseyasan # ゲームを指定
 *   node tools/voicevox/generate.js --kana     # 音声はつくらず、読み（カナ）だけ表示する
 *
 * - 出力：<ゲーム>/voice/<ハッシュ>.mp3 と、対応表 <ゲーム>/js/voice-lines.js
 * - ファイル名は「せりふ＋声の設定」のハッシュなので、変わっていないせりふはつくり直さない
 * - 使われなくなった音声ファイルは消す
 * - MP3 への変換に ffmpeg を使う
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { collectLines, ROOT } = require('./lines');
const GAMES = require('./games');

const ENGINE = process.env.VOICEVOX_URL || 'http://127.0.0.1:50021';
const args = process.argv.slice(2);
const kanaOnly = args.includes('--kana');
const names = args.filter((a) => !a.startsWith('--'));

/**
 * 読みの直し（その 1）：読ませる文の一部を差しかえる。画面の文字はそのまま。
 * 「こぶた」をひらがなのままにすると「こぶ たが」のように区切られるため、カタカナで読ませる。
 */
const READING = {
  'こぶた': 'コブタ',
};

/**
 * 読みの直し（その 2）：差しかえでは直らないせりふは、読みとアクセントを AquesTalk 風の記法で直接わたす。
 * キーは speakable() したせりふ。記法は「'」がアクセントの位置、「/」がアクセント句の区切り、
 * 「、」が息つぎ、「_」が無声化。--kana で表示される読みを手本に書く。
 */
const KANA = {
  // 「おうちを」が「おおちを」と読まれるため
  '1ぴきめのこぶたは、わらでおうちをつくります。': "イッ_ピキメノ'/コ'ブタワ、ワ'ラデ/オ'ウチオ/_ツクリマ'_ス",
  '2ひきめのこぶたは、きでおうちをつくります。': "ニ_ヒキメノ'/コ'ブタワ、キ'デ/オ'ウチオ/_ツクリマ'_ス",
  '3びきめのこぶたは、レンガでおうちをつくります。じかんはかかるけど、とってもじょうぶ！':
    "サンビキメノ'/コ'ブタワ、レ'ンガデ/オ'ウチオ/_ツクリマ'_ス、ジカンワ'/カカ'ルケド、トッテモ'/ジョオブ'",
  'おおきくなったこぶたたちは、じぶんのおうちをつくることにしました。':
    "オオキ'クナッタ/コブタ'タチワ、ジブンノ'/オ'ウチオ/_ツク'ル/コト'ニ/シマ'_シタ",
  'それなら、こんなおうちふきとばしてやる！': "ソレナ'ラ、コンナ'/オ'ウチ/フ_キトバ'_シテ/ヤル'",
  // 「ア/チチチ/チチイ」と区切られるため
  'あちちちちちー！！': "ア'チチチ、ア'チチイ",
  'にげろー！': "ニゲロ'オ",
};

function readingOf(text) {
  let t = text;
  for (const [from, to] of Object.entries(READING)) t = t.split(from).join(to);
  return t;
}

async function post(url, body) {
  const res = await fetch(url, body === undefined ? { method: 'POST' } : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} に失敗しました（${res.status}）: ${await res.text()}`);
  return res;
}

async function query(text, voice) {
  const sp = `speaker=${voice.speaker}`;
  const q = await (await post(`${ENGINE}/audio_query?${sp}&text=${encodeURIComponent(readingOf(text))}`)).json();
  if (KANA[text]) {
    q.accent_phrases = await (await post(`${ENGINE}/accent_phrases?${sp}&is_kana=true&text=${encodeURIComponent(KANA[text])}`)).json();
    q.kana = KANA[text];
  }
  for (const k of ['speedScale', 'pitchScale', 'intonationScale', 'volumeScale', 'prePhonemeLength', 'postPhonemeLength']) {
    q[k] = voice[k];
  }
  return q;
}

async function synthesize(q, voice) {
  const res = await post(`${ENGINE}/synthesis?speaker=${voice.speaker}`, q);
  return Buffer.from(await res.arrayBuffer());
}

function fileNameOf(text, voice) {
  const h = crypto.createHash('sha1').update(JSON.stringify([readingOf(text), KANA[text] || null, voice])).digest('hex');
  return h.slice(0, 12) + '.mp3';
}

function toMp3(wav, out) {
  const tmp = out + '.wav';
  fs.writeFileSync(tmp, wav);
  try {
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ac', '1', '-ar', '24000',
      '-codec:a', 'libmp3lame', '-b:a', '64k', out]);
  } finally {
    fs.unlinkSync(tmp);
  }
}

function writeManifest(game, files) {
  const sorted = {};
  for (const k of Object.keys(files).sort()) sorted[k] = files[k];
  const body = `/**
 * せりふと音声ファイルの対応表。tools/voicevox/generate.js が自動でつくるので、手で書きかえないこと。
 * 音声：${game.voice.credit}
 */
(function (root) {
  'use strict';
  const LINES = {
    credit: ${JSON.stringify(game.voice.credit)},
    base: 'voice/',
    files: ${JSON.stringify(sorted, null, 2).replace(/\n/g, '\n    ')},
  };
  if (typeof module === 'object' && module.exports) module.exports = LINES;
  root.${game.global} = LINES;
})(typeof self !== 'undefined' ? self : this);
`;
  fs.writeFileSync(path.join(ROOT, game.dir, 'js', 'voice-lines.js'), body);
}

async function run(key) {
  const game = GAMES[key];
  if (!game) throw new Error(`ゲームが見つかりません: ${key}（${Object.keys(GAMES).join(', ')}）`);
  const lines = collectLines(game);
  const dir = path.join(ROOT, game.dir, 'voice');
  console.log(`■ ${key}：せりふ ${lines.length} 個`);

  if (kanaOnly) {
    for (const t of lines) console.log(`  ${t}  →  ${(await query(t, game.voice)).kana}`);
    return;
  }

  fs.mkdirSync(dir, { recursive: true });
  const files = {};
  let made = 0;
  for (const t of lines) {
    const name = fileNameOf(t, game.voice);
    files[t] = name;
    const out = path.join(dir, name);
    if (fs.existsSync(out)) continue;
    toMp3(await synthesize(await query(t, game.voice), game.voice), out);
    made++;
    process.stdout.write(`  つくった: ${t}\n`);
  }
  const used = new Set(Object.values(files));
  let removed = 0;
  for (const f of fs.readdirSync(dir)) {
    if (f.endsWith('.mp3') && !used.has(f)) { fs.unlinkSync(path.join(dir, f)); removed++; }
  }
  writeManifest(game, files);
  console.log(`  新しくつくった ${made} 個 / 消した ${removed} 個`);
}

(async () => {
  try {
    await fetch(`${ENGINE}/version`);
  } catch (e) {
    console.error(`VOICEVOX Engine（${ENGINE}）に接続できません。先に起動してください。`);
    process.exit(1);
  }
  for (const key of names.length ? names : Object.keys(GAMES)) await run(key);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
