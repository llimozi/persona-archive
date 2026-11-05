"""把"永远排不上号"的人物向池子密度最高的区域移动（不改算法、不改简介）。

诊断结论（3000 次采样）：少数人物的平均名次在 40~66（共 78 人），最好也只到第 1~3 名，
永远差一口气。原因不是分布 fx 的问题，而是它们落在"没有其他人占位"的空档里，
高斯核在任何真实作答下都够不着它们。

做法：对这些人物，把每一维向全池均值靠拢 PULL（0~1）。
     0 = 完全不动，1 = 完全变成"平均人"。取中间值，保留个性又进入高密度区。

用法：python tools/pull-to-density.py [id,id,...] [pull]
"""
import json
import os
import statistics
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "personas.json")
DIMS = ["EE", "ST", "AC", "HX", "RB", "SR"]

IDS = (sys.argv[1] if len(sys.argv) > 1 else "").split(",")
PULL = float(sys.argv[2]) if len(sys.argv) > 2 else 0.5


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    personas = data["personas"]
    pool_mean = {d: statistics.mean(p["dims"][d] for p in personas) for d in DIMS}

    for p in personas:
        if p["id"] not in IDS:
            continue
        before = dict(p["dims"])
        for d in DIMS:
            v = p["dims"][d]
            nv = v + (pool_mean[d] - v) * PULL
            p["dims"][d] = int(round(max(6, min(94, nv))))
        print(f"{p['id']:<24} {before} -> {p['dims']}")

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
