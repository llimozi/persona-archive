"""把下载的 Lucide SVG 转成一个内联 React 图标组件（零运行时请求）。"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, ".tmp-icons")
OUT = os.path.join(ROOT, "src", "web", "components", "Icons.tsx")

ICONS = {
    "archive": "ArchiveIcon",
    "stamp": "StampIcon",
    "chevron-down": "ChevronDownIcon",
    "chevron-right": "ChevronRightIcon",
    "share-2": "ShareIcon",
    "image": "ImageIcon",
    "arrow-right": "ArrowRightIcon",
    "rotate-ccw": "ResetIcon",
    "scan-line": "ScanIcon",
}


def extract(path):
    s = open(path, encoding="utf-8").read()
    inner = re.search(r"<svg[^>]*>(.*)</svg>", s, re.S).group(1)
    # 归一化：去多余空白，属性转 JSX
    inner = re.sub(r"\s+", " ", inner).strip()
    inner = re.sub(r"stroke-width", "strokeWidth", inner)
    inner = re.sub(r"stroke-linecap", "strokeLinecap", inner)
    inner = re.sub(r"stroke-linejoin", "strokeLinejoin", inner)
    inner = re.sub(r"clip-rule", "clipRule", inner)
    inner = re.sub(r"fill-rule", "fillRule", inner)
    inner = re.sub(r'stroke-width=', "strokeWidth=", inner)
    inner = re.sub(r"\bclass=", "className=", inner)
    inner = re.sub(r"<rect([^>]*?)\s*/>", r"<rect\1 />", inner)
    inner = re.sub(r"<path([^>]*?)\s*/>", r"<path\1 />", inner)
    inner = re.sub(r"<circle([^>]*?)\s*/>", r"<circle\1 />", inner)
    return inner


def main():
    lines = [
        "/**",
        " * 内联图标组件（源自 Lucide，ISC 许可）。",
        " *",
        " * 为什么内联而不是 <img> 或图标字体：",
        " *   1. 零额外网络请求，首屏更快；",
        " *   2. 颜色继承 currentColor，跟着主题走；",
        " *   3. 不会因为外链资源加载失败而出现空白。",
        " */",
        "import type { SVGProps } from 'react';",
        "",
        "type IconProps = SVGProps<SVGSVGElement> & { size?: number };",
        "",
        "function Base({ size = 20, children, ...rest }: IconProps & { children: React.ReactNode }) {",
        "  return (",
        "    <svg",
        "      width={size}",
        "      height={size}",
        "      viewBox=\"0 0 24 24\"",
        "      fill=\"none\"",
        "      stroke=\"currentColor\"",
        "      strokeWidth={1.8}",
        "      strokeLinecap=\"round\"",
        "      strokeLinejoin=\"round\"",
        "      aria-hidden=\"true\"",
        "      focusable=\"false\"",
        "      {...rest}",
        "    >",
        "      {children}",
        "    </svg>",
        "  );",
        "}",
        "",
    ]

    for fname, comp in ICONS.items():
        path = os.path.join(SRC, f"{fname}.svg")
        if not os.path.exists(path):
            print(f"跳过（未下载）：{fname}")
            continue
        body = extract(path)
        lines.append(f"export function {comp}(props: IconProps) {{")
        lines.append(f"  return <Base {{...props}}>{body}</Base>;")
        lines.append("}")
        lines.append("")

    open(OUT, "w", encoding="utf-8").write("\n".join(lines))
    print(f"生成 {OUT}")


if __name__ == "__main__":
    main()
