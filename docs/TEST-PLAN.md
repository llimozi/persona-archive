# TEST-PLAN · 第三阶段测试基线

> 责任人：风控审查（QA）｜作用域：`tests/**` + `docs/TEST-*.md`
> **不修改业务代码、不修改根配置。** 断言失败一律如实上报，不放宽断言、不改业务代码凑绿。

## 1. 测试入口约定

| 命令 | 覆盖 | 运行器 | 状态 |
|---|---|---|---|
| `pnpm test` | 单元测试：引擎六维、共享类型、数据文件结构 | Vitest | 脚本已存在（后端提供），测试夹具由 QA 建 |
| `pnpm test:e2e` | 三屏 E2E（首页 → 答题 → 结果），移动端视口 390×844 | Playwright | **脚本缺失，待后端开发添加**（见 §1.1） |
| `pnpm typecheck` | TS 类型检查（后端脚本，QA 只读调用） | tsc | 已有 |

### 1.1 待后端开发补充（根配置归后端，QA 不碰）

需要在 `package.json` 的 `scripts` 中增加：

```json
"test:e2e": "playwright test --config tests/e2e/playwright.config.ts",
"test:unit": "vitest run tests/"
```

需要在 `devDependencies` 中增加：`@playwright/test`（以及首次 `pnpm exec playwright install chromium`）。

> 说明：`tests/e2e/playwright.config.ts` 放在 `tests/**` 内，归 QA 管；这样根配置只多两行脚本，其余不动。
> 后端若希望 Playwright 配置放根目录，请在群里说一声，QA 按你的约定落地。

`pnpm test` 现有的 `vitest run --passWithNoTests` 可在本目录跑通；**注意**：在测试尚未落地时它会"假绿"——本轮已建夹具，不再是空跑。

## 2. 测试分层与判据

| 层 | 对象 | 判据来源 | 归属 |
|---|---|---|---|
| L1 单元 · 引擎 | `src/engine/**` 六维打分与匹配 | DEV-CONTROL §3 人格系统行、`docs/product-discovery/06`、`docs/phase2-admission/05`（阈值是**设计值**，不是实测值） | 算法开发实现 / QA 测 |
| L1 单元 · 契约 | `data/*.json` 与 `src/shared/types.ts` 一致 | DEV-CONTROL §3 热点研究行 | 内容数据实现 / QA 测 |
| L2 接口 | `GET /api/health`、`/api/personas`、`/api/questions` | DEV-CONTROL §3 技术架构行 | 后端开发实现 / QA 测 |
| L3 E2E | 首页 / 答题页 / 结果页三屏 + 结果链接 | DEV-CONTROL §4 业务闭环、移动端 | 前端实现 / QA 测 |
| L4 真机 · 微信内置浏览器 | —— | —— | **NOT RUN**（本机无真机，不使用 device emulation 冒充） |

## 3. 引擎单测的预期行为（QA 独立编写，先于/并行于算法实现）

按 DEV-CONTROL §3 与分工令的判据落成用例，算法开发不必照抄，但**必须能同时满足**：

1. **确定性**：同一份作答输入连续执行 N 次，输出深度相等（无随机数、无时间依赖、无 `Math.random`、无 `Date.now` 影响得分）。
2. **输出四段结构**：返回值含 `main`（主）、`secondary`（次）、`hidden`（隐藏）、`surprise`（意外）四类结果字段，且非空。
3. **维度完备**：得分落在 `DIM_KEYS = EE/ST/AC/HX/RB/SR` 六维，无缺维、无未定义维度。
4. **值域**：每位人物得分、每维得分均为有限数（非 NaN/Infinity）。
5. **极值鲁棒**：全空作答 / 全部选项给同维拉满分 / 单题作答，均不抛异常且返回四段结构。
6. **排序稳定**：对同一输入，`main` 与 `secondary` 不重复、不同名。
7. **可复算示例**：仓库中提供至少一份固定输入 + 期望输出示例，测试可复现。

> 上述第 2 条的字段名等 **API 契约由算法开发定**。QA 的骨架用 `describe.skip`/动态探测写法，引擎落地后按实际导出名接入，**不预先篡改断言去迁就实现**；如果实现与判据冲突，报缺陷而不是改判据。

## 4. 数据契约校验（QA 独立编写）

对 `data/personas.json` / `data/questions.json` 校验：

- 文件可被 `JSON.parse`，非空；
- 人物：字段齐全 `id/name/category/tags/dims{EE,ST,AC,HX,RB,SR}/desc`，`dims` 六维均为 0–100 数值，`id` 唯一；
- 题目：字段齐全 `id/title/options[]`，每题 ≥2 选项，选项 `effects` 至少含一维，`id` 在文件内唯一；
- 素材红线：若有图片字段，`placeholder !== false` 的项一律 **FAIL**（不得引入第三方素材）。

## 5. E2E 判据（三屏）

- 首页在 390×844 与 360×640 下 `document.documentElement.scrollWidth <= clientWidth + 1`（无横向溢出）；
- 首页 → 点击开始 → 答题页 → 全部作答 → 结果页，四段结果文案可见；
- 所有可点击主按钮命中区 `≥ 44px`（用 `boundingBox()` 实测）；
- 页面不出现第三方图片域名（`img[src]` 非本地占位）；
- 结果页生成了 `?r=<token>` 分享链接（竞品研究交付后启用，当前为未覆盖项）。

## 6. 诚实性约束

- 无真机 → **NOT RUN**，不得用 Playwright `devices['iPhone 13']` 冒充"微信内置浏览器实测"；视口模拟只写成"视口模拟"。
- "单元测试通过" ≠ "产品可用"，报告分节写。
- 失败项 / 跳过项 / 未覆盖项一律列出，**不删除、不改写为成功**。
- 任何为过测试而放宽断言或改业务代码的行为视为违规。

## 7. 报告产出

`docs/TEST-REPORT-<YYYY-MM-DD>.md`，含：测了什么 / 怎么跑 / 原始输出摘录 / 通过-失败-未跑计数 / 未覆盖项 / 缺陷（@ 责任人）。
