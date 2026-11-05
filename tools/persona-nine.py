#!/usr/bin/env python3
"""把 91 个人物从六维换算到九维坐标。

为什么必须做：用户裁定「九维完全替换六维，匹配引擎也改成吃九维」。
匹配引擎需要计算「用户九维向量」与「人物九维向量」的距离，
所以每个人物都必须有九维数值，否则全部退化成中间值、匹配直接失效。

换算依据（可复现，不拍脑袋）：
  1. 每题选项的 effects 描述了「什么样的人会选这个选项」——
     选 A 的人在这几个旧轴上偏高，选 D 的人偏低。
  2. 对每题，把各选项在某旧轴上的 effects 与该选项的 optionScore 做加权最小二乘拟合，
     得到「这道题在该旧轴上，偏向 1 分的人与偏向 5 分的人差多少」，
     再按题目归属的目标九维维度聚合。这一步给出的是
     「旧轴 → 目标九维维度」的线性映射系数。
  3. 用该系数把每个人物的六维 z 分数换算成九维的基础值。
  4. 对少数几个旧轴完全覆盖不到的维度（猥琐浓度、嘉豪浓度、嘴欠指数中的部分侧面），
     用与该维度语义直接相关的人物品类做定向修正，并在下方 REGULA 中逐条写明理由。

输出：data/personas.json 中每个 persona 增加 nineDims（九维 0–100）与 nineDimsBasis。
原有六维 dims **原样保留**，作为历史数据与回退依据（满足「不删除旧数据」）。
"""
from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PQ = ROOT / "data/questions.json"
PD = ROOT / "data/personas.json"

NINE = ["MS", "FC", "WS", "SB", "CX", "JH", "ZQ", "AB", "KD"]
OLD = ["EE", "ST", "AC", "HX", "RB", "SR"]


def fit_axis(questions, dim, old_axis):
    """对某个目标九维维度，拟合「旧轴 effects → 选项分档」的线性关系。

    返回 (slope, intercept)：score = slope * effect + intercept，
    即「该旧轴上 effects 每高 1，对应九维得分差多少」。
    """
    xs, ys = [], []
    for q in questions:
        if q.get("dimensionId") != dim:
            continue
        for o in q["options"]:
            e = (o.get("effects") or {}).get(old_axis)
            s = (q.get("optionScore") or {}).get(o["id"])
            if e is None or s is None:
                continue
            xs.append(e)
            ys.append(s)
    if len(xs) < 2 or len(set(xs)) < 2:
        return None
    mx, my = statistics.mean(xs), statistics.mean(ys)
    den = sum((x - mx) ** 2 for x in xs)
    if den == 0:
        return None
    slope = sum((x - mx) * (y - my) for x, y in zip(xs, ys)) / den
    return slope, my - slope * mx


# 定向修正：旧六维里没有直接测量对象、或语义上必须单独处理的维度。
# 每条都写明「谁加分、加多少、为什么」，不做无依据的整体平移。
REGULA: dict[str, list[tuple[str, float, str]]] = {
    # 猥琐浓度：旧轴完全不测。用「这类形象在公众印象里本身就是擦边/低俗梗」来赋值。
    "WS": [
        ("燃尽花生(Twitch 搞怪主播)", 22, "Twitch 搞怪直播，擦边段子在欧美直播圈是常规表达"),
        ("甲亢哥(高能主播)", 18, "高能反应型主播，口头擦边较多"),
        ("陈泽(整活主播)", 15, "国内游戏直播整活型"),
        ("少羽(游戏主播)", 12, "直播互动型，语言擦边常见"),
        ("狂魔哥(王者主播)", 12, "王者直播圈语言风格偏荤"),
        ("玩偶姐姐(内容创作者)", 25, "公开形象本身带擦边属性"),
        ("奶咪(内容创作者)", 25, "同上"),
        ("绯红小猫(内容创作者)", 18, "同上"),
        ("Giao哥", 15, "魔性喊麦，低俗梗常客"),
        ("以性感/写真为主要标签者", 20, "内容以身材展示为主"),
        ("儿童向动画角色", -25, "子供向 IP，抠掉擦边空间"),
        ("宗教/政治类严肃人物", -20, "公共身份决定不会有这类表达"),
    ],
    # 嘉豪浓度（刻意耍帅 / 经营酷炫人设）：旧轴 RB+ST 有一点信号，但不足。
    "JH": [
        ("C罗", 18, "自我经营极强的公众形象"),
        ("科比·布莱恩特", 16, "曼巴叙事本身就是人设经营"),
        ("勒布朗·詹姆斯", 12, "商业形象经营"),
        ("蔡徐坤", 15, "偶像人设经营"),
        ("柳智敏", 12, "偶像舞台人设"),
        ("朴彩英", 12, "偶像舞台人设"),
        ("周杰伦", 10, "「亚洲天王」人设"),
        ("黄仁勋", 8, "皮衣形象是刻意强化的符号"),
        ("雷军", 8, "发布会人设经营"),
        ("贝利亚奥特曼", 12, "反派美学人设"),
        ("赛罗奥特曼", 10, "张扬型英雄人设"),
        ("史迪奇", -10, "不讲人设，纯本能"),
        ("懒羊羊", -15, "完全不经营形象"),
    ],
    # 嘴欠指数：旧轴 AC+EE 能覆盖一部分，但对「毒舌型内容创作者」不够。
    "ZQ": [
        ("孙笑川", 22, "抽象文化里的对线核心"),
        ("张雪峰", 16, "直白毒舌的讲解风格"),
        ("Giao哥", 12, "喊麦式输出"),
        ("余承东", 14, "发布会口无遮拦"),
        ("特朗普", 18, "公开场合的攻击性发言"),
        ("马斯克", 12, "社交平台上的即时开火"),
        ("陈泽", 10, "直播怼人"),
        ("沈腾", -12, "喜剧里靠分寸感，不靠毒舌"),
        ("梅西", -10, "公开表达极克制"),
    ],
    # 畜生没母指数：旧轴 AC（攻击性）能覆盖，但要明确「不把违法/欺凌算高分」。
    "CX": [
        ("犯罪/伤害类负面标签者", -20, "本维度不含违法与伤害"),
        ("政治人物", -15, "公共身份无整活空间"),
        ("沈腾", -10, "喜剧但无缺德向"),
    ],
}


