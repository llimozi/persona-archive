"""把 25 题的"主导维度"摊平到每维约 4 题。

现有主导维度分布：RB 7 / HX 5 / EE 4 / AC 4 / ST 3 / SR 2，
RB 过重、SR 过轻。只调每题的 `dims`（题目偏重声明），不动任何 options.effects
（选项计分不变，匹配算法不受影响），让引擎的题目权重口径回到均衡。

用法：python tools/rebalance-question-dims.py
"""
import json
import os
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "questions.json")

# 目标主导维度（按题号顺序分配，每维 4~5 题，且与该题选项的实际 effects 倾向一致）
LEAD = {
    "q-gen-001": "HX",
    "q-gen-002": "EE",
    "q-gen-003": "ST",
    "q-gen-004": "RB",
    "q-gen-005": "SR",
    "q-gen-006": "AC",
    "q-gen-007": "EE",
    "q-gen-008": "HX",
    "q-gen-009": "SR",
    "q-gen-010": "AC",
    "q-gen-011": "ST",
    "q-gen-012": "HX",
    "q-gen-013": "RB",
    "q-gen-014": "ST",
    "q-gen-015": "SR",
    "q-gen-016": "ST",
    "q-gen-017": "AC",
    "q-gen-018": "EE",
    "q-gen-019": "RB",
    "q-gen-020": "AC",
    "q-gen-021": "HX",
    "q-gen-022": "EE",
    "q-gen-023": "SR",
    "q-gen-024": "RB",
    "q-gen-025": "HX",
}


def main():
    data = json.load(open(DATA, encoding="utf-8"))

    for q in data["questions"]:
        lead = LEAD.get(q["id"])
        if not lead:
            continue
        dims = dict(q.get("dims", {}))
        # 主导维度设为 1.0（该题最看重这一维），其余保持原值但不超过主导
        dims[lead] = 1.0
        for d, v in list(dims.items()):
            if d != lead:
                dims[d] = min(v, 0.7)
        q["dims"] = dims

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    lead_count = Counter()
    for q in data["questions"]:
        dm = q.get("dims", {})
        if dm:
            lead_count[max(dm, key=dm.get)] += 1
    print("主导维度分布:", dict(lead_count))


if __name__ == "__main__":
    main()
