# TEST-REPORT-2026-11-04 · 第三阶段 H5 测试基线

> 责任人：风控审查（QA）｜作用域：`tests/**` + `docs/TEST-*.md`
> 判定口径：`docs/DEV-CONTROL.md` §4 + `docs/TEST-PLAN.md`

## 0. 一句话结论

| 项 | 结论 | 计数 |
|---|---|---|
| 单元测试（Vitest） | **PASS** | 23 通过 / 0 失败 / 0 跳过 |
| 类型检查（tsc） | **PASS** | 退出码 0 |
| E2E 三屏（Playwright，稳定实例） | **PASS** | 8 通过 / 0 失败 / 2 按设计跳过 |
| 移动端实测（390×844 / 360×640） | **PASS** | 见 §4 原始数字 |
| 真机 / 微信内置浏览器 | **NOT RUN** | 本机无真机，未验证 |
| 疑似 502 中断 | **已定位，非产品缺陷** | 见 §6 |

**单元测试通过 ≠ 产品可用**；**桌面浏览器视口模拟 ≠ 微信内置浏览器实测**。以下分节写清，不合并表述。

---

## 1. 怎么跑（可复现）

```bash
cd persona-archive

# 单元测试（引擎 + 数据契约）
pnpm test

# 类型检查
pnpm typecheck

# E2E：必须先起**不带 watch 的稳定实例**，否则会被热重载打断（见 §6）
pnpm build
API_PORT=8790 node dist/api/src/api/server.js &          # API 稳定实例，PID 固定
API_PORT=8790 npx vite preview --config vite.config.ts --port 4173 &
E2E_NO_SERVER=1 E2E_BASE_URL=http://127.0.0.1:4173 \
  npx playwright test --config tests/e2e/playwright.config.ts
```

**依赖说明**：`@playwright/test` 当前尚未进根 `package.json`（根配置归后端）。
本次执行用临时目录 `~/.qa-pw` 安装 Playwright 1.64.1 + Chromium，**未改动项目根配置**。
待后端加入依赖后，上述命令里 `npx playwright` 可直接用根 `pnpm exec playwright`。

## 2. 单元测试（23/23 PASS）

原始输出：

```
$ vitest run --config vitest.config.ts
 ✓ tests/data/contract.test.ts (9 tests) 40ms
 ✓ tests/engine/match.test.ts (14 tests) 171ms
 Test Files  2 passed (2)
      Tests  23 passed (23)
```

### 2.1 `tests/data/contract.test.ts`（9 项）

校验 `data/personas.json` 与 `data/questions.json` 是否满足契约：

- 人物字段齐全（id/name/category/tags/dims/desc）
- `dims` 含齐六维、均为 0–100 有限数、无未定义维度
- 人物 id 唯一
- 素材红线：含远程图片 url 但未标 `placeholder` 即 FAIL
- 题目字段齐全、选项 ≥2、`effects` 只含六维且为有限数、id 唯一

### 2.2 `tests/engine/match.test.ts`（14 项）

| 分组 | 用例 | 说明 |
|---|---|---|
| A 表达式求值 | 4 项 | `parseExpression` / `evalCondition` / `wildcardMatch`；缺失维度按 0.5 中性、语法错误返回 null |
| B 匹配主函数 | 9 项 | 确定性（连跑 5 次逐字节一致）、四段结构、不修改入参（纯函数）、六维值域 [0,1]、排序无重复、空作答/单题作答不抛异常、池状态字段 |
| C 进池防回归 | 1 项 | 12 人全入池、出池 0 人（见 §2.3） |

### 2.3 进池判据断言的变异测试（证明断言有效，不是摆设）

主控 23:56 要求补的「12 人入池、出池 0 人」断言已落地。为证明它**真能抓住回归**，做了注入实验：

