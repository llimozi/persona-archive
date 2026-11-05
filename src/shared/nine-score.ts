/**
 * 九维评分器：把「题目 + 作答」算成九个 0–100 分数。
 *
 * 这是九维的**唯一计算入口**，页面、雷达图、测试都从这里取数，
 * 保证「页面分数」与「雷达图分数」永远来自同一份结果。
 *
 * 与旧六维 scoreAnswers 的区别：
 *   旧：选项 effects 在维度上累加，再除以分母归一到 [0,1]。
 *   新：每题只归一个维度，选项映射成 1–5 原始分（反向题再翻），
 *       维度内取均值，再按 score = round(((mean-1)/4)*100) 映射到 0–100。
 *   两者是不同的量表与公式，结果不可互相换算。
 */

import {
  MIN_QUESTIONS_PER_DIM,
  NINE_DIMS,
  NINE_KEYS,
  scoreDim,
  type DimAnswer,
  type DimScore,
  type NineKey,
  type NineResult,
} from './nine-dims.js';

/** 供其他模块直接从本文件取类型，避免调用方到处找定义位置 */
export type { DimAnswer, DimScore, NineKey, NineResult } from './nine-dims.js';

/** 题库题目的九维视图（只要求这几个字段，便于测试构造最小样本） */
export interface NineQuestion {
  readonly id: string;
  readonly dimensionId?: NineKey;
  readonly reverse?: boolean;
  readonly optionScore?: Readonly<Record<string, number>>;
  readonly questionWeight?: number;
  readonly options: ReadonlyArray<{ readonly id: string }>;
}

export interface NineAnswer {
  readonly questionId: string;
  readonly optionId: string;
}

export interface NineWarning {
  readonly code: string;
  readonly message: string;
}

/**
 * 取某题的选项原始分。
 *
 * 映射优先级：
 *   1. 题目自带的 optionScore（权威，题库内逐题手写）
 *   2. 题内回退：按选项出场顺序线性铺到 1–5（仅兜底，且会记 warning）
 *
 * 回退**只在缺少映射时**触发，不允许「按字母猜」。真出现说明题库没迁移干净。
 */
function rawScoreOf(
  q: NineQuestion,
  optionId: string,
  warnings: NineWarning[],
): number | null {
  const opts = q.options;
  const idx = opts.findIndex((o) => o.id === optionId);
  if (idx < 0) return null;

  const mapped = q.optionScore?.[optionId];
  if (typeof mapped === 'number' && Number.isFinite(mapped)) return mapped;

  const n = opts.length;
  const fallback = n <= 1 ? 3 : 1 + (idx / (n - 1)) * 4;
  warnings.push({
    code: 'question_option_score_missing',
    message: `题目 ${q.id} 缺少 optionScore 映射，按选项顺序回退为 ${fallback.toFixed(2)}（请补映射）`,
  });
  return fallback;
}

/**
 * 主入口。answers 为 questionId → optionId。
 *
 * 未作答的题不会出现在 answers 里，因此不参与该维均值——
 * 这一点很关键：**绝不把空值当中间分 3**。
 */
export function scoreNine(
  questions: readonly NineQuestion[],
  answers: Readonly<Record<string, string>>,
): NineResult {
  const warnings: NineWarning[] = [];
  const byId = new Map<string, NineQuestion>();
  for (const q of questions) byId.set(q.id, q);

  const buckets = new Map<NineKey, DimAnswer[]>();
  for (const k of NINE_KEYS) buckets.set(k, []);
  let answeredCount = 0;

  for (const [questionId, optionId] of Object.entries(answers)) {
    if (optionId === undefined || optionId === null || optionId === '') continue;
    const q = byId.get(questionId);
    if (!q) {
      warnings.push({ code: 'answer_unknown_question', message: `作答引用了不存在的题目 ${questionId}，已忽略` });
      continue;
    }
    const dim = q.dimensionId;
    if (!dim || !(NINE_KEYS as readonly string[]).includes(dim)) {
      warnings.push({
        code: 'question_dimension_missing',
        message: `题目 ${questionId} 没有有效的 dimensionId，该题不计入九维`,
      });
      continue;
    }
    const raw = rawScoreOf(q, optionId, warnings);
    if (raw === null) {
      warnings.push({
        code: 'answer_unknown_option',
        message: `题目 ${questionId} 的选项 ${optionId} 不存在，该题不计分`,
      });
      continue;
    }
    buckets.get(dim)!.push({ questionId, raw, reverse: q.reverse === true });
    answeredCount += 1;
  }

  const dims: DimScore[] = NINE_DIMS.map((def) => scoreDim(def, buckets.get(def.key)!));
  const insufficient = dims.filter((d) => !d.measured).map((d) => d.dimensionId);

  return {
    version: 1,
    dims,
    complete: insufficient.length === 0,
    insufficient,
    answeredCount,
  };
}

/** 某维度在题库里总共有几道题（用于「已答 / 应答」展示） */
export function questionCountFor(questions: readonly NineQuestion[], dim: NineKey): number {
  return questions.filter((q) => q.dimensionId === dim).length;
}

/** 供 UI 判断是否「数据不足」 */
export function isInsufficient(dim: DimScore): boolean {
  return !dim.measured || dim.answered < MIN_QUESTIONS_PER_DIM;
}
