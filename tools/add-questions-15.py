"""新增 15 道题（10 → 25），格式与现有题完全一致。

覆盖目标：现有 10 题各维非零 effect 计数为
  EE 19 / ST 10 / AC 25 / HX 10 / RB 10 / SR 29（SR、AC 过重，ST/HX/RB 偏轻）
所以新增题重点补 ST、HX、RB，EE 适度补，AC/SR 少碰。

每题：4 个选项（保留与现有题一致的 4 选 1 风格，二选一仅原有 2 题）、
      options.effects 取值域 ±1、单选项每维系数量级与现有题一致（0.3–0.8）。
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data", "questions.json")

NEW = [
    {
        "id": "q-gen-011",
        "type": "scenario",
        "title": "开会时你发现领导的方案有个明显漏洞，全场没人吭声。你：",
        "dims": {"ST": 0.8, "RB": 0.7, "AC": 0.5},
        "options": [
            {"id": "A", "label": "当场举手，把问题摆到桌面上讲清楚", "effects": {"ST": 0.8, "RB": 0.6, "AC": 0.7}},
            {"id": "B", "label": "先私下发给关系好的同事，看他怎么想", "effects": {"SR": 0.5, "ST": -0.2, "HX": 0.4}},
            {"id": "C", "label": "散会后单独找领导说，当着人不太好", "effects": {"ST": 0.3, "HX": 0.6, "RB": -0.4}},
            {"id": "D", "label": "不说。说了也改不了，还容易得罪人", "effects": {"ST": -0.7, "RB": -0.6, "AC": -0.5}},
        ],
    },
    {
        "id": "q-gen-012",
        "type": "meme",
        "title": "朋友转给你一个「只有懂的人才懂」的梗，你其实没懂。你：",
        "dims": {"HX": 0.8, "ST": 0.6, "EE": 0.4},
        "options": [
            {"id": "A", "label": "回一串哈哈哈哈，先装懂", "effects": {"ST": 0.4, "HX": 0.5, "EE": 0.5}},
            {"id": "B", "label": "直接说：没懂，展开讲讲", "effects": {"ST": 0.6, "HX": 0.7, "AC": 0.4}},
            {"id": "C", "label": "自己搜一下，弄明白再回", "effects": {"HX": 0.8, "AC": 0.5, "ST": -0.3}},
            {"id": "D", "label": "已读，等它自己过去", "effects": {"EE": -0.6, "SR": -0.4, "ST": -0.5}},
        ],
    },
    {
        "id": "q-gen-013",
        "type": "single",
        "title": "看到一条明显不实但传得很广的消息。你：",
        "dims": {"RB": 0.7, "AC": 0.6, "HX": 0.5},
        "options": [
            {"id": "A", "label": "直接发评论指出问题，附上来源", "effects": {"RB": 0.7, "AC": 0.6, "ST": 0.5}},
            {"id": "B", "label": "心里有数就行，懒得争", "effects": {"HX": 0.6, "AC": -0.5, "RB": -0.3}},
            {"id": "C", "label": "转给一个愿意吵的朋友，让他去", "effects": {"SR": 0.6, "ST": 0.3, "RB": 0.2}},
            {"id": "D", "label": "先查清楚到底是不是真的，再说", "effects": {"HX": 0.8, "AC": 0.4, "RB": -0.2}},
        ],
    },
    {
        "id": "q-gen-014",
        "type": "forced",
        "title": "二选一：你更怕哪一种自己？",
        "dims": {"RB": 0.6, "ST": 0.5, "HX": 0.5},
        "options": [
            {"id": "A", "label": "说了一堆话，结果什么也没留下", "effects": {"ST": 0.6, "AC": -0.4, "RB": 0.4}},
            {"id": "B", "label": "憋了一堆话，结果一句也没说", "effects": {"ST": -0.7, "AC": -0.2, "RB": -0.5}},
        ],
    },
    {
        "id": "q-gen-015",
        "type": "scenario",
        "title": "你被拉进一个话题完全插不上嘴的饭局。你：",
        "dims": {"SR": 0.6, "HX": 0.5, "ST": 0.4},
        "options": [
            {"id": "A", "label": "找机会把话题带到自己熟的地方", "effects": {"ST": 0.7, "AC": 0.5, "SR": 0.3}},
            {"id": "B", "label": "认真听，偶尔接一句，也挺好", "effects": {"SR": 0.5, "HX": 0.5, "EE": -0.2}},
            {"id": "C", "label": "低头吃饭，等散场", "effects": {"SR": -0.6, "ST": -0.5, "EE": -0.4}},
            {"id": "D", "label": "跟旁边同样插不上话的人聊起来", "effects": {"SR": 0.6, "ST": 0.4, "HX": 0.3}},
        ],
    },
    {
        "id": "q-gen-016",
        "type": "single",
        "title": "有人当着大家的面夸你，夸得有点过。你：",
        "dims": {"ST": 0.7, "EE": 0.5, "HX": 0.4},
        "options": [
            {"id": "A", "label": "顺着接住，再自夸一句玩笑话", "effects": {"ST": 0.7, "EE": 0.5, "RB": 0.3}},
            {"id": "B", "label": "赶紧摆手：没有没有，都是运气", "effects": {"ST": -0.5, "HX": 0.4, "RB": -0.3}},
            {"id": "C", "label": "认真道谢，把功劳分给相关的人", "effects": {"ST": 0.4, "SR": 0.5, "HX": 0.5}},
            {"id": "D", "label": "笑一下糊过去，心里有点不好意思", "effects": {"EE": 0.3, "ST": -0.2, "HX": 0.3}},
        ],
    },
    {
        "id": "q-gen-017",
        "type": "scenario",
        "title": "一个合作的人反复拖延，第三次跟你说「明天一定」。你：",
        "dims": {"AC": 0.6, "RB": 0.6, "ST": 0.5},
        "options": [
            {"id": "A", "label": "把话挑明：这次不行我们就换方案", "effects": {"RB": 0.7, "ST": 0.6, "AC": 0.6}},
            {"id": "B", "label": "自己上手把活补上，别耽误事", "effects": {"AC": 0.8, "RB": -0.3, "SR": -0.3}},
            {"id": "C", "label": "再等一次，但把截止时间写进群里", "effects": {"AC": 0.4, "HX": 0.6, "ST": 0.3}},
            {"id": "D", "label": "算了，心里给他降个级，以后少合作", "effects": {"HX": 0.5, "ST": -0.4, "EE": -0.3}},
        ],
    },
    {
        "id": "q-gen-018",
        "type": "meme",
        "title": "你花两小时做的梗图/段子，发出去零点赞。你：",
        "dims": {"EE": 0.7, "ST": 0.6, "RB": 0.4},
        "options": [
            {"id": "A", "label": "删了，改天再战，不信没人懂", "effects": {"RB": 0.6, "EE": 0.4, "AC": 0.4}},
            {"id": "B", "label": "留着，本来也是做给自己看的", "effects": {"EE": -0.4, "RB": 0.3, "SR": -0.3}},
            {"id": "C", "label": "发给最懂我的那几个人，重新发一次", "effects": {"SR": 0.6, "ST": 0.5, "EE": 0.4}},
            {"id": "D", "label": "开始琢磨是不是我的表达有问题", "effects": {"HX": 0.8, "ST": -0.3, "EE": -0.2}},
        ],
    },
    {
        "id": "q-gen-019",
        "type": "single",
        "title": "一个你不太熟的人公开说了句冒犯你的话。你：",
        "dims": {"RB": 0.7, "EE": 0.6, "ST": 0.5},
        "options": [
            {"id": "A", "label": "当场回一句，让他知道这话不对", "effects": {"RB": 0.7, "ST": 0.7, "EE": 0.4}},
            {"id": "B", "label": "冷处理，以后不再来往", "effects": {"RB": 0.2, "ST": -0.3, "EE": -0.4}},
            {"id": "C", "label": "先想想他是不是有什么误会", "effects": {"HX": 0.7, "EE": -0.2, "RB": -0.3}},
            {"id": "D", "label": "当场笑笑，回头找朋友吐槽一顿", "effects": {"SR": 0.6, "EE": 0.5, "ST": 0.3}},
        ],
    },
    {
        "id": "q-gen-020",
        "type": "scenario",
        "title": "团队里没人愿意干的那件麻烦事，最后落到你头上。你：",
        "dims": {"AC": 0.7, "HX": 0.5, "RB": 0.4},
        "options": [
            {"id": "A", "label": "接了，干就干，还干得挺认真", "effects": {"AC": 0.8, "HX": 0.3, "RB": -0.2}},
            {"id": "B", "label": "接了，但先把边界和分工讲清楚", "effects": {"AC": 0.5, "HX": 0.7, "ST": 0.4}},
            {"id": "C", "label": "问一句：为什么又是我们组？", "effects": {"RB": 0.7, "ST": 0.6, "AC": 0.2}},
            {"id": "D", "label": "接了但不声张，做完再说", "effects": {"ST": -0.5, "AC": 0.4, "HX": 0.3}},
        ],
    },
    {
        "id": "q-gen-021",
        "type": "single",
        "title": "你发现自己一直相信的一件小事，其实是错的。你：",
        "dims": {"HX": 0.8, "RB": 0.5, "ST": 0.4},
        "options": [
            {"id": "A", "label": "马上改口，顺便把这事讲给别人听", "effects": {"ST": 0.6, "HX": 0.6, "RB": 0.3}},
            {"id": "B", "label": "心里改了，嘴上不太想承认", "effects": {"HX": 0.4, "ST": -0.5, "RB": -0.4}},
            {"id": "C", "label": "顺着往回查，看看还错在哪了", "effects": {"HX": 0.8, "AC": 0.5, "ST": -0.2}},
            {"id": "D", "label": "有点不服，先找证据反驳一下", "effects": {"RB": 0.6, "HX": 0.3, "EE": 0.4}},
        ],
    },
    {
        "id": "q-gen-022",
        "type": "scenario",
        "title": "深夜刷到一条把你气到的内容。你：",
        "dims": {"EE": 0.8, "RB": 0.6, "ST": 0.5},
        "options": [
            {"id": "A", "label": "直接下场对线，写到对方没词", "effects": {"RB": 0.8, "ST": 0.8, "EE": 0.6}},
            {"id": "B", "label": "写了一大段，最后全删，睡了", "effects": {"EE": -0.3, "ST": -0.6, "RB": -0.3}},
            {"id": "C", "label": "转发到小群，一起骂两句", "effects": {"SR": 0.6, "EE": 0.5, "ST": 0.4}},
            {"id": "D", "label": "截图存着，先想清楚再说", "effects": {"HX": 0.7, "AC": 0.4, "EE": -0.4}},
        ],
    },
    {
        "id": "q-gen-023",
        "type": "forced",
        "title": "二选一：如果只能保留一个，你选：",
        "dims": {"RB": 0.6, "SR": 0.5, "HX": 0.4},
        "options": [
            {"id": "A", "label": "说真话的自由，哪怕没人认同", "effects": {"RB": 0.8, "ST": 0.5, "SR": -0.4}},
            {"id": "B", "label": "被接纳的位置，哪怕少说两句", "effects": {"SR": 0.8, "RB": -0.5, "ST": -0.4}},
        ],
    },
    {
        "id": "q-gen-024",
        "type": "meme",
        "title": "你身边有个人，每次都能把天聊死。你：",
        "dims": {"SR": 0.6, "ST": 0.6, "EE": 0.4},
        "options": [
            {"id": "A", "label": "偏要接着聊，看他能聊到什么程度", "effects": {"RB": 0.6, "ST": 0.5, "SR": 0.3}},
            {"id": "B", "label": "学会了，他再说我就顺着往下接梗", "effects": {"ST": 0.8, "HX": 0.5, "SR": 0.3}},
            {"id": "C", "label": "尽量少接触，省点力气", "effects": {"SR": -0.7, "EE": -0.3, "ST": -0.4}},
            {"id": "D", "label": "直接把话挑明：你这聊法有点难接", "effects": {"ST": 0.7, "RB": 0.6, "SR": -0.2}},
        ],
    },
    {
        "id": "q-gen-025",
        "type": "single",
        "title": "你要在一个完全陌生的领域做决定，只有 10 分钟。你：",
        "dims": {"HX": 0.7, "AC": 0.6, "EE": 0.4},
        "options": [
            {"id": "A", "label": "先拍一个，错了再改", "effects": {"AC": 0.8, "RB": 0.4, "HX": -0.5}},
            {"id": "B", "label": "用剩下的十分钟把关键信息全扫一遍", "effects": {"HX": 0.8, "AC": 0.2, "ST": -0.3}},
            {"id": "C", "label": "找懂行的人问一句，比自己瞎猜快", "effects": {"SR": 0.7, "HX": 0.3, "AC": 0.4}},
            {"id": "D", "label": "拖到最后一刻，直觉说怎么来就怎么来", "effects": {"EE": 0.5, "AC": -0.4, "HX": -0.3}},
        ],
    },
]


def main():
    data = json.load(open(DATA, encoding="utf-8"))
    have = {q["id"] for q in data["questions"]}
    added = 0
    for q in NEW:
        if q["id"] in have:
            continue
        data["questions"].append(q)
        added += 1

    with open(DATA, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    from collections import Counter

    tot = Counter()
    for q in data["questions"]:
        for o in q["options"]:
            for d, v in o.get("effects", {}).items():
                if v != 0:
                    tot[d] += 1
    print(f"新增 {added} 题，共 {len(data['questions'])} 题")
    print("各维非零 effect 计数:", dict(tot))


if __name__ == "__main__":
    main()
