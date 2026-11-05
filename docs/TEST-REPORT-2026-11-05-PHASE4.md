# 第四阶段 · 测试报告（Android 真机核查 + 测试基线复核）

> 作者：测试审查（QA）｜日期：2026-11-05
> 判定人：测试审查（独立验收方，作者≠复核者）
> **本报告所有结论只绑实测证据；无证据的一律 `NOT RUN`，不做推定。**

## 0. 读这份报告先看三句话

1. **Android 真机验证：全部 `NOT RUN`。** 本机无任何 Android 设备、无 adb、无 SDK、无模拟器、无云真机凭据。**未用 Playwright 视口模拟冒充真机，无任何一项标 PASS。**
2. **测试基线：`pnpm test` PASS 31/31，`pnpm test:e2e` 在既有文档口径下 PASS 14/14。** 但 `pnpm test:e2e` **裸跑（默认配置自启服务）FAIL**，原因是配置缺陷，见 §3.2。
3. **单测通过 ≠ 产品可用。** 本报告只证明"已写的断言在当前代码上成立"，不证明 H5 在真实设备上可用。真机、微信内、弱网、海报保存、`?r=` 分享在真机上的表现 —— 全部 `NOT RUN`。

---

## 1. 被测版本与环境

| 项 | 值 | 证据 |
|---|---|---|
| 验收基线 commit | `265c9f4e75a7b9514777adcbeef45de98b875579`（短 `265c9f4`） | `git rev-parse HEAD`（开工时） |
| 开工时工作区 | 干净（`git status --porcelain` 无输出） | 同上 |
| 测试期间 HEAD 变化 | 变为 `221cb33a2852e40bbf04f6972fdbd1ce85f92e29`（另一成员提交「06 人格测试模型设计」） | `git log --oneline -3` |
| **关键判定** | `git diff --stat 265c9f4 HEAD -- tests/` **输出为空** → 从 `265c9f4` 起 `tests/` 未被改动，读数对基线有效 | 已执行 |
| OS | Windows（本机） | — |
| Node | v24.19.0 | `node -v` |
| pnpm | 11.21.0 | `pnpm -v` |
| Vitest | 2.1.9 | 测试输出 `RUN v2.1.9` |
| Playwright | @playwright/test 1.64.1，chromium-1234 / 1248 | `require('@playwright/test/package.json').version`、`ms-playwright` 目录 |
| 桌面浏览器 | 无 Chrome；有 Edge（仅记录，未用于本报告任何结论） | 路径探测 |

### 1.1 关于 HEAD 漂移的诚实说明

我开工核验时 HEAD 是 `265c9f4`，跑完测试后变为 `221cb33`。为了不把"别人中途提交的中间态"当作基线读数：

- 我在**纯净的 `265c9f4` 临时 worktree**（`git worktree add --detach`）里复跑了单测，结果 31/31 通过、退出码 0，与主工作区一致。
- 该临时 worktree 事后已删除（`git worktree remove --force` + `prune`），`git worktree list` 现只剩主工作区。
- E2E 那一次 14/14 跑在主工作区，其时 `tests/` 与 `265c9f4` 一致（diff 为空），但 `src/web/`、`src/engine/` 有**未提交改动**（前端在改海报）。**因此 E2E 的 14/14 只对"当时工作区"成立，不能声称是 `265c9f4` 纯净结果。** 这一点按红线如实标出，不用"tests/ 没变"掩饰。

---

## 2. 任务一：Android 真机验证

### 2.1 设备核查（实测，命令与结果原样）

