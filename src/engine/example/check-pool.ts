/**
 * 进池判据守卫（防止「误用 restricted 导致静默丢人」）。
 *
 *   pnpm exec tsx src/engine/example/check-pool.ts
 *
 * 为什么单独做这个检查：
 *   真实数据里 12 人全是 `compliance.matchPool = true`，但其中 10 人 `restricted = true`。
 *   如果实现误把 `restricted` 当作出池条件，池子会从 12 静默掉到 2，
 *   **而所有"主匹配存在"之类的断言依然会通过**——错误不会让任何测试变红。
 *   所以必须有一条**直接断言池大小**的守卫：12 人入池、出池 0 人。
 *
 * ⚠️ 依赖真实 data/*.json；数据改动时这条会跟着变，属预期。
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

const result = match({
  questions,
  answers: questions.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id })),
  personas,
  theme,
});

const total = personas.length;
const inPool = result.pool.size;
const dropped = total - inPool;
const restrictedCount = personas.filter((p) => (p as { compliance?: { restricted?: boolean } }).compliance?.restricted === true).length;
const matchPoolFalse = personas.filter((p) => (p as { compliance?: { matchPool?: boolean } }).compliance?.matchPool === false).length;

const outOfPoolWarnings = result.warnings.filter((w) => w.code === 'persona_out_of_match_pool');
const restrictedNoted = result.warnings.filter((w) => w.code === 'persona_restricted_noted');

console.log('真实数据:', `${total} 人`);
console.log('  compliance.restricted=true :', restrictedCount, '人');
console.log('  compliance.matchPool=false :', matchPoolFalse, '人  ← 这才是出池条件');
console.log('');
console.log('引擎结果: 入池', inPool, '人 / 出池', dropped, '人');
console.log('  出池告警 persona_out_of_match_pool:', outOfPoolWarnings.length, '条');
console.log('  受限告知 persona_restricted_noted  :', restrictedNoted.length, '条（只告知，不拦）');
console.log('');

const checks: Array<[string, boolean, string]> = [
  ['池大小 === 数据总数（无误剔）', inPool === total, `期望 ${total}，实际 ${inPool}`],
  ['出池 === 0', dropped === 0, `期望 0，实际 ${dropped}`],
  ['matchPool=false 为 0 时不应有出池告警', matchPoolFalse === 0 ? outOfPoolWarnings.length === 0 : true, `实际 ${outOfPoolWarnings.length} 条`],
  ['restricted=true 的人仍在池中（只告知不拦）', restrictedCount > 0 ? restrictedNoted.length === restrictedCount : true, `restricted ${restrictedCount} 人，告知 ${restrictedNoted.length} 条`],
  ['主匹配存在', result.main !== null, '主匹配为空'],
];

let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${ok ? '' : `  ← ${detail}`}`);
  if (!ok) failed += 1;
}

console.log('');
console.log(failed === 0 ? '守卫通过：进池判据只看 matchPool，restricted 不会误剔。' : `守卫失败 ${failed} 项。`);
process.exitCode = failed === 0 ? 0 : 1;
