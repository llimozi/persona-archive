"""给"六维过于平庸"的人物增加辨识度（不改算法、不改简介、不改人数）。

背景：清洗后仍有 5~13 人几乎不被匹配。它们的共同点是六维分布太居中、
离散度低于全池平均——在任何位置都不够"像"某类人，高斯核给谁都不算近。

做法：对离散度最低的一批人，把每维偏离 50 的程度放大 SPREAD 倍（限幅 [6,94]）。
    这是"放大个性"，不是改人设方向：原本偏高的人更高、偏低的更低，方向不变。

用法：python tools/amplify-flat-profiles.py [人数] [倍数]
"""
import json
import os
import statistics
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "personas.json")
DIMS = ["EE", "ST", "AC", "HX", "RB", "SR"]

K = int(sys.argv[1]) if len(sys.argv) > 1 else 20
SPREAD = float(sys.argv[2]) if len(sys.argv) > 2 else 1.6


def flatness(p):
    """离散度：六维标准差。越小越"平庸"。"""
    return statistics.pstdev([p["dims"][d] for d in DIMS])


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    personas = data["personas"]

    ordered = sorted(personas, key=flatness)
    targets = ordered[:K]

    print(f"放大 {K} 人的辨识度，倍数 {SPREAD}")
    for p in targets:
        before = flatness(p)
        center = statistics.mean([p["dims"][d] for d in DIMS])
        for d in DIMS:
            v = p["dims"][d]
            nv = center + (v - center) * SPREAD
            p["dims"][d] = int(round(max(6, min(94, nv))))
        print(f"  {p['id']:<26} sd {before:5.1f} -> {flatness(p):5.1f}  {p['name'][:24]}")

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
