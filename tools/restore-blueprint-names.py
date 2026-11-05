"""把 18 张卡的名字按 04 蓝图原名改回来（2026-11-05 执行令：不再避讳真实人名/艺人）。

只改 name 与 usageNote 中「不得使用姓名」这类脱敏话术；
dims / 简介 / 分类 / id 一律不动。
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "personas.json")

RENAME = {
    "mem-shoulai-008": "「寿来」借寿整活人 / 寿数回战",
    "mem-jiupaige-014": "「做完你的做你的」鸡排主理人李俊永",
    "mem-zhuzhiwen-015": "朱之文（大衣哥）与「你就是朱之文」句式",
    "mem-gaonai-016": "「野生狗奶」吴川才子招茂才",
    "mem-tianjia-017": "蔡有福 / 「误闯天家」",
    "mem-papijiang-019": "papi酱《生气了》「OMG 你吓到我了」",
    "mem-lanlao-020": "揽佬 / 「中国人能飞」",
    "mem-podcast-022": "视频播客：一次正常的对谈为什么会火",
    "an-xiongda-004": "熊大（回眸）",
    "sd-fendelin-006": "周晟安 / 白清枚（《盛夏芬德拉》）",
    "sd-guaiguai-007": "鹿鸣于 / 段休冥（《好一个乖乖女》）",
    "sd-aipop-009": "韩道勋 / 权时宪 / 李宰现（AI 偶像剧《漂亮的恶意》）",
    "sd-nvxiangshi-010": "龙问心 / 萧彻 / 卫凛（《女相师》）",
    "es-donk-001": "donk（Danil Kryshkovets / Team Spirit，CS2）",
    "es-jee-002": "Jee（季冬凯 / TYLOO，CS2）",
    "es-369-003": "369（TES / 英雄联盟）",
    "es-faker-004": "Faker（T1 / 英雄联盟）",
    "es-chovy-005": "Chovy（GEN / 英雄联盟）",
}

# 原名恢复后，原先"不得使用姓名/肖像"的脱敏话术改为"尊重本人、不作贬损"
USAGE = {
    "mem-jiupaige-014": "可使用其姓名与该句式；不涉或其经营做负面评价，不作贬损性描述。",
    "mem-zhuzhiwen-015": "可使用其姓名与该句式；文案禁用任何贬损性或阶层调侃指向。",
    "mem-gaonai-016": "可使用其姓名与道具梗；文案不作低俗化或贬损性描述。",
    "mem-tianjia-017": "可使用相关艺人与舞者姓名；不引用受版权保护的音频，不作贬损性描述。",
    "mem-papijiang-019": "可使用创作者姓名与歌词句式；产品内不内置受版权保护的音频。",
    "mem-lanlao-020": "可使用其姓名；原曲含第三方采样不内置音频，原歌词涉民族表述本产品不引用。",
    "mem-podcast-022": "可提及节目与嘉宾姓名；不得娱乐化引用任何健康与私人创伤相关表述。",
    "sd-fendelin-006": "可使用剧名与角色名；不内置受版权保护的音乐。",
    "sd-guaiguai-007": "可使用剧名与角色名；不作贬损性描述。",
    "sd-aipop-009": "可使用剧集与角色名；不作贬损性描述。",
    "sd-nvxiangshi-010": "可使用剧名与角色名；不作贬损性描述。",
    "es-donk-001": "可使用其姓名与战队；客观描述竞技表现，不作人身攻击。",
    "es-jee-002": "可使用其姓名与战队；客观描述竞技表现，不作人身攻击。",
    "es-369-003": "可使用其姓名与战队；客观描述竞技表现，不作人身攻击。",
    "es-faker-004": "可使用其姓名与战队；客观描述竞技表现，不作人身攻击。",
    "es-chovy-005": "可使用其姓名与战队；客观描述竞技表现，不作人身攻击。",
}


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    renamed = 0
    for p in data["personas"]:
        if p["id"] in RENAME:
            p["name"] = RENAME[p["id"]]
            renamed += 1
        if p["id"] in USAGE:
            p["usageNote"] = USAGE[p["id"]]

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"改名 {renamed} 张，共 {len(data['personas'])} 人")


if __name__ == "__main__":
    main()
