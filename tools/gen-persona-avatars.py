"""生成 78 张人物「档案照片」占位图（按分类区分配色/纹样/大字/编号）。

设计目标：**不要一眼看出是占位**。
  - 每个分类一套颜色与纹样（点阵 / 斜纹 / 圆环 / 网格）；
  - 画面里放名字首字 + 馆藏编号，像一张贴了标签的档案照；
  - 真图替换后仍是同一个方框，不会破坏版式。

用法：python tools/gen-persona-avatars.py
输出：public/assets/personas/<id>.png（512×512）
"""
from PIL import Image, ImageDraw, ImageFont
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "assets", "personas")
os.makedirs(OUT, exist_ok=True)

SIZE = 512

# 分类 → (底纸色, 纹样色, 大字色, 纹样样式)
PALETTE = {
    "mem":  ((236, 226, 205), (176, 58, 46),  (58, 46, 34),  "dot"),
    "ani":  ((226, 232, 218), (86, 122, 74),  (40, 54, 38),  "stripe"),
    "an":   ((222, 226, 236), (74, 86, 128),  (32, 40, 58),  "ring"),
    "sd":   ((238, 222, 220), (150, 74, 68),  (58, 34, 32),  "grid"),
    "es":   ((226, 228, 222), (66, 84, 78),   (34, 42, 40),  "chevron"),
    "intp": ((232, 228, 214), (120, 104, 62), (46, 40, 26),  "dot"),
    "scr":  ((230, 222, 232), (104, 76, 118), (42, 34, 50),  "ring"),
    "gm":   ((222, 230, 232), (62, 96, 106),  (30, 44, 48),  "grid"),
    "oth":  ((230, 228, 222), (96, 92, 84),   (42, 40, 36),  "stripe"),
}

FONT_BOLD = [r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\msyh.ttc", r"C:\Windows\Fonts\simhei.ttf"]
FONT_MONO = [r"C:\Windows\Fonts\consola.ttf", r"C:\Windows\Fonts\cour.ttf", r"C:\Windows\Fonts\simsun.ttc"]


def font(paths, px):
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, px)
            except Exception:
                continue
    return ImageFont.load_default()


def first_char(name):
    for ch in name:
        if ch in "「」『』《》（）() 　·":
            continue
        return ch
    return name[:1]


def archive_no(pid):
    import re
    m = re.search(r"(\d+)\s*$", pid)
    return f"{m.group(1).zfill(4)}" if m else "----"


def draw_pattern(d, style, color, size):
    """轻量纹样：够有辨识度，又不抢大字。"""
    # 降低纹样对比度：小尺寸下才不会糊成一片
    c = tuple(int(v + (255 - v) * 0.55) for v in color)
    faint = (c[0], c[1], c[2])
    if style == "dot":
        for y in range(24, size - 24, 34):
            for x in range(24, size - 24, 34):
                d.ellipse([x, y, x + 5, y + 5], fill=faint)
    elif style == "stripe":
        for i in range(-size, size * 2, 30):
            d.line([(i, 0), (i - size, size)], fill=faint, width=2)
    elif style == "ring":
        for r in range(70, 300, 46):
            d.ellipse([size / 2 - r, size / 2 - r, size / 2 + r, size / 2 + r], outline=faint, width=2)
    elif style == "grid":
        for i in range(40, size, 56):
            d.line([(i, 0), (i, size)], fill=faint, width=1)
            d.line([(0, i), (size, i)], fill=faint, width=1)
    elif style == "chevron":
        for y in range(0, size + 60, 54):
            d.line([(0, y), (size / 2, y + 40), (size, y)], fill=faint, width=2)


def draw_avatar(persona):
    cat = persona["category"]
    bg, patt, ink, style = PALETTE.get(cat, PALETTE["oth"])
    img = Image.new("RGB", (SIZE, SIZE), bg)
    d = ImageDraw.Draw(img)

    # 纸质底：极浅的横向纤维
    for y in range(0, SIZE, 3):
        d.line([(0, y), (SIZE, y)], fill=tuple(max(0, v - 3) for v in bg), width=1)

    draw_pattern(d, style, patt, SIZE)

    # 内框：双线装裱（外粗内细），像真档案照的卡纸
    d.rectangle([14, 14, SIZE - 14, SIZE - 14], outline=tuple(max(0, v - 46) for v in bg), width=5)
    d.rectangle([26, 26, SIZE - 26, SIZE - 26], outline=tuple(max(0, v - 26) for v in bg), width=1)

    # 四角装裱角：L 形短线
    L, TH = 34, 2
    edge = tuple(max(0, v - 60) for v in bg)
    for ox, oy, dx, dy in ((30, 30, 1, 1), (SIZE - 30, 30, -1, 1), (30, SIZE - 30, 1, -1), (SIZE - 30, SIZE - 30, -1, -1)):
        d.line([(ox, oy), (ox + L * dx, oy)], fill=edge, width=TH)
        d.line([(ox, oy), (ox, oy + L * dy)], fill=edge, width=TH)

    # 底部标注栏底色（在纹样之上再铺一次，保证编号清晰可读）
    d.rectangle([20, SIZE - 92, SIZE - 20, SIZE - 20], fill=tuple(max(0, v - 10) for v in bg))
    d.line([(20, SIZE - 92), (SIZE - 20, SIZE - 92)], fill=tuple(max(0, v - 40) for v in bg), width=2)

    ch = first_char(persona["name"])
    f = font(FONT_BOLD, 232)
    bbox = d.textbbox((0, 0), ch, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = (SIZE - tw) / 2 - bbox[0]
    ty = (SIZE - th) / 2 - bbox[1] - 18
    # 轻微投影，让大字从纸纹里浮起来
    d.text((tx + 2, ty + 3), ch, font=f, fill=tuple(min(255, v + 26) for v in bg))
    d.text((tx, ty), ch, font=f, fill=ink)

    # 底部：编号 + 分类拉丁缩写，像档案照的标注栏（先画栏，再画纹样，避免被纹样割穿）
    fm = font(FONT_MONO, 30)
    no = f"NO.{archive_no(persona['id'])}"
    d.text((40, SIZE - 78), no, font=fm, fill=patt)
    fm2 = font(FONT_MONO, 26)
    tag = cat.upper()
    tb = d.textbbox((0, 0), tag, font=fm2)
    d.text((SIZE - 40 - (tb[2] - tb[0]), SIZE - 74), tag, font=fm2, fill=tuple(int(v * 0.75) for v in ink))

    path = os.path.join(OUT, f"{persona['id']}.png")
    img.save(path, "PNG", optimize=True)
    return path


def main():
    personas = json.load(open(os.path.join(ROOT, "data", "personas.json"), encoding="utf-8"))["personas"]
    for p in personas:
        draw_avatar(p)
    print(f"共 {len(personas)} 张 → {os.path.relpath(OUT, ROOT)}")


if __name__ == "__main__":
    main()
