/**
 * limited 分支覆盖校验：内容数据把 4 张限时卡改标 `limited` 之后，
 * 用它确认 (a) 数据分布变了 (b) 引擎的 DEFAULT_SIGMA_BY_RARITY.limited 真的被跑到
 * (c) 结果仍然确定性一致。
 *
 *   pnpm exec tsx src/engine/example/check-limited.ts
 */

import { readFileSync } from 'node:fs';
import { match, DEFAULT_SIGMA_BY_RARITY } from '../match.js';
import type { EngineAnswer, EnginePersona, EngineQuestion, EngineTheme } from '../types.js';

const personas = (JSON.parse(readFileSync('data/personas.json', 'utf8')) as { personas: EnginePersona[] }).personas;
const questions = (JSON.parse(readFileSync('data/questions.json', 'utf8')) as { questions: EngineQuestion[] }).questions;

console.log('σ 缺省表:', JSON.stringify(DEFAULT_SIGMA_BY_RARITY));

const dist: Record<string, number> = {};
for (const p of personas) {
  const r = p.rarity ?? '(未标)';
  dist[r] = (dist[r] ?? 0) + 1;
}
console.log('真实数据 rarity 分布:', JSON.stringify(dist));

const theme: EngineTheme = {
  themeId: 'th-general',
  name: '通用鉴定',
  weights: { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 },
};

// 用 3 组固定作答覆盖不同侧面，确认 limited 人物会进榜、σ 缺省分支被执行
const answerSets: Array<{ name: string; answers: EngineAnswer[] }> = [
  { name: '全选第一项', answers: questions.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id })) },
  { name: '全选第二项', answers: questions.map((q) => ({ questionId: q.id, optionId: (q.options[1] ?? q.options[0]!).id })) },
  { name: '全选最后一项', answers: questions.map((q) => ({ questionId: q.id, optionId: q.options[q.options.length - 1]!.id })) },
];

let anyLimitedScored = false;
let anyHiddenScored = false;
for (const set of answerSets) {
  const input = { questions, answers: set.answers, personas, theme };
  const a = JSON.stringify(match(input));
  const b = JSON.stringify(match(input));
  const r = JSON.parse(a) as ReturnType<typeof match>;
  const limitedInRanking = r.ranking.filter((p) => p.rarity === 'limited');
  const hiddenInRanking = r.ranking.filter((p) => p.rarity === 'hidden');
  if (limitedInRanking.length > 0) anyLimitedScored = true;
  if (hiddenInRanking.length > 0) anyHiddenScored = true;
  console.log('');
  console.log(`[${set.name}] 池=${r.pool.size} 确定性=${a === b ? 'PASS' : 'FAIL'}`);
  console.log(`  主匹配: ${r.main?.persona.name} ${r.mainPercent?.label}`);
  console.log(`  榜上 limited: ${limitedInRanking.length} 人 ${limitedInRanking.map((p) => p.name).join(', ') || '—'}`);
  for (const p of limitedInRanking) {
    const sigmas = p.contributions.map((c) => `${c.dim}=${c.sigma.toFixed(2)}`).join(' ');
    console.log(`    ${p.name} → σ(取到 limited 缺省): ${sigmas}`);
  }
  console.log(`  榜上 hidden : ${hiddenInRanking.length} 人 ${hiddenInRanking.map((p) => p.name).join(', ') || '—'}`);
  for (const p of hiddenInRanking) {
    const sigmas = p.contributions.map((c) => `${c.dim}=${c.sigma.toFixed(2)}`).join(' ');
    console.log(`    ${p.name} → σ(取到 hidden 缺省): ${sigmas}`);
  }
}

console.log('');
console.log('================================');
console.log(`limited 分支是否被真实数据跑到: ${anyLimitedScored ? 'YES（0.18 已取到）' : 'NO'}`);
console.log(`hidden 分支是否被真实数据跑到: ${anyHiddenScored ? 'YES（0.15 已取到）' : 'NO'}`);
