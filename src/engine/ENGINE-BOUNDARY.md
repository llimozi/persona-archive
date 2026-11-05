# 引擎算法边界与 sigma 溯源（P1）

> 责任人：ENG（算法开发）｜交付时间：2026-11-05
> 基线 commit：`265c9f4`（开工时 `git status --porcelain` 为空，工作区干净）
> 任务来源：主控《第四阶段执行令 · P1 算法边界》

---

## 1. sigma 缺省值溯源（结论先行）

### 1.1 结论

| 档位 | 引擎取值 | 出处 | 性质 |
|---|---|---|---|
| `common` | **0.22** | `06` §11 U-06-6，`06:657` | **设计建议值** |
| `rare` | **0.18** | `06` §11 U-06-6，`06:657` | **设计建议值** |
| `hidden` | **0.15** | `06` §11 U-06-6，`06:657` | **设计建议值** |
| `limited` | **0.18** | **不是 06 原文**；是本实现的选择（见 §1.3） | **实现取值，无文档依据** |

**一句话**：`0.22 / 0.18 / 0.15` 三个数来自 `06` 第 11 节「未决项 U-06-6」的**建议**，
原文自己把该条目状态写成「**未定**」；`05` §5 U-05-5 又把同一组数标为「**建议值，未采用**」。
因此它们**既不是实测值，也不是行业标准，更不是已采纳的定值**——它们是"在没有真实标注数据时的占位建议"。

### 1.2 原文摘录（逐字，可核对）

**`docs/product-discovery/06-人格测试模型设计.md:657`**

```
| U-06-6 | 人物 `sigma` 的统一口径 | 未定 | 建议按 `rarity` 给默认：common 0.22 / rare 0.18 / hidden 0.15，再人工微调 |
```

拆读这一行：
- 第 3 列「现状」= **未定** → 说明连 06 自己都没有把这组数定下来；
- 第 4 列「建议」= 建议按 rarity 给默认 …「**再人工微调**」→ 三个数是**起点**，不是终点；
- 该表位于第 11 节「**未决项**与风险」，与 U-06-1（维度是否定稿）、U-06-4（α=0.6 是否合适）同级——
  即：**这是待决事项的一部分，不是已冻结的常量**。

**`docs/phase2-admission/05-阈值与算法口径输入.md:130`**

```
| U-05-5 | `sigma` 默认值（common 0.22 / rare 0.18 / hidden 0.15） | 建议值，未采用 | 仅在无真实标注时作合成输入用 |
```

05 的定性比 06 更明确，三点都要读：
1. **「建议值，未采用」**——当时（第一阶段）连采用都还没采用；
2. **「仅在无真实标注时作合成输入用」**——它被授权的用途是**测试/合成输入**；
3. 与 05 自检第 1 条「**本文件的 23 项里没有一个是实测的**」同向。

05 `05:126`（§5 未决项 U-05-1）同时记录了根因：
**人物 `dims` 真实标注数据不存在**，`NOT RUN`。
sigma 之所以只能是建议值，是因为没有任何一份真实标注可供校准。

### 1.3 `limited` 这一档：没有文档依据，必须单独说明

06 `06:657` 只给了三档（common / rare / hidden），**没有 `limited`**。
但 06 在两处明确把 `limited` 当合法稀有度使用：

- `06:365`（意外组合抽取）：`若不存在，取 L 中第一个 rarity='limited' 或 rarity='hidden' 的人物`
- `06:633`（§10.2 稀有度与池子规模无关）：`rarity = limited / hidden 的人物不加分`

即：**`limited` 是 06 定义内的档位，只是没给它 sigma 建议值**。
引擎对它取 **0.18（与 rare 同档）**——这是**本实现的取值选择，不是 06 原文**。
它不应被表述为"文档规定"，只能表述为"实现补齐"。

### 1.4 三个不能省的限定

1. **不得写成实测值**：没有任何实测存在，`05` §5 U-05-1 明确标注真实标注数据 `NOT RUN`。
2. **不得写成行业标准**：`06` §11 风险 4、`05` 风险 4 都点名过同类误引（如 `staleDays=30`）。
3. **不得写成"已验证"**：`06` §11 风险 1 原文警告——「所有人物容差若都填 0.2，等价于回到方案 A（单一分值）」，
   并给出前置动作：「须在后台做分布检查（同主题下主匹配分布的熵）」。**该检查当前 `NOT RUN`**。

### 1.5 证据等级

| 断言 | 等级 |
|---|---|
| 上表行号与原文逐字一致 | **VERIFIED**（本次逐一 `sed -n` 打印核对，见 §4 复现命令） |
| 这三个数是「设计建议值、非实测、非行业标准」 | **VERIFIED**（两处原文自述） |
| 用这组 sigma 跑出的匹配结果是否"准" | **UNKNOWN**——无标注集，无法测 |
| 三个默认值是否会让结果分布失衡 | **NOT RUN**（需真实 `dims`，`05` U-05-1 仍为 `NOT RUN`） |

