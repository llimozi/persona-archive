"""把本轮联网找到的真实图片处理成 512×512，写入 public/assets/personas/<id>.png。

规则与此前一致：居中裁方 → 缩放到 512 → PNG。
找不到源文件的人物不处理，保留现有占位头像。
"""
import json
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, ".tmp-img2")
OUT = os.path.join(ROOT, "public", "assets", "personas")
SIZE = 512

# id -> (源文件, 裁切框 or None, 来源说明)
PLAN = {
    "an-xiongda-004": ("xiongda.jpg", None, "萌娘百科《熊大》条目主图（白底立绘）"),
    "an-sairo-003": ("sairo.jpg", None, "萌娘百科《赛罗奥特曼》条目主图"),
    "an-belial-001": ("belial.jpg", (0, 0, 564, 564), "萌娘百科《贝利亚奥特曼》条目主图，上对齐保留头部"),
    "scr-malfoy-005": ("malfoy.png", (60, 60, 540, 740), "萌娘百科《德拉科·马尔福》条目主图（同人绘）"),
}


def main():
    personas = json.load(open(os.path.join(ROOT, "data", "personas.json"), encoding="utf-8"))["personas"]
    by_id = {p["id"]: p for p in personas}
    done = []

    for pid, (fname, box, note) in PLAN.items():
        path = os.path.join(SRC, fname)
        if not os.path.exists(path):
            print(f"跳过 {pid}：源文件缺失")
            continue
        im = Image.open(path).convert("RGB")
        if box:
            im = im.crop(box)
        w, h = im.size
        side = min(w, h)
        im = im.crop(((w - side) // 2, (h - side) // 2, (w - side) // 2 + side, (h - side) // 2 + side))
        im = im.resize((SIZE, SIZE), Image.LANCZOS)
        im.save(os.path.join(OUT, f"{pid}.png"), "PNG", optimize=True)
        done.append((pid, by_id.get(pid, {}).get("name", "?"), note, os.path.getsize(os.path.join(OUT, f"{pid}.png"))))

    print(f"换成真图 {len(done)} 张：")
    for pid, name, note, size in done:
        print(f"  {pid:<20} {name:<12} {size:>7} B  {note}")


if __name__ == "__main__":
    main()
