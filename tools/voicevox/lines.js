/**
 * 各ゲームの読み上げるせりふを、ソースコードから集める。
 *
 * - 対象は games.js の sources に書いたファイルの文字列リテラル（'…' "…" `…`）
 * - ひらがな・カタカナを含み、漢字と HTML を含まないものを「せりふ」とみなす
 *   （子ども向けのせりふはすべてひらがな・カタカナで書いているため。漢字を含む大人向けの文は読み上げない）
 * - テンプレート文字列の ${…} は、games.js の placeholders で値の候補を決めて、すべての組み合わせに展開する。
 *   候補が決まっていない ${…} を含むテンプレート文字列は対象外にする
 *
 * 読み上げのキーは speakable()（分かち書きのスペースを取り除いた文）で、voice.js と同じ規則にしている。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

/** voice.js と同じ規則：分かち書きのスペースを取り除く。 */
function speakable(text) {
  return text.replace(/[ 　]+/g, '');
}

const KANA = /[ぁ-んァ-ヶー]/;
const KANJI = /[一-龯々]/;

function isLine(text) {
  return KANA.test(text) && !KANJI.test(text) && !/[<>]/.test(text);
}

/** コメントを取り除く（文字列の中の // は残す）。 */
function stripComments(src) {
  let out = '';
  let i = 0;
  let quote = null;
  while (i < src.length) {
    const c = src[i];
    if (quote) {
      out += c;
      if (c === '\\') { out += src[i + 1] || ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

/** テンプレート文字列を、placeholders の候補ですべての組み合わせに展開する。 */
function expandTemplate(body, placeholders) {
  const parts = body.split(/\$\{([^}]*)\}/);
  let results = [''];
  for (let k = 0; k < parts.length; k++) {
    if (k % 2 === 0) {
      results = results.map((r) => r + parts[k]);
      continue;
    }
    const expr = parts[k].trim();
    const rule = placeholders.find((p) => p.match.test(expr));
    if (!rule) return [];
    const next = [];
    for (const r of results) for (const v of rule.values) next.push(r + v);
    results = next;
  }
  return results;
}

/** ゲームのせりふを集める。戻り値は speakable() したせりふの配列（重複なし・並べ替え済み）。 */
function collectLines(game) {
  const dir = path.join(ROOT, game.dir);
  const placeholders = game.placeholders ? game.placeholders() : [];
  const found = new Set();
  for (const file of game.sources) {
    const src = stripComments(fs.readFileSync(path.join(dir, file), 'utf8'));
    const re = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
    let m;
    while ((m = re.exec(src))) {
      const texts = m[3] !== undefined ? expandTemplate(m[3], placeholders) : [m[1] !== undefined ? m[1] : m[2]];
      for (const t of texts) if (isLine(t)) found.add(speakable(t));
    }
  }
  return [...found].sort();
}

module.exports = { collectLines, speakable, ROOT };
