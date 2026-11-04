/**
 * 四档 rarity → σ 取用证据表（主控验收用）。
 *
 *   pnpm exec tsx src/engine/example/check-rarity.ts
 *
 * 对真实 12 人 / 10 题，逐档列出：σ 缺省值、该档人物、人物在榜、实际取到的 σ。
 */

import { readFileSync } from 'node:fs';
import { DEFAULT_SIGMA_BY_RARITY, match } from '../match.js';
import type { EnginePersona, EngineQuestion, EngineTheme } from '../types.js';
import { DIM_KEYS } from '../types.js';

const personas = (JSON.parse(readFileSync('data/personas.json', 'utf8')) as { personas: EnginePersona[] }).personas;
const questions = (JSON.parse(readFileSync('data/questions.json', 'utf8')) as { questions: EngineQuestion[] }).questions;

const theme: EngineTheme = {
  themeId: 'th-general',
  name: '通用鉴定',
  weights: { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 },
};

const result = match({
  questions,
  answers: questions.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id })),
  personas,
  theme,
});

console.log('数据分布:', JSON.stringify(countBy(personas)));
console.log('池大小:', result.pool.size, '| 引擎版本:', result.engineVersion);
console.log('');
console.log('档位      σ 缺省  数据人数  榜上人数  实际取到的 σ（去重）  人物');
console.log('─'.repeat(96));

for (const r of ['common', 'rare', 'limited', 'hidden'] as const) {
  const inData = personas.filter((p) => (p.rarity ?? 'common') === r);
  const inRank = result.ranking.filter((p) => p.rarity === r);
  const sigmas = new Set<string>();
  for (const p of inRank) for (const c of p.contributions) sigmas.add(c.sigma.toFixed(2));
  const sigmaText = sigmas.size > 0 ? [...sigmas].sort().join(' / ') : '(未取到)';
  console.log(
    `${r.padEnd(8)}  ${String(DEFAULT_SIGMA_BY_RARITY[r]).padEnd(8)} ${String(inData.length).padEnd(9)} ${String(inRank.length).padEnd(9)} ${sigmaText.padEnd(20)} ${inRank.map((p) => p.name).join('、') || '—'}`,
  );
}

console.log('');
const uncovered = (['common', 'rare', 'limited', 'hidden'] as const).filter(
  (r) => !result.ranking.some((p) => p.rarity === r),
);
console.log(uncovered.length === 0 ? '✅ 四档全部被真实数据取到，无死分支' : `❌ 未覆盖档位: ${uncovered.join(', ')}`);

// 附：一位 limited 人物的逐维 σ，证明取的是 0.18 而不是别的
const sample = result.ranking.find((p) => p.rarity === 'limited');
if (sample) {
  console.log('');
  console.log(`样本逐维 σ（${sample.name}）:`);
  for (const c of sample.contributions) console.log(`  ${c.dim}  σ=${c.sigma.toFixed(2)}  μ=${c.mu.toFixed(2)}  x=${c.x.toFixed(2)}  g=${c.g.toFixed(6)}`);
}

void DIM_KEYS;

function countBy(list: EnginePersona[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of list) {
    const k = p.rarity ?? 'common';
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}
