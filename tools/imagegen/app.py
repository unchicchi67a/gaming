"""Modal の GPU で Stable Diffusion XL を動かし、画像を生成してローカルに保存する。

使い方（リポジトリのルートで実行）:
  1 枚ずつ:
    modal run tools/imagegen/app.py --prompt "a cute pig, picture book style" --out path/to/pig.png

  まとめて（JSON に書いた全部の画像を、1 回の起動で順に作る）:
    modal run tools/imagegen/app.py --batch path/to/jobs.json

オプション（1 枚ずつのとき）:
  --n       生成する枚数（1〜8）。2 枚以上なら pig-1.png, pig-2.png … のように連番で保存する
  --width   幅（16 の倍数、256〜1440。既定 1024）
  --height  高さ（16 の倍数、256〜1440。既定 1024）
  --seed    乱数の種。同じプロンプトと種なら同じ絵になる（既定はランダム）
  --cutout  背景を取り除いて透過にし、絵のある範囲だけに切り詰める

バッチの JSON は、次の形のオブジェクトの配列:
  {
    "out": "three-little-pigs/img/pig1.webp",   # 必須。.png か .webp
    "prompt": "...",                             # 必須
    "negative": "...",                           # 省略時は NEGATIVE_PROMPT
    "seed": 42, "width": 1024, "height": 1024,
    "init": "path/to/base.png",                  # これを元に描き直す（img2img）
    "strength": 0.6,                             # init をどれだけ描き直すか（0〜1）
    "mask_box": [x, y, w, h],                    # init のこの範囲だけ描き直す（インペイント。init の画素座標）
    "cutout": true,                              # 背景を取り除いて透過にする
    "keep_frame": true,                          # 切り抜いたあと、絵のある範囲に切り詰めない（表情ちがいの絵の位置をそろえるため）
    "copy": true,                                # 描き直さず init をそのまま使う（切り抜きだけしたいとき）
    "flip": true,                                # 左右反転して保存する
    "max_side": 640,                             # 長い辺がこれを超えたら縮小して保存する
    "skip_existing": true                        # out がすでにあれば作らない
  }
  "init" には、同じバッチで先に作った画像の "out" も指定できる（切り抜き前の絵が使われる）。
"""

import io
import json
import pathlib
import random

import modal

# Hugging Face のログインなしで使える（gated でない）モデル。ライセンスは CreativeML OpenRAIL++-M（商用利用可）
MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"
NEGATIVE_PROMPT = "blurry, low quality, deformed, extra limbs, text, watermark, signature"
MAX_IMAGES = 8
# 背景の切り抜きに使うモデル（rembg）。MIT ライセンス
CUTOUT_MODEL = "birefnet-general"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "torch==2.5.1",
        "diffusers==0.32.2",
        "transformers==4.48.1",
        "accelerate==1.3.0",
        "sentencepiece==0.2.0",
        "protobuf==5.29.3",
        "huggingface_hub[hf_transfer]==0.27.1",
        "rembg==2.0.68",
        "onnxruntime==1.22.0",
        "pillow==11.1.0",
    )
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1", "HF_HOME": "/cache", "U2NET_HOME": "/cache/rembg"})
)

# モデル（約 7GB）を毎回ダウンロードしないよう、Modal の Volume にキャッシュする
cache = modal.Volume.from_name("imagegen-hf-cache", create_if_missing=True)

app = modal.App("gaming-imagegen")


