#!/usr/bin/env python3
"""把用户提供的角色照片替换到项目头像目录。

输入：C:\\Users\\86185\\DoubaoWork\\chats\\2026-11-05\\new-chat\\人物档案
      文件名格式「<编号> <角色名>.png/jpg」

输出：public/assets/personas/<id>.png（512×512，RGB PNG）

处理规则：
  - 居中裁成正方形（保留主体，不做拉伸变形）
  - 缩放到 512×512（LANCZOS）
  - 统一转 RGB 后存 PNG；大图因此被压缩到项目规格
  - 缺号的角色（14 马志辉）跳过，保留原占位头像

用法：
    python tools/apply-persona-photos.py            # 干跑，只报告
    python tools/apply-persona-photos.py --apply    # 实际写入
"""
from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(r"C:\Users\86185\DoubaoWork\chats\2026-11-05\new-chat\人物档案")
OUT = ROOT / "public" / "assets" / "personas"
SIZE = 512

SKIP = {"14"}  # 用户指定：马志辉先跳过


def center_square(im: Image.Image) -> Image.Image:
    """居中裁正方形。不拉伸，避免人脸/角色变形。"""
    w, h = im.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    return im.crop((left, top, left + side, top + side))


def main() -> int:
    apply = "--apply" in sys.argv

    doc = json.loads((ROOT / "data" / "personas.json").read_text(encoding="utf-8"))
    personas = doc["personas"]
    by_pos = {p["position"]: p for p in personas if "position" in p}

    files = sorted(os.listdir(SRC))
    done, skipped, missing = [], [], []

    for fname in files:
        m = re.match(r"^(\d{2})\s+(.+)\.(png|jpg|jpeg)$", fname, re.I)
        if not m:
            print(f"?? 无法解析文件名: {fname}")
            continue
        pos = int(m.group(1))
        if m.group(1) in SKIP:
            skipped.append((pos, m.group(2), "用户在 SKIP 列表"))
            continue
        p = by_pos.get(pos)
        if p is None:
            missing.append((pos, m.group(2)))
            continue

        src_path = SRC / fname
        before_kb = os.path.getsize(src_path) // 1024
        im = Image.open(src_path)
        src_size = im.size

        # 处理链：居中裁方 → 缩放 → RGB
        im = center_square(im)
        if im.size[0] != SIZE:
            im = im.resize((SIZE, SIZE), Image.LANCZOS)
        if im.mode in ("RGBA", "LA", "P"):
            # 透明底铺白，避免 PNG 半透明边在卡片上发灰
            im = im.convert("RGBA")
            bg = Image.new("RGB", im.size, (255, 255, 255))
            bg.paste(im, mask=im.split()[-1])
            im = bg
        else:
            im = im.convert("RGB")

        dst = OUT / f"{p['id']}.png"
        if apply:
            im.save(dst, "PNG", optimize=True)
            after_kb = os.path.getsize(dst) // 1024
            done.append((pos, p["name"], src_size, before_kb, after_kb))
        else:
            done.append((pos, p["name"], src_size, before_kb, -1))

    print(f"=== {'写入' if apply else '干跑'}结果 ===")
    print(f"处理: {len(done)} 张 | 跳过: {len(skipped)} | 无匹配: {len(missing)}")
    if skipped:
        for pos, name, why in skipped:
            print(f"  跳过 {pos:02d} {name}（{why}）")
    if missing:
        print("  无匹配:", missing)

    if apply and done:
        tot_before = sum(d[3] for d in done)
        tot_after = sum(d[4] for d in done)
        print(f"\n体积: {tot_before} KB → {tot_after} KB（省 {tot_before - tot_after} KB）")
        shrunk = sorted(done, key=lambda d: d[3] - d[4], reverse=True)[:8]
        print("压缩最多的 8 张:")
        for pos, name, sz, b, a in shrunk:
            print(f"  {pos:02d} {name:16} {sz[0]}x{sz[1]}  {b:5}KB → {a:4}KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
