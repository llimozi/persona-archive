# 互联网人物档案馆 · H5（第三阶段）

移动端优先的人物性格档案馆 H5：首页 → 答题 → 结果。纯文字卡，不引第三方人物图片。

## 快速开始

```bash
pnpm install
pnpm dev
```

一条命令并起两个进程（`concurrently -k`，任一挂掉全部退出）：

| 进程 | 地址 | 说明 |
| --- | --- | --- |
| API | http://127.0.0.1:8787 | Fastify，启动时把 `data/*.json` 读进内存 |
| WEB | http://127.0.0.1:5173 | Vite dev server，`/api` 代理到 8787 |

打开 http://127.0.0.1:5173 即首页。自检：`curl http://127.0.0.1:8787/api/health` 返 200。

## 环境要求

- Node.js **>= 20.19**（Vite 6 要求）
- pnpm 8+

不需要 Docker、数据库、Redis、任何云服务或付费依赖。

## 目录

```
src/api/      Fastify 服务：env / dataStore / store / routes / server
src/shared/   前后端与引擎共用的类型与常量（由后端维护）
src/web/      前端（Vite root）
src/engine/   六维匹配引擎（纯 TS，零依赖）
data/         personas.json / questions.json
public/       静态资源，首版为空（不引第三方素材）
tests/        Vitest 单测 / Playwright E2E
dist/         构建产物（web 在 dist/web，api 在 dist/api）
```

## 接口清单（契约，改动须先通知前端 / 算法 / 测试）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 + 数据装载状态，恒 200 |
| GET | `/api/personas` | `{ items, source, total, warning? }` |
| GET | `/api/personas/:id` | 单个档案；不存在 404 |
| GET | `/api/questions` | `{ items, source, total, warning? }` |
| POST | `/api/admin/reload` | 重读 `data/*.json`，返回各表条数 |

`source` 取值：`file`（读到了）/ `empty`（文件缺失）/ `invalid`（解析失败）。
数据文件损坏**不会让服务起不来**，只会降级为空列表并在 `warning` / `health.data` 里体现。

## 构建与部署

```bash
pnpm build     # dist/web（静态）+ dist/api（编译后的 Fastify 服务）
pnpm start     # node dist/api/src/api/server.js，单进程同端口托管 dist/web
```

两种部署形态：

1. **纯静态托管**：只把 `dist/web/` 放到任意静态服务器；此时前端需要能访问到 `/api`（自行反转代理到 API 进程）。
2. **单进程**：`pnpm start` 后 Fastify 同时托管 API 与 `dist/web`，只有一个端口，反向代理最省事。

## 脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 同时起 API + WEB |
| `pnpm dev:api` / `pnpm dev:web` | 单独起一个 |
| `pnpm test` | Vitest（当前未写用例时 `--passWithNoTests`） |
| `pnpm typecheck` | 前端 + 后端两套 tsconfig |
| `pnpm build` / `pnpm start` | 构建 / 运行产物 |

## 六维模型

`EE 情绪表达` · `ST 稳定度` · `AC 行动力` · `HX 反差感` · `RB 关系边界` · `SR 疏离度`

匹配算法为**高斯核**：每个人物每维有代表值 μ 与容差 σ，用户得分与 μ 的距离经核函数映射为单维相似度，再按权重聚合，输出主匹配 / 次匹配 / 隐藏人格 / 意外组合四层。

- μ 来自 `data/personas.json` 的 `dims`（0–100，归一化到 0–1）
- σ 可由人物自带（`sigma` 字段），缺省按 `rarity` 取默认值：common 0.22 / rare 0.18 / hidden 0.15

> **这些阈值是第一阶段的设计值，不是实测值，也不是行业标准。** 第一阶段 `06 §11 U-06-6` 明确写着 σ 统一口径未定；本实现只是把「可选覆盖 + 缺省值」落到代码层，**不代表该问题已解决**。

匹配百分比是**娱乐匹配度**，不是心理测量值，任何对外文案都必须带此限定。

## 内容与合规红线

- 首版人物全部使用**纯文字卡或占位图**，不引用任何第三方图片（肖像、剧照、立绘、Logo），不可商用。
- 涉及真实逝者与悲剧的人物（如胖猫）**未纳入首版**。
- 涉及第三方 IP 或真实人物的卡在 `compliance` 中标记，`usageNote` 写明用法限制；`restricted` 是**合规标记**，与 `rarity`（稀有度）不是同一维度。
- 人物事实只取自第一阶段 `04` 的既有资料卡，`source` 字段保留可追溯锚点。
- **本仓库不构成任何传播合规结论**，也未取得商业运营授权。

## 已知边界

- **微信内置浏览器未做真机验证（`NOT RUN`）**：本机无微信客户端、无真机。桌面浏览器与 Playwright 设备模拟**不能**代表微信内实际表现。
- 微信外部链接规范 2.5 条把「性格测试」列为违规内容类别，**传播合规风险真实存在**；技术可访问 ≠ 允许传播。
- 数据在启动时一次性进内存，改完 `data/*.json` 需 `POST /api/admin/reload` 或重启。
- 未做账号、持久化、埋点；匹配结果尚无用真实用户样本校准。
- `dist/` 为构建产物，不应手工放文件进去。

## 开发规范

写作用域、验收口径、技术栈约束见 [`docs/DEV-CONTROL.md`](docs/DEV-CONTROL.md)，测试计划见 [`docs/TEST-PLAN.md`](docs/TEST-PLAN.md)。
