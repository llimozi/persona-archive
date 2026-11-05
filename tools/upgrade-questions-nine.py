#!/usr/bin/env python3
"""题库九维化：给 25 道现有题补齐维度归属，并为缺失维度补题。

做两件事：
1. 给每道题写入九维元数据（dimensionId / reverse / optionScore / questionWeight），
   **保留原有的 title / options.label / effects / dims**，不改交互、不改文案。
2. 只为**没有足够题目**的维度补题（用户要求「只为缺失维度补充必要题目」）。

被替换的维度代码说明：旧六维只有 6 个轴，九维有 9 个，其中
  猥琐浓度（WS）在旧题库里完全没有对应题——旧轴里没有这一测量对象。
所以 WS 是唯一从零开始建的维度，补 3 题；畜生没母（CX）旧题库只有 1 题，补 1 题。

补题的 effects 仍按旧六维口径填写，保证角色匹配引擎继续可用（见 persona-nine.py）。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data/questions.json"

# 补题：只补缺口维度。id 继续沿用 q-gen-0xx 序列，避免破坏既有 id 约定。
NEW_QUESTIONS = [
    {
        "id": "q-gen-026",
        "type": "meme",
        "title": "朋友发来一张模棱两可的图，你第一眼盯住的是：",
        "dimensionId": "WS",
        "reverse": False,
        "optionScore": {"A": 4.5, "B": 3, "C": 1, "D": 2},
        "dims": {"EE": 0.4, "AC": 0.6, "RB": 0.4},
        "options": [
            {"id": "A", "label": "先找图里最容易想歪的那个细节", "effects": {"EE": 0.5, "AC": 0.6}},
            {"id": "B", "label": "看两秒，顺手补一句带颜色的解读", "effects": {"EE": 0.6, "AC": 0.4}},
            {"id": "C", "label": "认真看看是不是 P 的", "effects": {"AC": -0.4, "HX": 0.5}},
            {"id": "D", "label": "根本没往那方面想", "effects": {"EE": -0.5, "AC": -0.5}},
        ],
    },
    {
        "id": "q-gen-027",
        "type": "scenario",
        "title": "一群人吃饭，有人开了个擦边的玩笑。你：",
        "dimensionId": "WS",
        "reverse": False,
        "optionScore": {"A": 5, "B": 3.5, "C": 1.5, "D": 2.5},
        "dims": {"EE": 0.6, "ST": 0.5, "SR": 0.5},
        "options": [
            {"id": "A", "label": "顺着往下接，还能再往上抬一档", "effects": {"EE": 0.7, "ST": 0.5}},
            {"id": "B", "label": "跟着笑，但不接话", "effects": {"EE": 0.3, "SR": 0.4}},
            {"id": "C", "label": "有点尴尬，低头夹菜", "effects": {"EE": -0.6, "SR": -0.3}},
            {"id": "D", "label": "听得懂，但更想看别人怎么接", "effects": {"EE": -0.2, "HX": 0.5}},
        ],
    },
    {
        "id": "q-gen-028",
        "type": "single",
        "title": "你脑子里那些不太正经的念头，通常：",
        "dimensionId": "WS",
        "reverse": False,
        "optionScore": {"A": 4.5, "B": 3, "C": 2, "D": 1},
        "dims": {"EE": 0.5, "ST": 0.4, "RB": 0.4},
        "options": [
            {"id": "A", "label": "三天之内一定会说出去", "effects": {"EE": 0.7, "RB": 0.4}},
            {"id": "B", "label": "分人，看对面扛不扛得住", "effects": {"EE": 0.3, "SR": 0.3}},
            {"id": "C", "label": "基本停在脑子里，不太往外说", "effects": {"EE": -0.6, "ST": -0.3}},
            {"id": "D", "label": "很少有，我脑回路挺干净", "effects": {"EE": -0.4, "RB": -0.5}},
        ],
    },
    {
        "id": "q-gen-029",
        "type": "scenario",
        "title": "同事的椅子被人悄悄挪歪了，大家都看见了。你：",
        "dimensionId": "CX",
        "reverse": False,
        "optionScore": {"A": 5, "B": 3.5, "C": 1.5, "D": 2.5},
        "dims": {"EE": 0.5, "AC": 0.5, "RB": 0.5},
        "options": [
            {"id": "A", "label": "顺手再推远一点，等他坐空", "effects": {"AC": 0.6, "RB": 0.6}},
            {"id": "B", "label": "不动手，但已经想好怎么起哄", "effects": {"EE": 0.5, "RB": 0.4}},
            {"id": "C", "label": "帮他挪回来，别摔着", "effects": {"AC": -0.3, "SR": 0.3}},
            {"id": "D", "label": "看一眼，不掺和", "effects": {"EE": -0.4, "AC": -0.4}},
        ],
    },
]

# 现有 25 题的九维元数据（与 src/shared/question-map.ts 逐条对应）
META = {
    "q-gen-001": ("AB", False, {"A": 4, "B": 5, "C": 2, "D": 1.5}),
    "q-gen-002": ("FC", False, {"A": 4, "B": 1.5, "C": 4.5, "D": 3}),
    "q-gen-003": ("SB", False, {"A": 5, "B": 2, "C": 1.5, "D": 4.5}),
    "q-gen-004": ("KD", False, {"A": 4.5, "B": 2}),
    "q-gen-005": ("MS", False, {"A": 2, "B": 3, "C": 4, "D": 3.5}),
    "q-gen-006": ("KD", True, {"A": 3, "B": 4.5, "C": 4, "D": 1}),
    "q-gen-007": ("FC", False, {"A": 4, "B": 3, "C": 1, "D": 2.5}),
    "q-gen-008": ("AB", False, {"A": 3, "B": 5, "C": 2, "D": 1}),
    "q-gen-009": ("KD", False, {"A": 3.5, "B": 4.5}),
    "q-gen-010": ("KD", False, {"A": 4.5, "B": 4, "C": 3, "D": 1}),
    "q-gen-011": ("ZQ", False, {"A": 4, "B": 2, "C": 3, "D": 1}),
    "q-gen-012": ("FC", False, {"A": 2, "B": 3.5, "C": 4, "D": 1}),
    "q-gen-013": ("ZQ", False, {"A": 4.5, "B": 1.5, "C": 2.5, "D": 3.5}),
    "q-gen-014": ("MS", True, {"A": 1, "B": 4.5}),
    "q-gen-015": ("SB", False, {"A": 4.5, "B": 2.5, "C": 1, "D": 3}),
    "q-gen-016": ("JH", False, {"A": 5, "B": 1.5, "C": 1, "D": 2.5}),
    "q-gen-017": ("KD", False, {"A": 4.5, "B": 4.5, "C": 3, "D": 1.5}),
    "q-gen-018": ("MS", False, {"A": 3.5, "B": 1.5, "C": 2.5, "D": 2}),
    "q-gen-019": ("ZQ", False, {"A": 5, "B": 2, "C": 1, "D": 3}),
    "q-gen-020": ("CX", False, {"A": 4, "B": 3, "C": 2, "D": 3.5}),
    "q-gen-021": ("JH", False, {"A": 2.5, "B": 1.5, "C": 3, "D": 4.5}),
    "q-gen-022": ("ZQ", False, {"A": 5, "B": 2.5, "C": 3.5, "D": 2}),
    "q-gen-023": ("MS", False, {"A": 1.5, "B": 4.5}),
    "q-gen-024": ("ZQ", False, {"A": 3.5, "B": 4, "C": 1, "D": 4.5}),
    "q-gen-025": ("AB", False, {"A": 3.5, "B": 2, "C": 1.5, "D": 4.5}),
}


def main() -> int:
    doc = json.loads(DATA.read_text(encoding="utf-8"))
    qs = doc["questions"]

    existing_ids = {q["id"] for q in qs}
    for q in qs:
        meta = META.get(q["id"])
        if not meta:
            print(f"!! 未映射的题 {q['id']}", file=sys.stderr)
            return 1
        dim, reverse, scores = meta
        q["dimensionId"] = dim
        q["reverse"] = reverse
        q["optionScore"] = scores
        q["questionWeight"] = 1
        # 校验：每个选项都必须有分值
        assert set(q["optionScore"]) == {o["id"] for o in q["options"]}, q["id"]

    for nq in NEW_QUESTIONS:
        if nq["id"] in existing_ids:
            print(f"!! id 冲突 {nq['id']}", file=sys.stderr)
            return 1
        qs.append({
            "id": nq["id"],
            "type": nq["type"],
            "title": nq["title"],
            "dimensionId": nq["dimensionId"],
            "reverse": nq["reverse"],
            "optionScore": nq["optionScore"],
            "questionWeight": 1,
            "dims": nq["dims"],
            "options": nq["options"],
        })

    doc["version"] = 2
    doc["scheme"] = "nine-dims-v1"
    doc["note"] = (
        "v2：九维坐标体系（nine-dims-v1）。坐标名与四档文案见 src/shared/nine-dims.ts。"
        "每题新增 dimensionId / reverse / optionScore / questionWeight，作为九维计分依据；"
        "保留原有 title / options.label / effects / dims，四选一交互不变。"
        "现有 25 题重新归属九维后，猥琐浓度为 0 题，故补 q-gen-026~028；"
        "畜生没母只有 1 题，补 q-gen-029。这些是唯一为凑维度而新增的题。"
    )
    DATA.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    from collections import Counter
    c = Counter(q["dimensionId"] for q in qs)
    print("questions:", len(qs))
    for k in ["MS", "FC", "WS", "SB", "CX", "JH", "ZQ", "AB", "KD"]:
        print(f"  {k}: {c.get(k, 0)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
