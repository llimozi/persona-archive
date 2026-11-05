"""从 Google Fonts 取 Noto Serif SC 分片，合并并裁剪成项目所需字符的子集。

思路：
  1. 请求 css2，拿到 unicode-range 切片清单（每片给出覆盖范围与 URL）；
  2. 只下载**覆盖我们字符集**的切片（通常 20~40 片，而不是 100+）；
  3. 用 fontTools 把这些切片合并成一个字体，再按字符集裁剪；
  4. 输出 woff2 到 public/assets/fonts/。

不依赖外网 CDN 运行：产物已落在项目内。
"""
import json
import os
import re
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "assets", "fonts")
TMP = os.path.join(ROOT, ".tmp-font")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def parse_ranges(css):
    """返回 [(unicode_ranges, url)]"""
    out = []
    for block in re.findall(r"@font-face\s*\{(.*?)\}", css, re.S):
        m = re.search(r"src:\s*url\((https://[^)]+)\)", block)
        u = re.search(r"unicode-range:\s*([^;]+);", block)
        if m:
            out.append((u.group(1).strip() if u else "", m.group(1)))
    return out


def range_covers(ranges, codepoint):
    for part in ranges.split(","):
        part = part.strip().lower().replace("u+", "")
        if not part:
            continue
        if "-" in part:
            a, b = part.split("-")
            if int(a, 16) <= codepoint <= int(b, 16):
                return True
        elif int(part, 16) == codepoint:
            return True
    return False


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)

    chars = open(os.path.join(ROOT, "_charset.txt"), encoding="utf-8").read()
    codepoints = sorted({ord(c) for c in chars if c.strip()})
    print(f"目标字符 {len(codepoints)} 个")

    family = sys.argv[1] if len(sys.argv) > 1 else "Noto+Serif+SC:wght@700"
    out_name = sys.argv[2] if len(sys.argv) > 2 else "serif-subset.woff2"

    css_url = f"https://fonts.googleapis.com/css2?family={family}&display=swap"
    css = fetch(css_url).decode("utf-8")
    ranges = parse_ranges(css)
    print(f"字体切片共 {len(ranges)} 片")

    need = []
    for ur, url in ranges:
        if any(range_covers(ur, cp) for cp in codepoints):
            need.append(url)
    print(f"需要下载 {len(need)} 片")

    paths = []
    for i, url in enumerate(need):
        p = os.path.join(TMP, f"slice-{i:03d}.woff2")
        if not os.path.exists(p):
            with open(p, "wb") as f:
                f.write(fetch(url))
        paths.append(p)

    # 合并：取第一片为基底，其余逐片合并
    from fontTools.ttLib import TTFont
    from fontTools.merge import Merger

    merged_path = os.path.join(TMP, f"merged-{out_name}.ttf")
    if len(paths) == 1:
        base = TTFont(paths[0])
        base.flavor = None
        base.save(merged_path)
    else:
        merger = Merger()
        font = merger.merge(paths)
        font.save(merged_path)

    from fontTools import subset

    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    opts.desubroutinize = True
    f = subset.load_font(merged_path, opts)
    s = subset.Subsetter(opts)
    s.populate(text=chars)
    s.subset(f)
    out = os.path.join(OUT_DIR, out_name)
    subset.save_font(f, out, opts)

    size = os.path.getsize(out)
    print(f"输出 {out_name}: {size} bytes ({size/1024:.1f} KB)")


if __name__ == "__main__":
    main()
