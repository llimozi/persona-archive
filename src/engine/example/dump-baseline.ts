/**
 * 引擎基准值导出（给前端/测试做断言用）。
 *
 *   pnpm exec tsx src/engine/example/dump-baseline.ts
 *
 * 输出「全选 A」这一确定性输入的引擎完整结果，供 E2E 断言
 * 「结果页六维 === 引擎 user.x*100」使用（主控 2026-11-05 要求的验收判据）。
 */

import { readFileSync } from 'node:fs';
import { match } from '../match.js';
import type { EngineAnswer, EnginePersona, EngineQuestion, EngineTheme } from '../types.js';
import { DIM_KEYS } from '../types.js';

const personas = (JSON.parse(readFileSync('data/personas.json', 'utf8')) as { personas: EnginePersona[] }).personas;
const questions = (JSON.parse(readFileSync('data/questions.json', 'utf8')) as { questions: EngineQuestion[] }).questions;

const theme: EngineTheme = {
  themeId: 'th-general',
  name: '通用鉴定',
  weights: { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 },
};

/** 固定作答：每题选第一个选项 */
const answers: EngineAnswer[] = questions.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id }));

const r = match({ questions, answers, personas, theme });

console.log('=== 全选 A · 引擎基准 ===');
console.log('');
console.log('user.x（0–1 制，前端条形图应用 x*100）：');
for (const d of DIM_KEYS) console.log(`  ${d}: ${r.user.x[d].toFixed(6)}  → 显示值 ${(r.user.x[d] * 100).toFixed(1)}`);
console.log('');
console.log('user.raw（S_d ∈ [-1,1]，用于"你偏得多狠"）：');
for (const d of DIM_KEYS) console.log(`  ${d}: ${r.user.raw[d].toFixed(6)}`);
console.log('');
console.log('未覆盖维度:', r.user.undetermined.length === 0 ? '(无)' : r.user.undetermined.join(','));
console.log('主匹配:', r.main?.persona.name, r.mainPercent?.label);
console.log('次匹配:', r.secondary?.persona.name ?? '(无)', r.secondary?.persona.percent ?? '');
console.log('隐藏:', r.hidden?.persona.name ?? '(无)');
console.log('意外:', r.surprise?.persona.name ?? '(无，池 < 40)');
console.log('');
console.log('排序（M / M\' / 百分比）：');
for (const p of r.ranking) {
  console.log(`  ${p.name.padEnd(16)} M=${p.score.toFixed(6)}  M'=${p.adjusted.toFixed(6)}  ${p.percent}%`);
}
console.log('');
console.log('供测试断言的 JSON：');
console.log(
  JSON.stringify(
    {
      dims: Object.fromEntries(DIM_KEYS.map((d) => [d, Number((r.user.x[d] * 100).toFixed(1))])),
      main: r.main?.persona.name ?? null,
      mainPercent: r.mainPercent?.value ?? null,
    },
    null,
    2,
  ),
);
