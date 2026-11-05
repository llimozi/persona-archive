#!/usr/bin/env python3
"""把用户提供的 archive-bg.svg 转成项目自托管的档案纸底图。

做三件事：
1. 剥掉 C2PA 元数据（体积大头，且对渲染无意义）。
2. 把印章里的 <text> 转成 <path>，字形取自项目自带的 serif 子集 /
   等宽字体，**不依赖任何系统字体**（Windows 没有 Songti SC，
   不转曲的话印章会静默回退成别的字体，甚至显示成方框）。
3. 重新序列化并输出到 public/assets/bg/。

用法：
    python tools/build-archive-bg.py <源 svg> [输出 svg]
"""

from __future__ import annotations

import re
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.pens.transformPen import TransformPen
from fontTools.misc.transform import Transform

ROOT = Path(__file__).resolve().parent.parent
SERIF = ROOT / "public/assets/fonts/serif-subset.woff2"
# 等宽：Windows / macOS / Android 上都有的通用族，字形本身极其规整，
# 直接沿用 CSS 字体栈即可，不做转曲（转曲后"未命中"的风险反而更高）。
MONO_STACK = "Courier New,monospace"
SERIF_STACK = "Songti SC,Noto Serif SC,serif"

SVG_NS = "http://www.w3.org/2000/svg"
C2PA_NS = "http://c2pa.org/manifest"


def load_serif():
    font = TTFont(str(SERIF))
    return font, font.getBestCmap(), font.getGlyphSet(), font["head"].unitsPerEm


def text_to_path(text: str, cx: float, baseline: float, size: float,
                 letter_spacing: float, em: int) -> str:
    """文本 → 单条 path。以 (cx, baseline) 为锚，按字母间距逐字排布并居中。"""
    font, cmap, glyphs, upem = load_serif()
    scale = size / upem
    # 先用字宽算出总宽，才能做水平居中
    advances = []
    for ch in text:
        gname = cmap.get(ord(ch))
        advances.append(font["hmtx"][gname][0] * scale if gname else size * 0.5)
    total = sum(advances) + letter_spacing * max(0, len(text) - 1)

    x = cx - total / 2
    parts: list[str] = []
    for ch, adv in zip(text, advances):
        gname = cmap.get(ord(ch))
        if gname:
            pen = SVGPathPen(glyphs)
            # SVG 的 y 轴向下，字体坐标系向上，故整体翻转并在基线上平移
            tpen = TransformPen(pen, Transform(scale, 0, 0, -scale, x, baseline))
            glyphs[gname].draw(tpen)
            d = pen.getCommands()
            if d:
                parts.append(d)
        x += adv + letter_spacing
    return " ".join(parts)


def main() -> int:
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "public/assets/bg/archive-bg.svg"
    dst.parent.mkdir(parents=True, exist_ok=True)

    ET.register_namespace("", SVG_NS)
    # 只读根节点 + defs 子树，元数据整段丢弃（C2PA manifest 占了大半体积）
    raw = src.read_text(encoding="utf-8")
    raw = re.sub(r"<metadata>.*?</metadata>", "", raw, flags=re.S)

    tree = ET.ElementTree(ET.fromstring(raw))
    root = tree.getroot()

    converted = 0
    for parent in root.iter():
        for node in list(parent):
            if node.tag != f"{{{SVG_NS}}}text":
                continue
            text = (node.text or "").strip()
            if not text:
                parent.remove(node)
                continue
            size = float(node.get("font-size", "8"))
            baseline = float(node.get("y", "0"))
            spacing = float(node.get("letter-spacing", "0"))
            cx = float(node.get("x", "0"))  # text-anchor=middle 时 x 就是中心
            d = text_to_path(text, cx, baseline, size, spacing, 1000)
            path = ET.SubElement(parent, f"{{{SVG_NS}}}path",
                                 {"d": d, "fill": node.get("fill", "#b23a2e")})
            # 保持原有元素顺序：新 path 插到被删 text 的位置
            parent.remove(path)
            idx = list(parent).index(node)
            parent.remove(node)
            parent.insert(idx, path)
            converted += 1

    tree.write(dst, encoding="utf-8", xml_declaration=False)
    out = dst.read_bytes()
    print(f"text->path: {converted}")
    print(f"out: {dst}  {len(out)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