| 核查项 | 命令 | 结果 | 判定 |
|---|---|---|---|
| adb 是否存在 | `command -v adb` / `adb devices -l` | 无输出，命令不存在 | 无 |
| Android SDK platform-tools | 探测 `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe` | `No such file or directory` | 无 |
| Android SDK 根目录 | 探测 `/c/Android`、`/c/Program Files/Android`、`/c/Program Files (x86)/Android`、`/d/Android`、`/d/platform-tools`、`$LOCALAPPDATA/Android` | 全部 `No such file or directory` | 无 |
| 环境变量 | `ANDROID_HOME` / `ANDROID_SDK_ROOT` | 均 `unset` | 无 |
| 模拟器 | 探测 `%LOCALAPPDATA%\Android\Sdk\emulator`、`~/.android/avd` | 均不存在 | 无 AVD |
| scrcpy / emulator / flutter | `command -v` | 均无 | 无 |
| 云真机凭据 | `BROWSERSTACK_USER/KEY`、`SAUCELABS_KEY`、`SAUCE_KEY`、`APPIUM_HOST` | 均 `unset` | 无 |
| USB 接入设备 | `Get-PnpDevice -PresentOnly` 过滤 PortableDevice / Android / ADB / MTP / 品牌名 | 仅 USB 复合设备、USB 根集线器、摄像头等本机设备；**无手机、无 ADB 接口**（命中的 "HUAWEI" 是本机主板/system firmware 名称 `HUAWEI NbDE-WXX9`，不是接入手机） | 无 |
| WSL | `wsl -l -v` | 有 Ubuntu 26.04（Stopped），**未在其中发现任何 Android 工具链证据，不作为设备来源** | 无 |

**结论：本机零 Android 设备能力。** 任何人若给出"已通过真机验证/已通过微信内置浏览器验证"的说法，与本报告实测不符。

### 2.2 真机验证项 — 全部 NOT RUN

| # | 验证项 | 判定 | 原因 |
|---|---|---|---|
| D-1 | 首页布局（390×844 / 360×640 实机） | **NOT RUN** | 无设备 |
| D-2 | 答题全流程（逐题作答→结果） | **NOT RUN** | 无设备 |
| D-3 | 结果页渲染与六维数值 | **NOT RUN** | 无设备 |
| D-4 | `?r=` 结果链接重放 | **NOT RUN** | 无设备 |
| D-5 | 结果页刷新/返回后状态保持 | **NOT RUN** | 无设备 |
| D-6 | 海报导出并保存到相册 | **NOT RUN** | 无设备 |
| D-7 | 弱网（3G/离线）表现 | **NOT RUN** | 无设备，且**未做 Playwright 网络节流**（节流即使做了也不等同真机弱网，故不补测冒充） |
| D-8 | 图片加载失败降级 | **NOT RUN** | 无设备 |
| D-9 | 微信内置浏览器实测 | **NOT RUN** | 必须真机 + 微信客户端，本机不具备 |
| D-10 | 微信内分享卡片/传播表现 | **NOT RUN** | 同上（且渠道合规仍待核验，见 DEV-CONTROL §4） |
| D-11 | 安全区（刘海/底部横条）不遮挡 | **NOT RUN** | 无设备 |

> 每项均无设备型号、OS 版本、浏览器版本可填 —— 因为没有设备。
> Playwright 的 `viewport-390x844` / `viewport-360x640` 是**桌面 Chromium 视口模拟**（配置中 `isMobile: false`），只能说明布局在这些像素下不出横向溢出，**不是真机结论**。

### 2.3 要跑真机验证，缺什么 / 需要用户提供什么

任选其一即可解锁 D-1 ~ D-11：

1. **一台 Android 手机**（USB 接本机，开「开发者选项 → USB 调试」）。需要同时提供：手机品牌/型号、Android 版本。有了它我会装 `adb`（platform-tools，约 15MB，免费）后自测。
2. **一个 Android 模拟器环境**：Android Studio + 一个 AVD。注意 —— **模拟器也不等于真机**，报告中会单列为 `模拟器` 而非 `真机`，微信内置浏览器仍无法在模拟器上可靠覆盖。
3. **云真机账号**（BrowserStack / Sauce Labs 等）：需要用户提供账号（费用需用户确认，本项目目前零预算口径）。

**微信内置浏览器验证**额外需要：一台已登录微信的手机 + 一个手机可访问的 HTTPS 域名（或用户手机连同一内网访问本机 IP）。当前项目无 HTTPS/域名，这一项**在现有条件下无法由我单方面补齐**。

---

## 3. 任务二：测试基线复核

### 3.1 `pnpm test`（Vitest 单测）— PASS

**命令**：`pnpm test`（= `vitest run --config vitest.config.ts`），在 `265c9f4` 的纯净 worktree 复跑。

**原始输出（原行照抄）**：

