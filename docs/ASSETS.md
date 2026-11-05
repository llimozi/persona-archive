# 素材与依赖登记（ASSETS）

本文件记录项目内所有第三方素材、字体、库的来源与用途，便于追溯与替换。

**统一规则**：所有资源一律下载到项目内自托管，运行时**不依赖任何外部 CDN**。
原因是在国内网络与微信内置浏览器下外链不稳定，且外链图片会污染 Canvas，导致海报导出失败。

- 最后更新：2026-11-06（第七轮：90 张角色照片全量替换）

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

### 真实图片（90 位）

**2026-11-06 全量替换**：由用户统一提供 90 张角色照片，覆盖此前所有占位头像。

| 项 | 内容 |
|---|---|
| 来源 | **用户提供**（DoubaoWork 会话目录 `人物档案`） |
| 数量 | 90 张（01–91 号，缺 14 号马志辉） |
| 原始格式 | PNG 43 张 / JPEG 47 张 |
| 原始体积 | 36.2 MB（最大单张 4.9 MB、5000px） |
| 处理后 | **512×512 RGB PNG，共 23.1 MB** |
| 处理脚本 | `tools/apply-persona-photos.py` |

**处理链**：居中裁成正方形（不拉伸变形）→ LANCZOS 缩放到 512×512 →
透明底铺白（避免 PNG 半透明边在卡片上发灰）→ 存 RGB PNG。

**压缩效果**：36.2 MB → 23.1 MB，省 13.1 MB。压缩最多的：
黄仁勋 4900KB→296KB、余承东 2995KB→325KB、牛来 2476KB→470KB、
甲亢哥 1987KB→222KB、奶咪 1801KB→322KB。

### 占位头像（1 位）

| 角色 | ID | 原因 |
|---|---|---|
| 马志辉 | `mem-bushi-027` | 隐藏角色，用户指定先跳过，暂无照片 |

占位头像为生成式设计，按分类区分配色与纹样。脚本 `tools/gen-persona-avatars.py`。

---

## 五、质感素材

### 馆藏档案纸底图（用户提供）

| 项 | 内容 |
|---|---|
| 文件 | `public/assets/bg/archive-bg.svg` |
| 来源 | **用户直接提供**（`archive-bg.svg`，2026-11-05 微信传输） |
| 用途 | 全站底层背景，由 `Page` 骨架的 `.paper-bg` 固定铺满 |
| 原始 | 390×844 竖屏构图，22 KB（含 C2PA 元数据） |
| 处理后 | 253 KB —— 31 处 `<text>`（30 个网格编号 + 印章 4 行文字）**转曲为 `<path>`** |
| 处理脚本 | `tools/build-archive-bg.py` |

**为什么转曲**：原图文字用 `Songti SC, Noto Serif SC, serif` 与 `Courier New,monospace`，
Windows 上根本没有 Songti SC，不转曲会在不同设备上静默回退成别的字体甚至方框。
转曲时字形取自项目自带的 `serif-subset.woff2`，不依赖任何系统字体。
同时剥掉了 C2PA 元数据（对渲染无意义）。

**铺满策略**：竖屏按宽度铺满；宽屏锁 `520px` 居中并整体压淡，避免 390 的网格被放大
3 倍后穿过正文；答题页单独再压一档（该屏信息密度最高）。
影像加载失败时退回 `--paper-2` 底色 + `body::before` 的 CSS 条纹，不会出现白块。

其余质感**全部为代码生成，未引用任何外部图片文件**：

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
