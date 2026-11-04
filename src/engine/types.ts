/**
 * 六维匹配引擎 · 类型定义（零依赖、纯类型）
 *
 * 来源：docs/product-discovery/06-人格测试模型设计.md 与 docs/phase2-admission/05-阈值与算法口径输入.md
 * ⚠️ 本文件中出现的所有数值（alpha / sigma / 阈值 / 池门槛 / 命中率）均为**设计值**，
 *    不是实测值、不是行业标准，任何对外文案都不得宣称「已实测」或「科学测量」。
 * ⚠️ 对 src/shared/types.ts 只做**类型兼容**：不修改它，引擎接受它的子集形状。
 */

// ── 六维 ──────────────────────────────────────────────────────────

import type { Rarity } from '../shared/types.js';

/** 六维代号（与 src/shared/types.ts 的 DimKey 保持一致） */
export type DimKey = 'EE' | 'ST' | 'AC' | 'HX' | 'RB' | 'SR';

/** 稀有度：**直接复用 shared 的定义，不在此处重复声明**，避免两份联合类型分叉 */
export type { Rarity };

/** 六维顺序固定：EE → ST → AC → HX → RB → SR。所有遍历按此顺序，保证浮点累加顺序确定。 */
export const DIM_KEYS: readonly DimKey[] = ['EE', 'ST', 'AC', 'HX', 'RB', 'SR'] as const;

/** 维度中文名（仅用于可读解释，不参与计算） */
export const DIM_LABELS: Readonly<Record<DimKey, string>> = {
  EE: '情绪外显',
  ST: '社交取向',
  AC: '行动节奏',
  HX: '混沌/幽默',
  RB: '关系优先',
  SR: '自我保护',
};

/** 六维原始分，取值 [-1, 1]；任一维可缺省（缺省 = 该维未被覆盖） */
export type RawEffects = Partial<Record<DimKey, number>>;

// ── 输入：题库 / 作答 ──────────────────────────────────────────────

/** 选项：选中即对该维 +delta（06 §5.1 极性型） */
export interface EngineOption {
  id: string;
  label?: string;
  /** 维度贡献 delta，建议范围 [-1, 1]（06 §5.2） */
  effects?: RawEffects;
}

/** 题目 */
export interface EngineQuestion {
  id: string;
  title?: string;
  /** 题目质量权重 w_q，默认 1.0（06 §5.2） */
  weight?: number;
  options: readonly EngineOption[];
}

/** 一条作答：题目 id + 选中的选项 id（单选） */
export interface EngineAnswer {
  questionId: string;
  optionId: string;
}

// ── 输入：人物 ────────────────────────────────────────────────────

/**
 * 人物画像。
 *
 * `dims` 兼容两种约定（引擎自动识别，不猜错就不硬转）：
 *  - **百分制**（src/shared/types.ts 的 `Dims` 形状）：六个键齐全、全部在 0..100 → 视为 mu，自动 /100；
 *  - **0..1 制**：视为 mu，直接使用。
 * 混合或越界的按 0..1 制处理，由 `validatePersona` 报 `mu_not_unit` 警告。
 */
export interface EnginePersona {
  id: string;
  name: string;
  category: string;
  tags?: readonly string[];
  dims: Partial<Record<DimKey, number>>;
  /** 单维容差 sigma（0~1）。缺省按 rarity 默认值（06 §11 U-06-6 建议值，设计值） */
  sigma?: Partial<Record<DimKey, number>>;
  /** 人物在该维度上的相对重要性（引擎内部归一化，06 §6.3 的 norm(weight)） */
  weight?: Partial<Record<DimKey, number>>;
  /** 该人物没有画像的维度（06 §6.3 的 dimsUnset），这些维度不参与该人物的加权 */
  dimsUnset?: readonly DimKey[];
  rarity?: Rarity;
  /** 排序第三级（06 §6.5）：同分时 serialNo 升序 */
  serialNo?: number;
  /** matchWeight，默认 1.0；06 §10.2 规定上限 1.3 */
  matchWeight?: number;
  desc?: string;
}

