/**
 * 逐人 σ 取用证据（最终基线）。
 *
 *   pnpm exec tsx src/engine/example/check-per-persona.ts
 *
 * 与 check-rarity.ts 的分工：
 *   - check-rarity      ：按档聚合，证明四档都被取到
 *   - 本文件            ：逐人展开，证明**每个人**取到的 σ 等于其 rarity 对应的值，
 *                        而不是静默回落到 common 的 0.22（`sigmaFor()` 的 ?? 兜底）
 */

import { readFileSync } from 'node:fs';
import { DEFAULT_SIGMA_BY_RARITY, match } from '../match.js';
import type { EnginePersona, EngineQuestion, EngineTheme } from '../types.js';

const personas = (JSON.parse(readFileSync('data/personas.json', 'utf8')) as { personas: EnginePersona[] }).personas;
const questions = (JSON.parse(readFileSync('data/questions.json', 'utf8')) as { questions: EngineQuestion[] }).questions;
const theme: EngineTheme = {
  themeId: 'th-general',
  name: '通用鉴定',
  weights: { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 },
};

const r = match({
  questions,
  answers: questions.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id })),
  personas,
  theme,
});

let bad = 0;
const rows: string[] = [];
for (const p of r.ranking) {
  const expected = DEFAULT_SIGMA_BY_RARITY[p.rarity as string];
  const seen = [...new Set(p.contributions.map((c) => c.sigma.toFixed(2)))];
  const ok = seen.length === 1 && seen[0] === expected?.toFixed(2);
  if (!ok) bad += 1;
  rows.push(`  ${ok ? '✅' : '❌'} ${p.rarity.padEnd(8)} ${p.name.padEnd(22)} σ实测=${seen.join('/')}  期望=${expected?.toFixed(2)}`);
}

console.log('逐人 σ 取用（真实 12 人，全选 A 作答）：');
console.log(rows.join('\n'));
console.log('');
console.log(bad === 0 ? `✅ ${r.ranking.length} 人全部取到本档 σ，无静默回落` : `❌ ${bad} 人 σ 取用异常`);
process.exitCode = bad === 0 ? 0 : 1;
