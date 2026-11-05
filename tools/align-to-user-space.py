"""把人物坐标同时对齐到用户的"均值 + 离散度"（不改题库、不改算法）。

上一步只平移了均值，方差仍窄（人物 SD 14–21%，用户 SD 20–36%），
导致 78 人挤在一条窄带里，只有少数位置能被随机作答命中。

做法：对每个维度做一次线性变换
    new_mu = user_mean + (mu - persona_mean) * (user_sd / persona_sd) * GAIN
  - GAIN 略小于 1，避免把人物外推到 0/1 边界（边界处高斯核会被截断，反而制造新的死区）；
  - 变换保持每个人在该维上的排序，人物之间的相对关系不变；
  - 结果夹在 [6, 94]。

用法：python tools/align-to-user-space.py --spread
"""
import json
import os
import statistics

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "personas.json")
DIMS = ["EE", "ST", "AC", "HX", "RB", "SR"]

# 实测用户分布（2000 次随机作答）
USER_MEAN = {"EE": 0.58, "ST": 0.59, "AC": 0.72, "HX": 0.91, "RB": 0.59, "SR": 0.73}
USER_SD = {"EE": 0.23, "ST": 0.30, "AC": 0.23, "HX": 0.36, "RB": 0.29, "SR": 0.20}
GAIN = 0.85


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    personas = data["personas"]

    print("维度  人物均值->  人物SD->  用户均值  用户SD")
    for d in DIMS:
        vals = [p["dims"][d] for p in personas]
        pm = statistics.mean(vals) / 100
        psd = statistics.pstdev(vals) / 100
        ratio = (USER_SD[d] / psd) * GAIN if psd > 0 else 1
        for p in personas:
            v = p["dims"][d] / 100
            nv = USER_MEAN[d] + (v - pm) * ratio
            p["dims"][d] = int(round(max(6, min(94, nv * 100))))
        new = [p["dims"][d] for p in personas]
        print(
            f"{d:4}  {pm:.2f}->{statistics.mean(new) / 100:.2f}   {psd:.2f}->{statistics.pstdev(new) / 100:.2f}   "
            f"{USER_MEAN[d]:.2f}      {USER_SD[d]:.2f}"
        )

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
