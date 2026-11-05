"""精准微调：只把"偏离中心最远的少数人物"往中间收，其余人不动。

与"全体收缩"的区别：
  - 全体收缩会让所有人挤在一起，细微差异被放大，长尾反而更出不来（实测 34→44）；
  - 只收极值，等于把被个别高分人物占满的作答空间腾出来还给其他人。

规则（每轮）：
  1. 找出六维"绝对偏离中心之和"最大的 K 个人；
  2. 对这些人，把每维向 50 方向收 alpha（只收不放，且不收过 50）；
  3. 不动 rarity、不动简介、不动分类、不动人数。

用法：python tools/nudge-extremes.py [K] [alpha]   默认 K=12 alpha=0.30
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "personas.json")
DIMS = ["EE", "ST", "AC", "HX", "RB", "SR"]

K = int(sys.argv[1]) if len(sys.argv) > 1 else 12
ALPHA = float(sys.argv[2]) if len(sys.argv) > 2 else 0.30


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    personas = data["personas"]

    scored = sorted(
        personas,
        key=lambda p: sum(abs(p["dims"][d] - 50) for d in DIMS),
        reverse=True,
    )
    targets = scored[:K]

    print(f"调整 {K} 人，alpha={ALPHA}")
    for p in targets:
        before = dict(p["dims"])
        for d in DIMS:
            v = p["dims"][d]
            nv = v + (50 - v) * ALPHA
            p["dims"][d] = int(round(max(5, min(95, nv))))
        after = dict(p["dims"])
        print(f"  {p['id']:<26} {before} -> {after}")

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
