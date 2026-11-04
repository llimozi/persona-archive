/**
 * 06 §9 手工算例逐位对照（主控 2026-11-04 要求补的用例）。
 *
 *   pnpm exec tsx src/engine/example/check-doc-example.ts
 *
 * ══════════════════════════════════════════════════════════════════
 * ⚠️ **本脚本的退出码 1 是预期结果，不是失败。不要为了让它变绿去调容差。**
 * ══════════════════════════════════════════════════════════════════
 *
 * 它用于**检测** 06 §9.3（只用主题权重的简化口径）与 §6.3 正文（含 `(1-α)·norm(weight)` 项）
 * 两套口径的差异。主控 2026-11-05 裁决：**以 §6.3 正文为准**，故本脚本应当**持续红着**。
 *
 * **若某天它变绿了，说明有人把实现改成了 §9.3 口径 —— 那才是回归，不是修好。**
 *
 * 佐证：§9.3 标题自己写「本例人物等权，故只用主题权重」，分母 0.88 完全由主题权重求和，
 * 未含 `(1-α)·norm` 项；而 §6.3 正文明确有该项，且等权下 norm = 1/|D_p| 不可能为零。
 * 所以 §9.3 不是"严格按第 6.3 节"，它是文档已知偏差。
 *
 * 真正**应当通过**的手算对照在 `check-s63-manual.ts`（退出码 0），那个才是正确实现的证据。
 * ══════════════════════════════════════════════════════════════════
 *
 * 与 `run.ts`（答题链路示例）的区别：
 *   - run.ts        ：验证「答题 → 六维分 → M」整条链路，输入受单维归一化的 5 等分点限制
 *   - 本文件        ：验证「公式本体」，直接喂入 06 §9 的用户分值 x=(.72,.35,.55,.81,.40,.30)
 *                     和 06 §9.1 的示例人物画像，看与 §9.3 宣称的 0.880 / 0.666 / 0.570 / 0.506 差多少
 *   - check-s63-manual.ts：严格按 §6.3 正文、第三方可手算、**应该通过**
 *
 * 实现方式：因为 S_d = Σwδ/Σ|wδ| 只能靠多题配比表达有理数，这里直接用 100 道单维配比题
 * 把每个 x_d 精确编码成 2 位小数（100 等分点足够表达 0.72 / 0.35 / 0.55 / 0.81 / 0.40 / 0.30）。
 */

import { match } from '../match.js';
import type { EngineAnswer, EnginePersona, EngineQuestion, EngineTheme } from '../types.js';
import { DIM_KEYS } from '../types.js';

/** 06 §9.1 的用户六维分（原文值，不是我们编的） */
const DOC_X = { EE: 0.72, ST: 0.35, AC: 0.55, HX: 0.81, RB: 0.4, SR: 0.3 } as const;

/** 06 §9.1 的示例人物画像（μ/σ 逐维，取自原文表格） */
const DOC_PERSONAS: EnginePersona[] = [
  {
    id: 'doc-nailong',
    name: '奶龙',
    category: 'meme',
    dims: { EE: 0.72, ST: 0.4, AC: 0.6, HX: 0.95, SR: 0.2 },
    sigma: { EE: 0.18, ST: 0.22, AC: 0.2, HX: 0.15, SR: 0.18 },
    dimsUnset: ['RB'],
    serialNo: 1,
  },
  {
    id: 'doc-coke',
    name: 'Coke 老师',
    category: 'meme',
    dims: { EE: 0.45, ST: 0.7, AC: 0.75, HX: 0.8, SR: 0.15 },
    sigma: { EE: 0.2, ST: 0.2, AC: 0.18, HX: 0.2, SR: 0.15 },
    dimsUnset: ['RB'],
    serialNo: 2,
  },
  {
    id: 'doc-belial',
    name: '贝利亚',
    category: 'anime',
    dims: { EE: 0.6, ST: 0.2, AC: 0.7, HX: 0.55, RB: 0.3, SR: 0.75 },
    sigma: { EE: 0.22, ST: 0.2, AC: 0.2, HX: 0.25, RB: 0.2, SR: 0.18 },
    serialNo: 3,
  },
  {
    id: 'doc-donk',
    name: 'donk',
    category: 'es',
    dims: { EE: 0.55, ST: 0.25, AC: 0.95, HX: 0.35, SR: 0.35 },
    sigma: { EE: 0.2, ST: 0.2, AC: 0.15, HX: 0.25, SR: 0.2 },
    dimsUnset: ['RB'],
    serialNo: 4,
  },
];

/** 06 §9.1 的主题权重 */
const DOC_THEME: EngineTheme = {
  themeId: 'th-general',
  name: '通用鉴定',
  weights: { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 },
};

/** 06 §9.3 的期望 M 值（原文给出，三位小数） */
const DOC_M: Record<string, number> = {
  'doc-nailong': 0.88,
  'doc-belial': 0.666,
  'doc-coke': 0.57,
  'doc-donk': 0.506,
};

/** 100 等分点编码：每维 100 道题，前 k 道选 +1、其余选 −1 → S = (2k−100)/100 = 2x−1 */
const N = 100;
function buildQuestions(): EngineQuestion[] {
  const out: EngineQuestion[] = [];
  for (const dim of DIM_KEYS) {
    for (let i = 1; i <= N; i += 1) {
      out.push({
        id: `doc-${dim}-${i}`,
        weight: 1,
        options: [
          { id: 'P', effects: { [dim]: 1 } },
          { id: 'N', effects: { [dim]: -1 } },
        ],
      });
    }
  }
  return out;
}

function buildAnswers(): EngineAnswer[] {
  const out: EngineAnswer[] = [];
  for (const dim of DIM_KEYS) {
    const k = Math.round(DOC_X[dim] * N);
    for (let i = 1; i <= N; i += 1) out.push({ questionId: `doc-${dim}-${i}`, optionId: i <= k ? 'P' : 'N' });
  }
  return out;
}

const questions = buildQuestions();
const result = match({ questions, answers: buildAnswers(), personas: DOC_PERSONAS, theme: DOC_THEME });

console.log('=== 06 §9 手工算例逐位对照 ===');
console.log('');
console.log('还原出的用户六维分（应与 06 §9.1 的 .72/.35/.55/.81/.40/.30 一致）：');
for (const d of DIM_KEYS) {
  const got = result.user.x[d];
  const want = DOC_X[d];
  const ok = Math.abs(got - want) < 1e-9;
  console.log(`  ${ok ? '✅' : '❌'} ${d}: 引擎 ${got.toFixed(4)}  文档 ${want.toFixed(2)}`);
}
console.log('');

let failed = 0;
console.log('人物 M 值对照（容忍 0.001，文档给三位小数）：');
for (const p of result.ranking) {
  const doc = DOC_M[p.id]!;
  const diff = Math.abs(p.score - doc);
  const ok = diff <= 0.001;
  if (!ok) failed += 1;
  console.log(`  ${ok ? '✅' : '❌'} ${p.name.padEnd(10)} 引擎 M=${p.score.toFixed(6)}  文档 M=${doc.toFixed(3)}  差=${diff.toFixed(6)}`);
}

console.log('');
console.log(failed === 0 ? '✅ 逐位一致：公式实现与 06 §9 手工算例相符，0 项超出容差。' : `❌ ${failed} 项超出容差。`);
process.exitCode = failed === 0 ? 0 : 1;
