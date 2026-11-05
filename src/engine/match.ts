/**
 * 六维匹配引擎 · 主入口
 *
 * 权威来源（只读）：
 *   docs/product-discovery/06-人格测试模型设计.md（§5 作答→维度分、§6 匹配算法、§7 可解释性、§8 百分比口径）
 *   docs/phase2-admission/05-阈值与算法口径输入.md（§1 实现口径、§2 阈值清单）
 *
 * ══ 硬性承诺（对应 06 §1 的 C1–C5）══
 *  1. **纯函数**：不读文件、不读时钟、不读环境变量、不写任何外部状态。
 *  2. **零运行时依赖**：只用 ECMAScript 内建（Math.exp 等），不引任何第三方库。
 *  3. **无随机数**：全文件不出现 Math.random / Date.now；同一输入重复执行结果字符级相同。
 *  4. **全部数值遍历都按 DIM_KEYS 固定顺序**，保证浮点累加顺序稳定。
 *
 * ⚠️ **数值性质声明**：本文件所有常量（alpha=0.6、betaMax=0.03、池门槛 40、意外下限 0.55、
 *    次匹配差 0.12、隐藏命中率目标 15%、sigma 默认 0.22/0.18/0.15）均为 **06/05 的「设计值」**，
 *    未经本产品真实用户数据实测校准，**不是实测值，也不是行业标准**。
 *    任何对外表述都必须写成"设计取值"，百分比一律是**娱乐匹配度**，不是心理测量值。
 */

import { DIM_LABELS, getDimKeys } from './types.js';
import type {
  DimContribution,
  DimKey,
  EngineAnswer,
  EnginePersona,
  EngineQuestion,
  Explanation,
  HiddenRule,
  MatchConfig,
  MatchInput,
  MatchPick,
  MatchResult,
  MatchWarning,
  PercentDisplay,
  QuestionAttribution,
  ScoredPersona,
  UserVector,
} from './types.js';
import { evalCondition, wildcardMatch } from './expression.js';

export const ENGINE_VERSION = 'engine-1.0.0';

/**
 * 主题权重缺省值 —— **唯一权威来源**（主控 2026-11-05 裁决：结果只允许引擎一条计算路径）。
 *
 * 出处：`06 §9.1` 的 th-general 主题权重（`EE .18 / ST .18 / AC .18 / HX .22 / RB .12 / SR .12`），和为 1.0。
 * ⚠️ 这是**设计值**，不是实测校准值（`06 §4.3` 明确写"权重是起步值，不是终值"）。
 *
 * 为什么要导出：分享链接重算、前端展示、后端接口三方必须用**同一组权重**，
 * 否则同一份作答在不同端会算出不同人物。任何端都不得再自己写一份常量。
 */
export const DEFAULT_THEME_WEIGHTS: Readonly<Record<DimKey, number>> = Object.freeze({
  EE: 0.18,
  ST: 0.18,
  AC: 0.18,
  HX: 0.22,
  RB: 0.12,
  SR: 0.12,
});

/**
 * 默认参数。全部是 **设计值**（出处见每个字段注释），未经实测校准。
 * 修改任何一个都必须同步更新 COLLAB 文档里的可复算示例，否则示例会失真。
 */
export const DEFAULT_CONFIG: Required<MatchConfig> = {
  /** 06 §6.3 `06:345`｜05 §2.1 A1｜设计值 */
  alpha: 0.6,
  /** 06 §6.4 `06:351`｜05 §2.1 A2｜设计值 */
  betaMax: 0.03,
  /** 06 §6.4｜设计值 */
  betaStep: 0.01,
  /** 06 §10.1 / §4.3.1｜05 §2.1 A3｜设计值 40 张；当前真实池 30 张 → 首批该层关闭 */
  surprisePoolThreshold: 40,
  /** 06 §6.5｜设计值 */
  surpriseMinScore: 0.55,
  /** 06 §6.5｜设计值 */
  secondaryCloseDelta: 0.12,
  /** 06 §6.5 / §10.4｜05 §2.1 A8｜设计目标，仅用于告警不改变算法 */
  hiddenRateTarget: 0.15,
};

/**
 * sigma 缺省值：按 rarity 给默认（06 §11 U-06-6 `06:657` 的**建议值**，
 * 05 §2.2 U-05-5 标注为"建议值，未采用"）。
 *
 * ⚠️ 必读口径，防止误引：
 *  - 06 `06:657` 原文只列了三档 **common 0.22 / rare 0.18 / hidden 0.15**，
 *    这三档是**设计建议值，不是实测值，也不是行业标准**。
 *  - `limited` 这一档**不在 06 的默认值表里**。但 06 `06:365`（意外组合抽取）与
 *    06 `06:633`（"rarity = limited / hidden 的人物不加分"）都明确把 `limited` 当作
 *    合法稀有度使用，所以它是 06 定义内的档位、只是没有给 sigma 建议值。
 *    本引擎对 `limited` 取 **0.18**（与 rare 同档）——这是**本实现的取值选择，不是 06 原文**。
 *    2026-11-04 全仓口径统一：`match.ts` 与 `ENGINE-CALC-EXAMPLE.md` 两处均为 0.18，
 *    `src/shared/types.ts` 的 Rarity 注释**不约定**具体数值（只声明档位），因此无第三个来源。
 *    如后续要改这一档，只改本文件这一行 + 文档那一行，两处必须同步。
 *  - 06 §11 风险 1 已警告："所有人物容差若都填 0.2，等价于回到方案 A"。
 */
