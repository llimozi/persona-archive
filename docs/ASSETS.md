# 素材与依赖登记（ASSETS）

本文件记录项目内所有第三方素材、字体、库的来源与用途，便于追溯与替换。

**统一规则**：所有资源一律下载到项目内自托管，运行时**不依赖任何外部 CDN**。
原因是在国内网络与微信内置浏览器下外链不稳定，且外链图片会污染 Canvas，导致海报导出失败。

- 最后更新：2026-11-05（第五轮）

---

## 一、运行时依赖（库）

| 库 | 版本 | 用途 | 加载方式 | 体积（gzip） |
|---|---|---|---|---|
| `gsap` | 3.15.1 | 揭晓仪式的抽屉与六维数值的弹性动画 | **按需**动态 import，仅结果揭晓时下载 | 28.1 KB（独立 chunk） |
| `canvas-confetti` | 1.9.4 | 「连点印章」彩蛋的朱红纸屑 | **按需**动态 import，仅触发彩蛋时下载 | 4.29 KB（独立 chunk） |

**为什么按需**：两者都只在极少数时刻使用，压进首屏包不值得。Vite 已切成独立 chunk，
正常浏览首页 / 答题页不会下载它们。任一库加载失败都会被捕获并跳过特效，**不影响主流程**。

**没有采用的库及原因**：

- `lottie-web` —— 解包 25 MB，动画还需额外 JSON 资源，为少量装饰付出的代价过大，改用 CSS 关键帧 + GSAP。
- `motion`（Framer Motion）—— 9 MB，本项目动画大多是一次性关键帧，CSS 已能覆盖，不值得引入。

---

## 二、字体（自托管 + 子集化）

| 字体 | 来源 | 许可 | 用途 | 文件 | 体积 |
|---|---|---|---|---|---|
| Noto Serif SC 700 | Google Fonts | SIL Open Font License | 标题、人名、印章文字（`--font-serif`） | `public/assets/fonts/serif-subset.woff2` | 264 KB |
| Noto Sans SC 700 | Google Fonts | SIL Open Font License | 正文、按钮、UI（`--font`） | `public/assets/fonts/sans-subset.woff2` | 264 KB |

**子集化做法**：`tools/build-font-subset.py`

1. 请求 Google Fonts 的 css2，拿到全部 unicode-range 切片清单（各 101 片）；
2. 只下载**覆盖项目字符集**的切片（37 片）；
3. 用 fontTools 合并、再按字符集裁剪，输出 woff2。

字符集来自 `data/personas.json`、`data/questions.json` 与所有 `.tsx/.ts` 源码，共 **1479 个唯一字符**。

**兜底**：`font-display: swap` —— 字体未就绪时先用系统字体渲染，不阻塞首屏；
字体文件 404 或加载失败时自动回退到系统字体栈，页面不会白屏或缺字。

**未采用**：GitHub Releases 上的霞鹜文楷完整包下载超时（4.5 MB 反复中断），改用 Google Fonts 切片方案。

---

## 三、图标

| 图标集 | 来源 | 许可 | 用法 | 文件 |
|---|---|---|---|---|
| Lucide | https://github.com/lucide-icons/lucide | ISC | 内联 React 组件，零请求 | `src/web/components/Icons.tsx` |

当前使用：`archive`（档案）、`stamp`（印章）、`chevron-down`（展开）、`chevron-right`、
`share-2`（分享）、`image`（海报）、`arrow-right`（前进）、`rotate-ccw`（重测）、`scan-line`（扫描）。

**为什么内联**：无额外网络请求、颜色继承 `currentColor`、不会因外链失败出现空白。
生成脚本：`tools/build-icons.py`（原始 SVG 从 Lucide 仓库下载后转换）。

---

## 四、人物图片

### 真实图片（9 位）

| 人物 | ID | 来源 | 说明 |
|---|---|---|---|
| 奶龙 | `mem-nailong-001` | [萌娘百科·奶龙](https://zh.moegirl.org.cn/奶龙) | 角色单人立绘 |
| 背手负鼠 | `ani-opossum-004` | [Sixth Tone 报道](https://www.sixthtone.com/news/1018605) | 报道配图中央裁出本体 |
| 哭哭马 | `ani-cryinghorse-005` | [中国义乌网报道](http://news.zgyww.cn/system/2026/01/14/010296697.shtml) | 裁出马头区域 |
| 咕噜耄 | `mem-gulumao-021` | [B站官方账号](https://space.bilibili.com/2930404) | 账号头像（本人使用此橘猫形象） |
| 贝利亚奥特曼 | `an-belial-001` | [萌娘百科](https://zh.moegirl.org.cn/贝利亚奥特曼) | 条目主图，上对齐保留头部 |
| 迪迦奥特曼 | `an-diga-002` | [萌娘百科](https://zh.moegirl.org.cn/迪迦奥特曼) | 条目主图 |
| 赛罗奥特曼 | `an-sairo-003` | [萌娘百科](https://zh.moegirl.org.cn/赛罗奥特曼) | 条目主图 |
| **熊大（回眸）** | `an-xiongda-004` | [萌娘百科·熊大](https://zh.moegirl.org.cn/熊大) | **本轮新增**：白底立绘 |
| **德拉科·马尔福** | `scr-malfoy-005` | [萌娘百科·德拉科·马尔福](https://zh.moegirl.org.cn/德拉科·马尔福) | **本轮新增**：条目主图（同人绘） |

处理方式：居中裁方 → 缩放 512×512 → PNG，脚本 `tools/apply-round5-images.py`。

### 占位头像（69 位）

生成式设计，按分类区分配色与纹样（点阵 / 斜纹 / 圆环 / 网格 / 人字），
带双线装裱框、四角角标、大字投影与编号栏。脚本 `tools/gen-persona-avatars.py`。
**不是第三方素材**，真图补齐后直接覆盖同名文件即可。

### 联网寻找失败（保留占位）

`卡皮巴拉`、`水豚`、`负鼠`、`马尔福`（单字查询）等在萌娘百科无图或返回空；
其余 60 余位为网络梗、AI 漫剧角色、虚拟人设，本身没有固定形象，保留占位头像更合适。

---

## 五、质感素材

**全部为代码生成，未引用任何外部图片文件**：

- 纸张噪点 / 纤维：CSS `repeating-linear-gradient` + 内联 SVG `feTurbulence`；
- 暗角：CSS `radial-gradient`；
- 印章油墨不匀：`radial-gradient` 叠加 + 不规则 `border-radius`；
- 海报纸纹 / 暗角 / 墨条：Canvas 原生绘制。

这样做的原因：外链贴图会触发 Canvas 污染导致海报导出失败，且额外增加请求。

---

## 六、体积预算

| 项 | gzip 体积 | 说明 |
|---|---|---|
| 首屏 JS | 66.72 KB | 主包 |
| 首屏 CSS | 8.35 KB | 主样式 |
| GSAP（按需） | 28.10 KB | 仅揭晓仪式 |
| confetti（按需） | 4.29 KB | 仅彩蛋 |
| 中文字体（按需） | 264 KB × 2 | 静态资源，`font-display: swap` |

**首屏 JS + CSS 合计约 75 KB（gzip）**，重型库不进入首屏。
