/**
 * 隐藏角色解锁判定。
 *
 * 需求（用户明确要求，逐条对照实现）：
 *   1. 不是「大于等于 90」——必须精确等于目标值；
 *   2. 不是两个维度的平均值达到 100——每个维度**分别**判定；
 *   3. 多个维度之间是 AND，必须同时成立；
 *   4. 未满足条件时，该角色**不出现在普通匹配候选中**；
 *   5. 不得通过人为修改显示分数来假装触发——判定读的是评分器的最终整数分；
 *   6. 隐藏角色单独判断解锁资格，不参与普通匹配排序。
 *
 * 数据侧约定：人物记录上带 `unlock`（维度 → 必须精确相等的分数），
 * 且 `compliance.matchPool=false`（保证它不进普通匹配池）。
 */

import type { DimScore, NineKey } from './nine-dims.js';

/** 解锁条件：维度 → 必须精确等于的分数 */
export type UnlockRule = Partial<Record<NineKey, number>>;

export interface UnlockCandidate {
  readonly id: string;
  readonly name: string;
  readonly unlock?: UnlockRule;
}

export interface UnlockResult {
  /** 是否满足全部条件 */
  readonly unlocked: boolean;
  /** 未满足的维度（用于解释"差在哪"，不对外展示具体阈值 UI） */
  readonly unmet: ReadonlyArray<{ dim: NineKey; need: number; actual: number }>;
}

/**
 * 判定某个隐藏角色是否解锁。
 *
 * 精确相等，不是 >=。差额计算只用于内部解释，不改变判定口径。
 */
export function checkUnlock(candidate: UnlockCandidate, dims: readonly DimScore[]): UnlockResult {
  const rule = candidate.unlock;
  if (!rule || Object.keys(rule).length === 0) {
    // 没有解锁条件的角色不因为这条规则被解锁
    return { unlocked: false, unmet: [] };
  }

  const byKey = new Map<NineKey, DimScore>();
  for (const d of dims) byKey.set(d.dimensionId, d);

  const unmet: Array<{ dim: NineKey; need: number; actual: number }> = [];
  for (const [dim, need] of Object.entries(rule) as Array<[NineKey, number]>) {
    const got = byKey.get(dim);
    // 该维度未测出（作答不足）时不算命中：不能拿"没测"当成"达到"
    if (!got || !got.measured) {
      unmet.push({ dim, need, actual: got?.score ?? -1 });
      continue;
    }
    // 精确相等。分数本身是 0–100 整数（scoreFromMean 已取整），
    // 这里再比对一次整数，避免有人传入小数绕过。
    if (got.score !== need) unmet.push({ dim, need, actual: got.score });
  }

  return { unlocked: unmet.length === 0, unmet };
}

/** 在候选中筛出已解锁的隐藏角色（顺序按传入顺序，保持稳定） */
export function pickUnlocked<T extends UnlockCandidate>(
  candidates: readonly T[],
  dims: readonly DimScore[],
): T[] {
  return candidates.filter((c) => checkUnlock(c, dims).unlocked);
}
