# TEST-REPORT-2026-11-05 · 第三阶段 H5 测试验收（终版）

> 责任人：风控审查（QA）｜作用域：`tests/**` + `docs/TEST-*.md`
> 判定口径：`docs/DEV-CONTROL.md` §4 + `docs/TEST-PLAN.md` + 主控历次裁决
> 证据等级：VERIFIED（有可复现命令与原始输出）/ OBSERVED / INFERRED / NOT RUN

## 0. 结论总表

**读数绑定**（主控口径：数字必须挂到 commit 上，且写「跑的那一刻的 HEAD」）

| 项 | 值 |
|---|---|
| 基线 commit | `2fe82be`（三条新断言入库） |
| 最终复验 commit | `d10f1d3`，`git status --porcelain` 无输出 |
| 最终复验时刻 | 2026-11-05T01:03:25 |
| 复验结果 | `Test Files 3 passed (3)` / `Tests 29 passed (29)` / TEST_EXIT=0 |
| 说明 | HEAD 会移动，故本表写**跑的那一刻的 HEAD**，不写「报告时的 HEAD」。两个 commit 上均跑出 29。 |

| 项 | 结论 | 证据 | 等级 |
|---|---|---|---|
| 单元测试（Vitest） | **PASS** | `Test Files 3 passed (3)` / `Tests 29 passed (29)` / EXIT=0 | VERIFIED |
| 类型检查（tsc） | **PASS** | `pnpm typecheck` EXIT=0 | VERIFIED |
| 构建（含 typecheck） | **PASS** | `pnpm build` EXIT=0 | VERIFIED |
| E2E 三屏 + 分享（Playwright，双视口） | **PASS** | 14 passed / 0 failed / 0 skipped，落盘 `test-results/e2e.json`（24611 B，00:29:09） | VERIFIED |
| E2E 稳定性（连跑） | **PASS** | 连续 4 次均 14 passed / EXIT=0 | VERIFIED |
| 结果页六维 == 引擎 `user.x*100` | **PASS** | 六维 `100/81/100/100/73/21`，逐维差 < 0.5 | VERIFIED |
| 分享链接 `?r=` 他人打开一致 | **PASS** | 全新 context 打开，主匹配与六维与直连一致 | VERIFIED |
| 移动端 390/360 无横向溢出 | **PASS** | 两视口 `scrollWidth == clientWidth`，溢出 0px | VERIFIED |
| 按钮热区 ≥44px | **PASS** | 最小 52×44（重测），其余 320/350×44~56 | VERIFIED |
| 素材红线（无第三方图片） | **PASS** | 首页/结果页远程图片域名 = 空 | VERIFIED |
| 真机 / 微信内置浏览器 | **NOT RUN** | 本机无真机 | NOT RUN |
| 横屏 / 弱网 / 安全区 | **NOT RUN** | 未构造 | NOT RUN |
| 海报 Canvas 导出 PNG | **NOT RUN** | 未纳入本轮断言 | NOT RUN |

**单元测试通过 ≠ 产品可用；Chromium 视口模拟 ≠ 微信内置浏览器实测。** 两类分开陈述，不合并。

## 1. 怎么跑（可复现）

```bash
cd persona-archive

# ① 单元测试
pnpm test                      # Test Files 3 passed / Tests 29 passed

# ② 类型检查、③ 构建
pnpm typecheck                 # EXIT=0
pnpm build                     # EXIT=0（已含 typecheck）

# ④ E2E（须先保证 8790 稳定实例在线；配置默认 baseURL 已是 8790，webServer 用生产产物）
pnpm test:e2e                  # 14 passed / 0 failed / 0 skipped
```

**E2E 环境前提（硬性）**：`baseURL` 默认 `http://127.0.0.1:8790`，且 `webServer` 启动的是
`node dist/api/src/api/server.js`（生产产物、**不带 watch**）。配置内已写入警告注释：**严禁改回 `pnpm dev`**。

## 2. 单元测试 29 项

| 文件 | 项数 | 覆盖 |
|---|---|---|
| `tests/data/contract.test.ts` | 9 | 数据契约：字段齐全、六维 0–100 有限数、id 唯一、素材红线、选项 effects 合法性 |
| `tests/engine/match.test.ts` | 16 | 表达式求值 4 项；匹配主函数 9 项（确定性、四段结构、纯函数、值域、极值鲁棒）；进池防回归 1 项；逐档 σ 2 项 |
| `tests/engine/single-path.test.ts` | 1 | 静态断言：`src/web` 不得出现 `normalizeDims` / `scoreAnswers`（注释行除外） |

### 2.1 三条关键断言均做过变异验证（未变异的断言 = 没有断言）

