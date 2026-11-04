/**
 * 告警噪音检查：真实数据跑一遍，确认量纲告警为 0（正常数据保持静默）。
 *
 *   pnpm exec tsx src/engine/example/check-warnings.ts
 */

import { readFileSync } from 'node:fs';
import { match } from '../match.js';
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

const byCode: Record<string, number> = {};
for (const w of r.warnings) byCode[w.code] = (byCode[w.code] ?? 0) + 1;

const unitNoise = (byCode['mu_unit_ambiguous'] ?? 0) + (byCode['mu_range_suspect'] ?? 0);
const restrictedNoted = byCode['persona_restricted_noted'] ?? 0;

console.log('真实 12 人 / 10 题，告警总数:', r.warnings.length);
for (const [code, n] of Object.entries(byCode)) console.log(`  ${code}: ${n}`);
console.log('');
console.log(`${unitNoise === 0 ? '✅' : '❌'} 正常百分制数据不产生量纲告警（实际 ${unitNoise} 条）——不会淹没真问题`);
console.log(`ℹ️ persona_restricted_noted = ${restrictedNoted} 条：这是「有合规注意项但仍进池」的告知，属信息性，不是错误`);

process.exitCode = unitNoise === 0 ? 0 : 1;
