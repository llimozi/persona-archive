/**
 * 固定打分的"配比题"构造器（仅用于可复算示例，不属于产品题库）。
 *
 * 为什么需要它：
 *   单维归一化 S_d = Σw·δ / Σ|w·δ| 只取决于 δ 的符号——单题只能得到 ±1，
 *   **无法**表达 0.72 这种中间值。中间值必须靠"多题配比"：
 *   n 道题中 k 道取 +1、n−k 道取 −1，则 S_d = (2k − n) / n，x_d = (S_d+1)/2 = k/n。
 *
 * 示例取 **n = 5**（可表达 0, .2, .4, .6, .8, 1.0），示例用户的六维分全部落在 5 等分点上，
 * 手算能逐题核对。真实题库（data/questions.json）不受此限。
 */

import type { EngineAnswer, EngineQuestion } from '../types.js';
import { DIM_KEYS } from '../types.js';

/** 每维题量 n */
export const QUESTIONS_PER_DIM = 5;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 目标 x → 该维取 +1 的题数 k（0..n）。x = k/n */
export function isoSplit(x: number): number {
  const k = Math.round(clamp01(x) * QUESTIONS_PER_DIM);
  return Math.min(QUESTIONS_PER_DIM, Math.max(0, k));
}

/** 题目 id 规则：q-fixed-<DIM>-<序号 1..n>，选项固定为 P(+1) / N(−1) */
export function questionId(dim: string, index: number): string {
  return `q-fixed-${dim}-${index}`;
}

/** 生成 6 维 × n 道固定题（与目标 x 无关，题目形状是固定的） */
export function buildIdentityQuestions(): EngineQuestion[] {
  const out: EngineQuestion[] = [];
  for (const dim of DIM_KEYS) {
    for (let i = 1; i <= QUESTIONS_PER_DIM; i += 1) {
      out.push({
        id: questionId(dim, i),
        title: `固定题 ${dim} #${i}`,
        weight: 1,
        options: [
          { id: 'P', label: '加', effects: { [dim]: 1 } },
          { id: 'N', label: '减', effects: { [dim]: -1 } },
        ],
      });
    }
  }
  return out;
}

/** 按目标 x 生成作答：每维前 k 道选 P，其余选 N */
export function buildAnswers(x: Record<string, number>): EngineAnswer[] {
  const answers: EngineAnswer[] = [];
  for (const dim of DIM_KEYS) {
    const k = isoSplit(x[dim] ?? 0.5);
    for (let i = 1; i <= QUESTIONS_PER_DIM; i += 1) {
      answers.push({ questionId: questionId(dim, i), optionId: i <= k ? 'P' : 'N' });
    }
  }
  return answers;
}
