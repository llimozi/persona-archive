/**
 * 可复算示例（手工验算用）——固定输入，输出中间值与最终结果。
 *
 * 用途：
 *   1. 任何人可以照着 docs/ENGINE-CALC-EXAMPLE.md 把中间值手算一遍，验证引擎没跑偏；
 *   2. 单测用它做回归：改了算法必须同步改文档。
 *
 * 约定：
 *   - 人物与数值全部是**示例值**，为了让手算闭合而挑选，不是真实人物档案，
 *     也不代表任何实测结论（对齐 06 §9.1「示例值不是资料结论」的口径）。
 *   - 示例用户的六维分刻意取 5 等分点（见 identity.ts 的解释）。
 */

import type { EngineAnswer, EnginePersona, EngineQuestion, EngineTheme, MatchInput } from '../types.js';
import { buildAnswers, buildIdentityQuestions } from './identity.js';
/** 示例用户的六维分：全部落在 5 等分点上，手算可逐题核对 */
export const EXAMPLE_USER_X = { EE: 0.8, ST: 0.4, AC: 0.6, HX: 1.0, RB: 0.4, SR: 0.2 } as const;

/** 主题权重（06 §9.1 th-general 设计值，和为 1.0） */
export const EXAMPLE_THEME: EngineTheme = {
  themeId: 'th-general',
  name: '通用鉴定',
  weights: { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 },
};

/** 四人示例池（mu/sigma 取自 06 §9.1 示例表，明确标注为示例值） */
export const EXAMPLE_PERSONAS: EnginePersona[] = [
  {
    id: 'mem-nailong-001',
    name: '奶龙',
    category: 'meme',
    tags: ['abstract', 'joker'],
    dims: { EE: 0.72, ST: 0.4, AC: 0.6, HX: 0.95, SR: 0.2 },
    sigma: { EE: 0.18, ST: 0.22, AC: 0.2, HX: 0.15, SR: 0.18 },
    dimsUnset: ['RB'],
    serialNo: 1,
  },
  {
    id: 'mem-coke-002',
    name: 'Coke 老师',
    category: 'meme',
    tags: ['abstract'],
    dims: { EE: 0.45, ST: 0.7, AC: 0.75, HX: 0.8, SR: 0.15 },
    sigma: { EE: 0.2, ST: 0.2, AC: 0.18, HX: 0.2, SR: 0.15 },
    dimsUnset: ['RB'],
    serialNo: 2,
  },
  {
    id: 'ani-belial-003',
    name: '贝利亚',
    category: 'anime',
    tags: [],
    dims: { EE: 0.6, ST: 0.2, AC: 0.7, HX: 0.55, RB: 0.3, SR: 0.75 },
    sigma: { EE: 0.22, ST: 0.2, AC: 0.2, HX: 0.25, RB: 0.2, SR: 0.18 },
    serialNo: 3,
  },
  {
    id: 'es-donk-004',
    name: 'donk',
    category: 'es',
    tags: [],
    dims: { EE: 0.55, ST: 0.25, AC: 0.95, HX: 0.35, SR: 0.35 },
    sigma: { EE: 0.2, ST: 0.2, AC: 0.15, HX: 0.25, SR: 0.2 },
    dimsUnset: ['RB'],
    serialNo: 4,
  },
];

/** 固定题目（6 维 × 5 题，形状与 x 无关） */
export const EXAMPLE_QUESTIONS: EngineQuestion[] = buildIdentityQuestions();

/** 按示例用户分生成的作答 */
export const EXAMPLE_ANSWERS: EngineAnswer[] = buildAnswers(EXAMPLE_USER_X);

/** 完整示例输入 */
export function buildExampleInput(): MatchInput {
  return {
    questions: EXAMPLE_QUESTIONS,
    answers: EXAMPLE_ANSWERS,
    personas: EXAMPLE_PERSONAS,
    theme: EXAMPLE_THEME,
    hiddenRules: [
      {
        ruleId: 'hh-001',
        name: '薛定谔的社恐',
        // 06 §6.6 的示例条件；示例用户 ST=0.4 → 不命中（隐藏就该罕见）
        condition: 'ST < 0.30 AND EE > 0.70 AND HX > 0.60',
        candidatePool: ['*'],
        priority: 10,
        minAnswersCovered: 0.8,
      },
      {
        ruleId: 'hh-009',
        name: '满嘴抽象的夜猫子',
        // 为验证隐藏层链路可走通而加（示例规则，非产品规则库内容）
        condition: 'HX >= 1.0 AND EE >= 0.8',
        candidatePool: ['mem-*'],
        priority: 5,
        minAnswersCovered: 0.8,
      },
    ],
    userTagRules: [
      { tag: 'joker', condition: 'HX > 0.75 AND ST < 0.40' },
      { tag: 'abstract', condition: 'HX > 0.75' },
    ],
  };
}

export { buildAnswers, buildIdentityQuestions } from './identity.js';
