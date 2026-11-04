/**
 * 量纲守卫：验证「0..1 制的疑似笔误」不再静默。
 *
 *   pnpm exec tsx src/engine/example/check-unit.ts
 *
 * 背景（主控 2026-11-04 裁定）：`Dims` 类型只约束「键齐全、值是数字」，不约束取值范围。
 * 引擎靠"六键齐全 + 全在 0..100 + 存在 >1"识别百分制。若一整组值全落在 0..1，
 * 既可能是 0–1 制，也可能是百分制笔误（如本意 1% 写成 1），引擎无法分辨——
 * 所以必须**告警**，不能静默按某一侧处理。
 */

import { match } from '../match.js';
import type { EnginePersona, EngineQuestion, EngineTheme } from '../types.js';

const questions: EngineQuestion[] = [
  { id: 'q1', weight: 1, options: [{ id: 'A', effects: { EE: 1 } }] },
  { id: 'q2', weight: 1, options: [{ id: 'A', effects: { ST: 1 } }] },
  { id: 'q3', weight: 1, options: [{ id: 'A', effects: { AC: 1 } }] },
  { id: 'q4', weight: 1, options: [{ id: 'A', effects: { HX: 1 } }] },
  { id: 'q5', weight: 1, options: [{ id: 'A', effects: { RB: 1 } }] },
  { id: 'q6', weight: 1, options: [{ id: 'A', effects: { SR: 1 } }] },
];
const answers = questions.map((q) => ({ questionId: q.id, optionId: 'A' }));
const theme: EngineTheme = { themeId: 't', name: 't', weights: { EE: 1 / 6, ST: 1 / 6, AC: 1 / 6, HX: 1 / 6, RB: 1 / 6, SR: 1 / 6 } };

const cases: Array<[string, EnginePersona, boolean]> = [
  [
    '百分制（正常数据）',
    { id: 'ok-pct', name: 'P', category: 'c', dims: { EE: 78, ST: 62, AC: 66, HX: 90, RB: 34, SR: 44 } },
    false,
  ],
  [
    '0–1 制（合法但需告知）',
    { id: 'ok-unit', name: 'U', category: 'c', dims: { EE: 0.78, ST: 0.62, AC: 0.66, HX: 0.9, RB: 0.34, SR: 0.44 } },
    true,
  ],
  [
    '疑似笔误：全在 0..1 但本意可能是百分制',
    { id: 'suspect', name: 'S', category: 'c', dims: { EE: 1, ST: 0.5, AC: 0.5, HX: 0.9, RB: 0.3, SR: 0.4 } },
    true,
  ],
  [
    '越界值（>100）',
    { id: 'oob', name: 'O', category: 'c', dims: { EE: 780, ST: 62, AC: 66, HX: 90, RB: 34, SR: 44 } },
    true,
  ],
];

let failed = 0;
for (const [name, persona, expectWarn] of cases) {
  const r = match({ questions, answers, personas: [persona], theme });
  const unitWarn = r.warnings.filter((w) => w.code === 'mu_unit_ambiguous' || w.code === 'mu_range_suspect');
  const ok = expectWarn === unitWarn.length > 0;
  if (!ok) failed += 1;
  console.log(`${ok ? '✅' : '❌'} ${name.padEnd(34)} 告警 ${unitWarn.length} 条 ${expectWarn ? '(期望有)' : '(期望无)'}`);
  for (const w of unitWarn) console.log(`     [${w.code}] ${w.message.slice(0, 70)}…`);
}

console.log('');
console.log(failed === 0 ? '量纲守卫通过：疑似笔误与越界都会告警，不再静默。' : `量纲守卫失败 ${failed} 项。`);
process.exitCode = failed === 0 ? 0 : 1;