export const DEFAULT_SIGMA_BY_RARITY: Readonly<Record<string, number>> = {
  common: 0.22,
  rare: 0.18,
  limited: 0.18,
  hidden: 0.15,
};

/** 差距阈值：|x-mu|/sigma 超过此值判"有差距"/"明显不像"（展示用分段，非算法参数） */
const GAP_NEAR = 0.5;
const GAP_FAR = 1.5;

// ════════════════════════════════════════════════════════════════
// 1. 作答 → 六维分（06 §5）
// ════════════════════════════════════════════════════════════════

/**
 * 把作答算成六维分。
 *
 *   S_d = Σ w_q·δ_q,d / Σ |w_q·δ_q,d|   ∈ [-1,1]（06 §5.2）
 *   x_d = (S_d + 1) / 2                  ∈ [0,1]（06 §5.3）
 *   分母为 0 → x_d = 0.5，标 undetermined，不参与人物加权
 */
export function scoreAnswers(
  questions: readonly EngineQuestion[],
  answers: readonly EngineAnswer[],
): { user: UserVector; warnings: MatchWarning[] } {
  const warnings: MatchWarning[] = [];
  const byId = new Map<string, EngineQuestion>();
  for (const q of questions) byId.set(q.id, q);

  const numerator: Record<DimKey, number> = zeroDims();
  const denominator: Record<DimKey, number> = zeroDims();
  const counts: Record<DimKey, number> = zeroDims();
  const perQuestion: UserVector['perQuestion'] = [];
  const seen = new Set<string>();

  for (const ans of answers) {
    const q = byId.get(ans.questionId);
    if (!q) {
      warnings.push({ code: 'answer_unknown_question', message: `作答引用了不存在的题目 ${ans.questionId}，已忽略` });
      continue;
    }
    if (seen.has(ans.questionId)) {
      warnings.push({ code: 'answer_duplicate', message: `题目 ${ans.questionId} 重复作答，仅采用第一次` });
      continue;
    }
    seen.add(ans.questionId);

    const opt = q.options.find((o) => o.id === ans.optionId);
    if (!opt) {
      warnings.push({
        code: 'answer_unknown_option',
        message: `题目 ${ans.questionId} 的选项 ${ans.optionId} 不存在，该题不计分`,
      });
      continue;
    }

    const wq = typeof q.weight === 'number' && Number.isFinite(q.weight) ? q.weight : 1;
    const dims: Array<{ dim: DimKey; contribution: number }> = [];
    const dynamicDims = getDimKeys();
    for (const dim of dynamicDims) {
      const rawDelta = opt.effects?.[dim];
      if (typeof rawDelta !== 'number' || !Number.isFinite(rawDelta) || rawDelta === 0) continue;
      if (Math.abs(rawDelta) > 1) {
        warnings.push({
          code: 'delta_out_of_range',
          message: `题目 ${q.id} 的 ${dim} 贡献 ${rawDelta} 超出建议范围 [-1,1]，已按原值计入`,
        });
      }
      const contribution = wq * rawDelta;
      numerator[dim] += contribution;
      denominator[dim] += Math.abs(contribution);
      counts[dim] += 1;
      dims.push({ dim, contribution });
    }
    perQuestion.push({ questionId: q.id, optionId: opt.id, dims });
  }

  if (answers.length === 0) {
    warnings.push({ code: 'no_answers', message: '没有任何作答，结果不可用（06 §5.3：作答不完整应作废）' });
  }

  const raw = zeroDims();
  const x = zeroDims();
  const undetermined: DimKey[] = [];
  for (const dim of getDimKeys()) {
    const den = denominator[dim];
    if (den === 0) {
      raw[dim] = 0;
      x[dim] = 0.5;
      undetermined.push(dim);
      continue;
    }
    const s = numerator[dim] / den;
    raw[dim] = s;
    x[dim] = (s + 1) / 2;
  }

  const coveredCount = getDimKeys().length - undetermined.length;
  const user: UserVector = {
    x,
    raw,
    undetermined,
    coverage: coveredCount / getDimKeys().length,
    answerCoverage: questions.length > 0 ? perQuestion.length / questions.length : 0,
    tags: [],
    perQuestion,
  };
  void counts; // 计数用于归因调试，不进入对外结果结构

  return { user, warnings };
}

// ════════════════════════════════════════════════════════════════
// 2. 人物打分（06 §6.2 / §6.3 / §6.4）
// ════════════════════════════════════════════════════════════════

