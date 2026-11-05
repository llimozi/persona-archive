#!/usr/bin/env python3
"""按用户定稿名单（91 人）重建 data/personas.json。

只做名单与档案字段的对齐，不改匹配算法。
- 保留仍在新名单里的旧人物：复用其 id / dims / compliance 等既有判定，只更新名称、别名、简介。
- 下线不在新名单里的人物（用户裁决：严格按名单）。
- 新增人物给出六维设计打分（0–100，非实测），依据各人在网络上的可观察形象。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data/personas.json"
SRC_DOC = "docs/product-discovery/04-热梗与人物资料卡.md"

# (id, 名称, 别称, 简介, 分类, 六维, 受限理由, 备注)
# 六维顺序：EE 情绪外显 / ST 自信掌控 / AC 攻击性 / HX 好奇心 / RB 叛逆 / SR 社交半径
R: list[dict] = [
    # ── 01—20 ──────────────────────────────────────────────
    dict(keep="mem-nailong-001", no=1, name="奶龙", alias="小奶龙",
         desc="黄色圆滚滚的小恐龙，贪吃、贪玩、憨憨的，表情包和动作很有喜感。",
         cat="mem", dims=(88, 44, 70, 96, 28, 70), third=True,
         note="商业 IP：不得使用官方形象或可识别复刻造型。"),
    dict(keep="mem-coke-003", no=2, name="Coke老师", alias="抖一颜、火影最帅男人",
         desc="网络创作者，以夸张表情、魔性动作、游戏直播和反差整活出圈。",
         cat="mem", dims=(98, 91, 93, 98, 48, 44), real=True),
    dict(keep="mem-bushaoxin-007", no=3, name="不烧心良心老板", alias="良心老板",
         desc="「不烧心」相关短视频形象，主打良心经营、不偷工减料。",
         cat="mem", dims=(66, 72, 40, 58, 34, 64), real=True),
    dict(keep="mem-jiupaige-014", no=4, name="鸡排主理人李俊永", alias="鸡排哥、景德镇鸡排主理人",
         desc="景德镇鸡排摊主，以独特营业话术和「做完你的做你的」等名场面走红。",
         cat="mem", dims=(86, 82, 76, 58, 76, 72), real=True),
    dict(keep="mem-zhuzhiwen-015", no=5, name="朱之文", alias="大衣哥",
         desc="农民歌手，因《星光大道》走红，形象朴实，歌声有辨识度。",
         cat="mem", dims=(40, 30, 12, 36, 22, 70), real=True),
    dict(keep="mem-lanlao-020", no=6, name="揽佬", alias="揽佬 SKAI ISYOURGOD",
         desc="说唱音乐人，《中国人能飞》等作品在网络传播。",
         cat="mem", dims=(80, 86, 68, 72, 88, 54), real=True),
    dict(keep="mem-pangmao-002", no=7, name="胖猫", alias="胖猫",
         desc="2024 年引发广泛网络关注的人物，相关事件衍生大量讨论和二创。",
         cat="mem", dims=(26, 14, 10, 44, 52, 30), real=True),
    dict(keep="mem-damaige-010", no=8, name="Michael大麦哥", alias="大麦哥、Michael",
         desc="铁人三项运动员及成长类内容创作者，分享运动、成长和自我提升。",
         cat="mem", dims=(70, 74, 42, 80, 52, 66), real=True),
    dict(keep="mem-sunxiaochuan-011", no=9, name="孙笑川", alias="带带大师兄、大师兄、孙狗、网恋教父",
         desc="抽象文化代表人物之一，直播语录和粉丝二创形成大量互联网梗。",
         cat="mem", dims=(76, 58, 84, 60, 82, 72), real=True),
    dict(keep="mem-jixinghang-013", no=10, name="季洪行 & 八级哥", alias="八级哥、大笑奶龙素材组",
         desc="与大笑奶龙素材传播相关的组合条目，标志性记忆点是魔性笑声。",
         cat="mem", dims=(94, 66, 62, 78, 70, 58), third=True),
    dict(keep="mem-kapibala-024", no=11, name="卡皮巴拉", alias="水豚、卡皮吧啦",
         desc="真实动物，温顺松弛，常被用来表达佛系、淡定和与世无争。",
         cat="ani", dims=(10, 20, 6, 28, 12, 44)),
    dict(keep="mem-malou-025", no=12, name="吗喽", alias="打工吗喽",
         desc="网络自嘲形象，代表疲惫、卑微、被生活支配的打工人。",
         cat="mem", dims=(38, 12, 22, 32, 62, 36)),
    dict(keep="mem-shushu-026", no=13, name="鼠鼠", alias="鼠鼠我啊、鼠鼠人",
         desc="网络自嘲人格，代表弱势、社恐、没钱、没存在感的普通人。",
         cat="mem", dims=(16, 10, 8, 30, 54, 16)),
    dict(keep="mem-bushi-027", no=14, name="不是哥们", alias="不是哥们儿",
         desc="网络流行语拟人化形象，表达震惊、无语、质疑和难以理解。",
         cat="mem", dims=(74, 52, 48, 56, 62, 40)),
    dict(keep="an-belial-001", no=15, name="贝利亚奥特曼", alias="贝利亚皇帝、黑暗皇帝",
         desc="《奥特曼》系列反派，曾是光之国战士，后来成为黑暗势力代表。",
         cat="an", dims=(90, 94, 96, 62, 88, 34), third=True),
    dict(keep="an-diga-002", no=16, name="迪迦奥特曼", alias="迪迦、光之巨人",
         desc="《迪迦奥特曼》主角，拥有多种形态，是经典童年英雄形象。",
         cat="an", dims=(66, 78, 64, 58, 44, 78), third=True),
    dict(keep="an-sairo-003", no=17, name="赛罗奥特曼", alias="赛少、赛文之子",
         desc="奥特曼系列人气角色，自信张扬、好胜，战斗力强。",
         cat="an", dims=(84, 92, 82, 66, 68, 58), third=True),
    dict(keep="an-xiongda-004", no=18, name="熊大（回眸）", alias="熊大回眸",
         desc="《熊出没》角色，回头表情常被用于表达无语、嫌弃和看透一切。",
         cat="an", dims=(62, 72, 60, 48, 50, 64), third=True),
    dict(keep="sd-jiangbanya-012", no=19, name="酱板鸭", alias="复仇酱板鸭",
         desc="AI 短剧及网络二创角色，常见设定是被抛弃后回来复仇。",
         cat="sd", dims=(78, 70, 86, 54, 82, 30)),
    dict(keep="es-donk-001", no=20, name="donk", alias="天才少年",
         desc="俄罗斯 CS2 职业选手，以强悍枪法和激进突破风格闻名。",
         cat="es", dims=(76, 88, 92, 62, 66, 44), real=True),

    # ── 21—40 ──────────────────────────────────────────────
    dict(new="mem-doubao-040", no=21, name="豆包", alias="豆包",
         desc="AI 助手形象，来自字节跳动，适合以 AI、聊天搭子和一本正经回答等网络印象塑造角色。",
         cat="mem", dims=(34, 58, 16, 84, 22, 60), third=True),
    dict(new="mem-kuangmo-041", no=22, name="狂魔哥", alias="狂魔哥",
         desc="游戏主播，以《王者荣耀》相关直播和视频内容为主要识别点。",
         cat="mem", dims=(90, 80, 88, 56, 64, 58), real=True),
    dict(keep="es-faker-004", no=23, name="Faker", alias="大魔王、李哥、神",
         desc="韩国《英雄联盟》职业选手，多次获得世界赛冠军，被视为电竞传奇。",
         cat="es", dims=(30, 92, 56, 78, 34, 48), real=True),
    dict(keep="intp-trump-001", no=24, name="唐纳德·特朗普", alias="特朗普、川普、懂王",
         desc="美国政治人物，因演讲、表情和夸张发言成为网络二创素材。",
         cat="intp", dims=(96, 94, 84, 58, 80, 86), real=True),
    dict(keep="intp-musk-002", no=25, name="埃隆·马斯克", alias="马斯克、马一龙",
         desc="企业家，涉及电动汽车、航天、AI 和社交平台，网络话题度很高。",
         cat="intp", dims=(86, 90, 74, 92, 84, 82), real=True),
    dict(keep="intp-jensen-003", no=26, name="黄仁勋", alias="老黄、夹克勋、皮衣刀客",
         desc="英伟达创始人及 CEO，标志性黑色皮夹克形象深入人心。",
         cat="intp", dims=(52, 86, 40, 88, 46, 64), real=True),
    dict(keep="ani-cryinghorse-005", no=27, name="哭哭马", alias="不要不开心马、周一马",
         desc="因委屈哭脸造型走红的马形毛绒玩偶，常被用来表达疲惫和委屈。",
         cat="ani", dims=(56, 22, 14, 42, 30, 46)),
    dict(keep="oth-burntpeanut-004", no=28, name="TheBurntPeanut", alias="TBP、The Burnt Peanut",
         desc="Twitch 游戏主播，以花生造型虚拟形象和搞怪直播风格出圈。",
         cat="oth", dims=(88, 72, 70, 66, 72, 62), real=True),
    dict(new="mem-jiaukang-042", no=29, name="甲亢哥", alias="IShowSpeed、Speed",
         desc="美国网络主播，以极度亢奋、夸张反应和高能直播风格闻名。",
         cat="mem", dims=(98, 76, 78, 82, 80, 88), real=True),
    dict(new="mem-xiaomingjianmo-043", no=30, name="回答我·小明剑魔", alias="小明剑魔、回答我",
         desc="游戏圈梗人物，关联《英雄联盟》剑魔视频切片和「回答我」式表达。",
         cat="mem", dims=(82, 70, 90, 52, 78, 40)),
    dict(new="mem-gazi-044", no=31, name="嘎子（谢孟伟）", alias="嘎子哥、嘎子",
         desc="演员，因《小兵张嘎》走红，后来也因直播及网络事件形成梗。",
         cat="intp", dims=(72, 68, 64, 54, 58, 62), real=True),
    dict(new="mem-shenteng-045", no=32, name="沈腾", alias="腾哥、沈叔叔、军艺校草",
         desc="喜剧演员，擅长喜剧表演和即兴反应，贡献大量影视综艺名场面。",
         cat="intp", dims=(56, 62, 34, 60, 38, 74), real=True),
    dict(new="ani-doro-046", no=33, name="Doro 粉狗", alias="Doro、粉狗、粉毛小狗",
         desc="《胜利女神：妮姬》桃乐丝相关的粉丝二创迷因形象。",
         cat="ani", dims=(48, 34, 30, 60, 40, 52), third=True),
    dict(new="ani-gugu-047", no=34, name="咕咕嘎嘎企鹅", alias="Gugu Gaga Penguin、管理员企鹅",
         desc="AI 企鹅化迷因形象，特点是摇摇晃晃和「咕咕嘎嘎」的魔性音效。",
         cat="ani", dims=(72, 40, 28, 62, 44, 50)),
    dict(new="mem-tafei-048", no=35, name="永雏塔菲", alias="塔菲、菲菲公主、臭粉毛",
         desc="B站虚拟主播，以粉色形象、直播互动和粉丝文化出圈。",
         cat="scr", dims=(84, 74, 48, 70, 66, 80), third=True),
    dict(new="mem-mifan-049", no=36, name="米饭仙人", alias="米饭仙人",
         desc="吃播人物，以大量吃米饭为记忆点，常被塑造成米饭至上的形象。",
         cat="mem", dims=(66, 70, 26, 50, 54, 44)),
    dict(new="ani-naiwa-050", no=37, name="奶蛙", alias="大笑奶蛙、黄色奶蛙",
         desc="黄色蛙形抽象迷因，外形圆润，常搭配魔性大笑音效。",
         cat="ani", dims=(80, 46, 34, 56, 48, 46)),
    dict(new="ani-meituan-051", no=38, name="美团袋鼠（肥嘟嘟）", alias="肥嘟嘟",
         desc="美团袋鼠形象的抽象二创版本，肥嘟嘟的外形和相关网络话术形成记忆点。",
         cat="ani", dims=(70, 52, 40, 54, 56, 48), third=True),
    dict(new="ani-spongebob-052", no=39, name="海绵宝宝", alias="SpongeBob",
         desc="黄色海绵，乐观、热情、精力旺盛，经常制造喜剧场面。",
         cat="ani", dims=(92, 68, 30, 90, 46, 86), third=True),
    dict(new="ani-niulai-053", no=40, name="牛来", alias="牛来",
         desc="黄色抽象迷因体系中的角色，常与奶蛙、美团袋鼠等形象并列。",
         cat="ani", dims=(68, 48, 38, 52, 50, 44)),

    # ── 41—60 ──────────────────────────────────────────────
    dict(new="mem-dongyong-054", no=41, name="冬泳怪鸽", alias="奥利给大叔、奥利给",
         desc="网络创作者，以冬泳、励志短视频和「奥利给」口号走红。",
         cat="mem", dims=(94, 78, 36, 62, 74, 66), real=True),
    dict(new="mem-tralalero-055", no=42, name="Tralalero Tralala", alias="Tralalero、Nike 鲨鱼",
         desc="意大利脑腐迷因角色，穿运动鞋的鲨鱼，搭配魔性意大利语音频传播。",
         cat="mem", dims=(76, 60, 62, 58, 70, 42)),
    dict(new="mem-tungtung-056", no=43, name="Tung Tung Tung Sahur", alias="Tung Tung、木棍人",
         desc="意大利脑腐迷因角色，木棍拟人形象，名字来自重复敲击声。",
         cat="mem", dims=(54, 56, 58, 50, 66, 36)),
    dict(new="mem-bombardiro-057", no=44, name="Bombardiro Crocodilo", alias="Bombardiro、鳄鱼轰炸机",
         desc="意大利脑腐迷因角色，鳄鱼与轰炸机的荒诞融合体。",
         cat="mem", dims=(62, 74, 80, 54, 72, 38)),
    dict(keep="es-ig-006", no=45, name="TheShy", alias="晒哥、羞男、姜爷",
         desc="韩国《英雄联盟》职业选手姜承録，S8 世界冠军，以极强上路压制力和高风险操作闻名。",
         cat="es", dims=(44, 84, 88, 62, 70, 40), real=True),
    dict(new="es-uzi-058", no=46, name="Uzi", alias="乌兹、小狗、澡子哥",
         desc="中国《英雄联盟》职业选手简自豪，以 ADC 操作、对线压制力和比赛高光闻名。",
         cat="es", dims=(66, 82, 80, 60, 62, 56), real=True),
    dict(new="es-kangkang-059", no=47, name="康康（ZmjjKK）", alias="KK、康康、大明星",
         desc="中国《无畏契约》职业选手郑永康，以激进的决斗位风格和舞台表现力出圈。",
         cat="es", dims=(80, 86, 90, 58, 68, 52), real=True),
    dict(new="an-guangtouqiang-060", no=48, name="光头强", alias="强哥、光头强",
         desc="《熊出没》中的伐木工，与熊大熊二斗智斗勇，后来成为兼具喜剧和温情的角色。",
         cat="an", dims=(70, 58, 62, 56, 66, 46), third=True),
    dict(new="an-huitailang-061", no=49, name="灰太狼", alias="灰太狼大王",
         desc="《喜羊羊与灰太狼》角色，常年抓羊失败，「我一定会回来的」是经典台词。",
         cat="an", dims=(72, 76, 70, 68, 58, 50), third=True),
    dict(new="an-lanyangyang-062", no=50, name="懒羊羊", alias="懒羊羊大王、小懒",
         desc="《喜羊羊与灰太狼》角色，贪吃、爱睡觉、怕麻烦，人生目标是吃饱睡好。",
         cat="an", dims=(30, 20, 10, 34, 18, 46), third=True),
    dict(new="an-paida-063", no=51, name="派大星", alias="Patrick Star、派总",
         desc="《海绵宝宝》中的粉色海星，单纯、迟钝、脑回路清奇。",
         cat="an", dims=(78, 34, 20, 66, 44, 64), third=True),
    dict(new="an-zhangyuge-064", no=52, name="章鱼哥", alias="Squidward",
         desc="《海绵宝宝》角色，厌世、傲娇、热爱艺术，常代表无语和疲惫。",
         cat="an", dims=(34, 56, 46, 60, 58, 22), third=True),
    dict(new="an-stitch-065", no=53, name="史迪奇", alias="Stitch、实验 626 号、小蓝怪",
         desc="《星际宝贝》中的外星实验体，调皮、破坏力强，但重视家庭。",
         cat="an", dims=(90, 58, 92, 94, 92, 34), third=True),
    dict(new="es-ronaldo-066", no=54, name="C罗", alias="CR7、总裁",
         desc="葡萄牙足球运动员，以自律、身体素质、进球能力和胜负欲著称。",
         cat="intp", dims=(74, 94, 72, 64, 56, 78), real=True),
    dict(new="es-messi-067", no=55, name="梅西", alias="梅老板、球王",
         desc="阿根廷足球运动员，以盘带、组织、创造机会和进球能力闻名。",
         cat="intp", dims=(36, 86, 34, 74, 28, 66), real=True),
    dict(new="es-lebron-068", no=56, name="勒布朗·詹姆斯", alias="詹皇、小皇帝、King James",
         desc="美国篮球运动员，以全面能力、身体天赋和长期竞技表现著称。",
         cat="intp", dims=(62, 92, 70, 68, 58, 76), real=True),
    dict(new="es-jordan-069", no=57, name="迈克尔·乔丹", alias="飞人、篮球之神",
         desc="NBA 传奇球星，公牛王朝核心，以统治力和竞争精神闻名。",
         cat="intp", dims=(58, 96, 80, 66, 62, 70), real=True),
    dict(new="es-kobe-070", no=58, name="科比·布莱恩特", alias="Kobe、黑曼巴、曼巴、老大",
         desc="NBA 传奇球星，以「曼巴精神」、自律和关键时刻表现成为篮球文化标志。",
         cat="intp", dims=(48, 96, 74, 80, 52, 56), real=True),
    dict(new="mem-xiaoyangge-071", no=59, name="疯狂小杨哥", alias="小杨哥、杨小哥",
         desc="短视频及直播电商创作者，以兄弟整活、夸张表演和家庭喜剧内容走红。",
         cat="mem", dims=(96, 80, 62, 68, 70, 82), real=True),
    dict(new="mem-chenze-072", no=60, name="陈泽", alias="陈泽、泽哥",
         desc="抖音游戏主播及短视频创作者，以直播互动、游戏内容和个人整活风格出圈。",
         cat="mem", dims=(84, 72, 76, 58, 72, 64), real=True),

    # ── 61—80 ──────────────────────────────────────────────
    dict(new="mem-xinba-073", no=61, name="辛巴", alias="辛有志、辛选创始人",
         desc="直播电商主播，以强势直播风格、带货和直播间话题受到关注。",
         cat="mem", dims=(82, 84, 78, 60, 74, 70), real=True),
    dict(new="mem-lijiaqi-074", no=62, name="李佳琦", alias="Austin、口红一哥",
         desc="直播电商主播，以美妆、口红试色和「OMG，买它！」等话术走红。",
         cat="mem", dims=(88, 76, 48, 70, 58, 84), real=True),
    dict(new="mem-jianailiang-075", no=63, name="贾乃亮", alias="亮亮、乃亮",
         desc="演员和综艺嘉宾，因活跃性格、夸张反应和表情包受到关注。",
         cat="intp", dims=(82, 62, 40, 60, 50, 76), real=True),
    dict(new="mem-caixukun-076", no=64, name="蔡徐坤", alias="坤坤、鸡哥、IKUN",
         desc="歌手、艺人，因篮球视频片段和网络二创成为高传播度梗人物。",
         cat="intp", dims=(62, 74, 44, 62, 66, 72), real=True),
    dict(new="mem-lanzhanfei-077", no=65, name="蓝战非", alias="蓝战非、战非",
         desc="旅行类视频创作者，以跨国旅行、长途探索和个人经历分享为主。",
         cat="mem", dims=(44, 86, 30, 74, 78, 40), real=True),
    dict(new="mem-hetongxue-078", no=66, name="何同学", alias="何同学",
         desc="科技类视频创作者，擅长用实验和生活化场景讲解科技产品。",
         cat="mem", dims=(42, 68, 30, 90, 44, 52), real=True),
    dict(new="mem-tim-079", no=67, name="Tim（影视飓风）", alias="Tim、影视飓风 Tim",
         desc="影视飓风核心成员，以摄影、视频制作、影视设备和高质量影像内容出圈。",
         cat="mem", dims=(48, 74, 34, 86, 50, 58), real=True),
    dict(new="mem-leijun-080", no=68, name="雷军", alias="雷总、雷布斯",
         desc="小米创始人，因发布会演讲、「Are you OK」等名场面成为科技圈梗人物。",
         cat="mem", dims=(72, 76, 46, 74, 52, 80), real=True),
    dict(new="intp-yuchengdong-081", no=69, name="余承东", alias="余大嘴、余总",
         desc="华为高管，常因发布会表达、产品宣传和技术观点形成网络话题。",
         cat="intp", dims=(78, 88, 74, 72, 62, 62), real=True),
    dict(new="mem-zhoujielun-082", no=70, name="周杰伦", alias="周董、Jay Chou、亚洲天王",
         desc="华语流行音乐代表人物，歌手、词曲创作者和制作人，拥有大量经典作品。",
         cat="intp", dims=(46, 88, 38, 74, 70, 70), real=True),
    dict(new="mem-tingquan-083", no=71, name="听泉鉴宝", alias="听泉赏宝、听泉、泉哥",
         desc="网络鉴宝主播，以直播鉴宝和娱乐化讲解走红。",
         cat="mem", dims=(86, 76, 44, 80, 60, 78), real=True),
    dict(new="mem-panhong-084", no=72, name="潘宏", alias="潘宏爱玩狗",
         desc="宠物类短视频创作者，以狗狗护理、宠物洗护和宠物互动内容为主。",
         cat="mem", dims=(74, 78, 62, 64, 66, 60), real=True),
    dict(new="mem-liangzi-085", no=73, name="良子", alias="李占良、良子美食",
         desc="吃播及美食创作者，以大份量进食和食物测评出圈。",
         cat="intp", dims=(68, 64, 26, 56, 52, 50), real=True),
    dict(new="mem-giao-086", no=74, name="Giao哥", alias="Giao哥、Giao桑",
         desc="网络短视频人物，以魔性说唱、独特口音和「一给我里 giaogiao」等名场面走红。",
         cat="mem", dims=(90, 72, 56, 58, 78, 62), real=True),
    dict(new="mem-fanxiaoqin-087", no=75, name="范小勤", alias="小马云",
         desc="因外貌与马云相似而走红的网络人物，「小马云」是其标志性称呼。",
         cat="intp", dims=(40, 38, 20, 46, 34, 44), real=True),
    dict(new="mem-shaoyu-088", no=76, name="少羽", alias="少羽",
         desc="游戏主播，以直播互动和个人风格为主要识别点。",
         cat="mem", dims=(78, 70, 74, 54, 68, 58), real=True),
    dict(new="mem-yujie-089", no=77, name="雨姐", alias="东北雨姐、雨姐",
         desc="东北风格短视频创作者，以农村生活、家庭日常和豪爽表达走红。",
         cat="mem", dims=(82, 82, 66, 58, 62, 72), real=True),
    dict(new="mem-zhangxuefeng-090", no=78, name="张雪峰", alias="张雪峰老师、峰哥、考研名嘴",
         desc="教育领域讲师及内容创作者，以考研、专业选择和就业方向的直白讲解出圈。",
         cat="mem", dims=(86, 88, 70, 72, 60, 74), real=True),
    dict(new="mem-taozhe-091", no=79, name="陶喆", alias="陶吉吉、David Tao、R&B 教父",
         desc="华语歌手、词曲创作者，以 R&B 风格和《爱很简单》《普通朋友》等作品闻名。",
         cat="intp", dims=(44, 78, 32, 70, 56, 56), real=True),
    dict(new="es-mbappe-092", no=80, name="姆巴佩", alias="Kylian Mbappé、姆总、龟龟（网络戏称）",
         desc="法国足球运动员，以速度、爆发力和进球能力闻名。",
         cat="intp", dims=(70, 86, 72, 60, 58, 64), real=True),

    # ── 81—91 ──────────────────────────────────────────────
    dict(new="es-wangchuqin-093", no=81, name="王楚钦", alias="大头、头哥",
         desc="中国乒乓球运动员，左手打法，以进攻能力和比赛表现受到关注。",
         cat="intp", dims=(66, 80, 78, 58, 54, 56), real=True),
    dict(new="gm-wululu-094", no=82, name="乌鲁鲁", alias="乌鲁鲁、没浮木的",
         desc="《三角洲行动》工程干员，本名大卫·费莱尔，擅长巡飞弹远程打击、速凝掩体和区域控制，攻守兼备。",
         cat="gm", dims=(38, 78, 70, 66, 40, 34), third=True),
    dict(new="es-niko-095", no=83, name="Niko", alias="NiKo、尼公子、沙鹰之王、夜店小王子",
         desc="波黑 CS 职业选手 Nikola Kovač，以顶级步枪能力和沙鹰名场面著称。",
         cat="es", dims=(62, 84, 86, 58, 64, 50), real=True),
    dict(new="mem-deepseek-096", no=84, name="DeepSeek 大肥鱼", alias="大肥鱼、蓝色大肥鱼、鲸鱼娘、鱼鱼",
         desc="DeepSeek 社区二创角色，源于蓝色鲸鱼标识的趣味拟人化，常被塑造成蓝发、鲸尾形象。",
         cat="scr", dims=(48, 56, 16, 82, 38, 54), third=True),
    dict(new="mem-tianzaitian-097", no=85, name="田一名", alias="油王、超级偶像",
         desc="网络歌手及短视频创作者，因翻唱《热爱105℃的你》和相关模仿视频走红。",
         cat="intp", dims=(88, 78, 50, 60, 66, 68), real=True),
    dict(new="mem-liuzhimin-098", no=86, name="柳智敏", alias="Karina、娜娜",
         desc="韩国女团 aespa 成员，以舞台表现、外貌辨识度和个人风格受到关注。",
         cat="intp", dims=(52, 80, 40, 62, 54, 66), real=True),
    dict(new="mem-piaocaiying-099", no=87, name="朴彩英", alias="Rosé、肉肉、人间蜜嗓、澳洲野玫瑰",
         desc="BLACKPINK 成员及个人歌手，以辨识度很高的嗓音和个人音乐作品出圈。",
         cat="intp", dims=(46, 74, 32, 66, 52, 64), real=True),
    dict(new="intp-takaichi-100", no=88, name="高市早苗", alias="高市首相、早苗",
         desc="日本政治人物，因政治立场、演讲和公开活动受到关注。",
         cat="intp", dims=(64, 88, 80, 62, 76, 54), real=True),
    dict(new="mem-feihongxiaomao-101", no=89, name="绯红小猫", alias="KittyxKum",
         desc="按用户确认的网络创作者 KittyxKum 记录，保留原名称和对应身份。",
         cat="intp", dims=(70, 62, 40, 66, 58, 60), real=True),
    dict(new="mem-wanoujiejie-102", no=90, name="玩偶姐姐", alias="HongKongDoll、HK Doll",
         desc="网络内容创作者，以「玩偶姐姐」艺名和标志性口罩形象为人熟知。",
         cat="intp", dims=(48, 66, 30, 58, 62, 48), real=True),
    dict(new="mem-naimi-103", no=91, name="奶咪", alias="Naimi、Anaimiya",
         desc="网络内容创作者，主要涉及短视频、穿搭、舞蹈、写真和日常影像。",
         cat="intp", dims=(62, 64, 32, 58, 56, 62), real=True),
]

DIM_KEYS = ["EE", "ST", "AC", "HX", "RB", "SR"]


def main() -> int:
    doc = json.loads(DATA.read_text(encoding="utf-8"))
    old = {p["id"]: p for p in doc["personas"]}

    out = []
    for r in R:
        base = old.get(r.get("keep", ""), None) or old.get(r.get("new", ""), None)
        pid = r.get("keep") or r["new"]
        dims = dict(zip(DIM_KEYS, r["dims"]))
        assert all(isinstance(v, int) and 0 <= v <= 100 for v in dims.values()), pid

        reasons = []
        if r.get("real"):
            reasons.append("realPersonControversy")
        if r.get("third"):
            reasons.append("thirdPartyIP")

        item = dict(base) if base else {}
        item.update(
            id=pid,
            name=r["name"],
            alias=r["alias"],
            category=r["cat"],
            tags=base["tags"] if base else ["网络人物", "档案卡"],
            dims=dims,
            desc=r["desc"],
            cardType=base["cardType"] if base else "text",
            placeholder=base["placeholder"] if base else True,
            source=f"{SRC_DOC}#{pid}",
            evidence="OBSERVED",
            compliance={
                "restricted": bool(reasons),
                "restrictedReason": reasons,
                "matchPool": True,
                "resultCardEnabled": True,
            },
            usageNote=(r.get("note") or ("真实在职个人：不盗用肖像，不推断心理与私生活，文案不得写成对真人外貌的贬损。" if r.get("real") else "—")),
            rarity=base["rarity"] if base else "common",
            rarityBasis=base["rarityBasis"] if base else "主控按热度与辨识度分档（非 04 原卡判定）",
            imageUrl=f"/assets/personas/{pid}.png",
            imageKind=base["imageKind"] if base else "placeholder",
        )
        out.append(item)

    doc["personas"] = out
    doc["version"] = 2
    doc["generatedAt"] = "2026-11-05"
    doc["note"] = (
        "v2：按用户 2026-11-05 定稿名单重建为 91 人（严格按名单，不在名单上的旧条目已下线）。"
        "名称、别称、简介取自用户名单原文；dims 为六维设计打分（0-100），非实测值。"
        "沿用旧条目的剧情判定沿用原 id 与 compliance。"
    )
    DATA.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    from collections import Counter

    print("personas:", len(out))
    print("categories:", dict(Counter(p["category"] for p in out)))
    print("ids unique:", len({p["id"] for p in out}) == len(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
