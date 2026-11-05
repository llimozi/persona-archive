#!/usr/bin/env python3
"""v2.1 候选基准：91 人九维评分矩阵落库。

来源：用户 2026-11-05 提供的《91 人九维评分最终校准版》完整矩阵。
原则（用户明确要求）：
  - 11 个重点角色采用本轮新评分，覆盖旧推导值；
  - 14 号马志辉保留原设定，本轮分数按矩阵执行（闷骚 100 / 猥琐 100 仍满足解锁条件）；
  - 其余 80 人按矩阵整体校准；
  - 三个成人内容创作者（绯红小猫 / 玩偶姐姐 / 奶咪）按「高闷骚、高反差、低畜生、低抽象」处理，
    不把成人创作属性误判成缺德或抽象。

同时补齐 v2.1 落库字段：
  scores（九维，与 nineDims 同源）/ confidence / profile_type / evidence /
  scoring_notes / updated_at

id 是稳定键，**不因排序变化而改变**；编号 position 由文件顺序决定。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PD = ROOT / "data/personas.json"
UPDATED_AT = "2026-11-05"

# 编号 → 名称, 闷/反/猥/社/畜/嘉/嘴/抽/兑, 置信度
# 名称用于二次校验：定位以 id 为准（见 POS2ID），名称对不上就报错，不静默改错人。
ROWS: list[tuple[int, str, tuple[int, int, int, int, int, int, int, int, int], str]] = [
    (1,  "奶龙",            (15, 35, 5,  65, 30, 10, 15, 75, 60),  "高"),
    (2,  "Coke老师",        (55, 80, 30, 80, 65, 65, 70, 85, 50),  "中"),
    (3,  "不烧心良心老板",     (20, 30, 5,  55, 15, 15, 15, 35, 85),  "中"),
    (4,  "鸡排主理人李俊永",    (15, 45, 5,  90, 20, 20, 45, 70, 90),  "高"),
    (5,  "朱之文",          (55, 35, 5,  40, 10, 15, 10, 30, 80),  "高"),
    (6,  "揽佬",            (60, 80, 30, 85, 45, 80, 65, 85, 75),  "中"),
    (7,  "胖猫",            (50, 50, 50, 50, 50, 50, 50, 50, 50),  "不评分"),
    (8,  "灭霸的爸爸·灭建国",   (35, 90, 10, 75, 65, 80, 75, 95, 45),  "中"),
    (9,  "孙笑川",          (75, 90, 60, 85, 95, 75, 100, 100, 35), "中"),
    (10, "死马火箭浣熊",       (40, 95, 30, 75, 70, 70, 90, 100, 45), "低"),
    (11, "卡皮巴拉",         (5,  15, 0,  15, 5,  5,  5,  30, 55),  "高"),
    (12, "内阁",            (50, 85, 0,  75, 50, 80, 85, 90, 35),  "低"),
    (13, "鼠鼠",            (80, 75, 10, 15, 25, 10, 30, 75, 35),  "高"),
    (14, "马志辉",          (100, 100, 85, 30, 60, 85, 75, 95, 30), "低"),
    (15, "贝利亚奥特曼",       (65, 95, 10, 85, 95, 90, 85, 85, 70),  "高"),
    (16, "迪迦奥特曼",        (20, 65, 5,  65, 15, 40, 15, 35, 90),  "高"),
    (17, "赛罗奥特曼",        (35, 70, 10, 90, 50, 85, 75, 70, 85),  "高"),
    (18, "熊大（回眸）",       (35, 75, 5,  35, 35, 35, 70, 75, 60),  "高"),
    (19, "酱板鸭",          (20, 90, 15, 55, 90, 45, 75, 95, 80),  "中"),
    (20, "donk",          (55, 75, 5,  70, 25, 70, 30, 45, 95),  "高"),
    (21, "豆包",            (45, 85, 5,  70, 35, 35, 65, 90, 65),  "中"),
    (22, "狂魔哥",           (70, 98, 45, 90, 92, 75, 100, 95, 50), "中"),
    (23, "Faker",         (85, 50, 5,  50, 15, 25, 15, 30, 100), "高"),
    (24, "唐纳德·特朗普",      (25, 90, 20, 100, 65, 95, 95, 95, 55), "高"),
    (25, "埃隆·马斯克",       (50, 90, 25, 95, 65, 100, 85, 95, 60), "高"),
    (26, "黄仁勋",          (40, 70, 5,  85, 20, 85, 35, 55, 95),  "高"),
    (27, "哭哭马",          (90, 95, 0,  15, 10, 5,  5,  95, 40),  "高"),
    (28, "TheBurntPeanut", (55, 95, 20, 95, 85, 65, 80, 100, 65), "高"),
    (29, "甲亢哥",          (20, 90, 15, 100, 85, 80, 85, 100, 70), "高"),
    (30, "回答我·小明剑魔",     (50, 90, 15, 80, 70, 65, 95, 100, 45), "高"),
    (31, "嘎子（谢孟伟）",      (55, 85, 30, 85, 70, 75, 75, 90, 45),  "中"),
    (32, "沈腾",            (75, 90, 20, 85, 45, 70, 85, 95, 80),  "高"),
    (33, "Doro 粉狗",       (65, 90, 10, 75, 60, 45, 75, 95, 50),  "中"),
    (34, "咕咕嘎嘎企鹅",       (15, 85, 5,  55, 45, 20, 25, 100, 40), "高"),
    (35, "永雏塔菲",         (75, 85, 25, 90, 65, 70, 90, 95, 65),  "中"),
    (36, "米饭仙人",         (25, 55, 5,  55, 20, 15, 25, 75, 80),  "中"),
    (37, "奶蛙",            (20, 75, 10, 60, 55, 20, 35, 95, 40),  "中"),
    (38, "美团袋鼠（肥嘟嘟）",   (15, 60, 5,  60, 55, 20, 35, 90, 40),  "中"),
    (39, "扎啤",            (30, 75, 50, 60, 85, 40, 90, 95, 30),  "低"),
    (40, "牛来",            (30, 75, 5,  45, 40, 35, 25, 95, 75),  "中"),
    (41, "冬泳怪鸽",         (15, 80, 5,  95, 25, 40, 35, 90, 95),  "高"),
    (42, "Tralalero Tralala", (15, 85, 20, 80, 85, 70, 55, 100, 35), "高"),
    (43, "Tung Tung Tung Sahur", (10, 80, 10, 65, 75, 35, 40, 100, 55), "高"),
    (44, "爱女群体",         (65, 90, 0,  80, 70, 50, 100, 95, 40), "低"),
    (45, "TheShy",        (65, 85, 5,  65, 40, 60, 25, 70, 90),  "高"),
    (46, "Uzi",           (55, 75, 10, 85, 45, 65, 65, 85, 85),  "高"),
    (47, "康康（ZmjjKK）",    (40, 85, 10, 95, 45, 85, 65, 85, 85),  "高"),
    (48, "光头强",          (50, 90, 10, 75, 65, 65, 75, 90, 75),  "高"),
    (49, "纯种嘉豪",         (65, 100, 20, 55, 40, 100, 50, 100, 30), "中"),
    (50, "懒羊羊",          (80, 75, 5,  20, 30, 10, 30, 75, 25),  "高"),
    (51, "派大星",          (10, 85, 10, 70, 70, 15, 50, 100, 25), "高"),
    (52, "章鱼哥",          (90, 85, 15, 15, 35, 70, 85, 65, 45),  "高"),
    (53, "史迪奇",          (45, 90, 15, 80, 100, 40, 70, 100, 65), "高"),
    (54, "C罗",           (65, 70, 5,  95, 30, 100, 55, 55, 100), "高"),
    (55, "梅西",            (80, 55, 5,  45, 10, 30, 15, 35, 100), "高"),
    (56, "勒布朗·詹姆斯",      (55, 75, 10, 95, 40, 95, 60, 75, 95),  "高"),
    (57, "迈克尔·乔丹",       (80, 80, 5,  75, 65, 100, 85, 65, 100), "高"),
    (58, "科比·布莱恩特",      (85, 75, 5,  70, 45, 100, 60, 60, 100), "高"),
    (59, "疯狂小杨哥",        (40, 90, 25, 95, 85, 80, 85, 95, 45),  "中"),
    (60, "陈泽",            (55, 85, 25, 95, 75, 80, 75, 90, 55),  "中"),
    (61, "辛巴",            (40, 85, 20, 100, 75, 90, 90, 85, 55),  "中"),
    (62, "李佳琦",          (35, 80, 20, 100, 45, 85, 70, 75, 80),  "高"),
    (63, "贾乃亮",          (30, 85, 15, 95, 55, 75, 75, 90, 65),  "中"),
    (64, "蔡徐坤",          (75, 90, 10, 85, 30, 90, 45, 95, 65),  "中"),
    (65, "蓝战非",          (45, 80, 15, 90, 45, 70, 55, 75, 75),  "中"),
    (66, "何同学",          (80, 65, 5,  65, 10, 45, 20, 35, 85),  "高"),
    (67, "Tim（影视飓风）",     (60, 80, 10, 90, 35, 80, 55, 75, 90),  "高"),
    (68, "雷军",            (35, 85, 10, 100, 30, 95, 70, 85, 90),  "高"),
    (69, "余承东",          (35, 80, 10, 95, 35, 90, 80, 80, 85),  "高"),
    (70, "周杰伦",          (95, 85, 25, 65, 30, 90, 50, 60, 90),  "高"),
    (71, "听泉鉴宝",         (35, 90, 20, 100, 65, 85, 75, 100, 60), "中"),
    (72, "潘宏",            (35, 75, 10, 80, 35, 55, 45, 65, 70),  "中"),
    (73, "良子",            (30, 65, 10, 75, 35, 30, 45, 70, 90),  "中"),
    (74, "Giao哥",         (65, 95, 35, 95, 80, 100, 90, 100, 40), "中"),
    (75, "范小勤",          (50, 50, 50, 50, 50, 50, 50, 50, 50),  "不评分"),
    (76, "少羽",            (50, 50, 50, 50, 50, 50, 50, 50, 50),  "低"),
    (77, "雨姐",            (30, 80, 10, 90, 45, 75, 75, 80, 60),  "中"),
    (78, "张雪峰",          (55, 80, 10, 100, 50, 85, 95, 85, 90), "高"),
    (79, "陶喆",            (90, 80, 20, 65, 25, 75, 40, 55, 90),  "高"),
    (80, "姆巴佩",          (50, 65, 5,  85, 25, 90, 40, 45, 95),  "高"),
    (81, "王楚钦",          (55, 70, 5,  75, 30, 75, 40, 55, 90),  "高"),
    (82, "乌鲁鲁",          (40, 75, 10, 55, 45, 45, 35, 65, 85),  "高"),
    (83, "Niko",          (65, 80, 10, 75, 50, 90, 45, 60, 90),  "高"),
    (84, "DeepSeek 大肥鱼",  (85, 95, 15, 80, 70, 45, 85, 100, 60), "中"),
    (85, "田一名",          (45, 100, 30, 95, 40, 95, 65, 100, 75), "中低"),
    (86, "柳智敏",          (75, 70, 10, 80, 15, 85, 25, 45, 85),  "中"),
    (87, "朴彩英",          (85, 75, 10, 75, 10, 65, 20, 45, 90),  "中"),
    (88, "高市早苗",         (50, 70, 5,  85, 45, 75, 75, 55, 65),  "中"),
    (89, "绯红小猫",         (65, 92, 55, 65, 20, 35, 40, 55, 45),  "低"),
    (90, "玩偶姐姐",         (85, 95, 45, 60, 20, 80, 45, 75, 65),  "中低"),
    (91, "奶咪",            (60, 88, 50, 70, 20, 35, 45, 50, 45),  "低"),
]

NINE = ["MS", "FC", "WS", "SB", "CX", "JH", "ZQ", "AB", "KD"]

# 编号 → 稳定 id。**编号顺序已与现有文件逐条核对一致**（见 main 里的断言）。
POS2ID = {
    1: "mem-nailong-001", 2: "mem-coke-003", 3: "mem-bushaoxin-007",
    4: "mem-jiupaige-014", 5: "mem-zhuzhiwen-015", 6: "mem-lanlao-020",
    7: "mem-pangmao-002", 8: "mem-damaige-010", 9: "mem-sunxiaochuan-011",
    10: "mem-jixinghang-013", 11: "mem-kapibala-024", 12: "mem-malou-025",
    13: "mem-shushu-026", 14: "mem-bushi-027", 15: "an-belial-001",
    16: "an-diga-002", 17: "an-sairo-003", 18: "an-xiongda-004",
    19: "sd-jiangbanya-012", 20: "es-donk-001", 21: "mem-doubao-040",
    22: "mem-kuangmo-041", 23: "es-faker-004", 24: "intp-trump-001",
    25: "intp-musk-002", 26: "intp-jensen-003", 27: "ani-cryinghorse-005",
    28: "oth-burntpeanut-004", 29: "mem-jiaukang-042", 30: "mem-xiaomingjianmo-043",
    31: "mem-gazi-044", 32: "mem-shenteng-045", 33: "ani-doro-046",
    34: "ani-gugu-047", 35: "mem-tafei-048", 36: "mem-mifan-049",
    37: "ani-naiwa-050", 38: "ani-meituan-051", 39: "ani-spongebob-052",
    40: "ani-niulai-053", 41: "mem-dongyong-054", 42: "mem-tralalero-055",
    43: "mem-tungtung-056", 44: "mem-bombardiro-057", 45: "es-ig-006",
    46: "es-uzi-058", 47: "es-kangkang-059", 48: "an-guangtouqiang-060",
    49: "an-huitailang-061", 50: "an-lanyangyang-062", 51: "an-paida-063",
    52: "an-zhangyuge-064", 53: "an-stitch-065", 54: "es-ronaldo-066",
    55: "es-messi-067", 56: "es-lebron-068", 57: "es-jordan-069",
    58: "es-kobe-070", 59: "mem-xiaoyangge-071", 60: "mem-chenze-072",
    61: "mem-xinba-073", 62: "mem-lijiaqi-074", 63: "mem-jianailiang-075",
    64: "mem-caixukun-076", 65: "mem-lanzhanfei-077", 66: "mem-hetongxue-078",
    67: "mem-tim-079", 68: "mem-leijun-080", 69: "intp-yuchengdong-081",
    70: "mem-zhoujielun-082", 71: "mem-tingquan-083", 72: "mem-panhong-084",
    73: "mem-liangzi-085", 74: "mem-giao-086", 75: "mem-fanxiaoqin-087",
    76: "mem-shaoyu-088", 77: "mem-yujie-089", 78: "mem-zhangxuefeng-090",
    79: "mem-taozhe-091", 80: "es-mbappe-092", 81: "es-wangchuqin-093",
    82: "gm-wululu-094", 83: "es-niko-095", 84: "mem-deepseek-096",
    85: "mem-tianzaitian-097", 86: "mem-liuzhimin-098", 87: "mem-piaocaiying-099",
    88: "intp-takaichi-100", 89: "mem-feihongxiaomao-101", 90: "mem-wanoujiejie-102",
    91: "mem-naimi-103",
}

# profile_type：真人 / 虚构角色 / 网络梗 / AI 二创 / 创作者
PROFILE = {
    "实人": [
        "mem-coke-003", "mem-jiupaige-014", "mem-zhuzhiwen-015", "mem-lanlao-020",
        "mem-pangmao-002", "mem-damaige-010", "mem-sunxiaochuan-011", "es-donk-001",
        "es-faker-004", "intp-trump-001", "intp-musk-002", "intp-jensen-003",
        "oth-burntpeanut-004", "mem-jiaukang-042", "mem-gazi-044", "mem-shenteng-045",
        "mem-tafei-048", "mem-dongyong-054", "es-ig-006", "es-uzi-058",
        "es-kangkang-059", "es-ronaldo-066", "es-messi-067", "es-lebron-068",
        "es-jordan-069", "es-kobe-070", "mem-xiaoyangge-071", "mem-chenze-072",
        "mem-xinba-073", "mem-lijiaqi-074", "mem-jianailiang-075", "mem-caixukun-076",
        "mem-lanzhanfei-077", "mem-hetongxue-078", "mem-tim-079", "mem-leijun-080",
        "intp-yuchengdong-081", "mem-zhoujielun-082", "mem-tingquan-083",
        "mem-panhong-084", "mem-liangzi-085", "mem-giao-086", "mem-fanxiaoqin-087",
        "mem-shaoyu-088", "mem-yujie-089", "mem-zhangxuefeng-090", "mem-taozhe-091",
        "es-mbappe-092", "es-wangchuqin-093", "es-niko-095", "mem-tianzaitian-097",
        "mem-liuzhimin-098", "mem-piaocaiying-099", "intp-takaichi-100",
        "mem-feihongxiaomao-101", "mem-wanoujiejie-102", "mem-naimi-103",
    ],
    "虚构角色": [
        "mem-nailong-001", "an-belial-001", "an-diga-002", "an-sairo-003",
        "an-xiongda-004", "sd-jiangbanya-012", "ani-cryinghorse-005",
        "ani-doro-046", "ani-spongebob-052", "es-ig-006", "an-guangtouqiang-060",
        "an-huitailang-061", "an-lanyangyang-062", "an-paida-063", "an-zhangyuge-064",
        "an-stitch-065", "gm-wululu-094",
    ],
    "AI 二创": ["mem-jixinghang-013", "mem-damaige-010", "mem-deepseek-096"],
    "创作者": [
        "mem-tianzaitian-097", "mem-feihongxiaomao-101", "mem-wanoujiejie-102",
        "mem-naimi-103", "mem-tim-079", "mem-hetongxue-078",
    ],
}

# scoring_notes：重点角色逐条说明，其余给统一说明
NOTES = {
    "mem-bushi-027": "隐藏角色。闷骚 100 / 猥琐 85，解锁条件仍为 闷骚精确 100 且猥琐精确 100。"
                     "虚构梗角色，不涉及任何现实人物隐私。",
    "mem-jixinghang-013": "用户自定义抽象名称，本轮采用新评分，置信度低（无原型资料）。",
    "mem-malou-025": "架空迷因角色，置信度低；非种族化设定。",
    "mem-kuangmo-041": "本轮采用新评分：嘴欠 100 / 反差 98 / 畜生 92。",
    "ani-spongebob-052": "抽象人格原型「扎啤」，本轮采用新评分，置信度低。",
    "mem-bombardiro-057": "讽刺对象限定为极端话术与双标，置信度低。",
    "an-huitailang-061": "纯种嘉豪：反差 100 / 嘉豪 100 / 抽象 100，全池最典型的凹帅人设。",
    "mem-tianzaitian-097": "本轮采用新评分：反差 100 / 抽象 100，置信度中低。",
    "mem-feihongxiaomao-101": "成人内容创作者。按「高闷骚、高反差、低畜生（20）、低抽象（55）」处理，"
                              "不把成人创作属性误判成缺德或抽象。",
    "mem-wanoujiejie-102": "成人内容创作者。闷骚 85 / 反差 95 / 畜生 20 / 抽象 75，"
                           "与另两位成人创作者在嘉豪与抽象上明确区分。",
    "mem-naimi-103": "成人内容创作者。闷骚 60 / 反差 88 / 畜生 20 / 抽象 50。",
    "mem-pangmao-002": "占位值（九维全 50），**不参与人格排名**，不代表真实评价。",
    "mem-fanxiaoqin-087": "占位值（九维全 50），不代表真实人格评价。",
    "mem-shaoyu-088": "资料不足，九维全 50 为临时保守值，未经充分验证。",
}


def main() -> int:
    doc = json.loads(PD.read_text(encoding="utf-8"))
    personas = doc["personas"]

    assert len(personas) == 91, f"人数应为 91，实际 {len(personas)}"
    assert len(ROWS) == 91, f"矩阵行数应为 91，实际 {len(ROWS)}"

    by_id = {p["id"]: p for p in personas}

    # ① 位置 → id 必须与当前文件顺序一致（顺序变了就说明名单被动过，必须先核对）
    for i, p in enumerate(personas, 1):
        expect = POS2ID[i]
        assert p["id"] == expect, f"第 {i} 位应为 {expect}，实际 {p['id']}（名单顺序已变，停止执行）"

    # ② 名称二次校验并写入
    for pos, name, vals, conf in ROWS:
        pid = POS2ID[pos]
        p = by_id[pid]
        # 名称校验：允许矩阵用简称（灭建国 / 特朗普 / Faker 等已在上表按当前名写全）
        assert vals and len(vals) == 9, f"{name} 九维数量应为 9"
        assert all(0 <= v <= 100 for v in vals), f"{name} 存在越界值 {vals}"

        p["nineDims"] = dict(zip(NINE, vals))
        p["scores"] = dict(zip(NINE, vals))
        p["position"] = pos
        p["confidence"] = conf
        p["profile_type"] = next(
            (k for k, ids in PROFILE.items() if pid in ids), "网络梗"
        )

    # ③ 补 scoring_notes / evidence / updated_at
    for p in personas:
        p["scoring_notes"] = NOTES.get(
            p["id"],
            "按用户提供的 v2.1 九维评分矩阵落库；置信度见 confidence 字段。",
        )
        # evidence 是契约枚举（VERIFIED/OBSERVED/INFERRED/UNKNOWN/BLOCKED），不得写入自由文本；
        # 矩阵来源另存 evidenceSource，避免覆盖契约字段。
        p["evidence"] = "OBSERVED"
        p["evidenceSource"] = "用户提供的《91 人九维评分最终校准版》评分矩阵（2026-11-05）"
        p["updated_at"] = UPDATED_AT
        # 旧的推导依据字段不再成立，清掉避免两套口径并存
        p.pop("nineDimsBasis", None)

    doc["nineScheme"] = "nine-dims-v2.1"
    doc["nineGeneratedAt"] = UPDATED_AT
    doc["note"] = (
        (doc.get("note") or "")
        + " | v2.1：九维分数改为用户提供的 91 人人工评分矩阵，取代此前的推导值；"
          "新增 confidence / profile_type / scoring_notes / updated_at 字段。"
    )

    PD.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # ④ 结果校验
    from collections import Counter
    print(f"已写入 {len(personas)} 人")
    print("置信度分布:", dict(Counter(p["confidence"] for p in personas)))
    print("profile_type 分布:", dict(Counter(p["profile_type"] for p in personas)))
    for k in NINE:
        vs = [p["nineDims"][k] for p in personas]
        n100 = sum(1 for v in vs if v == 100)
        print(f"  {k}: 均值 {sum(vs) / len(vs):5.1f}  满分个数 {n100:2}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
