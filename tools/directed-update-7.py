#!/usr/bin/env python3
"""任务 B：七个指定角色的定向改名与重写。

原则（用户明确要求）：
  - 只用**角色唯一 id** 定位，绝不按显示序号改数据；
  - 只改这 7 个条目，其他 84 个条目一个字段都不动；
  - 不增不减，总数保持 91。

改名后 id 保持不变：id 是内部稳定键，被 imageUrl、测试、分享链接、
审计脚本引用；改 id 会牵动一大片（图片路径、引用），而显示层只认 name。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PD = ROOT / "data/personas.json"
DOC = "docs/product-discovery/04-热梗与人物资料卡.md"

UPDATES = {
    # ── 08 ──────────────────────────────────────────────────────
    "mem-damaige-010": {
        "name": "灭霸的爸爸·灭建国",
        "alias": "灭建国、灭霸他爸",
        "desc": "来自近期流行的 AI 漫威校园二创梗。网友将灭霸的爸爸戏称为「灭建国」，"
                "把强大的漫威反派与极具生活气息的中文父亲名字结合，形成强烈反差。"
                "代表记忆点：「灭建国是谁？」「灭霸的爸爸叫灭建国。」"
                "注意：这是网络二创设定，不是漫威官方角色设定。",
        "tags": ["AI 二创", "漫威梗", "反差", "取名字梗", "校园二创"],
        "usageNote": "网络二创设定，非漫威官方角色；不得把该名字表述为官方设定。",
        "compliance": {"restricted": True, "restrictedReason": ["thirdPartyIP"],
                       "matchPool": True, "resultCardEnabled": True},
    },
    # ── 10 ──────────────────────────────────────────────────────
    "mem-jixinghang-013": {
        "name": "死马火箭浣熊",
        "alias": "死马火箭浣熊",
        "desc": "用户提供的自定义抽象名称。"
                "当前阶段不编造原型、历史背景或人物身份，"
                "后续可根据用户提供的图片、视频和素材完善角色设定。",
        "tags": ["抽象迷因", "自定义角色", "待补充设定"],
        "usageNote": "仅保留用户提供的名称；未确认原型前不得补写背景故事或身份。",
        "compliance": {"restricted": False, "restrictedReason": [],
                       "matchPool": True, "resultCardEnabled": True},
    },
    # ── 12 ──────────────────────────────────────────────────────
    "mem-malou-025": {
        "name": "内阁",
        "alias": "内阁、内阁大学士",
        "desc": "架空抽象迷因角色。主打一副一本正经、故作高深、莫名其妙充满权威感的形象："
                "动辄引经据典、开口就是「此事需从长计议」、"
                "在一群人的闲聊里突然发表一段极其正式的权威意见，然后在下一个话题里迅速失语。"
                "笑点来自「神秘组织」「高深学问」与「突然发表权威意见」的错位，"
                "而不是任何真实组织或群体。",
        "tags": ["抽象迷因", "故作高深", "权威感", "一本正经", "架空设定"],
        "usageNote": "架空设定。不得将该角色设计为侮辱任何种族、民族或群体的形象；"
                     "不得使用种族刻板印象、歧视性暗语或相关贬损描述。"
                     "「内阁大学士」只作文字梗称呼，不对应任何现实政治职务或群体。",
        "compliance": {"restricted": False, "restrictedReason": [],
                       "matchPool": True, "resultCardEnabled": True},
    },
    # ── 14：隐藏角色 ─────────────────────────────────────────────
    "mem-bushi-027": {
        "name": "马志辉",
        "alias": "马志辉、路管管",
        "desc": "用户自定义的闷骚大学生梗角色。表面是那种在群里永远只回「收到」「好的」「+1」的人，"
                "内心戏却能拍八十集连续剧：路上看见熟人先在心里演练三遍打招呼的措辞，"
                "换了新头像等了三小时没人发现，只好自己先点个赞。"
                "闷骚指数与猥琐浓度双双拉满，是那种「嘴上什么都没说、脑子里已经演完一整季」的抽象人物。",
        "tags": ["闷骚", "大学生", "内心戏", "隐藏角色", "抽象人设"],
        "usageNote": "项目内部虚构梗角色。不得把未经证实的现实人物的性经历、"
                     "自慰习惯或其他私人性行为写成事实，不得对外展示现实个人隐私。",
        "compliance": {"restricted": False, "restrictedReason": [],
                       "matchPool": False, "resultCardEnabled": True},
        # 隐藏门槛：闷骚指数与猥琐浓度同时精确等于 100（AND，不是 ≥90，也不是均值）
        "unlock": {"MS": 100, "WS": 100},
    },
    # ── 39：海绵宝宝 → 扎啤 ──────────────────────────────────────
    "ani-spongebob-052": {
        "name": "扎啤",
        "alias": "扎啤",
        "desc": "一种抽象人格原型，形容那些行为离谱、脑回路不在线、"
                "干出让人无语的事情的人：走在路上能把自己绊一个趔趄，"
                "说完一句话能自己听出三种意思，"
                "正经场合说正经话，正经话说得像在说胡话。"
                "重点不在现实中的任何人，而在这类「离谱操作」本身。",
        "tags": ["抽象原型", "离谱操作", "脑回路", "荒诞场面", "无语"],
        "usageNote": "抽象人格原型，不绑定现实中任何特定人物；只写行为与场面，不指向具体个人。",
        "compliance": {"restricted": False, "restrictedReason": [],
                       "matchPool": True, "resultCardEnabled": True},
    },
    # ── 44 ──────────────────────────────────────────────────────
    "mem-bombardiro-057": {
        "name": "爱女群体",
        "alias": "爱女群体、极端爱女派",
        "desc": "对极端化网络话术现象进行讽刺的抽象角色："
                "把「爱女」当成免检通行证，用情绪化扣帽子代替讨论，"
                "同一套标准只在自己这边生效，一言不合就清点立场、拒绝交流。"
                "讽刺的对象是**具体的极端观点、双标和逻辑矛盾**，"
                "不是女性这个群体，也不是正常的性别议题讨论。",
        "tags": ["网络现象", "双标", "话术", "抽象讽刺", "情绪化"],
        "usageNote": "不得将女性整体当作嘲讽对象；不得把正常女权观点或女性群体一概归为该角色；"
                     "不得将智力障碍或残障身份作为侮辱笑点。讽刺对象必须是具体的极端观点、双标与逻辑矛盾。",
        "compliance": {"restricted": False, "restrictedReason": [],
                       "matchPool": True, "resultCardEnabled": True},
    },
    # ── 49：灰太狼 → 纯种嘉豪 ────────────────────────────────────
    "an-huitailang-061": {
        "name": "纯种嘉豪",
        "alias": "嘉豪、纯种嘉豪、嘉豪本豪",
        "desc": "代表那些喜欢装逼却不自知、沉浸在自己的帅气人设和世界观里、"
                "对自己的表现极其满意的人：走路带风、进门先找反光面、"
                "自拍一百张选出最不满意的那张发出去，"
                "用力过猛却完全不觉得尴尬，对旁人的反应一概不太敏感。"
                "核心梗：「别人还没觉得你帅，你已经把自己帅完了。」",
        "tags": ["嘉豪", "装逼", "凹造型", "用力过猛", "自我感觉良好"],
        "usageNote": "不依据真人外貌来评价嘉豪浓度，只看行为、表达和自我认知。",
        "compliance": {"restricted": False, "restrictedReason": [],
                       "matchPool": True, "resultCardEnabled": True},
    },
}


def main() -> int:
    doc = json.loads(PD.read_text(encoding="utf-8"))
    personas = doc["personas"]
    before = len(personas)
    by_id = {p["id"]: p for p in personas}

    for pid, upd in UPDATES.items():
        p = by_id.get(pid)
        if p is None:
            print(f"!! 找不到角色 {pid}", file=sys.stderr)
            return 1
        old_name = p["name"]
        p["name"] = upd["name"]
        p["alias"] = upd["alias"]
        p["desc"] = upd["desc"]
        p["tags"] = upd["tags"]
        p["usageNote"] = upd["usageNote"]
        p["compliance"] = upd["compliance"]
        p["source"] = f"{DOC}#{pid}"
        if "unlock" in upd:
            p["unlock"] = upd["unlock"]
        else:
            p.pop("unlock", None)
        print(f"  {pid}: {old_name} → {p['name']}")

    assert len(personas) == before == 91, f"人数被改动：{before} → {len(personas)}"
    PD.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"\n总计 {len(personas)} 人，其余 {len(personas) - len(UPDATES)} 条未改动")
    return 0


if __name__ == "__main__":
    sys.exit(main())
