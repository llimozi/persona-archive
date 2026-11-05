"""生成 12 张人物占位头像（统一设计语言，每人一张，不留空白）。

用法：python tools/gen-persona-avatars.py
输出：src/web/assets/personas/<id>.png
"""
from PIL import Image, ImageDraw, ImageFont
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "src", "web", "assets", "personas")
os.makedirs(OUT, exist_ok=True)

SIZE = 512

# 分类配色：与站点设计 token 同色系（深底 + 暖金点缀）
PALETTE = {
    "mem": ((38, 34, 30), (212, 175, 122)),
    "ani": ((30, 36, 34), (150, 196, 168)),
    "an":  ((32, 32, 42), (140, 160, 220)),
    "sd":  ((38, 30, 32), (214, 140, 140)),
}

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
]


def load_font(px):
    for f in FONT_CANDIDATES:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, px)
            except Exception:
                continue
    return ImageFont.load_default()


def first_char(name):
    """取名字首个有意义字符：跳过引号/括号/空格。"""
    for ch in name:
        if ch in "「」『』《》（）() \u3000·":
            continue
        return ch
    return name[:1]


def draw_avatar(persona):
    bg, accent = PALETTE.get(persona["category"], ((34, 34, 38), (200, 200, 200)))
    img = Image.new("RGB", (SIZE, SIZE), bg)
    d = ImageDraw.Draw(img)

    # 极简纹理：斜向细线，避免纯色显得像加载失败
    for i in range(-SIZE, SIZE * 2, 26):
        d.line([(i, 0), (i - SIZE, SIZE)], fill=tuple(min(255, c + 7) for c in bg), width=1)

    # 外圈细描边
    d.rounded_rectangle([10, 10, SIZE - 10, SIZE - 10], radius=54, outline=accent, width=3)

    ch = first_char(persona["name"])
    font = load_font(232)
    bbox = d.textbbox((0, 0), ch, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    d.text(((SIZE - tw) / 2 - bbox[0], (SIZE - th) / 2 - bbox[1] - 18), ch, font=font, fill=accent)

    # 底部小字：分类缩写，帮助辨认
    small = load_font(44)
    cat = persona["category"].upper()
    cb = d.textbbox((0, 0), cat, font=small)
    d.text(((SIZE - (cb[2] - cb[0])) / 2 - cb[0], SIZE - 96), cat, font=small,
           fill=tuple(min(255, c + 60) for c in bg))

    path = os.path.join(OUT, f"{persona['id']}.png")
    img.save(path, "PNG", optimize=True)
    return path


def main():
    data = json.load(open(os.path.join(ROOT, "data", "personas.json"), encoding="utf-8"))
    personas = data["personas"]
    for p in personas:
        path = draw_avatar(p)
        print(f"OK {p['id']:<22} {os.path.relpath(path, ROOT)}")
    print(f"\n共 {len(personas)} 张 → {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