```
 RUN  v2.1.9 C:/Users/86185/AppData/Local/Temp/pa-265c9f4

 ✓ tests/engine/single-path.test.ts (1 test) 13ms
 ✓ tests/data/contract.test.ts (11 tests) 39ms
 ✓ tests/engine/theme-usage.test.ts (2 tests) 15ms
 ✓ tests/engine/match.test.ts (17 tests) 582ms
   ✓ 引擎 · 匹配主函数 > match 已导出 522ms

 Test Files  4 passed (4)
      Tests  31 passed (31)
   Start at  08:43:36
   Duration  2.20s (transform 1.01s, setup 0ms, collect 1.24s, tests 649ms, environment 2ms, prepare 1.72s)
```

**退出码**：`0`（`TEST_EXIT_265c9f4=0`）

**分文件明细**：

| 文件 | 用例数 | 结果 |
|---|---|---|
| `tests/engine/single-path.test.ts` | 1 | PASS |
| `tests/data/contract.test.ts` | 11 | PASS |
| `tests/engine/theme-usage.test.ts` | 2 | PASS |
| `tests/engine/match.test.ts` | 17 | PASS |
| **合计** | **31** | **PASS 31 / FAIL 0 / SKIP 0** |

**计数口径说明**：源码里 `test(` / `it(` 字面量共 30 处，运行时展开 **31** 个用例（有参数化）。以运行时为准。

### 3.2 `pnpm test:e2e`（Playwright E2E）

#### 3.2.1 裸跑（默认配置，自启服务）— **FAIL（配置缺陷）**

**命令**：`pnpm test:e2e`（不带任何环境变量）

**原始输出（关键行照抄）**：

```
[WebServer] Error: Cannot find module 'C:\Users\86185\.dsh\bot\workspace\persona-archive\tests\e2e\dist\api\src\api\server.js'
[WebServer]     code: 'MODULE_NOT_FOUND',
Error: Process from config.webServer was not able to start. Exit code: 1
[ELIFECYCLE] Command failed with exit code 1.
```

**退出码**：`1`

**根因**（`tests/e2e/playwright.config.ts`）：`webServer.command` 写的是**相对路径** `node dist/api/src/api/server.js`，Playwright 按 `testDir`（即 `tests/e2e`）解析工作目录，于是拼成 `tests/e2e/dist/...` —— 该路径不存在。`dist/api/src/api/server.js` 本身是存在的（已核验），所以不是构建缺失，是**路径解析错误**。

**影响**：新人或 CI 按 `package.json` 的脚本直接跑 E2E 会**必挂**，与"一条命令可跑"的验收口径（DEV-CONTROL §4）不符。

**历史成因（如实记录）**：`docs/TEST-REPORT-2026-11-04.md` 与 `2026-11-05` 两版都写的是「先手动起 8790 稳定实例，再 `E2E_NO_SERVER=1 E2E_BASE_URL=... pnpm test:e2e`」。也就是说 **`webServer` 自启分支在此前从未被真正执行过**，本次裸跑是它第一次被验证，随即暴露问题。这不是本轮引入的回归，是**长期未覆盖的路径**。

**定级**：`P1 配置缺陷`。修复方式（供参考，需在 `tests/` 作用域内由我改或由主控裁定）：`command` 改为绝对路径 `node ${resolve(HERE,'../../dist/api/src/api/server.js')}`，并显式指定 `cwd`。**本轮未擅自修改**——因为它会改变团队既有的 E2E 运行方式，先把结论交出来。

#### 3.2.2 按既有文档口径跑 — PASS

**前提**：手动起稳定实例（非 watch），与历史报告口径一致。

```
API_PORT=8790 NODE_ENV=production node dist/api/src/api/server.js   # 200
API_PORT=8790 npx vite preview --config vite.config.ts --port 4173  # 200
E2E_NO_SERVER=1 E2E_BASE_URL=http://127.0.0.1:4173 pnpm test:e2e
```

**结果**：`14 passed (59.2s)`，**退出码 `0`**。

**分文件 / 分视口明细**（14 项 = 7 用例 × 2 视口）：

| 用例 | 文件 | 390×844 | 360×640 |
|---|---|---|---|
| 结果页六维数值 = 引擎 `user.x*100` | `dims-consistency.e2e.ts` | PASS | PASS |
| 热区与溢出实测并取证 | `measure.e2e.ts` | PASS | PASS |
| 首页可访问且无横向溢出 | `screens.e2e.ts` | PASS | PASS |
| 首页不引用第三方图片（素材红线） | `screens.e2e.ts` | PASS | PASS |
| 全流程：首页 → 答题 → 结果 | `screens.e2e.ts` | PASS | PASS |
| 答题页无横向溢出 | `screens.e2e.ts` | PASS | PASS |
| **分享结果链接 `?r=<token>`** | `screens.e2e.ts` | PASS | PASS |