@app.cls(
    image=image,
    # L4 が混んでいると割り当てを長く待たされるため、空いている GPU を順に使う
    gpu=["L4", "A10G", "T4"],
    volumes={"/cache": cache},
    timeout=3600,
    scaledown_window=60,  # 使い終わったら早めに GPU を止めてクレジットを節約する
)
class SDXL:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import StableDiffusionXLPipeline

        self.pipe = StableDiffusionXLPipeline.from_pretrained(
            MODEL_ID, torch_dtype=torch.float16, variant="fp16", use_safetensors=True
        ).to("cuda")
        cache.commit()
        self._img2img = None
        self._inpaint = None
        self._rembg = None

    def _pipes(self):
        from diffusers import StableDiffusionXLImg2ImgPipeline, StableDiffusionXLInpaintPipeline

        if self._img2img is None:
            # 同じ重みを使い回す（メモリを増やさない）
            self._img2img = StableDiffusionXLImg2ImgPipeline.from_pipe(self.pipe)
            self._inpaint = StableDiffusionXLInpaintPipeline.from_pipe(self.pipe)
        return self._img2img, self._inpaint

    def _cutout(self, img, keep_frame=False):
        from rembg import new_session, remove

        if self._rembg is None:
            self._rembg = new_session(CUTOUT_MODEL)
            cache.commit()
        out = remove(img, session=self._rembg)
        if keep_frame:
            return out
        box = out.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        return out.crop(box) if box else out

    def _one(self, job: dict, init_bytes: bytes | None):
        import torch
        from PIL import Image, ImageDraw, ImageFilter

        width = job.get("width", 1024)
        height = job.get("height", 1024)
        common = dict(
            prompt=job["prompt"],
            negative_prompt=job.get("negative", NEGATIVE_PROMPT),
            num_inference_steps=job.get("steps", 30),
            guidance_scale=job.get("guidance", 7.0),
            generator=torch.Generator("cuda").manual_seed(job["seed"]),
        )
        if init_bytes is not None and job.get("copy"):
            return Image.open(io.BytesIO(init_bytes)).convert("RGB")
        if init_bytes is None:
            img = self.pipe(width=width, height=height, **common).images[0]
        else:
            init = Image.open(io.BytesIO(init_bytes)).convert("RGB")
            img2img, inpaint = self._pipes()
            if "mask_box" in job:
                x, y, w, h = job["mask_box"]
                mask = Image.new("L", init.size, 0)
                ImageDraw.Draw(mask).rounded_rectangle([x, y, x + w, y + h], radius=min(w, h) // 4, fill=255)
                mask = mask.filter(ImageFilter.GaussianBlur(12))
                img = inpaint(
                    image=init, mask_image=mask, width=init.width, height=init.height,
                    strength=job.get("strength", 0.9), **common,
                ).images[0]
                # 描き直した範囲の外は元の絵のまま残す（全体の色が少しずれるのを防ぐ）
                img = Image.composite(img, init, mask)
            else:
                img = img2img(image=init, strength=job.get("strength", 0.6), **common).images[0]
        return img

    @modal.method()
    def generate(self, prompt: str, width: int, height: int, seed: int, n: int, cutout: bool = False) -> list[bytes]:
        results = []
        for i in range(n):
            img = self._one({"prompt": prompt, "width": width, "height": height, "seed": seed + i}, None)
            if cutout:
                img = self._cutout(img)
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            results.append(buf.getvalue())
        return results

    @modal.method()
    def run_batch(self, jobs: list[dict], inits: dict[str, bytes]) -> list[tuple[str, bytes, bytes]]:
        """jobs を順に作る。戻り値は (out, 保存するバイト列, 切り抜き前の PNG) の並び。"""
        from PIL import Image, ImageOps

        raw: dict[str, bytes] = dict(inits)
        results = []
        for k, job in enumerate(jobs):
            init_bytes = raw[job["init"]] if "init" in job else None
            img = self._one(job, init_bytes)
            buf = io.BytesIO()
            img.save(buf, format="PNG")
            raw[job["out"]] = buf.getvalue()
            if job.get("cutout"):
                img = self._cutout(img, job.get("keep_frame", False))
            if job.get("flip"):
                img = ImageOps.mirror(img)
            side = job.get("max_side")
            if side and max(img.size) > side:
                img.thumbnail((side, side), Image.LANCZOS)
            out = io.BytesIO()
            if job["out"].lower().endswith(".webp"):
                img.save(out, format="WEBP", quality=job.get("quality", 86), method=6)
            else:
                img.save(out, format="PNG")
            results.append((job["out"], out.getvalue(), raw[job["out"]]))
            print(f"[{k + 1}/{len(jobs)}] {job['out']}")
        return results


def _check_size(name: str, value: int) -> None:
    if value % 16 != 0 or not 256 <= value <= 1440:
        raise SystemExit(f"--{name} は 16 の倍数で 256〜1440 にしてください（指定値: {value}）")


RAW_DIR = pathlib.Path(".imagegen-raw")


def _raw_path(out: pathlib.Path) -> pathlib.Path:
    """切り抜き前の絵の保存先（インペイントの元にするため残しておく。リポジトリには入れない）。"""
    return RAW_DIR / out.with_suffix(".png").relative_to(out.anchor) if out.is_absolute() else RAW_DIR / out.with_suffix(".png")


def _run_batch(batch: str) -> None:
    jobs = json.loads(pathlib.Path(batch).read_text(encoding="utf-8"))
    outs = {j["out"] for j in jobs}
    todo = []
    for job in jobs:
        out = pathlib.Path(job["out"])
        if out.suffix.lower() not in (".png", ".webp"):
            raise SystemExit(f"out は .png か .webp にしてください: {job['out']}")
        if job.get("skip_existing") and out.exists():
            continue
        _check_size("width", job.get("width", 1024))
        _check_size("height", job.get("height", 1024))
        job.setdefault("seed", random.randrange(2**31))
        todo.append(job)
    if not todo:
        print("作る画像はありません（すべて作成済み）")
        return

    # 元にする絵のうち、このバッチで作らないものはローカルから送る
    made = {j["out"] for j in todo}
    inits = {}
    for job in todo:
        src = job.get("init")
        if src and src not in made and src not in inits:
            p = pathlib.Path(src)
            raw = _raw_path(p) if src in outs else p
            if not raw.exists():
                raw = p
            inits[src] = raw.read_bytes()

    for out, data, raw in SDXL().run_batch.remote(todo, inits):
        path = pathlib.Path(out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        _raw_path(path).parent.mkdir(parents=True, exist_ok=True)
        _raw_path(path).write_bytes(raw)
        print(f"保存しました: {path}")


@app.local_entrypoint()
def main(
    prompt: str = "",
    out: str = "",
    n: int = 1,
    width: int = 1024,
    height: int = 1024,
    seed: int = -1,
    cutout: bool = False,
    batch: str = "",
):
    if batch:
        _run_batch(batch)
        return
    if not prompt or not out:
        raise SystemExit("--prompt と --out を指定してください（まとめて作るときは --batch）")
    if not 1 <= n <= MAX_IMAGES:
        raise SystemExit(f"--n は 1〜{MAX_IMAGES} にしてください（指定値: {n}）")
    _check_size("width", width)
    _check_size("height", height)
    if seed < 0:
        seed = random.randrange(2**31)

    out_path = pathlib.Path(out)
    if out_path.suffix.lower() != ".png":
        raise SystemExit("--out は .png で指定してください")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    images = SDXL().generate.remote(prompt, width, height, seed, n, cutout)
    for i, data in enumerate(images):
        path = out_path if n == 1 else out_path.with_name(f"{out_path.stem}-{i + 1}{out_path.suffix}")
        path.write_bytes(data)
        print(f"保存しました: {path}（seed={seed + i}）")