---

## 2. 意外组合层边界测试

### 2.1 为什么需要这一轮

真实池 **12 人**（`data/personas.json` 实测计数，`matchPool=false` 者 0 张），
远低于 06 §10.1 的**设计门槛 40**（`06:626`、`06:189`、`05:60` A3）。
因此在真实数据下 `surpriseEnabled` 恒为 `false`，**意外组合层的抽取代码从未被执行过**——
它此前完全没有测试覆盖（基线 20 条引擎用例中零条触及该分支）。

### 2.2 本轮发现的实现缺口（已修复）

**缺口**：`pickSurprise()` 只实现了 06 §6.5 的**主规则（A 分支）**，
**漏掉了原文的兜底分支（B 分支）**。

`06:365` 原文：

> 在 L 中取第一个满足「与 main 分类不同 **且** 无 peer 关系 **且** M' ≥ 0.55」的人物；
> **若不存在，取 L 中第一个 `rarity='limited'` 或 `rarity='hidden'` 的人物**；仍不存在则不输出

修复前的行为：A 分支无命中 → 直接 `return null`，B 分支**代码根本不存在**。

**修复**（`src/engine/match.ts` 的 `pickSurprise`）：
1. 补上 B 兜底分支：A 无命中时，在排序表里找第一个 `limited`/`hidden`；
2. 同时修正一处口径：原文「**至少与 main 差距 ≥ 2 位**」写在主规则那条上，是 **A 分支的约束**，
   不应作用于 B。修复前它被当作 A/B 共同前提（B 不存在，所以没暴露）；
   若照旧套在 B 上，窄池里 `limited` 排在 `L[1]` 时将永远兜不到，与原文"取第一个"矛盾。

**注意口径**：这是一处**实现与 06 原文不一致的修复**，不是"调参"，也不改 06 任何数值。

### 2.3 红-绿记录（证明测试真能抓住缺口）

| 步骤 | 操作 | 结果 |
|---|---|---|
| RED | 临时把 B 分支改为 `undefined`（模拟修复前） | `2 failed \| 26 passed`，失败的正是两条兜底用例 |
| GREEN | 还原实现 | `28 passed (28)` |

RED 阶段失败的两条：
- `A 无命中但池中有 rarity=limited → 走兜底分支，取第一个 limited`
- `兜底分支取的是「排序后最靠前」的 limited/hidden，不是「数组里先出现」的那个`

### 2.4 覆盖清单

文件：`tests/engine/surprise-boundary.test.ts`（28 条）。数据全部在用例内构造，**不读 `data/`**。

| 分组 | 覆盖内容 | 条数 |
|---|---|---|
| 池门槛开关 | 12 人 / 39 人 / 40 人边界（含等号）/ `matchPool=false` 后有效池 39 / 门槛可被 config 覆盖 | 5 |
| 触发路径（A） | 不同分类 + 无 peer + M'≥0.55 + 位次差恰好 2；位次差=1 被跳过；peer 关系被跳过 | 3 |
| 不触发与兜底（B/C） | 全同分类→null；M'<0.55→null；limited 兜底；按排序而非数组顺序取；A/B 都无命中→null | 5 |
| 空数据 | personas 空 / answers 空 / questions 空 / 人物无 dims | 4 |
| 缺题·缺选项·非法 optionId·重复作答 | 未知题目；非法 optionId；effects 全 0；重复作答只取第一次；题目 id 重复；delta 越界 | 6 |
| 确定性 | 同输入连续 50 次，JSON 字符级相同 | 1 |
| sigma 取值来源 | 四档常量值；未填 sigma 时按 rarity 取；显式 sigma 不被覆盖；无 rarity 按 common 兜底 | 4 |

**所有断言名均等于其实际检查内容**——其中两条在初稿里名不副实，已当场改正：
- 原名"兜底分支只取 limited/hidden 中排序最靠前的一个" → 初版用 0.5 作人物值，实际因 σ 不同导致
  limited 的 g 更大、排序更前，与"数组顺序"断言相反。已改为**先断言排序与数组顺序相反，再断言取到前者**，
  现在这条断言真正在测"按排序、不按数组顺序"。
- 原名"结构不符…→ null" 初版断言写的是空串解码，实际测不到"非二元组"。已改为直接构造 `[["q01"]]` 载荷。

---

## 3. 结果 URL 重放一致性

### 3.1 链路

```
answers(Object) → runMatch() → encodeAnswers() → "?r=<base64url>" → decodeAnswers() → runMatch() → 逐维比对
```

