"""加题后重新对齐人物坐标到新的用户分布（不改算法、不改题库、不改简介）。

加 15 题后，用户向量被平均得更厉害：
  SD 从 .23~.36 掉到 .06~.15，均值升到 EE.57/ST.61/AC.74/HX.94/RB.63/SR.72，
  所有随机作答挤在同一个点附近，只有该点周围的人物能被选中（27 人从未出现）。

做法与此前一致：把人物均值与离散度同时对齐到新的用户分布。
"""
import json
import os
import statistics

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "personas.json")
DIMS = ["EE", "ST", "AC", "HX", "RB", "SR"]

# 25 题实测（2000 次随机作答）
USER_MEAN = {"EE": 0.57, "ST": 0.61, "AC": 0.74, "HX": 0.94, "RB": 0.63, "SR": 0.72}
USER_SD = {"EE": 0.15, "ST": 0.13, "AC": 0.11, "HX": 0.06, "RB": 0.14, "SR": 0.12}
# 人物离散度取用户 SD 的 1.8 倍：比用户窄会让所有人挤成一团，
# 比用户宽太多则边缘人物永远够不着。1.8 倍在实测里分布最平。
SPREAD_GAIN = 1.8


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    personas = data["personas"]

    print("维度  人物均值->新  人物SD->新   用户均值/用户SD")
    for d in DIMS:
        vals = [p["dims"][d] for p in personas]
        pm = statistics.mean(vals) / 100
        psd = statistics.pstdev(vals) / 100
        target_sd = USER_SD[d] * SPREAD_GAIN
        ratio = target_sd / psd if psd > 0 else 1
        for p in personas:
            v = p["dims"][d] / 100
            nv = USER_MEAN[d] + (v - pm) * ratio
            p["dims"][d] = int(round(max(6, min(98, nv * 100))))
        new = [p["dims"][d] for p in personas]
        print(
            f"{d:4}  {pm:.2f}->{statistics.mean(new) / 100:.2f}   "
            f"{psd:.2f}->{statistics.pstdev(new) / 100:.2f}   {USER_MEAN[d]:.2f}/{USER_SD[d]:.2f}"
        )

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
