"""把下载到的真实图片统一处理成 512×512，写入 public/assets/personas/<id>.png。

用法：python tools/apply-real-avatars.py
处理策略：居中裁切为正方形 → 缩放到 512×512 → 输出 PNG。
找不到源文件的人物不处理，保留原有占位图。
"""
from PIL import Image, ImageOps
import io
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, ".tmp-img")
OUT = os.path.join(ROOT, "public", "assets", "personas")
SIZE = 512

# persona id -> (源文件名, 裁切框 None 表示自动取方形, 备注)
PLAN = {
    "mem-nailong-001": ("nailong2.png", None, "萌娘百科《奶龙》条目角色单人立绘"),
    "ani-opossum-004": ("possum_crop.png", None, "Sixth Tone 报道配图中裁出的背手负鼠本体"),
    "an-diga-002": ("diga.jpg", (60, 0, 811, 720), "萌娘百科《迪迦奥特曼》条目主图，避开左上角标题"),
    "an-belial-001": ("belial.jpg", (0, 0, 564, 564), "萌娘百科《贝利亚奥特曼》条目主图，上对齐保留头部"),
    "an-sairo-003": ("sairo.jpg", None, "萌娘百科《赛罗奥特曼》条目主图"),
    "ani-cryinghorse-005": ("kuku.jpg", (40, 295, 395, 650), "中国义乌网报道《哭哭马》配图，裁出马头"),
    "mem-gulumao-021": ("gulumao.jpg", None, "B站 @咕噜耄 官方头像（本人即使用此橘猫形象，未露脸）"),
}


def process(src_name, box):
    path = os.path.join(SRC, src_name)
    if not os.path.exists(path):
        return None, "源文件不存在"
    try:
        im = Image.open(path)
        im.load()
    except Exception as e:  # noqa: BLE001
        return None, f"打开失败 {e}"

    im = im.convert("RGB")
    if box:
        im = im.crop(box)

    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    im = im.crop((left, top, left + side, top + side))
    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    return im, None


def main():
    data = json.load(open(os.path.join(ROOT, "data", "personas.json"), encoding="utf-8"))
    ids = [p["id"] for p in data["personas"]]
    done, skipped = [], []

    for pid in ids:
        if pid not in PLAN:
            skipped.append((pid, "未找到可用图源"))
            continue
        src_name, box, note = PLAN[pid]
        im, err = process(src_name, box)
        if im is None:
            skipped.append((pid, err))
            continue
        out_path = os.path.join(OUT, f"{pid}.png")
        im.save(out_path, "PNG", optimize=True)
        done.append((pid, note, os.path.getsize(out_path)))

    print(f"=== 换成真图 {len(done)} 张 ===")
    for pid, note, size in done:
        print(f"  {pid:<22} {size:>7} B  {note}")
    print(f"\n=== 仍用占位 {len(skipped)} 张 ===")
    for pid, why in skipped:
        print(f"  {pid:<22} {why}")


if __name__ == "__main__":
    main()