/** 人物间关系（06 §6.5 的 peer / contrast 判定依据） */
export interface PersonaRelation {
  a: string;
  b: string;
  kind: 'peer' | 'contrast';
}

// ── 输入：主题 / 隐藏规则 / 标签 ──────────────────────────────────

/** 主题配置（06 §4.2） */
export interface EngineTheme {
  themeId: string;
  name: string;
  /** 六维权重向量，**设计上要求和为 1.0**；引擎不静默归一，校验后按原值使用 */
  weights: Record<DimKey, number>;
  /** 池 < surprisePoolThreshold 时自动关闭意外组合层（06 §10.1） */
  surpriseEnabled?: boolean;
}

/** 隐藏人格规则（06 §6.6） */
export interface HiddenRule {
  ruleId: string;
  name: string;
  /** 布尔表达式，变量为六维分 x_d，如 "ST < 0.30 AND EE > 0.70" */
  condition: string;
  /** 候选人物 id 通配，如 "ani-*"；为空表示不限 */
  candidatePool?: readonly string[];
  priority?: number;
  /** 作答覆盖度下限，低于则不触发（06 §6.6） */
  minAnswersCovered?: number;
  /** 命中后挂的标签，用于文案 */
  tags?: readonly string[];
}

/** 用户标签规则：把用户最高两维映射成标签（06 §6.4 的映射表） */
export interface UserTagRule {
  tag: string;
  /** 条件表达式，变量同 HiddenRule */
  condition: string;
}

// ── 输入：整体 ────────────────────────────────────────────────────

export interface MatchConfig {
  /**
   * α：主题权重占比。**设计值 0.6**（06 §6.3 `06:345`，05 §2.1 A1）。
   * 未做任何实测校准，属设计取值，不得写成实测值。
   */
  alpha?: number;
  /** 标签微调上限 β_max。**设计值 0.03**（06 §6.4 `06:351`，05 §2.1 A2） */
  betaMax?: number;
  /** 每个共享标签的 β 增量。**设计值 0.01**（06 §6.4） */
  betaStep?: number;
  /** 意外组合池门槛。**设计值 40 张**（06 §10.1，05 §2.1 A3）；当前真实池 30，故首批应关闭该层 */
  surprisePoolThreshold?: number;
  /** 意外组合的 M' 下限。**设计值 0.55**（06 §6.5） */
  surpriseMinScore?: number;
  /** 次匹配"足够近"的差值上限。**设计值 0.12**（06 §6.5） */
  secondaryCloseDelta?: number;
  /** 隐藏人格命中率目标，仅作自检提示，不改变算法。**设计值 <15%**（06 §6.5 / §10.4，05 §2.1 A8） */
  hiddenRateTarget?: number;
}

export interface MatchInput {
  questions: readonly EngineQuestion[];
  answers: readonly EngineAnswer[];
  personas: readonly EnginePersona[];
  theme: EngineTheme;
  relations?: readonly PersonaRelation[];
  hiddenRules?: readonly HiddenRule[];
  userTagRules?: readonly UserTagRule[];
  config?: MatchConfig;
}

// ── 输出 ──────────────────────────────────────────────────────────

/** 某维度在本次作答中的原始分与覆盖情况 */
export interface DimScore {
  dim: DimKey;
  /** 归一化原始分 S_d ∈ [-1,1]；未被覆盖时为 0 */
  raw: number;
  /** 维度分 x_d = (S_d+1)/2 ∈ [0,1]；未被覆盖时为中性 0.5 */
  value: number;
  /** 是否被题目覆盖（false → undetermined，不参与该人物加权） */
  covered: boolean;
  /** 覆盖该维度的题数（有效 delta ≠ 0 的题） */
  questionCount: number;
}

