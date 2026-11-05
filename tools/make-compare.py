"""把新旧截图拼成左右对比图（左=上一版，右=本轮）。"""
from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = os.path.join(ROOT, "artifacts", "visual")
OUT = os.path.join(V, "compare")
os.makedirs(OUT, exist_ok=True)

FONT_PATHS = [r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"]


def font(px):
    for f in FONT_PATHS:
        if os.path.exists(f):
            try:
                return ImageFont.truetype(f, px)
            except Exception:
                continue
    return ImageFont.load_default()


def compose(before_path, after_path, out_name, title, target_h=1000):
    b = Image.open(before_path).convert("RGB")
    a = Image.open(after_path).convert("RGB")

    # 等比缩放到同一高度
    def scale(im):
        w = int(im.width * target_h / im.height)
        return im.resize((w, target_h), Image.LANCZOS)

    b, a = scale(b), scale(a)

    gap, header, pad = 24, 86, 20
    W = b.width + a.width + gap + pad * 2
    H = target_h + header + pad
    canvas = Image.new("RGB", (W, H), (238, 232, 219))
    d = ImageDraw.Draw(canvas)

    d.text((pad, 16), title, font=font(28), fill=(28, 26, 23))
    f_lbl = font(22)
    d.text((pad, 56), "上一版", font=f_lbl, fill=(122, 114, 102))
    d.text((pad + b.width + gap, 56), "本轮", font=f_lbl, fill=(178, 58, 46))

    canvas.paste(b, (pad, header))
    canvas.paste(a, (pad + b.width + gap, header))

    # 细边框
    d.rectangle([pad - 1, header - 1, pad + b.width, header + target_h], outline=(203, 189, 158))
    d.rectangle(
        [pad + b.width + gap - 1, header - 1, pad + b.width + gap + a.width, header + target_h],
        outline=(178, 58, 46),
    )

    path = os.path.join(OUT, out_name)
    canvas.save(path, "PNG", optimize=True)
    return path, canvas.size


def main():
    jobs = [
        ("before/home-390.png", "after-home-390.png", "compare-home.png", "首页首屏对比（390×844）"),
        ("before/result-390.png", "after-result-390.png", "compare-result.png", "结果页首屏对比（390×844）"),
        ("before/poster-390.png", "after-poster-390.png", "compare-poster.png", "导出海报对比（9:16）"),
    ]
    for bf, af, name, title in jobs:
        p, size = compose(os.path.join(V, bf), os.path.join(V, af), name, title)
        print(f"{name}: {size[0]}x{size[1]}")


if __name__ == "__main__":
    main()