| 断言 | 注入的破坏 | 结果 |
|---|---|---|
| 进池 12 / 出池 0 | 判据 `matchPool === false` → `restricted === true` | **FAIL**，报出 10 人出池；还原后 26 passed |
| 逐档 σ（common/rare/limited/hidden） | 分别改 `hidden 0.15→0.22`、`limited 0.18→0.25`、`rare 0.18→0.20` | **三次全部 FAIL**；还原后 26 passed |
| `src/web` 无第二套算法 | 向 `src/web/lib/api.ts` 追加 `const scoreAnswers = ...` | **FAIL**，定位到具体文件行；还原后 26 passed |

## 3. E2E 14 项（双视口 × 5 组用例 + 六维一致性）

| 用例 | 390×844 | 360×640 |
|---|---|---|
| 首页可访问且无横向溢出 | PASS | PASS |
| 首页不引用第三方图片（素材红线） | PASS | PASS |
| 全流程：首页 → 答题 → 结果 | PASS | PASS |
| 答题页无横向溢出 | PASS | PASS |
| 分享结果链接 `?r=`：他人打开直达结果页且数值一致 | PASS | PASS |
| 热区与溢出实测取证（measure） | PASS | PASS |
| 结果页六维数值必须等于引擎 `user.x*100`（dims-consistency） | PASS | PASS |

**本轮变化**：此前 2 个 skipped 的「分享结果链接」用例**已去掉过期 skip 并真实执行**——跳过的理由是"分享功能未交付"，而该功能早已交付。现在用**全新 browser context**（清空本地存档）打开分享链接，验证访客能直达结果页且六维与直连一致。

### 3.1 六维一致性断言（P0 回归守护）

三个断言并用，缺一不可：

```
① 极差 ≥ max(50, 期望极差-10)     防"压缩/缩放"型（normalizeDims 会把极差压到 50 以下）
② |page - engine.user.x*100| < 0.5  防平移 / 错序 / 单位换算型（页面必须是引擎值四舍五入结果）
③ 主匹配名 == 引擎 main.persona.name 防主人物取列表第一条
④ /api/questions 响应必须含 theme   防前端静默走 DEFAULT_THEME_WEIGHTS 兜底（"结果对"≠"路径对"）
```

实测：引擎 `100/81/100/100/72.7/20.6`，页面显示 `100/81/100/100/73/21`，逐维差均 < 0.5。

**变异验证（已做）**：向 `App.tsx` 注入 `+20` 平移后重跑，断言立刻 FAIL 并报出偏差值；还原后恢复 14 passed。

**⚠️ 已知边界（非缺陷）**：极差判据对"整体平移、顺序错乱、两维互换"不敏感（三者极差均不变）。因此**极差只作快速失败前置**，正式判据是②的逐维绝对值。

## 4. 移动端实测原始数字

```
390×844  首页 320... scrollWidth=390 clientWidth=390 overflow=false
[首页]   开始按钮 350x44
[答题页] 选项 350x56 ×4；下一题 350x44
[结果页] 重测 52x44；分享给朋友 350x44；overflow=false

360×640  scrollWidth=360 clientWidth=360 overflow=false
[首页]   开始按钮 320x44
[答题页] 选项 320x56 ×4；下一题 320x44
[结果页] 重测 52x44；分享给朋友 320x44；overflow=false
```

全部按钮高度 ≥44px，最小为「重测」52×44（高度恰好达标，无余量）。

> ⚠️ Chromium 视口模拟，非微信内置浏览器实测。X5/WKWebView 的真实渲染、字体回退、安全区均 **NOT RUN**。

## 5. NOT RUN 清单（如实列出，未改写为成功）

| 项 | 状态 | 原因 |
|---|---|---|
| 微信内置浏览器（iOS / Android 真机） | **NOT RUN** | 本机无真机 |
| 横屏布局 | **NOT RUN** | 未构造 |
| 弱网 / 断网恢复 | **NOT RUN** | 未构造 |
| 真机安全区（刘海/底部横条） | **NOT RUN** | 需真机 |
| 海报 Canvas 导出 PNG | **NOT RUN** | 功能未交付 |
| 引擎「意外组合层」 | **NOT RUN** | 池 12 < 门槛 40，该分支从未执行（属算法开发域，已在其文档标注） |

## 6. 本轮修复的两处测试侧缺陷

### 6.1 reporter 不落盘（严重，已修复）

**现象**：E2E 跑过，但 `tests/e2e/test-results/` 为空——**测试跑过了却没留下证据**。

**根因**：`reporter` 的 `outputFile: 'test-results/e2e.json'` 使用**相对路径**，而 `testDir: '.'` 使它按测试目录解析，路径漂移导致文件未生成（删除后重跑完全不重建）。

**修复**：改为绝对路径 `resolve(HERE, 'test-results/e2e.json')`。