/**
 * 把人物 dims 规整成 0..1 制 mu。
 *
 * ⚠️ 量纲约定（主控 2026-11-04 裁定，写进契约）：
 *   **`Dims` 一律为 0–100 百分制**（`src/shared/types.ts` 的 `Dims`）。
 *   本函数里的 0..1 自动识别**仅作为历史数据兜底**，新数据不得依赖它。
 *
 * 识别规则：六键齐全 + 全部在 0..100 + 存在 >1 的值 → 判百分制，统一 /100。
 * 为什么是"猜"而不是"断言"：`Dims` 类型只约束"键齐全、值是数字"，**不约束取值范围**，
 * 所以引擎无法在类型层拿到保证，只能在运行期识别；识别到的每种降级都会 push 一条 warning，
 * 不允许静默——见下方对"疑似笔误"的判定。
 */
function normalizeMu(
  dims: Partial<Record<DimKey, number>>,
  personaId: string,
  warnings: MatchWarning[],
): Partial<Record<DimKey, number>> {
  const vals = getDimKeys().map((d) => dims[d]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const allPresent = vals.length === getDimKeys().length;
  const inPercentRange = allPresent && vals.every((v) => v >= 0 && v <= 100);
  const hasAboveOne = vals.some((v) => v > 1);
  const allPercent = inPercentRange && hasAboveOne;

  // 风险点：全部值都落在 0..1 时，既可能是"0..1 制"，也可能是"百分制但数值极小（笔误）"。
  // 引擎无法区分，只能按 0..1 处理，但**必须告警**，否则会静默错一整档。
  if (allPresent && inPercentRange && !hasAboveOne) {
    warnings.push({
      code: 'mu_unit_ambiguous',
      message: `人物 ${personaId} 的 dims 六个值全部落在 0..1，按 0–1 制处理；若原意是百分制（如 1 = 1%），此处会静默错一整档。请按契约统一写 0–100。`,
    });
  }
  if (allPresent && !inPercentRange) {
    warnings.push({
      code: 'mu_range_suspect',
      message: `人物 ${personaId} 的 dims 存在越界值（应恒在 0–100），已按 0–1 制原样使用，结果可能明显失真。`,
    });
  }

  const out: Partial<Record<DimKey, number>> = {};
  for (const d of getDimKeys()) {
    const v = dims[d];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[d] = allPercent ? v / 100 : v;
  }
  return out;
}

function zeroDims(): Record<DimKey, number> {
  return { EE: 0, ST: 0, AC: 0, HX: 0, RB: 0, SR: 0 };
}

function sigmaFor(p: EnginePersona, dim: DimKey): number {
  const explicit = p.sigma?.[dim];
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit > 0) return explicit;
  const byRarity = p.rarity ? DEFAULT_SIGMA_BY_RARITY[p.rarity] : undefined;
  return byRarity ?? DEFAULT_SIGMA_BY_RARITY.common!;
}

interface PreparedPersona {
  raw: EnginePersona;
  mu: Partial<Record<DimKey, number>>;
  dims: DimKey[];
  /** norm(weight_{p,d})：在本人物 D_p 内归一化，和为 1 */
  normWeight: Record<DimKey, number>;
  serialNo: number;
  matchWeight: number;
  rarity: string;
  tags: string[];
}

function preparePersona(p: EnginePersona, index: number, cfg: Required<MatchConfig>, warnings: MatchWarning[]): PreparedPersona {
  const mu = normalizeMu(p.dims, p.id, warnings);
  const unset = new Set(p.dimsUnset ?? []);
  const dims: DimKey[] = [];
  for (const d of getDimKeys()) {
    const v = mu[d];
    if (typeof v !== 'number' || unset.has(d)) continue;
    if (v < 0 || v > 1) {
      warnings.push({ code: 'mu_out_of_range', message: `人物 ${p.id} 的 ${d}=${v} 越界，已截断到 [0,1]` });
      mu[d] = Math.min(1, Math.max(0, v));
    }
    dims.push(d);
  }
  if (dims.length === 0) {
    warnings.push({ code: 'persona_no_dims', message: `人物 ${p.id} 没有任何可用维度，不参与匹配` });
    return {
      raw: p,
      mu,
      dims: [],
      normWeight: zeroDims(),
      serialNo: p.serialNo ?? index,
      matchWeight: clampMatchWeight(p.matchWeight, p.id, warnings),
      rarity: p.rarity ?? 'common',
      tags: [...(p.tags ?? [])].sort(),
    };
  }

  // norm(weight)：人物未显式给 weight 时视为等权（06 §9.1 示例即"权重此处简化取等权"）
  const rawW = dims.map((d) => {
    const w = p.weight?.[d];
    return typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 1;
  });
  const totalW = rawW.reduce((a, b) => a + b, 0);
  const normWeight = zeroDims();
  dims.forEach((d, i) => {
    normWeight[d] = totalW > 0 ? rawW[i]! / totalW : 0;
  });

  void cfg;
  return {
    raw: p,
    mu,
    dims,
    normWeight,
    serialNo: p.serialNo ?? index,
    matchWeight: clampMatchWeight(p.matchWeight, p.id, warnings),
    rarity: p.rarity ?? 'common',
    tags: [...(p.tags ?? [])].sort(),
  };
}