```
注入：match.ts 判据 matchPool === false  →  restricted === true
结果：FAIL —— 出池人数应为 0，实际 10（奶龙、coke、背手负鼠、哭哭马、忧郁姐、
      世界巡演 AI 宇宙、贝利亚、迪迦、赛罗、酱板鸭 被误拦）
还原后：Tests 23 passed (23)
```

**这是关键证据**：误用 `restricted` 会让池从 12 降到 2，但其余全部用例依然会绿。
补这条断言前后，只有它能抓住该回归。

## 3. E2E 三屏（8 通过 / 2 跳过 / 0 失败）

执行环境：`pnpm build` 产物 + `node dist/api/src/api/server.js`（**无 watch**）+ `vite preview`，
API PID 固定，全程未重启。两个视口各跑一轮：390×844、360×640。

| # | 用例 | 390 | 360 |
|---|---|---|---|
| 1 | 首页可访问且无横向溢出 | PASS | PASS |
| 2 | 首页不引用第三方图片（素材红线） | PASS | PASS |
| 3 | 全流程：首页 → 答题 → 结果 | PASS | PASS |
| 4 | 答题页无横向溢出 | PASS | PASS |
| 5 | 分享结果链接 `?r=<token>` | SKIP | SKIP |

**第 5 项按设计跳过**：`?r=<token>` 独立结果链接尚未交付，标 **NOT RUN**，不计入通过。

## 4. 移动端实测原始数字

```
viewport=390x844 首页   scrollWidth=390 clientWidth=390 overflow=false
[首页]   开始按钮      350x44
[答题页] scrollWidth=390 clientWidth=390 overflow=false
[答题页] 选项1~4       350x56
[答题页] 下一题        350x44
[结果页] scrollWidth=390 clientWidth=390 overflow=false
[结果页] 重测          52x44
[结果页] 分享给朋友    350x44

viewport=360x640 首页   scrollWidth=360 clientWidth=360 overflow=false
[首页]   开始按钮      320x44
[答题页] 选项1~4       320x56
[答题页] 下一题        320x44
[结果页] 重测          52x44
[结果页] 分享给朋友    320x44
```

判定：**两视口均无横向溢出；全部按钮热区 ≥44px（最小 52×44 的重测按钮，高度正好 44px，达标无余量）**。

> ⚠️ 这是 **Chromium 视口模拟**，不是微信内置浏览器实测。X5/WKWebView 的真实渲染、字体回退、安全区适配均 **NOT RUN**。

## 5. 未覆盖 / 跳过 / NOT RUN 清单（如实列出）

| 项 | 状态 | 原因 |
|---|---|---|
| 微信内置浏览器（iOS / Android 真机） | **NOT RUN** | 本机无真机 |
| 结果页整屏截图 | **NOT RUN** | 未纳入本轮断言 |
| 分享 / 独立结果链接 `?r=<token>` | **NOT RUN** | 功能未交付 |
| 海报 Canvas 导出 PNG | **NOT RUN** | 功能未交付 |
| 引擎「意外组合层」 | **NOT RUN** | 池需 ≥40 人，当前 12 人，该分支恒不执行（算法开发已同判） |
| 引擎 `limited` 以外的稀有度边界 | 部分覆盖 | 四档均有真实数据，但档位间的 σ 边界行为未逐档断言 |
| 真机安全区（iPhone 刘海/底部横条） | **NOT RUN** | 需真机 |
| 弱网 / 断网恢复 | **NOT RUN** | 未构造 |
| 并发请求压力 | **NOT RUN** | 非本轮范围 |
| API 单元测试（`src/api/**`） | **未覆盖** | 本轮只做契约 + 引擎 + E2E，接口层未写单测 |
| `imgs` 第三方域名检查仅覆盖首页 | 部分覆盖 | 结果页未跑同款检查 |

## 6. 疑似缺陷的定位结论：502 中断（不是产品缺陷，但不能放过）

**现象**：E2E 第一轮出现 `/api/questions → HTTP 502`，页面显示「接口没连上」。
截图证据（本轮留存）：390×844 视口，页面错误态。

