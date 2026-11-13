# CLAUDE.md

## プロジェクト構成

このリポジトリでは、ブラウザで遊べるゲームを増やしていく。ゲームはひとつずつフォルダに分ける。

- 新しいゲームを作ったら、必ずルートの `README.md` の「ゲーム一覧」と「フォルダ構成」に追加し、このセクションにも構成を書き足すこと
- ルートの `index.html`（GitHub Pages のトップページ）にも、新しいゲームへのリンクを追加すること
- 各ゲームのフォルダには、遊び方・機能・テストの実行方法を書いた `README.md` を置くこと

- `reversi/`：ブラウザで遊べるリバーシ（ビルド不要の HTML / CSS / JavaScript）
  - `index.html` を直接ブラウザで開いて動作させる（`file://` でも動くよう、ES Modules は使わず通常の `<script>` で読み込む）
  - ルールは `js/engine.js`、CPU は `js/ai.js`。どちらもブラウザと Node.js の両方から読み込める形式にしている
  - オプションの「爆裂」ルール（設定 `blast`）：打てるマスは通常どおり（はさめるマスだけ）→ はさんだ石を裏返す → 打ったマスのまわり8マスの石をすべて裏返す（はさんだばかりの隣の石も元に戻る）。もとは別のゲーム `bakuretsu-reversi/` だったが、ユーザーの希望でリバーシのオプションにまとめた
  - オプションの「爆裂連鎖」（設定 `followUp`。爆裂ありのときだけ有効）：爆風で裏返った石が新しい色で相手の石をはさめば裏返す（`getFollowUp`）。1 回だけで、それ以上は続けない（何回も続けると中央付近が毎回変わってしまうため、ユーザーの希望で 1 回にした）。判定はすべて爆風直後の盤面で行ってからまとめて裏返す（1 つずつ裏返すと順番で結果が変わる）
  - ルールは `E.makeRules(blast, followUp)` で作り、`applyMove(b, pos, player, rules)` と `chooseMove(..., { rules })` に渡す。`applyMove` は `{ flips, blast, followUp }`（打てなければ `null`）を返し、`undoMove` に渡して取り消す。`rules` を省略すると通常のリバーシ
  - 画面では「はさむ →（爆裂ありなら）爆発 →（爆裂連鎖ありなら）爆裂連鎖」の段階に分けて見せる。爆裂連鎖のときに文字（トースト）は出さない（見づらくなるため。ユーザーの希望）。アニメーション中は次の手を受け付けない
  - 設定の保存先は `reversi.settings.v2`
  - テスト：`node --test reversi/tests/reversi.test.js reversi/tests/blast.test.js`
- 絵の生成：ユーザー単位の Claude Code スキル `imagegen`（`~/.claude/skills/imagegen/`。Modal の GPU で Stable Diffusion XL を動かす）を使う。このリポジトリには入れていない
  - 使い方と進め方（試作を見せてユーザーに選んでもらってから組み込む）はスキルの `SKILL.md` に従う
  - 切り抜く前の絵は `.imagegen-raw/` に残る（`.gitignore` 済み）

- どのゲームにも `js/fullscreen.js` を入れている：タッチ端末を横向きにして画面をタッチすると全画面、縦向きに戻すと解除（全画面はタッチの中でしか始められない）。新しいゲームにも入れること。iPhone の Safari は非対応なので、ホーム画面に追加したとき用の `apple-mobile-web-app-capable` を `index.html` に書く