/** 06 §10.2：matchWeight 略高但不超过 1.3 */
function clampMatchWeight(value: number | undefined, id: string, warnings: MatchWarning[]): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  if (value > 1.3) {
    warnings.push({ code: 'match_weight_clamped', message: `人物 ${id} 的 matchWeight=${value} 超过 06 §10.2 上限 1.3，已截断` });
    return 1.3;
  }
  if (value < 0) return 0;
  return value;
}

function gaussian(x: number, mu: number, sigma: number): number {
  return Math.exp(-((x - mu) ** 2) / (2 * sigma * sigma));
}

function gapVerdict(ratio: number): DimContribution['verdict'] {
  if (ratio <= GAP_NEAR) return '接近';
  if (ratio <= GAP_FAR) return '有差距';
  return '明显不像';
}

function scorePersona(
  p: PreparedPersona,
  x: Record<DimKey, number>,
  undetermined: Set<DimKey>,
  themeWeights: Record<DimKey, number>,
  userTags: string[],
  cfg: Required<MatchConfig>,
): ScoredPersona | null {
  const activeDims = p.dims.filter((d) => !undetermined.has(d));
  if (activeDims.length === 0) return null;

  // ω_d = α·w_theme + (1-α)·norm(weight_p)
  // norm(weight_p) 在 D_p 内归一（06 §6.3）；D_p 取"已覆盖"维度子集，与 06 §5.3
  // "undetermined 不参与该人物加权"一致——未覆盖维度已先被 activeDims 剔除。
  const rawW = new Map<DimKey, number>();
  let rawSum = 0;
  for (const d of activeDims) {
    const w = p.raw.weight?.[d];
    const ww = typeof w === 'number' && Number.isFinite(w) && w > 0 ? w : 1;
    rawW.set(d, ww);
    rawSum += ww;
  }
  if (rawSum <= 0) return null;

  const contributions: DimContribution[] = [];
  let weighted = 0;
  let omegaTotal = 0;
  for (const d of activeDims) {
    const mu = p.mu[d]!;
    const sigma = sigmaFor(p.raw, d);
    const g = gaussian(x[d], mu, sigma);
    const omega = cfg.alpha * (themeWeights[d] ?? 0) + (1 - cfg.alpha) * ((rawW.get(d) ?? 1) / rawSum);
    weighted += omega * g;
    omegaTotal += omega;
    contributions.push({
      dim: d,
      share: 0,
      g,
      x: x[d],
      mu,
      sigma,
      omega,
      gapInSigma: Math.abs(x[d] - mu) / sigma,
      verdict: gapVerdict(Math.abs(x[d] - mu) / sigma),
    });
  }
  if (omegaTotal <= 0) return null;

  const score = weighted / omegaTotal;
  for (const c of contributions) c.share = (c.omega * c.g) / (weighted || 1);
  contributions.sort((a, b) => (b.share !== a.share ? b.share - a.share : getDimKeys().indexOf(a.dim) - getDimKeys().indexOf(b.dim)));

  // 标签微调（06 §6.4）
  const sharedTags = userTags.filter((t) => p.tags.includes(t));
  const beta = Math.min(cfg.betaMax, cfg.betaStep * sharedTags.length);
  const adjusted = score * (1 + beta);

  return {
    id: p.raw.id,
    name: p.raw.name,
    category: p.raw.category,
    tags: p.tags,
    rarity: p.rarity,
    matchWeight: p.matchWeight,
    score,
    adjusted,
    percent: roundPercent(adjusted),
    usedDims: contributions.map((c) => c.dim),
    contributions,
    sharedTags,
    beta,
  };
}

/** 06 §8.1：P = round(M' × 100)。四舍五入用 +0.5 取整，避免浮点边界随引擎实现漂移。 */
function roundPercent(m: number): number {
  return Math.floor(m * 100 + 0.5);
}

/** 06 §8.2 第 2 条：不显示小数点；<10% 显示为 `<10%` */
export function formatPercent(percent: number): PercentDisplay {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return { value, label: value < 10 ? '<10%' : `${value}%` };
}

// ════════════════════════════════════════════════════════════════
// 3. 四层抽取（06 §6.5 / §6.6）
// ════════════════════════════════════════════════════════════════

interface RelationIndex {
  has(a: string, b: string, kind: 'peer' | 'contrast'): boolean;
}

