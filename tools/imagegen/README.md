# tools/imagegen

[Modal](https://modal.com/) の GPU で Stable Diffusion XL を動かし、ゲームで使う絵を作るスクリプトです。「3びきのこぶた」の絵（`three-little-pigs/img/`）はこれで作りました。

- モデル：`stabilityai/stable-diffusion-xl-base-1.0`（ライセンスは CreativeML Open RAIL++-M。商用利用可）
- 背景の切り抜き：rembg（`birefnet-general`）
- GPU は L4 → A10G → T4 の順に、空いているものを使います

## 準備

```sh
pip install modal
modal setup        # ブラウザで Modal にログインする
```

はじめて動かすときは、モデル（約 7GB）を Modal の Volume（`imagegen-hf-cache`）にダウンロードするので時間がかかります。2 回目からはキャッシュを使います。

## 使い方

リポジトリのルートで実行します。

### 1 枚ずつ

```sh
modal run tools/imagegen/app.py --prompt "a cute pig, picture book style" --out path/to/pig.png
```

| オプション | 内容 |
| --- | --- |
| `--n` | 生成する枚数（1〜8）。2 枚以上なら `pig-1.png`, `pig-2.png` … のように連番で保存する |
| `--width` / `--height` | 大きさ（16 の倍数、256〜1440。既定 1024） |
| `--seed` | 乱数の種。同じプロンプトと種なら同じ絵になる（既定はランダム） |
| `--cutout` | 背景を取り除いて透過にし、絵のある範囲だけに切り詰める |

### まとめて（バッチ）

```sh
modal run tools/imagegen/app.py --batch path/to/jobs.json
```

JSON に書いた全部の画像を、1 回の起動で順に作ります。書き方は `app.py` の先頭の説明を見てください。主な項目：

- `init` と `strength`：元の絵をもとに描き直す（img2img）
- `init` と `mask_box`：元の絵の一部（顔のまわりなど）だけを描き直す（インペイント）。表情ちがいの絵を作るときに使う
- `cutout`：背景を取り除いて透過にする。`keep_frame` を付けると切り詰めず、元の絵と同じ位置のまま保存する（表情ちがいの絵を重ねるため）
- `copy`：描き直さずに `init` をそのまま使う（切り抜きだけしたいとき）

切り抜く前の絵は `.imagegen-raw/` に残ります（インペイントの元に使うため）。このフォルダは `.gitignore` でリポジトリから外しています。

## 注意

- 生成した絵は、バッチがすべて終わってからまとめて保存されます
- 背景の切り抜きは CPU で動くので、1 枚あたり 1〜2 分かかることがあります
- Modal の利用料（GPU の時間）がかかります。使い終わると 60 秒で GPU を止めます
