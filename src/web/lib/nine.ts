/**
 * 九维计算入口（前端唯一路径）。
 *
 * 设计：**九维是展示与评分的权威结果**，角色匹配仍然走引擎 `match()`。
 * 两者共用同一份作答，但测的是不同的东西：
 *   - 九维：用户自己的人格坐标（五档量表 + 固定公式）
 *   - 匹配：用户落在 91 个角色里的哪一个（高斯距离）
 *
 * 九维分**不参与**角色匹配的排序，也不与匹配度百分比混算
 * （用户明确要求「不要把九个维度合并成一个科学人格总分」）。
 */

import { NINE_DIMS, NINE_KEYS, type NineKey } from '../../shared/nine-dims';
import { scoreNine, type NineQuestion, type NineResult } from '../../shared/nine-score';

export interface NineInputQuestion {
  readonly id: string;
  readonly dimensionId?: string;
  readonly reverse?: boolean;
  readonly optionScore?: Record<string, number> | undefined;
  readonly questionWeight?: number;
  readonly options?: ReadonlyArray<{ readonly id: string }>;
}

/**
 * 计算九维结果。
 *
 * questions 直接来自 /api/questions（已带 dimensionId / optionScore / reverse），
 * answers 是 questionId → optionId。
 * 未作答的题目不会出现在 answers 里，因此**不会被当作中间分**。
 */
export function computeNine(
  questions: readonly NineInputQuestion[],
  answers: Readonly<Record<string, string>>,
): NineResult {
  const qs: NineQuestion[] = questions
    .filter((q) => (q.options?.length ?? 0) > 0)
    .map((q) => ({
      id: q.id,
      dimensionId: q.dimensionId as NineKey | undefined,
      reverse: q.reverse,
      optionScore: q.optionScore,
      questionWeight: q.questionWeight,
      options: q.options ?? [],
    }));
  return scoreNine(qs, answers);
}

/** 九维顺序：严格 01 → 09 */
export const NINE_ORDER = NINE_DIMS.map((d) => d.order);
export { NINE_KEYS };