function buildRelationIndex(relations: readonly { a: string; b: string; kind: 'peer' | 'contrast' }[] | undefined): RelationIndex {
  const peer = new Set<string>();
  const contrast = new Set<string>();
  const key = (a: string, b: string) => (a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`);
  for (const r of relations ?? []) {
    if (r.kind === 'peer') peer.add(key(r.a, r.b));
    else contrast.add(key(r.a, r.b));
  }
  return {
    has: (a, b, kind) => (kind === 'peer' ? peer : contrast).has(key(a, b)),
  };
}

/**
 * 三级排序（06 §6.5）：M' 降序 → matchWeight 降序 → serialNo 升序。
 * 这是"无平局随机性"的实现保证。
 */
function sortRanking(list: ScoredPersona[], serialOf: Map<string, number>): ScoredPersona[] {
  return [...list].sort((a, b) => {
    if (b.adjusted !== a.adjusted) return b.adjusted - a.adjusted;
    if (b.matchWeight !== a.matchWeight) return b.matchWeight - a.matchWeight;
    const sa = serialOf.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const sb = serialOf.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; // 最终字典序兜底，保证全序
  });
}

function pickSecondary(
  ranking: ScoredPersona[],
  main: ScoredPersona,
  rel: RelationIndex,
  cfg: Required<MatchConfig>,
): MatchPick | null {
  const rest = ranking.filter((p) => p.id !== main.id);
  if (rest.length === 0) return null;

  // ⚠️ 严格按 06:363 原文：
  //   「L 中第一个满足『与 main 不同分类 **或** 与 main 的 M' 差值 ≤ 0.12』的人物」——
  //   抽取条件只有这两条。"不同 rarity / contrast 关系"是**约束列**（校验选取结果是否合格），
  //   不是抽取条件。早期实现误把约束写进了抽取，导致同分类但同稀有的人本可被跳过。
  const strict = rest.find(
    (p) => p.category !== main.category || Math.abs(main.adjusted - p.adjusted) <= cfg.secondaryCloseDelta,
  );
  if (strict) {
    const reasons: string[] = [];
    if (strict.category !== main.category) reasons.push('不同分类');
    if (Math.abs(main.adjusted - strict.adjusted) <= cfg.secondaryCloseDelta) reasons.push('与主匹配分差 ≤0.12');
    // 约束列校验：06:363 要求次匹配与 main 至少满足一条（不同分类 / 不同 rarity / contrast 关系）
    const satisfiesConstraint =
      strict.category !== main.category || strict.rarity !== main.rarity || rel.has(main.id, strict.id, 'contrast');
    const note = satisfiesConstraint
      ? `次匹配按 06 §6.5 抽取：${reasons.join('、')}`
      : `次匹配按 06 §6.5 抽取：${reasons.join('、')}；但未满足约束列（同类同稀有度且无 contrast），标「同类近亲」`;
    return { persona: strict, note };
  }
  return { persona: rest[0]!, note: '同池内没有满足抽取条件（不同分类 / 分差 ≤0.12）的次匹配，按规则取 L[1] 并标「同类近亲」' };
}

/**
 * 意外组合抽取（06 §6.5 `06:365`，**两条分支，顺序固定**）：
 *
 *   A. 主规则：L 中「与 main 分类不同 **且** 无 peer 关系 **且** M' ≥ 0.55」的第一个人；
 *   B. 兜底（06:365 原文「若不存在，取 L 中第一个 rarity='limited' 或 rarity='hidden' 的人物」）：
 *      A 无命中时，在全表里按排序取第一个 limited/hidden 卡；
 *   C. 仍不存在 → 不输出该层。
 *
 * ⚠️ 「差距 ≥2 位」是**约束列**，只作用于 A 分支（原文位置就在主规则那条上）。
 *    2026-11-05 修正：早期实现把它当成了 A/B 共同前提，且**缺 B 兜底分支**——
 *    B 从未被执行过，等于把 06 的一条规则静默丢了。兜底分支必须扫全表，
 *    若也套 ≥2 位，窄池（如 3 人）里 limited/hidden 排在 L[1] 就永远兜不到。
 */
function pickSurprise(
  ranking: ScoredPersona[],
  main: ScoredPersona,
  rel: RelationIndex,
  cfg: Required<MatchConfig>,
): MatchPick | null {
  const mainIndex = ranking.findIndex((p) => p.id === main.id);
  const minIndex = mainIndex + 2; // A 分支约束：至少相差 ≥2 位（06 §6.5）

  const primary = ranking
    .slice(Math.max(0, minIndex))
    .find((p) => p.category !== main.category && !rel.has(main.id, p.id, 'peer') && p.adjusted >= cfg.surpriseMinScore);
  if (primary) {
    return { persona: primary, note: '意外组合：与主匹配不同分类、无 peer 关系、超过设计下限 0.55（06 §6.5）' };
  }

  // 兜底必须排除主匹配本人：扫的是全表，若主匹配本身就是 limited/hidden，
  // 不排除会返回「意外组合 == 主匹配」，与 06 §6.5「意外」的定义直接矛盾。
  const fallback = ranking.find((p) => p.id !== main.id && (p.rarity === 'limited' || p.rarity === 'hidden'));
  if (fallback) {
    return {
      persona: fallback,
      note: `意外组合（兜底）：主规则无命中，按 06 §6.5 取 L 中第一个 rarity='${fallback.rarity}' 的人物`,
    };
  }

  return null;
}

function pickHidden(
  ranking: ScoredPersona[],
  user: UserVector,
  rules: readonly HiddenRule[] | undefined,
  warnings: MatchWarning[],
): MatchPick | null {
  if (!rules || rules.length === 0) return null;
  const hits: Array<{ rule: HiddenRule; hit: ScoredPersona | null }> = [];
  for (const rule of rules) {
    const ok = evalCondition(rule.condition, user.x as unknown as Record<string, number>);
    if (ok === null) {
      warnings.push({ code: 'hidden_rule_invalid', message: `隐藏规则 ${rule.ruleId} 的 condition 无法解析：${rule.condition}` });
      continue;
    }
    if (!ok) continue;
    const need = rule.minAnswersCovered ?? 0;
    if (user.coverage < need) {
      warnings.push({
        code: 'hidden_rule_coverage',
        message: `隐藏规则 ${rule.ruleId} 条件命中但覆盖度 ${user.coverage.toFixed(2)} < ${need}，按 06 §6.6 不触发`,
      });
      continue;
    }
    const pool = rule.candidatePool ?? [];
    const poolHit = ranking.find((p) => (pool.length === 0 ? true : pool.some((pat) => wildcardMatch(pat, p.id))));
    if (!poolHit) {
      warnings.push({ code: 'hidden_rule_empty_pool', message: `隐藏规则 ${rule.ruleId} 命中但候选池为空` });
      continue;
    }
    hits.push({ rule, hit: poolHit });
  }
  if (hits.length === 0) return null;
  hits.sort((a, b) => {
    const pa = a.rule.priority ?? 0;
    const pb = b.rule.priority ?? 0;
    if (pb !== pa) return pb - pa;
    const sa = a.hit?.adjusted ?? 0;
    const sb = b.hit?.adjusted ?? 0;
    if (sb !== sa) return sb - sa;
    return a.rule.ruleId < b.rule.ruleId ? -1 : a.rule.ruleId > b.rule.ruleId ? 1 : 0;
  });
  const top = hits[0]!;
  const note = `隐藏人格由规则 ${top.rule.ruleId}「${top.rule.name}」触发（条件 ${top.rule.condition}），候选池内取 M' 最高者`;
  return { persona: top.hit!, note };
}

// ════════════════════════════════════════════════════════════════
// 4. 可解释文本（06 §7，纯模板，不经 AI）
// ════════════════════════════════════════════════════════════════

const DISCLAIMER = '娱乐匹配度，不是心理测量';

function dimText(d: DimKey): string {
  return `${d}（${DIM_LABELS[d]}）`;
}

function buildExplanation(
  main: ScoredPersona | null,
  secondary: MatchPick | null,
  hidden: MatchPick | null,
  surprise: MatchPick | null,
  user: UserVector,
  questions: readonly EngineQuestion[],
): Explanation {
  if (!main) {
    return {
      mainSummary: '没有可用的人物画像，无法给出主匹配',
      mainDims: [],
      mainQuestions: [],
      secondarySummary: null,
      hiddenSummary: null,
      surpriseSummary: null,
      disclaimer: DISCLAIMER,
    };
  }

  const dims = main.contributions.slice(0, 3).map((c) => {
    const mine = c.x.toFixed(2);
    const yours = c.mu.toFixed(2);
    const closer = c.g >= 0.8 ? '很接近' : c.g >= 0.5 ? '有点像' : '不太像';
    return `${dimText(c.dim)}：你的值 ${mine}，他/她的代表值 ${yours}（容差 σ=${c.sigma.toFixed(2)}），${closer}；这一维占你和他匹配分的 ${(c.share * 100).toFixed(1)}%`;
  });

  // 题目归因（06 §7.2 第 2 步）：取贡献最大的维度，反查 |w_q·δ| 最大的两道题
  const mainQuestions = attributeQuestions(main, user.perQuestion);
  const moved = mainQuestions[0];
  const movedText = moved
    ? `${moved.questionId} 题（选项 ${moved.optionId}）对你俩的 ${moved.dim} 是${moved.direction === 'toward' ? '拉近' : '推远'}项，贡献 ${moved.contribution.toFixed(2)}`
    : '本次作答中有明显贡献的题目不足，无法归因到具体题目';

  const top = dims[0] ?? '';
  const mainSummary = `你和「${main.name}」最像的是${top ? ` ${top.split('：')[0]}` : '整体画像'}；关键题是：${movedText}。`;

  const secondarySummary = secondary
    ? `次匹配「${secondary.persona.name}」${formatPercent(secondary.persona.percent).label}：${secondary.note}`
    : null;
  const hiddenSummary = hidden
    ? `隐藏人格「${hidden.persona.name}」：${hidden.note}`
    : null;
  const surpriseSummary = surprise
    ? `意外组合「${surprise.persona.name}」${formatPercent(surprise.persona.percent).label}：${surprise.note}`
    : null;

  void questions;
  return {
    mainSummary,
    mainDims: dims,
    mainQuestions,
    secondarySummary,
    hiddenSummary,
    surpriseSummary,
    disclaimer: DISCLAIMER,
  };
}

function attributeQuestions(
  main: ScoredPersona,
  perQuestion: UserVector['perQuestion'],
): QuestionAttribution[] {
  const positive = main.contributions.find((c) => c.mu > 0.5 && c.x > 0.5)?.dim ?? main.contributions[0]?.dim;
  if (!positive) return [];
  const mu = main.contributions.find((c) => c.dim === positive)?.mu ?? 0.5;
  const rows: QuestionAttribution[] = [];
  for (const q of perQuestion) {
    for (const d of q.dims) {
      if (d.dim !== positive) continue;
      rows.push({
        questionId: q.questionId,
        optionId: q.optionId,
        dim: d.dim,
        contribution: d.contribution,
        direction: (mu - 0.5) * d.contribution >= 0 ? 'toward' : 'away',
      });
    }
  }
  rows.sort((a, b) => {
    if (Math.abs(b.contribution) !== Math.abs(a.contribution)) return Math.abs(b.contribution) - Math.abs(a.contribution);
    return a.questionId < b.questionId ? -1 : a.questionId > b.questionId ? 1 : 0;
  });
  return rows.slice(0, 2);
}

// ════════════════════════════════════════════════════════════════
// 5. 主入口
// ════════════════════════════════════════════════════════════════

/**
 * 六维匹配：作答 → 六维分 → 人物排序 → 主/次/隐藏/意外 + 可读解释。
 *
 * **纯函数、无随机、无 I/O**。同一输入重复调用返回深度相等的结果。
 */
export function match(input: MatchInput): MatchResult {
  const cfg = resolveConfig(input.config);
  const warnings: MatchWarning[] = [];

  // 主题权重校验（06 §4.2 要求和为 1.0；不静默归一，只告警，值按原样用）
  const wsum = getDimKeys().reduce((s, d) => s + (input.theme.weights[d] ?? 0), 0);
  if (Math.abs(wsum - 1) > 1e-6) {
    warnings.push({
      code: 'theme_weights_not_normalized',
      message: `主题 ${input.theme.themeId} 的六维权重和为 ${wsum}，06 §4.2 要求为 1.0；引擎按原值使用未静默归一`,
    });
  }

  const { user, warnings: answerWarnings } = scoreAnswers(input.questions, input.answers);
  warnings.push(...answerWarnings);

  // 用户标签（06 §6.4 的映射表，数据驱动）
  const userTags: string[] = [];
  for (const rule of input.userTagRules ?? []) {
    const ok = evalCondition(rule.condition, user.x as unknown as Record<string, number>);
    if (ok === null) {
      warnings.push({ code: 'user_tag_rule_invalid', message: `用户标签规则 ${rule.tag} 的 condition 无法解析：${rule.condition}` });
      continue;
    }
    if (ok) userTags.push(rule.tag);
  }
  userTags.sort();
  user.tags = [...userTags];

  // 全池硬过滤（06 §4.3.1 第 1 条）：受限卡不进任何匹配池。
  //
  // ⚠️ 判据口径（2026-11-04 与内容数据对齐，以真实数据为准）：
  //   `compliance.restricted`   = 「有合规注意项」（多为 thirdPartyIP），**不等于**不能进池；
  //   `compliance.matchPool`    = 「能不能当匹配对象」，**这才是进池判据**；
  //   `rarity`                  = 稀有度（common/rare/limited/hidden），与受限语义无关。
  // 真实数据 12 人里 10 人 restricted=true 但 matchPool=true——若按 restricted 拦，池只剩 2 人，
  // 所以这里**只看 matchPool === false 才拦**，restricted 仅作为告警级信息透出。
  const eligible = input.personas.filter((p) => {
    const meta = p as EnginePersona & {
      compliance?: { restricted?: boolean; matchPool?: boolean; restrictedReason?: unknown };
      restrictedReason?: unknown;
    };
    if (meta.compliance?.matchPool === false) {
      warnings.push({ code: 'persona_out_of_match_pool', message: `人物 ${p.id} 的 compliance.matchPool=false，按 06 §4.3.1 不进匹配池` });
      return false;
    }
    // 缺 matchPool 字段：**只告警，不拦截**（主控 2026-11-05 裁决）。
    //
    // ⚠️ 为什么是"告警"而不是"保守拦截"：
    //   matchPool 缺失**不代表这张卡不该进池**，只代表**数据不完整**。
    //   因数据不完整就把人物删掉，是用一种错误掩盖另一种错误 —— 结果里少一个人，
    //   而没人知道少了、为什么少。正确做法是放它进池、同时告警要求补齐字段。
    //
    // ── 为什么两处都读 ──────────────────────────────────────────────
    // 契约（shared/types.ts）只定义 `compliance.restrictedReason` 一处，那才是"该写在哪"。
    // 但"读"必须宽容：历史数据或外部写入方把该字段放在顶层时，只读 compliance 会让这张卡
    // 静默漏掉提示——**该报的没报，且没人知道**。所以两处都读：契约管"应写在哪"，引擎管"写歪了也别静默失效"。
    //   · 放在 compliance 内 → 命中（契约写法，12/12 真实数据如此）
    //   · 放在顶层         → 也命中（宽容写法，不符合契约但能生效）
    //   · 两处都没有       → 无法判断是否漏写 matchPool，不告警（否则会对每个没写该字段的正常卡刷告警）
    // 后端开发 2026-11-05 指出：本段原先写的是"旧实现读顶层、数据写在 compliance 内、两者永远对不上、
    // 安全网从未生效"——那是把一段**推断**写成了历史事实，且结论过头（顶层为空的卡之所以不告警，
    // 本就是这个设计，与"对不上"无关）。注释只该说明"为什么这样写"，不该讲故事。
    if (meta.compliance?.matchPool === undefined && (meta.compliance?.restrictedReason || meta.restrictedReason)) {
      warnings.push({
        code: 'persona_match_pool_missing',
        message: `人物 ${p.id} 未声明 compliance.matchPool（疑似加卡时漏字段），已按可进池处理，请补齐该字段`,
      });
    }
    if (meta.compliance?.restricted === true) {
      // 仅告警，不拦——它是合规注意项标记，不是出池条件
      warnings.push({ code: 'persona_restricted_noted', message: `人物 ${p.id} 标有合规注意项（restricted=true），仍按 matchPool 进池` });
    }
    return true;
  });

  const serialOf = new Map<string, number>();
  const prepared: PreparedPersona[] = [];
  eligible.forEach((p, i) => {
    const prep = preparePersona(p, i, cfg, warnings);
    serialOf.set(p.id, prep.serialNo);
    if (prep.dims.length > 0) prepared.push(prep);
  });

  if (prepared.length === 0) {
    warnings.push({ code: 'pool_empty', message: '匹配池为空（data/personas.json 可能还是占位空数组），无法产出结果' });
  }

  const undetermined = new Set(user.undetermined);
  const scored: ScoredPersona[] = [];
  for (const p of prepared) {
    const s = scorePersona(p, user.x, undetermined, input.theme.weights, user.tags, cfg);
    if (s) scored.push(s);
    else warnings.push({ code: 'persona_skipped_uncovered', message: `人物 ${p.raw.id} 的所有维度都未被作答覆盖，跳过` });
  }

  const ranking = sortRanking(scored, serialOf);
  const main = ranking[0] ?? null;
  const rel = buildRelationIndex(input.relations);
  const secondary = main ? pickSecondary(ranking, main, rel, cfg) : null;
  const hidden = pickHidden(ranking, user, input.hiddenRules, warnings);
  const surpriseEnabled = ranking.length >= cfg.surprisePoolThreshold;
  const surprise = main && surpriseEnabled ? pickSurprise(ranking, main, rel, cfg) : null;

  if (main && !surpriseEnabled) {
    warnings.push({
      code: 'surprise_disabled_small_pool',
      message: `池 ${ranking.length} < 设计门槛 ${cfg.surprisePoolThreshold}，按 06 §10.1 关闭意外组合层`,
    });
  }

  // 分布自检（06 §8.2 第 3 点 / 05 §2.1 A4）：**内部调参口径，不得对外**
  if (main) {
    const pct = main.percent;
    if (pct < 30 || pct > 75) {
      warnings.push({
        code: 'main_percent_out_of_band',
        message: `主匹配 ${pct}% 落在内部自检区间 30%–75% 之外（06 §8.2 第 3 点）；该区间仅供调参，不得对外引用`,
      });
    }
  }

  const explanation = buildExplanation(main ?? null, secondary, hidden, surprise, user, input.questions);

  return {
    user,
    ranking,
    main: main ? { persona: main, note: '主匹配：排序第一（06 §6.5）' } : null,
    secondary,
    hidden,
    surprise,
    explanation,
    resolvedConfig: cfg,
    mainPercent: main ? formatPercent(main.percent) : null,
    pool: {
      size: ranking.length,
      surpriseEnabled,
      surpriseRule: `池 ≥ ${cfg.surprisePoolThreshold} 张才启用意外组合（06 §10.1，设计值）`,
    },
    warnings,
    engineVersion: ENGINE_VERSION,
  };
}

function resolveConfig(config: MatchConfig | undefined): Required<MatchConfig> {
  return {
    alpha: clampUnit(config?.alpha, DEFAULT_CONFIG.alpha),
    betaMax: config?.betaMax ?? DEFAULT_CONFIG.betaMax,
    betaStep: config?.betaStep ?? DEFAULT_CONFIG.betaStep,
    surprisePoolThreshold: config?.surprisePoolThreshold ?? DEFAULT_CONFIG.surprisePoolThreshold,
    surpriseMinScore: clampUnit(config?.surpriseMinScore, DEFAULT_CONFIG.surpriseMinScore),
    secondaryCloseDelta: config?.secondaryCloseDelta ?? DEFAULT_CONFIG.secondaryCloseDelta,
    hiddenRateTarget: config?.hiddenRateTarget ?? DEFAULT_CONFIG.hiddenRateTarget,
  };
}

function clampUnit(v: number | undefined, fallback: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