**修复后验证**：删除目录 → 重跑 → `e2e.json` 生成（24611 B，00:29:09），内容 `passed=14 / skipped=0 / failed=0`，**与终端输出逐项一致**，且逐条可查（含分享用例、六维用例均为 passed）。

**这条比任何断言失败都严重**：断言失败至少留下记录，不落盘意味着"跑过了等于没跑"。

### 6.2 E2E 配置指向 watch 实例（已修复）

`baseURL` 默认值原为 5173（`tsx watch` dev 端口）、`webServer` 原为 `pnpm dev`，导致 4 个 `timedOut`。改为默认 8790 + 生产产物后超时全部消失。配置内已写入"严禁改回"的注释。

## 7. 缺陷台账

| 编号 | 现象 | 性质 | 状态 |
|---|---|---|---|
| Q-1 | E2E reporter 不落盘 | 测试基础设施缺陷 | **FIXED**（绝对路径） |
| Q-2 | E2E 默认打 5173 watch 实例致超时 | 配置缺陷 | **FIXED**（默认 8790 + 生产产物） |
| Q-3 | 分享用例 skip 理由过期（功能已交付仍 skip） | 测试维护缺陷 | **FIXED**（改为真跑并通过） |
| Q-4 | 静态断言缺变异验证 | 测试有效性缺口 | **FIXED**（注入后 FAIL，已还原） |
| Q-5 | 结果页六维显示与引擎不一致（52/51/52/51/51/49 vs 100/81/100/100/73/21） | **「单一计算路径被破坏」——不是渲染错误**（见下） | **FIXED**（前端改调引擎，六维取 `user.x*100`） |

### 7.1 Q-5 的归类说明（重要）

这条**不是「前端渲染错误」**，而是**同一份数据被算了两遍、两套公式**。归类为「单一计算路径被破坏」或「断言覆盖不足」才准确。

**理由**：渲染错误只影响展示，改那一段即可验证；**计算路径被破坏则必须做端到端一致性验证**——因为页面每一步都能跑、数字看起来也像合理的分数（52 不是明显异常值），只有「页面数 == 引擎数」这个跨层比对能发现。

**这类 bug 的共同特征**（本项目实测两次）：
1. 每一步单独看都能跑通，没有报错、没有崩溃
2. 结果落在合理范围内，肉眼无法判断对错
3. 常规断言（「有数字渲染出来」「元素存在」）全部通过
4. 只有**跨层数值比对**能抓到

**对应的守护手段**：`tests/e2e/dims-consistency.e2e.ts` 的四层断言 + `tests/engine/single-path.test.ts` 静态断言（禁止 `src/web` 出现第二套算法实现）。前者抓「算错了」，后者抓「又写了一版但当前碰巧算对」。

**本轮我个人的方法论错误（如实记录）**，与主控同期出现的三次属同一类——**只看到部分输出就下结论**：

1. 首版 E2E 用臆造 testid（`[data-testid="option"]`），实际 DOM 是 `button.option`，导致**假阴性**误报"三屏闭环断点"。
2. 断言六维时用正则假设"标签与数值同行"，实际页面是分行渲染，导致误报"未渲染出六维"。
3. 连续两轮报"E2E 12 passed"，却在主控查文件时为 0 字节——**没有先确认落盘就报通过**。

**共同教训**：断言假设了某种页面结构，而页面并不按那个结构渲染；以及"终端绿了"不等于"证据留下了"。**此后所有通过结论必须先确认证据文件存在且内容一致。**

## 8. 诚实性声明

- 真机与微信内置浏览器：**NOT RUN**，未用任何设备模拟冒充。
- 本报告的每个 PASS 均可由 §1 的命令复现；每个 NOT RUN 均写明原因。
- 失败项、跳过项、未覆盖项均如实保留，未删除、未改写。
- 未声称「微信传播已合规」。

## 附：本轮产出文件

| 文件 | 内容 |
|---|---|
| `docs/TEST-PLAN.md` | 测试入口约定、分层判据、诚实性约束 |
| `docs/TEST-REPORT-2026-11-04.md` | 首版报告（基线搭建期） |
| `docs/TEST-REPORT-2026-11-05.md` | 本报告（验收终版） |
| `tests/data/contract.test.ts` | 数据契约 9 项 |
| `tests/engine/match.test.ts` | 引擎 16 项（含进池防回归、逐档 σ） |
| `tests/engine/single-path.test.ts` | 唯一计算路径静态断言 1 项 |
| `tests/e2e/playwright.config.ts` | E2E 配置（双视口、8790、绝对路径输出） |
| `tests/e2e/screens.e2e.ts` | 三屏 + 分享链路 |
| `tests/e2e/dims-consistency.e2e.ts` | 六维与引擎一致性（4 条断言） |
| `tests/e2e/measure.e2e.ts` | 热区与溢出实测取证 |