**JSON 统计原行**：`{"expected":14,"skipped":0,"unexpected":0,"flaky":0}`

**热区实测原始输出（360×640 片段）**：

```
viewport=360x640 scrollWidth=360 clientWidth=360 overflow=false
[首页] 开始按钮 320x44
[答题页] 选项1 320x56 ... 选项4 320x56
[答题页] 下一题 320x44
[结果页] scrollWidth=360 clientWidth=360 overflow=false
[结果页] 按钮1 "重测" 52x44
[结果页] 按钮2 "分享给朋友" 320x44
```

所有按钮高度 **≥44px**，无横向溢出 —— 满足 DEV-CONTROL §4 的移动端判据（**仅在视口模拟下成立**）。

#### 3.2.3 E2E 结论的边界（必须写明）

- 14/14 PASS 是**桌面 Chromium 视口模拟**结果，`isMobile: false`。
- 它**不能**证明：真机布局、微信内置浏览器、iOS Safari、触摸手势、真实字体渲染、弱网、相册保存。
- 它跑在**含未提交改动的工作区**（见 §1.1），不是 `265c9f4` 纯净产物。

### 3.3 skip 排查结果 — **0 个被跳过**

| 排查项 | 命令 | 结果 |
|---|---|---|
| 硬 skip（`test.skip` / `it.skip` / `describe.skip` / `.only` / `.fixme` / `xit`） | `grep -rn` over `tests/**/*.ts` | **0 处** |
| 条件 skip（`skipIf` / `runIf`） | `grep -rn` | **0 处** |
| 运行时实际 skip 数 | Vitest 输出 / Playwright JSON | **均为 0** |
| `ctx.skip(...)` 调用点 | `tests/engine/match.test.ts` | 存在 12 处，但为**带前置条件的降级分支**（未落地/数据为空时计入"未跑"而非 PASS）。本次运行**全部未触发**（31 用例全部执行） |

**关于长期 skipped 的两条分享用例**：

- 位置：`tests/e2e/screens.e2e.ts:115`。
- 现状：**已不再是 skip，确认真跑。** 源码第 116 行注释写明「分享功能已交付（`src/web/lib/share.ts`）。旧 skip 理由已过期，改为真跑。」
- 实测证据：本次两个视口均执行完毕，日志原行 `ok 7 [viewport-390x844] › ... 分享结果链接 ?r=<token>... (4.8s)`、`ok 14 [viewport-360x640] › ... (4.4s)`，`skipped:0`。
- **该用例内仍有一处弱断言（如实列出）**：若结果页未暴露 `?r=` 链接，第 139-144 行会降级为「仅校验分享入口存在」并打 `partial` 注解，而不是判失败。**本次运行未走该降级分支**（走的是完整校验：全新 context 打开分享链接 + 六维逐项比对）。但这条降级路径本身会掩盖分享缺陷，建议后续改为硬失败 —— 本轮未改，只报告。

### 3.4 名字与实际检查是否相符 — 抽查结论

| 测试 | 名字声称 | 实际断言 | 相符？ |
|---|---|---|---|
| `single-path.test.ts` | src/web 唯一计算路径 | 递归扫 `src/web` 全部 `.ts/.tsx/.js/.mjs`，**剥离注释后**匹配 `normalizeDims|scoreAnswers`，并断言「扫到的文件数 > 0，否则断言失去意义」 | ✅ 相符，且带防假绿护栏 |
| `theme-usage.test.ts` | theme 权重端到端生效 | 用两组不同权重跑 `match()`，断言 `mainPercent` 必须不同（理由充分：六维经归一化会把权重约掉，不能当判据） | ✅ 相符，判据选择正确 |
| `dims-consistency.e2e.ts` | 结果页数值 = 引擎 `user.x*100` | 实际同时打印引擎值与页面值逐维对照（EE/ST/AC/HX/RB/SR 六项全等） | ✅ 相符 |
| `measure.e2e.ts` | 热区与溢出实测 | 实际读取 `scrollWidth/clientWidth` 与各按钮 `BoundingBox` | ✅ 相符 |
| `screens.e2e.ts:115` | 分享链接他人可看同一结果 | 完整路径相符；**降级分支为弱断言**（见 §3.3） | ⚠️ 部分相符 |

