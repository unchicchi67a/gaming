# gaming

ブラウザで遊べるゲームを集めたリポジトリです。ゲームはひとつずつフォルダに分かれていて、どれもビルドや外部ライブラリなしで動きます。

## ゲーム一覧

| ゲーム | フォルダ | 内容 |
| --- | --- | --- |
| リバーシ | [`reversi/`](reversi/) | 石をはさんで裏返すボードゲーム。CPU対戦（レベル1〜10）と2人対戦に対応 |
| 3びきのこぶた | [`three-little-pigs/`](three-little-pigs/) | 3歳くらいの子ども向けの絵本ゲーム。タッチや息の「ふーっ」で昔話を進める |
| おみせやさんごっこ | [`omiseyasan/`](omiseyasan/) | 3歳くらいの子ども向けのお店屋さんごっこ。お客さんが言った品物を棚からタッチしてわたす（やおやさん・くだものやさん・パンやさん） |

各ゲームの遊び方や機能は、それぞれのフォルダの README を見てください。

## 遊び方

GitHub Pages で公開しています。ブラウザで https://unchicchi67a.github.io/gaming/ を開くと、遊ぶゲームを選べます。

手元で遊ぶ場合は、各ゲームの `index.html` をブラウザで開くと遊べます。

ローカルサーバーで動かす場合は、リポジトリのルートで次のコマンドを実行し、ブラウザで `http://localhost:8000/<フォルダ名>/` を開きます。

```sh
python3 -m http.server 8000
```

GitHub Codespaces で動かしている場合は、「ポート」タブから 8000 番を開いてください。

## フォルダ構成

```
gaming/
├── README.md        このファイル（ゲーム一覧）
├── CLAUDE.md        Claude Code 向けの作業ルール
├── index.html       ゲームを選ぶトップページ（GitHub Pages の入口）
├── reversi/         リバーシ
├── three-little-pigs/ 3びきのこぶた
├── omiseyasan/      おみせやさんごっこ
└── tools/voicevox/  VOICEVOX でせりふの音声ファイルをつくるスクリプト
```

## 音声

「3びきのこぶた」と「おみせやさんごっこ」の読み上げの声は、VOICEVOX:冥鳴ひまり です。音声ファイルのつくり方は [`tools/voicevox/README.md`](tools/voicevox/README.md) を見てください。

## ゲームを追加するとき

1. ゲームごとに新しいフォルダを作り、`index.html` をそのフォルダに置く
2. フォルダの中に、遊び方・機能・テストの実行方法を書いた `README.md` を置く
3. この README の「ゲーム一覧」と「フォルダ構成」に追加する
4. ルートの `index.html` にゲームへのリンクを追加する
5. 読み上げを VOICEVOX の音声にする場合は、`tools/voicevox/games.js` にゲームを追加して音声ファイルをつくる