**排查过程**（OBSERVED）：
1. 复测 `5173/api/questions` 连打 15 次 → 15/15 全 200；直连 8787 → 200。
2. 观察端口 PID：8787 的上游 PID 在测试期间发生变化 → 上游进程被重启过。
3. 与后端开发提供的 `EBUSY` 栈证据吻合：编辑器原子写触发 chokidar 监视 → Vite 退出 → `concurrently -k` 连带杀 API。

**结论（OBSERVED，非推测）**：
- 这是**联调期热重载/进程重启窗口**导致的短暂不可达，**不是 502 处理逻辑本身的缺陷**，也不是数据问题。
- **但结论不能停在「偶发」**：真正的工程结论是 **E2E 不能依赖一个会被热重载打断的上游**。
- **验证**：改为 `pnpm build` 产物 + 非 watch 实例并固定 PID 后，重跑 E2E **8/8 通过、0 失败**。同一套用例、同一份代码，失败消失 → 反向证明前一次的失败属于环境抖动。

**对流程的影响**：已在 `docs/TEST-PLAN.md` §1 与本节写明「E2E 前必须先起稳定实例」，后续所有 E2E 均按此执行。

## 7. 本轮发现并已修正的测试侧问题（我的责任，如实记录）

| 问题 | 现象 | 处置 |
|---|---|---|
| 臆造 testid | 首版 E2E 用 `[data-testid="option"]`，实际 DOM 是 `button.option`，导致**假阴性**（误报「三屏闭环断点」） | 按真实 DOM 重写选择器 |
| 忽略「下一题」按钮 | 答题页需点选项 + 点「下一题」两步，首版只点选项 | 修正交互流程 |
| 断言口径写错 | 断言 `evalCondition` 缺失维度返回 null，实际契约是「按 0.5 中性」 | 按实现注释的契约修正断言（**不是放宽断言，是修正我写错的判据**） |
| 导出名猜错 | 首版按 `matchPersonas` 找函数，真实导出是 `match()` | 按真实导出接入 |

> 以上四项都是**测试自身的缺陷**，修正依据是产品真实契约，**没有为变绿而放宽任何断言**。

## 8. 缺陷单

**本轮无产品侧缺陷（P0/P1 均 0）。**

代码在读取过程中发生过并发变更（`src/engine/match.ts` 进池判据在我读取与复测之间被作者修改），我最初据此判定「存在 restricted 误拦缺陷」，复测后发现已由作者修正，**故不作为缺陷上报**。此处记录，说明判定是基于当时的真实文件状态，不是臆测。

## 9. 诚实性声明

- 真机与微信内置浏览器：**NOT RUN**，本轮未用任何设备模拟冒充。
- 「单测通过」只说明引擎与数据契约符合断言，**不代表产品可用**；「E2E 通过」只说明三屏在 Chromium 两个视口下可走通，**不代表真机可用**。
- 所有跳过项与未覆盖项均在上文列出，**未删除、未改写为成功**。
- 并未声称「微信传播已合规」。

---

## 附：本轮产出文件

| 文件 | 内容 |
|---|---|
| `docs/TEST-PLAN.md` | 测试入口约定、分层判据、诚实性约束 |
| `docs/TEST-REPORT-2026-11-04.md` | 本报告 |
| `tests/data/contract.test.ts` | 数据契约 9 项 |
| `tests/engine/match.test.ts` | 引擎 14 项（含进池防回归） |
| `tests/e2e/playwright.config.ts` | E2E 配置（双视口，置于 tests/ 内，根配置只需一行脚本） |
| `tests/e2e/screens.e2e.ts` | 三屏 E2E |
| `tests/e2e/measure.e2e.ts` | 热区与溢出实测取证 |

## 待后端开发处理（根配置归你）

```json
"test:e2e": "playwright test --config tests/e2e/playwright.config.ts"
```
并在 `devDependencies` 增加 `@playwright/test`。当前 `pnpm test` 已可用（22→23 项真实执行，假绿已修复）。