**未逐行通读**：`match.test.ts`（324 行 / 17 用例）与 `contract.test.ts`（11 用例）本次只核了 skip 与通过状态，**未逐条比对断言强度**。这一项如实标 `NOT RUN`，不声称已审。

---

## 4. 计数汇总

### 4.1 任务一（Android 真机）

| 通过 | 失败 | 未跑 |
|---|---|---|
| **0** | **0** | **11**（D-1 ~ D-11） |

### 4.2 任务二（测试基线）

| 项 | 通过 | 失败 | 未跑 |
|---|---|---|---|
| `pnpm test`（31 用例） | 31 | 0 | 0 |
| `pnpm test:e2e` 裸跑 | — | **1（配置缺陷，command FAIL）** | — |
| `pnpm test:e2e` 文档口径（14 用例） | 14 | 0 | 0 |
| skip 排查 | 0 处 skip | — | — |
| 断言强度逐条复核 | 5 项抽查中 4 项相符 | 1 项弱断言（§3.3） | match/contract 11+17 用例未逐条审 |

---

## 5. 未覆盖项（明确不做或做不到的）

1. 真机 / 微信内置浏览器 / iOS 全系 —— 无设备，`NOT RUN`。
2. 海报导出保存到相册 —— 无设备，`NOT RUN`；桌面 E2E 也未覆盖下载落盘校验。
3. 弱网、离线、图片失败降级 —— `NOT RUN`。
4. 并发/压力、安全测试（XSS、接口越权）—— 本轮范围外，未做。
5. `match.test.ts` / `contract.test.ts` 的断言强度逐条审计 —— 未做。
6. API 层单测（`src/api/**` 无任何测试）—— 现状缺失，如实列出。
7. 微信分享卡片、渠道合规 —— `NOT RUN`，且不得声称"已合规"。

---

## 6. 缺陷清单

| ID | 严重度 | 描述 | 位置 | 状态 |
|---|---|---|---|---|
| Q-4-1 | ~~P1~~ | `pnpm test:e2e` 裸跑必挂：`webServer.command` 用相对路径，被按 `testDir` 解析成 `tests/e2e/dist/...` | `tests/e2e/playwright.config.ts` | **FIXED**（见 §8） |
| Q-4-2 | P2 | 分享用例的降级分支为弱断言，会掩盖 `?r=` 缺陷 | `tests/e2e/screens.e2e.ts:139-144` | **OPEN** |
| Q-4-3 | P2 | `src/api/**` 无单测覆盖（数据加载/404/reload 均未测） | `tests/` 缺失 | **OPEN** |
| Q-4-4 | P3 | E2E 依赖 `dist/` 产物，源码与产物可能漂移（本次 `dist/api` 为 11-04 23:43 构建） | 流程问题 | 记录 |

---

## 7. 下次评审我要做的事（待裁定）

1. Q-4-1 是否允许我改 `tests/e2e/playwright.config.ts`（属我作用域，但会改变团队运行方式）。
2. Q-4-2 是否改为硬失败（会让分享链路要求更严，可能立即变红）。
3. 补 `src/api/**` 单测（属 `tests/` 作用域，我可以写）。

**在拿到真机之前，Android 相关项全部维持 `NOT RUN`，不会被任何人改写为 PASS。**

---

## 8. Q-4-1 修复与裸跑验收（主控 2026-11-05 裁决后补）

### 8.1 改了什么

**只改了一个文件**：`tests/e2e/playwright.config.ts`（我的作用域）。
**没有改任何用例文件**（`git status -- tests/e2e/*.e2e.ts tests/engine tests/data` 为空），**没有删任何断言**。

| # | 改动 | 原因 |
|---|---|---|
| 1 | `command: 'node dist/api/src/api/server.js'` → `command: \`node "${API_ENTRY}"\``，`API_ENTRY = resolve(REPO_ROOT,'dist/api/src/api/server.js')` | Q-4-1 根因：相对路径被按 `testDir` 解析 |
| 2 | 新增 `cwd: REPO_ROOT` | 显式锁死工作目录，杜绝同类再犯 |
| 3 | 新增 `assertBuilt()` 前置自检（config 求值期） | 缺 `dist` 时给出可执行提示，而不是原始 `MODULE_NOT_FOUND` |

