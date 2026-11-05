"""按 rarity 均摊 sigma 档位，消除"common 天然赢"的结构性偏差。

根因：引擎的 sigma 由 rarity 决定（common 0.22 / rare & limited 0.18 / hidden 0.15）。
     高斯核下 sigma 越大，人物对任何作答都更容易拿到高分 ——
     所以 34 个 common 会系统性压过 13 个 hidden，与内容本身无关。

做法：按"偏离中心的程度"给每个人重新分档——
     越靠近 50（越像"万能人设"）给越小 sigma，越极端（featured）给越大 sigma。
     这样 sigma 补偿了位置带来的偏差，同时保持档位四档齐全（引擎逐档断言需要）。
     人数按 common≈1/3、rare≈1/6、limited≈1/4、hidden≈1/4 分配。

注意：这只改 rarity 标签与其附带的 sigma，不改 dims、不改简介、不改算法。
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "personas.json")
DIMS = ["EE", "ST", "AC", "HX", "RB", "SR"]

# 目标占比
MIX = [("hidden", 0.25), ("limited", 0.25), ("rare", 0.17), ("common", 0.33)]


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    personas = data["personas"]
    n = len(personas)

    # 按偏离中心升序：最"平庸"的排前面（→ 给 hidden 小 sigma，最难被选中）
    ordered = sorted(personas, key=lambda p: sum(abs(p["dims"][d] - 50) for d in DIMS))

    counts = {k: int(round(n * r)) for k, r in MIX}
    diff = n - sum(counts.values())
    counts["common"] += diff

    idx = 0
    plan = []
    for rarity, _ in MIX:
        for _ in range(counts[rarity]):
            if idx >= n:
                break
            plan.append((ordered[idx]["id"], rarity))
            idx += 1
    while idx < n:
        plan.append((ordered[idx]["id"], "common"))
        idx += 1

    new_rarity = dict(plan)
    changed = 0
    for p in personas:
        r = new_rarity[p["id"]]
        if p["rarity"] != r:
            changed += 1
        p["rarity"] = r
        p["rarityBasis"] = "主控按六维位置重新分档：越靠近中心给越小 sigma，用于抵消高斯核的位置偏差"

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    from collections import Counter

    print(f"重分档 {changed}/{n} 人")
    print("新分布:", dict(Counter(p["rarity"] for p in personas)))


if __name__ == "__main__":
    main()
