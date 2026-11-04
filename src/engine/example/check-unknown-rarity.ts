/**
 * 未知 rarity 的静默回落验证。
 *
 *   pnpm exec tsx src/engine/example/check-unknown-rarity.ts
 *
 * 目的：证明 `sigmaFor()` 的 `byRarity ?? DEFAULT_SIGMA_BY_RARITY.common!` 兜底
 * 会让「拼错的档位名」静默变成「用 common 的 0.22」，且引擎**不会告警**。
 * 这正是为什么测试层必须有「无未定义稀有度」这条断言——引擎自己不会拦。
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
const answers = questions.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id }));

/** 挑第一个人，把 rarity 改成拼错的档位名 */
const victim = { ...personas[0]!, rarity: 'uncommon' as never };
const rest = personas.slice(1);

const before = match({ questions, answers, personas, theme });
const after = match({ questions, answers, personas: [victim, ...rest], theme });

const b = before.ranking.find((p) => p.id === victim.id)!;
const a = after.ranking.find((p) => p.id === victim.id)!;
const sigmaOf = (x: { contributions: Array<{ sigma: number }> }) => [...new Set(x.contributions.map((c) => c.sigma.toFixed(2)))].join('/');

console.log('把一个人的 rarity 改成拼错的 "uncommon"：');
console.log(`  ${victim.name}  原 rarity=common   σ=${sigmaOf(b)}  M'=${b.adjusted.toFixed(6)}`);
console.log(`  ${victim.name}  改 rarity=uncommon σ=${sigmaOf(a)}  M'=${a.adjusted.toFixed(6)}`);
console.log('');
console.log(`积分差: ${Math.abs(a.adjusted - b.adjusted).toFixed(6)}`);
console.log('');

const sigmaWarnings = after.warnings.filter((w) => /sigma|rarity/.test(w.code));
console.log(`引擎为此产生的告警数: ${sigmaWarnings.length}`);
console.log('=> 引擎**不会**为未知 rarity 告警，它静默用了 common 的 ' + DEFAULT_SIGMA_BY_RARITY.common);
console.log('');
console.log('结论：这条只能靠测试层「无未定义稀有度」断言拦住（数据侧 validate-data.mjs 是第一道）。');
console.log('本脚本退出码固定为 0 —— 它验证的是"引擎不会拦"这个既定事实，不是缺陷。');
