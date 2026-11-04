/**
 * 混填小数的三层判定对照（算法口径 vs API 口径 vs 数据口径）。
 *
 *   pnpm exec tsx src/engine/example/check-mixed-dims.ts
 *
 * 背景：`{EE:0.78, ST:62, AC:66, HX:90, RB:34, SR:44}` 这种"一维小数、其余百分制"的数据，
 * 后端 `checkDims()` 加了 `!Number.isInteger(v)` 后能拦；引擎的自动识别规则**拦不住**，
 * 因为它的判定条件是"六键齐全 + 全在 0..100 + 存在 >1 的值"，这组数据**恰好全部满足**。
 * 本脚本把引擎的真实行为测出来，避免"以为引擎也拦住了"。
 */

import { match } from '../match.js';
import type { EnginePersona, EngineQuestion, EngineTheme } from '../types.js';
import { DIM_KEYS } from '../types.js';

const questions: EngineQuestion[] = DIM_KEYS.map((dim, i) => ({
  id: `q${i}`,
  weight: 1,
  options: [{ id: 'A', effects: { [dim]: 1 } }],
}));
const answers = questions.map((q) => ({ questionId: q.id, optionId: 'A' }));
const theme: EngineTheme = {
  themeId: 't',
  name: 't',
  weights: { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 },
};

const cases: Array<[string, EnginePersona['dims'], string]> = [
  ['正常百分制', { EE: 78, ST: 62, AC: 66, HX: 90, RB: 34, SR: 44 }, 'API 拦得住，引擎静默正确'],
  ['混填小数（一维 0.78）', { EE: 0.78, ST: 62, AC: 66, HX: 90, RB: 34, SR: 44 }, 'API 拦得住，引擎**静默按百分制/100**'],
  ['整卡 0–1 制', { EE: 0.78, ST: 0.62, AC: 0.66, HX: 0.9, RB: 0.34, SR: 0.44 }, 'API 拦得住，引擎**会告警**'],
  ['越界 178', { EE: 178, ST: 62, AC: 66, HX: 90, RB: 34, SR: 44 }, 'API 拦得住，引擎**会告警**'],
];

console.log('引擎对各类脏 dims 的实际反应：');
console.log('');

let silent = 0;
for (const [name, dims, expect] of cases) {
  const r = match({ questions, answers, personas: [{ id: 'x', name: 'X', category: 'c', dims }], theme });
  const mu = r.ranking[0]?.contributions.map((c) => `${c.dim}=${c.mu.toFixed(2)}`).join(' ') ?? '(无人物)';
  const unitWarns = r.warnings.filter((w) => /mu_/.test(w.code));
  if (unitWarns.length === 0) silent += 1;
  console.log(`[${name}]`);
  console.log(`    引擎告警: ${unitWarns.length} 条 ${unitWarns.map((w) => w.code).join(',')}`);
  console.log(`    引擎实际用的 mu: ${mu}`);
  console.log(`    预期: ${expect}`);
  console.log('');
}

console.log(`结论：${silent} 类脏数据在引擎层**完全静默**——引擎的自动识别救不了量纲问题，`);
console.log('      真正的第一道闸门是数据侧 validate-data.mjs 的整数断言，第二道是 API 层 checkDims()。');
console.log('      本脚本验证的是"引擎不会拦"这个既定事实，退出码固定 0。');
