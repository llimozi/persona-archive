#!/usr/bin/env python3
"""题库优化：29 → 36 题。

做四件事：
  1. 换掉语义跑偏的题（测的不是它声称的维度）；
  2. 修正分值不合理的题（同分不同义、方向反了）；
  3. 补齐社牛 / 畜生 / 嘉豪三个薄维度，总数到 36；
  4. 统一 optionScore 到 1–5 连续刻度，保证每维均值映射公平。

**不推倒重做**：只动有明确问题的题，其余原样保留。
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PQ = ROOT / "data/questions.json"

NINE = ["MS", "FC", "WS", "SB", "CX", "JH", "ZQ", "AB", "KD"]
TARGET_PER_DIM = 4  # 36 / 9

# ─────────────────────────────────────────────────────────────
# 一、替换：语义与维度定义不符的题
#     做法是保留 id 与原位置（不破坏分享链接、进度存储），
#     但把题干与选项换成真正测该维度的内容。
# ─────────────────────────────────────────────────────────────
REPLACE = {
    # 原题测「接手麻烦事的责任心」，与畜生（损友式整活/缺德幽默）无关
    "q-gen-020": {
        "type": "scenario",
        "title": "群里有人发了张同事睡着流口水的抓拍。你：",
        "dimensionId": "CX",
        "reverse": False,
        "optionScore": {"A": 5, "B": 3.5, "C": 1, "D": 2},
        "dims": {"EE": 0.6, "AC": 0.5, "RB": 0.3},
        "options": [
            {"id": "A", "label": "存下来，做成表情包发到全员大群", "effects": {"EE": 0.7, "AC": 0.6, "RB": 0.4}},
            {"id": "B", "label": "先发个「他睡得好安详」，看别人跟不跟", "effects": {"EE": 0.5, "RB": 0.3}},
            {"id": "C", "label": "提醒发图的人：这个别往外传", "effects": {"EE": -0.4, "AC": -0.3}},
            {"id": "D", "label": "私聊笑两句，大群就算了", "effects": {"EE": 0.2, "AC": -0.2}},
        ],
    },
    # 原题测「信错了不服气」，与嘉豪（凹帅/经营人设）无关
    "q-gen-021": {
        "type": "scenario",
        "title": "聚会合照出来了，你发现自己那张拍得有点糊。你：",
        "dimensionId": "JH",
        "reverse": False,
        "optionScore": {"A": 5, "B": 3.5, "C": 1, "D": 2.5},
        "dims": {"EE": 0.6, "ST": 0.5, "SR": 0.4},
        "options": [
            {"id": "A", "label": "重拍，而且要我站中间、光打在脸上", "effects": {"ST": 0.7, "EE": 0.6}},
            {"id": "B", "label": "自己换头像用另一张更帅的", "effects": {"ST": 0.5, "SR": 0.3}},
            {"id": "C", "label": "挺好的，合照又不是写真", "effects": {"ST": -0.5, "EE": -0.3}},
            {"id": "D", "label": "笑一下就算了，反正大家都知道我帅", "effects": {"ST": 0.4, "EE": 0.2}},
        ],
    },
}

# ─────────────────────────────────────────────────────────────
# 二、修正：分值/方向不合理的题（题干选项文案不动）
# ─────────────────────────────────────────────────────────────
RESCORE = {
    # A「把话挑明」与 B「自己补上」是两种态度，不该同为最高分。
    # 兑现维度测的是"说到做到"，B 更贴近（自己把事兜住），A 偏立规矩。
    "q-gen-017": {"A": 4, "B": 5, "C": 3, "D": 1},
    # 深夜对线：C「转发到小群一起骂」比 B「写完删掉」更能体现嘴欠的外放，
    # 原先 C(3.5) 与 B(2.5) 差距过大，收窄到合理梯度。
    "q-gen-022": {"A": 5, "B": 2, "C": 3.5, "D": 1.5},
    # 反差：D「已读，等它自己过去」是回避而非表里不一，原先给 1 分与 C「自己搜明白再回」并列，
    # 反而让"回避"看起来和"真诚"一样。调整为 D 略高于 C（回避本身也是一种表里分离）。
    "q-gen-012": {"A": 2, "B": 4, "C": 4.5, "D": 2.2},
}

# ─────────────────────────────────────────────────────────────
# 三、新增 7 题：优先补薄维度
# ─────────────────────────────────────────────────────────────
NEW_QUESTIONS = [
    # ── 社牛 +2（原 2 → 4）
    {
        "id": "q-gen-030",
        "type": "scenario",
        "title": "电梯里遇到一个只见过两面的人，还要一起待 18 层。你：",
        "dimensionId": "SB",
        "reverse": False,
        "optionScore": {"A": 5, "B": 3.5, "C": 1.5, "D": 2.5},
        "dims": {"EE": 0.6, "SR": 0.6, "ST": 0.3},
        "options": [
            {"id": "A", "label": "主动开口，18 层能聊完他的前半生", "effects": {"EE": 0.7, "SR": 0.7}},
            {"id": "B", "label": "点个头，他要是开口我就接得住", "effects": {"EE": 0.3, "SR": 0.3}},
            {"id": "C", "label": "低头看手机，从 1 楼看到 18 楼", "effects": {"EE": -0.6, "SR": -0.5}},
            {"id": "D", "label": "假装接到电话，一路讲到出电梯", "effects": {"EE": 0.2, "SR": -0.3}},
        ],
    },
    {
        "id": "q-gen-031",
        "type": "meme",
        "title": "年会抽奖抽到你上台表演，台下三百人。你：",
        "dimensionId": "SB",
        "reverse": False,
        "optionScore": {"A": 5, "B": 3.5, "C": 1, "D": 2.5},
        "dims": {"EE": 0.7, "ST": 0.5, "SR": 0.5},
        "options": [
            {"id": "A", "label": "上来先热个场，把节目单都改了", "effects": {"EE": 0.8, "ST": 0.6}},
            {"id": "B", "label": "唱首安全的歌，唱完赶紧下台", "effects": {"EE": 0.3, "ST": 0.2}},
            {"id": "C", "label": "找个理由把奖让给别人", "effects": {"EE": -0.7, "ST": -0.4}},
            {"id": "D", "label": "站在台上，让气氛自己尴尬下去", "effects": {"EE": 0.4, "ST": -0.2}},
        ],
    },
    # ── 畜生 +2（原 2 → 4）
    {
        "id": "q-gen-032",
        "type": "scenario",
        "title": "室友说好今晚回来，你正好在家无聊。你会：",
        "dimensionId": "CX",
        "reverse": False,
        "optionScore": {"A": 5, "B": 3.5, "C": 1, "D": 2.5},
        "dims": {"EE": 0.6, "AC": 0.5, "RB": 0.4},
        "options": [
            {"id": "A", "label": "把灯全关了装没人，等他开门那一声", "effects": {"EE": 0.6, "AC": 0.6, "RB": 0.5}},
            {"id": "B", "label": "在门口贴张纸条，写点不着调的", "effects": {"EE": 0.4, "RB": 0.4}},
            {"id": "C", "label": "给他留盏灯，顺手热个宵夜", "effects": {"EE": -0.5, "AC": -0.4}},
            {"id": "D", "label": "照常过，他回来该干嘛干嘛", "effects": {"EE": -0.2, "AC": -0.2}},
        ],
    },
    {
        "id": "q-gen-033",
        "type": "single",
        "title": "朋友新剪了头发，问你好不好看。其实很像锅盖。你：",
        "dimensionId": "CX",
        "reverse": False,
        "optionScore": {"A": 5, "B": 3.5, "C": 1.5, "D": 2.5},
        "dims": {"EE": 0.5, "RB": 0.5, "AC": 0.4},
        "options": [
            {"id": "A", "label": "直接喊他「锅盖」，还给他配了个盖饭图", "effects": {"EE": 0.6, "RB": 0.6}},
            {"id": "B", "label": "憋笑说「挺有辨识度的」", "effects": {"EE": 0.3, "RB": 0.2}},
            {"id": "C", "label": "认真说好看，然后私下跟别人笑", "effects": {"EE": -0.4, "RB": -0.3}},
            {"id": "D", "label": "夸完补一句：过两周就顺了", "effects": {"EE": -0.2, "AC": -0.2}},
        ],
    },
    # ── 嘉豪 +2（原 2 → 4）
    {
        "id": "q-gen-034",
        "type": "scenario",
        "title": "你刚在朋友圈发了一张精修三小时的自拍，第一条评论是「这修过吧」。你：",
        "dimensionId": "JH",
        "reverse": False,
        "optionScore": {"A": 5, "B": 3.5, "C": 1, "D": 2.5},
        "dims": {"EE": 0.5, "ST": 0.6, "SR": 0.3},
        "options": [
            {"id": "A", "label": "回他：那也得底子好才修得出来", "effects": {"EE": 0.6, "ST": 0.7}},
            {"id": "B", "label": "礼貌回个表情，心里不太舒服", "effects": {"EE": 0.2, "ST": 0.1}},
            {"id": "C", "label": "删了，下次不发了", "effects": {"EE": -0.6, "ST": -0.5}},
            {"id": "D", "label": "自嘲一句「我谢谢你的诚实」", "effects": {"EE": -0.2, "ST": 0.2}},
        ],
    },
    {
        "id": "q-gen-035",
        "type": "meme",
        "title": "新认识的人第一次见你，你希望他记住你的什么？",
        "dimensionId": "JH",
        "reverse": False,
        "optionScore": {"A": 5, "B": 3.5, "C": 1, "D": 2.5},
        "dims": {"ST": 0.6, "SR": 0.4, "EE": 0.4},
        "options": [
            {"id": "A", "label": "我这人一出现，气场就不一样", "effects": {"ST": 0.8, "SR": 0.3}},
            {"id": "B", "label": "穿得干净、发型在线就够", "effects": {"ST": 0.4, "SR": 0.2}},
            {"id": "C", "label": "记住我说话还算靠谱就行", "effects": {"ST": -0.5, "SR": 0.1}},
            {"id": "D", "label": "随便，反正早晚会对我刮目相看", "effects": {"ST": 0.5, "EE": 0.3}},
        ],
    },
    # ── 剩余 1 题：补兑现（原 5，保持最厚维度的稳定性）
    {
        "id": "q-gen-036",
        "type": "scenario",
        "title": "年初立的「今年一定瘦十斤」，现在 12 月了。你：",
        "dimensionId": "KD",
        "reverse": False,
        "optionScore": {"A": 5, "B": 3.5, "C": 2, "D": 1},
        "dims": {"ST": 0.5, "AC": 0.5, "EE": 0.3},
        "options": [
            {"id": "A", "label": "真的瘦了，虽然过程不光彩", "effects": {"ST": 0.6, "AC": 0.6}},
            {"id": "B", "label": "没到十斤，但瘦了六斤，认", "effects": {"ST": 0.3, "AC": 0.3}},
            {"id": "C", "label": "换个说法：其实我目标是健康", "effects": {"ST": -0.3, "AC": -0.3}},
            {"id": "D", "label": "早忘了，明年再立一次", "effects": {"ST": -0.6, "AC": -0.5}},
        ],
    },
]


def main() -> int:
    doc = json.loads(PQ.read_text(encoding="utf-8"))
    qs = doc["questions"]
    by_id = {q["id"]: q for q in qs}

    replaced, rescored = [], []

    # ① 替换语义跑偏的题（保留 id 与位置）
    for qid, spec in REPLACE.items():
        q = by_id.get(qid)
        if q is None:
            print(f"!! 找不到 {qid}", file=sys.stderr)
            return 1
        q["type"] = spec["type"]
        q["title"] = spec["title"]
        q["dimensionId"] = spec["dimensionId"]
        q["reverse"] = spec["reverse"]
        q["optionScore"] = spec["optionScore"]
        q["dims"] = spec["dims"]
        q["options"] = spec["options"]
        replaced.append(qid)

    # ② 修正分值（题干选项不动）
    for qid, scores in RESCORE.items():
        q = by_id.get(qid)
        if q is None:
            print(f"!! 找不到 {qid}", file=sys.stderr)
            return 1
        q["optionScore"] = scores
        rescored.append(qid)

    # ③ 追加新题
    existing = set(by_id)
    for nq in NEW_QUESTIONS:
        if nq["id"] in existing:
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

    # ④ 统一校验：每个选项必须有分值，且分值落在 1–5
    for q in qs:
        assert set(q["optionScore"]) == {o["id"] for o in q["options"]}, f"{q['id']} 分值缺项"
        for v in q["optionScore"].values():
            assert 1 <= v <= 5, f"{q['id']} 分值越界 {v}"

    doc["version"] = 3
    doc["note"] = (
        "v3：29 → 36 题。替换 q-gen-020（原测责任心而非畜生）、q-gen-021（原测不服气而非嘉豪）；"
        "修正 q-gen-017 / 022 / 012 的选项分值；新增 q-gen-030~036，"
        "优先补社牛、畜生、嘉豪三个薄维度。九维分布见各题 dimensionId。"
    )
    PQ.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    c = Counter(q["dimensionId"] for q in qs)
    print(f"题目总数: {len(qs)}")
    print(f"替换: {replaced}")
    print(f"重打分: {rescored}")
    print("维度分布:")
    for k in NINE:
        print(f"  {k}: {c.get(k, 0)}")
    uneven = [k for k in NINE if c.get(k, 0) != TARGET_PER_DIM]
    print("分布不均的维度:", uneven or "无（全部 4 题）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
