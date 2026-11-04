/**
 * 主题权重和的容差边界实测（对齐后端 checkTheme 的 1e-6 判据）。
 *
 *   pnpm exec tsx src/engine/example/check-theme-tolerance.ts
 *
 * 目的：把「引擎告警」与「API 拒绝」两条线各自的边界测出来，避免"以为守住了"。
 */

import { readFileSync } from 'node:fs';
import { match } from '../match.js';
import type { EnginePersona, EngineQuestion } from '../types.js';

const questions = (JSON.parse(readFileSync('data/questions.json', 'utf8')) as { questions: EngineQuestion[] }).questions;
const personas = (JSON.parse(readFileSync('data/personas.json', 'utf8')) as { personas: EnginePersona[] }).personas;
const answers = questions.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id }));

const base = { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 };

console.log('单维偏移 delta → 权重和 → 引擎是否告警（引擎判据：|sum-1| > 1e-6）');
console.log('');
for (const d of [0, 1e-16, 1e-9, 1e-7, 1e-6, 1e-5, 1e-3]) {
  const weights = { ...base, EE: base.EE + d };
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const r = match({ questions, answers, personas, theme: { themeId: 't', name: 't', weights } });
  const warns = r.warnings.filter((w) => w.code === 'theme_weights_not_normalized');
  console.log(
    `delta=${String(d).padEnd(8)} sum=${sum.toFixed(12)}  |sum-1|=${Math.abs(sum - 1).toExponential(2).padEnd(9)} 告警=${warns.length}`,
  );
}

console.log('');
console.log('结论：');
console.log('  · 容差 1e-6 是**精度天花板**，不是零误差：单维偏 1e-7 不会被告警；');
console.log('  · 六个数浮点累加误差在 1e-16 量级，1e-6 比它宽 10 个数量级，不会误报；');
console.log('  · 但 1e-6 是**选择**而非推导结果——本文档只记录边界，不主张它是最优值。');