`src/web/lib/share.ts` 只编码 answers（不编码结论），打开者由引擎重算——这是"链接里的结论必须等于当前引擎结论"的设计前提。

### 3.2 断言内容（`tests/engine/share-replay.test.ts`，13 条）

| 分组 | 覆盖内容 | 条数 |
|---|---|---|
| 编解码往返 | 还原后深度相等；键顺序无关→同 token；token 仅含 base64url 字符 | 3 |
| 逐维一致 | 六维 `x` 用 `===` 逐维相等；`raw`/`undetermined`/`coverage` 相等；整个结果快照深度相等；JSON 字符级相同；每题每选项分别重放；同一 token 连续重算 100 次 | 7 |
| 异常 token 降级 | 非法 base64 → null；空对象 → null；非二元组结构 → null；篡改选项 → 引擎忽略该题不崩溃、不产伪结果 | 3 |

### 3.3 明确不声称的东西

- **不声称准确率**。没有标注集，任何"N% 一致"的表述都无依据。
  本测试断言的是「**两次计算完全相等**」= 重放一致性，**不等于结果正确**。
- **不声称真机/微信环境已验证**。测试在 Node 环境下用 shim 提供 `btoa`/`atob` 口径，
  浏览器实机 `NOT RUN`（由 E2E 侧负责，不在本文件结论范围内）。

---

## 4. 复现命令（逐条对应上文结论）

```bash
cd persona-archive

# ① sigma 溯源：逐行核对原文（应打出 §1.2 的两行）
sed -n '657p' ../docs/product-discovery/06-人格测试模型设计.md
sed -n '130p' ../docs/phase2-admission/05-阈值与算法口径输入.md

# ② 当前真实池规模与出池数（12 / 0）
node -e "const d=require('./data/personas.json');const a=Array.isArray(d)?d:d.personas||d.items||[];console.log(a.length, a.filter(p=>p.compliance&&p.compliance.matchPool===false).length)"

# ③ 边界测试
npx vitest run --config vitest.config.ts tests/engine/surprise-boundary.test.ts
npx vitest run --config vitest.config.ts tests/engine/share-replay.test.ts

# ④ 全量
pnpm test engine    # 期望 61 passed, EXIT=0
pnpm test           # 期望 97 passed, EXIT=0
pnpm typecheck      # 期望 EXIT=0
```

本次实跑输出（原样）：

```
 ✓ tests/engine/single-path.test.ts (1 test) 13ms
 ✓ tests/engine/theme-usage.test.ts (2 tests) 13ms
 ✓ tests/engine/match.test.ts (17 tests) 110ms
 ✓ tests/data/contract.test.ts (11 tests) 43ms
 ✓ tests/engine/surprise-boundary.test.ts (28 tests) 170ms
 ✓ tests/unit/poster.test.ts (25 tests) 28ms
 ✓ tests/engine/share-replay.test.ts (13 tests) 89ms

 Test Files  7 passed (7)
      Tests  97 passed (97)
```

`pnpm test engine` → `Tests 61 passed (61)`，`REAL_EXIT=0`；
`pnpm typecheck` → `TYPECHECK_EXIT=0`。

---

## 5. 结论表

| 项 | 结论 | 依据 |
|---|---|---|
| 意外组合层「触发」路径被执行 | **PASS** | §2.4 触发路径 3 条实跑通过 |
| 意外组合层「不触发」路径被执行 | **PASS** | §2.4 不触发 5 条实跑通过 |
| 06 §6.5 兜底分支（B）存在 | **PASS**（修复后） | RED→GREEN 记录，§2.3 |
| 空数据 / 异常输入不崩溃 | **PASS** | §2.4 空数据 4 条 + 异常 6 条 |
| sigma 三档出处与性质已核实 | **PASS** | §1.1/§1.2，VERIFIED |
| sigma `limited` 档有文档依据 | **FAIL（无依据）** | 系实现补齐，非 06 原文，§1.3 |
| sigma 默认值是否合适 | **NOT RUN** | 需真实 `dims` 标注，`05` U-05-1 `NOT RUN` |
| ?r= 重放一致性 | **PASS** | §3.2，13 条实跑通过，HEAD `265c9f4`+本轮改动 |
| 重放"准确率" | **BLOCKED** | 无标注集，不做也无从做 |
| 浏览器/微信实机重放 | **NOT RUN** | 超出本次 Node 环境范围，归 E2E |
| `npm test` 全绿且 EXIT=0 | **PASS** | §4，97 passed / EXIT=0 |

> 全部结论绑定 commit：开工基线 `265c9f4`，本轮改动见 git diff；
> 表格中「HEAD `265c9f4`+本轮改动」指结论在本轮改动**提交后**仍成立，最终 HEAD 以提交记录为准。
