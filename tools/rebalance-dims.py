"""按分布体检结果微调六维数值，把匹配分布压平（不改算法、不改人数、不改简介）。

原理：高斯核下，人物离 0.5 越远（六维越极端），能匹配到的作答组合越多，就越容易被选中。
      把极端人物的偏离度收一收，让 78 人在作答空间里铺得更开，长尾人物才有机会出现。

做法：对每个维度做一次"向中心收缩 + 保序"的映射——
  1. 先算目标：把六维整体标准差压到目标值，同时保持每个人在每维上的排序不变；
  2. 收缩强度由 SHRINK 控制，只动超出目标区间的部分，中间段基本不动；
  3. 结果四舍五入成整数，且限制在 5–95，避免制造新的极端值。

用法：python tools/rebalance-dims.py [--shrink 0.75] [--target-sd 16]
"""
import json
import os
import statistics
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "personas.json")
DIMS = ["EE", "ST", "AC", "HX", "RB", "SR"]

SHRINK = float(os.environ.get("SHRINK", "0.72"))
TARGET_SD = float(os.environ.get("TARGET_SD", "17"))


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    personas = data["personas"]

    report = {}
    for d in DIMS:
        vals = [p["dims"][d] for p in personas]
        mean = statistics.mean(vals)
        sd = statistics.pstdev(vals)
        # 目标：把标准差压到 TARGET_SD，均值向 50 轻推
        new_mean = 50 + (mean - 50) * 0.6
        scale = TARGET_SD / sd if sd > 0 else 1
        scale = scale * SHRINK if scale < 1 else 1
        changed = 0
        for p in personas:
            v = p["dims"][d]
            nv = new_mean + (v - mean) * scale
            nv = int(round(max(5, min(95, nv))))
            if nv != v:
                changed += 1
            p["dims"][d] = nv
        report[d] = (round(sd, 1), changed)

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("维度  原标准差  改动人数  新标准差")
    for d in DIMS:
        vals = [p["dims"][d] for p in personas]
        print(f"{d:4}  {report[d][0]:>8}  {report[d][1]:>8}  {statistics.pstdev(vals):>8.1f}")


if __name__ == "__main__":
    main()
