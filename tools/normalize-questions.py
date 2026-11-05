"""把题库的选择偏差拉回中心：让随机作答的期望落在各维 0.5 附近。

问题：现有 10 题里，各题选项的 effects 均值几乎全是正数
     （AC +0.15 / SR +0.20 / HX +0.11 ...），
     意味着**随便选也能拿到偏高的分数**，用户向量永远挤在右上角，
     78 人里能赢的只有同样站在右上角的那几个。

做法：对每个维度，找出"每个选项都偏高/偏低"的题，给该题全选项统一平移 -bias，
     使该维度在这一题上的平均效果回到 0（不改选项之间的相对差，不改题型，不改题目文案）。
     bias 超过阈值才动，避免把微小差异也抹平。

用法：python tools/normalize-questions.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "questions.json")
DIMS = ["EE", "ST", "AC", "HX", "RB", "SR"]
THRESHOLD = 0.03  # 平均偏差超过它才修正


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    qs = data["questions"]

    print("题号          维度  原均值  修正量  新均值")
    for q in qs:
        opts = q["options"]
        n = len(opts)
        for d in DIMS:
            vals = [o.get("effects", {}).get(d, 0.0) for o in opts]
            mean = sum(vals) / n
            if abs(mean) < THRESHOLD:
                continue
            for o in opts:
                eff = o.setdefault("effects", {})
                if d in eff:
                    eff[d] = round(max(-1.0, min(1.0, eff[d] - mean)), 2)
            new_vals = [o.get("effects", {}).get(d, 0.0) for o in opts]
            print(f"{q['id']:<13} {d:4}  {mean:+.2f}   {-mean:+.2f}   {sum(new_vals) / n:+.2f}")

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("\n修正后全库均值:")
    for d in DIMS:
        total = 0.0
        cnt = 0
        for q in qs:
            n = len(q["options"])
            total += sum(o.get("effects", {}).get(d, 0.0) for o in q["options"]) / n
            cnt += 1
        print(f"  {d}: {total / cnt:+.3f}")


if __name__ == "__main__":
    main()