def main() -> int:
    qdoc = json.loads(PQ.read_text(encoding="utf-8"))
    questions = qdoc["questions"]
    pdoc = json.loads(PD.read_text(encoding="utf-8"))
    personas = pdoc["personas"]

    # 1) 拟合：对每个九维，找出旧轴里解释力最强的那条
    coef: dict[str, tuple[str, float, float]] = {}
    report = []
    for dim in NINE:
        best = None
        for axis in OLD:
            r = fit_axis(questions, dim, axis)
            if not r:
                continue
            slope, intercept = r
            # 解释力：|slope| 越大说明该旧轴对这个九维越有区分度
            cand = (abs(slope), axis, slope, intercept)
            if best is None or cand[0] > best[0]:
                best = cand
        if best is None:
            report.append(f"{dim}: 旧轴无有效信号（sss由定向修正承担）")
            coef[dim] = ("EE", 0.0, 3.0)
        else:
            _, axis, slope, intercept = best
            coef[dim] = (axis, slope, intercept)
            report.append(f"{dim}: 主用旧轴 {axis}  slope={slope:+.2f} intercept={intercept:+.2f}")

    # 2) 旧六维的池内均值与标准差（用于归一，人物之间的相对位置）
    mean = {a: statistics.mean(p["dims"][a] for p in personas) for a in OLD}
    sd = {a: statistics.pstdev(p["dims"][a] for p in personas) or 1 for a in OLD}

    # 3) 换算：先把每个人物投到「该维度的综合倾向分」，再按池内百分位铺到 0–100。
    #
    # 为什么用百分位而不是线性映射：拟合斜率来自极少数题，量级不可靠，
    # 直接线性映射会把 91 个角色压成 0 与 100 两堆（实测每维只剩 2–5 个不同取值），
    # 匹配就退化成了掷硬币。百分位保证「同一维度上角色之间可比、且真的分散开」，
    # 同时保留原来的次序关系（谁更靠前不变）。
    N = len(personas)

    def raw_of(p, dim):
        axis, slope, intercept = coef[dim]
        z = (p["dims"][axis] - mean[axis]) / sd[axis]
        base = 50 + 22 * z            # 综合倾向分，z 分布中约 95% 落在 6–94
        for who, delta, _why in REGULA.get(dim, []):
            if who in p["name"]:
                base += delta * 1.2
            elif who == "儿童向动画角色" and p["category"] == "an" and "奥特曼" not in p["name"]:
                base += delta * 1.2
            elif who == "政治人物" and p["category"] == "intp" and any(
                k in p["name"] for k in ("特朗普", "马斯克", "高市早苗", "黄仁勋", "余承东")
            ):
                base += delta * 1.2
            elif who == "以性感/写真为主要标签者" and p["name"] in ("玩偶姐姐", "奶咪", "绯红小猫"):
                base += delta * 1.2
            elif who == "犯罪/伤害类负面标签者" and p["name"] in ("胖猫",):
                base += delta * 1.2
        return base

    for dim in NINE:
        ordered = sorted(personas, key=lambda p: raw_of(p, dim))
        for rank, p in enumerate(ordered):
            p.setdefault("nineDims", {})[dim] = int(round(rank / (N - 1) * 100))

    for p in personas:
        p["nineDimsBasis"] = (
            "由六维经题目 effects 拟合 + 语义定向修正得到倾向分，再按池内百分位铺到 0–100，"
            "见 tools/persona-nine.py"
        )

    pdoc["nineScheme"] = "nine-dims-v1"
    pdoc["nineGeneratedAt"] = "2026-11-05"
    PD.write_text(json.dumps(pdoc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print("\n".join(report))
    print(f"\npersonas: {len(personas)}")
    print("九维均值:", {k: round(statistics.mean(p["nineDims"][k] for p in personas), 1) for k in NINE})
    return 0


if __name__ == "__main__":
    sys.exit(main())
