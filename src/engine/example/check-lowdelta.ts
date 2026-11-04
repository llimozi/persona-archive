/**
 * 低幅权重影响评估：q-gen-006/B、q-gen-010/C 的 delta 低于 07 建议下限 ±0.3。
 *
 *   pnpm exec tsx src/engine/example/check-lowdelta.ts
 *
 * 结论要回答一个问题：这 3 处是"口径违规必须改"，还是"引擎本来就支持、不影响正确性"？
 */

import { readFileSync } from 'node:fs';
import { scoreAnswers } from '../match.js';
import type { EngineAnswer, EngineQuestion } from '../types.js';
import { DIM_KEYS } from '../types.js';

const questions = (JSON.parse(readFileSync('data/questions.json', 'utf8')) as { questions: EngineQuestion[] }).questions;

const LOW = 0.3;
const found: Array<{ q: string; opt: string; dim: string; d: number }> = [];
for (const q of questions) {
  for (const o of q.options) {
    for (const dim of DIM_KEYS) {
      const v = o.effects?.[dim];
      if (typeof v === 'number' && v !== 0 && Math.abs(v) < LOW) found.push({ q: q.id, opt: o.id, dim, d: v });
    }
  }
}

console.log(`低于 ±${LOW} 的 delta 共 ${found.length} 处：`);
for (const f of found) console.log(`  ${f.q} / ${f.opt}  ${f.dim}=${f.d}  |δ|=${Math.abs(f.d)}`);

console.log('');
console.log('── 引擎对这些值的处理 ──');
console.log('scoreAnswers 里对 |δ| 的处理只有一条约束：|δ|>1 时告警（06 §5.2 建议范围 [-1,1]）。');
console.log('没有任何"|δ| 必须 ≥0.3"的硬约束——07 的 ±0.3~±0.8 是**内容口径建议**，不是算法不变量。');

console.log('');
console.log('── 影响量化：同一份作答，低幅值抬到 ±0.3 前后六维分差 ──');

// 构造两份题库：原样 vs 把低幅值抬到 ±0.3（保号）
const lifted: EngineQuestion[] = questions.map((q) => ({
  ...q,
  options: q.options.map((o) => {
    const eff: Record<string, number> = {};
    for (const dim of DIM_KEYS) {
      const v = o.effects?.[dim];
      if (typeof v !== 'number' || v === 0) continue;
      eff[dim] = Math.abs(v) < LOW ? Math.sign(v) * LOW : v;
    }
    return { ...o, effects: eff };
  }),
}));

const answerSets: Array<[string, EngineAnswer[]]> = [
  ['全选 A（不含低幅选项）', questions.map((q) => ({ questionId: q.id, optionId: 'A' }))],
  ['全选 B（含 q-gen-006/B）', questions.map((q) => ({ questionId: q.id, optionId: 'B' }))],
  ['全选 C（含 q-gen-010/C）', questions.map((q) => ({ questionId: q.id, optionId: 'C' }))],
];

for (const [name, answers] of answerSets) {
  const a = scoreAnswers(questions, answers).user.x;
  const b = scoreAnswers(lifted, answers).user.x;
  const diffs = DIM_KEYS.map((d) => `${d} ${a[d].toFixed(4)}→${b[d].toFixed(4)} (${(b[d] - a[d]).toFixed(4)})`);
  const maxDiff = Math.max(...DIM_KEYS.map((d) => Math.abs(b[d] - a[d])));
  console.log('');
  console.log(`[${name}] 最大单维位移 ${maxDiff.toFixed(4)}`);
  console.log(`  ${diffs.join('  ')}`);
}