`git diff` 的删除行只有两处：旧的绝对路径注释、旧的相对路径 command。符合"只修路径不动断言"。

### 8.2 前置条件（新人必读）

**E2E 吃的是 `dist/` 生产产物，必须先 `pnpm build`。**

```
pnpm install
pnpm build        # ← 前置条件：产出 dist/web + dist/api
pnpm test:e2e     # ← 一条命令跑完，自起服务，无需手动开实例
```

产物缺失时，裸跑会**在开浏览器之前**失败并打印：

```
[E2E 前置条件未满足] 缺少生产产物：dist/web/index.html

请先在仓库根执行：  pnpm build
然后再跑：          pnpm test:e2e

（E2E 跑的是 dist/ 产物而非 dev 服务；dist/web 由 Fastify 在同一端口 8790 托管）
```

**为什么不在 config 里串 `pnpm build`**（主控第 3 条给了两个选项，我选了后者）：
串构建会把 `typecheck` 也拖进每条测试命令，失败时**分不清是构建挂了还是测试挂了**，且与本项目"先起稳定实例"的既有口径打架。改为**显式拦下 + 给出唯一正确命令**，信息更诚实。若主控要求改成自动构建，我照办。

**已核实的事实**：前端页面不需要单独起 `vite preview` —— `src/api/server.ts` 检测到 `dist/web` 存在时用 `@fastify/static` 在同一端口 8790 托管。实测 `GET http://127.0.0.1:8790/` 返回 `200` 且是 `<!doctype html>` 首页。

### 8.3 裸跑验收 — PASS

**验证前提**：`curl http://127.0.0.1:8790/api/health` 先返回 `000`（端口完全空闲），确保不是复用了残留实例。

**命令**：`pnpm test:e2e`（**不带任何环境变量**）

**原始输出（原行照抄）**：

```
Running 28 tests using 1 worker
  ...
  28 passed (1.6m)
```

**退出码**：`0`（`FINAL_E2E_EXIT=0`）

**JSON 统计原行**：
```
{"startTime":"2026-11-05T00:55:51.664Z","duration":94747.181,"expected":28,"skipped":0,"unexpected":0,"flaky":0}
```

`[WebServer]` 前缀出现在输出中，证明服务确由 Playwright 自起，非外部复用。

**用例数从 14 → 28 的原因**：不是我的改动，是**前端在 `tests/e2e/poster.e2e.ts` 新增了 7 个海报导出用例**，×2 视口 = 14，14 + 14 = 28。这批用例属前端作用域，我未修改。

**另外验证**：`pnpm typecheck` 通过，退出码 `0`（改完 config 后无类型错误）。

### 8.4 `?r=` 分享用例是否仍真跑 — **明确结论：真跑，非 skip**

`tests/e2e/screens.e2e.ts:115` 的「分享结果链接 `?r=<token>`：他人打开直达结果页且数值一致」：

- 本次裸跑两个视口均执行：`ok 14 [viewport-390x844] ...` / `ok 28 [viewport-360x640] ...`
- 全局 `skipped: 0`，该用例**不是 skip，也没有在修复中被跳过或删除**
- 走的是**完整校验路径**：全新 browser context 打开分享链接 → 断言六维为 6 个 → 逐维与直连结果比对一致

**保留的限制（未修复，如实列出）**：该用例内部仍有降级弱断言路径（`screens.e2e.ts:139-144`，即 Q-4-2）——若结果页未暴露 `?r=` 链接，会降级为"仅校验分享入口存在"。**本次运行未触发该降级**。Q-4-2 仍 `OPEN`，等主控裁定是否改硬失败。

### 8.5 修复后的读数汇总

| 项 | 读数 | 退出码 |
|---|---|---|
| `pnpm typecheck` | 通过 | 0 |
| `pnpm test:e2e` **裸跑（无环境变量）** | `28 passed (1.6m)`，`skipped:0 unexpected:0 flaky:0` | **0** |
| 缺产物场景 | 打印前置条件提示后失败（预期行为） | 非 0 |

**仍未改变的红线**：以上全部是**桌面 Chromium 视口模拟**结果。真机 / 微信内置浏览器 **仍为 NOT RUN**，不因本次修复而改变。