export interface UserVector {
  /** 六个维度分，按 DIM_KEYS 顺序 */
  x: Record<DimKey, number>;
  /** 六个原始分，用于解释"你偏得多狠" */
  raw: Record<DimKey, number>;
  /** 未被覆盖的维度（undetermined） */
  undetermined: DimKey[];
  /** 作答覆盖度 = 有效覆盖维度数 / 6 */
  coverage: number;
  /** 本次作答的平均题目覆盖度（供隐藏规则 minAnswersCovered 使用） */
  answerCoverage: number;
  /** 由 userTagRules 推出的用户标签，按字典序 */
  tags: string[];
  /** 每题对每维的贡献明细（用于归因，不参与打分） */
  perQuestion: Array<{ questionId: string; optionId: string; dims: Array<{ dim: DimKey; contribution: number }> }>;
}

export interface DimContribution {
  dim: DimKey;
  /** 该维占总匹配分的比例（06 §7.2 第 1 步） */
  share: number;
  /** 高斯核 g */
  g: number;
  /** 用户值 x_d */
  x: number;
  /** 人物代表值 mu */
  mu: number;
  /** 容差 sigma */
  sigma: number;
  /** 有效权重 ω_d */
  omega: number;
  /** |x-mu| / sigma */
  gapInSigma: number;
  /** 大白话差距说明 */
  verdict: '接近' | '有差距' | '明显不像';
}

export interface ScoredPersona {
  id: string;
  name: string;
  category: string;
  tags: string[];
  rarity: string;
  /** 是否属于二层排序依据 matchWeight */
  matchWeight: number;
  /** 高斯加权原始分 M_p ∈ (0,1] */
  score: number;
  /** 标签微调后 M'_p（排序依据） */
  adjusted: number;
  /** 娱乐匹配度百分比 = round(M' × 100)（06 §8.1；**非心理测量值**） */
  percent: number;
  /** 命中的人物维度集合 */
  usedDims: DimKey[];
  /** 维度贡献明细，按贡献降序 */
  contributions: DimContribution[];
  /** 标签共享明细 */
  sharedTags: string[];
  beta: number;
}

export interface QuestionAttribution {
  questionId: string;
  optionId: string;
  dim: DimKey;
  contribution: number;
  /** 与他人的方向：拉近还是推远 */
  direction: 'toward' | 'away';
}

export interface MatchPick {
  persona: ScoredPersona;
  /** 抽取规则给出的附加说明 */
  note: string;
}

export interface Explanation {
  /** 主匹配一句话归因（纯模板生成，非 AI） */
  mainSummary: string;
  /** 维度贡献前三条的可读文本 */
  mainDims: string[];
  /** 推动主匹配的关键题（06 §7.2 第 2 步） */
  mainQuestions: QuestionAttribution[];
  /** 次匹配说明 */
  secondarySummary: string | null;
  /** 隐藏人格说明 */
  hiddenSummary: string | null;
  /** 意外组合说明 */
  surpriseSummary: string | null;
  /** 不可折叠的免责小字（06 §8.2 第 1 条） */
  disclaimer: string;
}

export interface MatchWarning {
  code: string;
  message: string;
}

/** 百分比展示口径（06 §8.2 第 2 条：不显示小数点，<10% 显示 <10%） */
export interface PercentDisplay {
  /** 0-100 的整数 */
  value: number;
  /** 展示串：'87%' 或 '<10%' */
  label: string;
}

export interface MatchResult {
  user: UserVector;
  ranking: ScoredPersona[];
  main: MatchPick | null;
  secondary: MatchPick | null;
  hidden: MatchPick | null;
  surprise: MatchPick | null;
  explanation: Explanation;
  /** 本次运行实际使用的参数（含默认值展开），便于复算 */
  resolvedConfig: Required<MatchConfig>;
  /** 主匹配百分比展示口径（娱乐匹配度，非心理测量） */
  mainPercent: PercentDisplay | null;
  /** 池子与层级状态 */
  pool: { size: number; surpriseEnabled: boolean; surpriseRule: string };
  warnings: MatchWarning[];
  /** 引擎版本，结果快照里必须一起存，便于追溯 */
  engineVersion: string;
}
