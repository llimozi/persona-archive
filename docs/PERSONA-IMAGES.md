# 人物配图来源

- 整理人：主控（Chief）
- 更新时间：2026-11-05
- 处理方式：统一居中裁切为正方形 → 缩放到 512×512 → PNG，输出到 `public/assets/personas/<id>.png`
- 处理脚本：`tools/apply-real-avatars.py`（可重跑，找不到源文件的自动跳过、保留占位）

## 已换真实图片（7 张）

| 人物 | ID | 来源 | 说明 |
|---|---|---|---|
| 奶龙 | `mem-nailong-001` | [萌娘百科·奶龙](https://zh.moegirl.org.cn/奶龙) | 条目内角色单人立绘 |
| 背手负鼠 | `ani-opossum-004` | [Sixth Tone 报道](https://www.sixthtone.com/news/1018605) | 从报道配图中央裁出负鼠本体 |
| 哭哭马 | `ani-cryinghorse-005` | [中国义乌网报道](http://news.zgyww.cn/system/2026/01/14/010296697.shtml) | 裁出马头区域 |
| 咕噜耄 | `mem-gulumao-021` | [B站官方账号](https://space.bilibili.com/2930404) | 该账号本人的头像（橘猫形象），UP 主本人不露脸 |
| 贝利亚奥特曼 | `an-belial-001` | [萌娘百科·贝利亚奥特曼](https://zh.moegirl.org.cn/贝利亚奥特曼) | 条目主图，上对齐保留头部 |
| 迪迦奥特曼 | `an-diga-002` | [萌娘百科·迪迦奥特曼](https://zh.moegirl.org.cn/迪迦奥特曼) | 条目主图，裁切避开标题文字 |
| 赛罗奥特曼 | `an-sairo-003` | [萌娘百科·赛罗奥特曼](https://zh.moegirl.org.cn/赛罗奥特曼) | 条目主图 |

## 仍为占位头像（5 张）

| 人物 | ID | 未采用原因 |
|---|---|---|
| coke老师 | `mem-coke-003` | 找到的均为多栏报道拼图，无法分离出单张可用正面照 |
| 忧郁姐 | `mem-sorrowlady-006` | 报道配图均为评论区截图或仿妆拼图，原剧单人画面无法干净裁出 |
| 不烧心良心老板 | `mem-bushaoxin-007` | AI 漫剧无统一固定形象（包子铺/盒饭摊/猪脚饭摊主轮换），不存在"该角色的图" |
| 世界巡演 AI 二创宇宙 | `mem-musicai-009` | 该条目是二创模板而非单个角色，本身没有对应形象 |
| 酱板鸭 | `sd-jiangbanya-012` | 只找到《雪山救狐》中**白狐化身**的剧照；报道明确白狐与酱板鸭是**两个不同角色**，用于酱板鸭卡属张冠李戴，故不采用 |

## 使用说明

- 本项目的图片仅作**娱乐展示**用途，未取得上述形象的商业授权。
- 若后续需要对外发布或商用，须重新评估授权问题，不能沿用本目录的图片。
- 数据侧用 `imageKind` 标注：`official` = 真实图片，`placeholder` = 生成式占位头像；
  `cardType` 同步为 `image` / `text`。`validate-data` 会强制校验：
  每人都必须有 `imageUrl`、路径必须含本人 id（防错配）、文件必须真实存在。
