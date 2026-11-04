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
// 缺 matchPool 但带 restrictedReason 的卡，当前引擎推的是 persona_match_pool_missing（只告警不拦截）。
// ⚠️ 这里曾过滤 `persona_out_of_pool_legacy`——那是主控 2026-11-05 裁决前的旧码名，引擎已不再推。
//    残留的后果是：过滤结果恒为 0，打印出来「0 条（应为 0）」看着很正常，
//    实际是"码根本不会出现"而非"确实没漏字段"，等于一条永远不会红的断言。
//    现改为过滤真实码名，判据换成"真实数据里不该有缺字段的卡"。
const missingWarnings = result.warnings.filter((w) => w.code === 'persona_match_pool_missing');
const restrictedNoted = result.warnings.filter((w) => w.code === 'persona_restricted_noted');
/** restricted=true 的人物 id（数据侧声明） */
const restrictedIds = personas
  .filter((p) => (p as { compliance?: { restricted?: boolean } }).compliance?.restricted === true)
  .map((p) => p.id);
/** 实际进了池的人物 id（引擎输出） */
const inPoolIds = new Set(result.ranking.map((p) => p.id));

console.log('真实数据:', `${total} 人`);
console.log('  compliance.restricted=true :', restrictedCount, '人');
console.log('  compliance.matchPool=false :', matchPoolFalse, '人  ← 这才是出池条件');
console.log('');
console.log('引擎结果: 入池', inPool, '人 / 出池', dropped, '人');
console.log('  出池告警 persona_out_of_match_pool:', outOfPoolWarnings.length, '条');
console.log('  缺字段告知 persona_match_pool_missing:', missingWarnings.length, '条（只告警，不拦截）');
console.log('  受限告知 persona_restricted_noted  :', restrictedNoted.length, '条（只告知，不拦）');
console.log('');

const checks: Array<[string, boolean, string]> = [
  ['池大小 === 数据总数（无误剔）', inPool === total, `期望 ${total}，实际 ${inPool}`],
  ['出池 === 0', dropped === 0, `期望 0，实际 ${dropped}`],
  ['matchPool=false 为 0 时不应有出池告警', matchPoolFalse === 0 ? outOfPoolWarnings.length === 0 : true, `实际 ${outOfPoolWarnings.length} 条`],
  ['真实数据无「缺 matchPool」的卡（应 0，且该码确实会被推——见 fixture）', missingWarnings.length === 0, `实际 ${missingWarnings.length} 条`],
  // ── 为什么这条要从"查告警"改成"查在场"（历史记录，不是当前结果）─────────────
  // 【旧行为】本条原先判断的是「有没有推 persona_restricted_noted 告警」，
  //          而名字写的是「仍在池中」。两者在正常路径下恰好同向，所以看不出问题。
  // 【暴露方式】有人往 restricted 分支里插了一句 `return false` 做变异：人从池里消失，
  //          但 warnings.push 在 return 之前已执行，告警照推 —— 旧断言因此没有反应。
  // 【现在】直接判断 restrictedIds 是否全部在 inPoolIds 里，与告警解耦。
  //         变异时会在失败信息里逐个列出缺失的人 id。
  // ⚠️ 本段是历史说明；若要确认现状，跑本文件看输出，不要读注释。
  [
    'restricted=true 的人仍在池中（查在场，不查告警）',
    restrictedIds.every((id) => inPoolIds.has(id)),
    `不在池中的 restricted 人物：${restrictedIds.filter((id) => !inPoolIds.has(id)).join(',') || '无'}`,
  ],
  ['主匹配存在', result.main !== null, '主匹配为空'],
];

// ── fixture 用例：真实数据里 0 例，所以必须构造才能验证「缺 matchPool 只告警不拦截」这条分支 ──
// 没有这段，上面那条 missingWarnings === 0 永远是 0、也永远不会红 = 等于没有断言。
// 这段就是那条断言的"反向证据"：证明 persona_match_pool_missing 这个码真的会被推出来。
// （历史：该断言原过滤 persona_out_of_pool_legacy，引擎改码名后它恒为 0，已修正。）
const legacyPersona = {
  id: 'fixture-legacy-001',
  name: '缺 matchPool 的测试人物',
  category: 'demo',
  dims: { EE: 50, ST: 50, AC: 50, HX: 50, RB: 50, SR: 50 },
  // 真实数据的 restrictedReason 写在 compliance 内（12/12），所以 fixture 也放这里。
  compliance: { restrictedReason: ['thirdPartyIP'] },
} as unknown as (typeof personas)[number];

const legacyRun = match({
  questions,
  answers: questions.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id })),
  personas: [...personas, legacyPersona],
  theme,
});
const missingHit = legacyRun.warnings.filter((w) => w.code === 'persona_match_pool_missing');
const explicitHit = legacyRun.warnings.filter((w) => w.code === 'persona_out_of_match_pool');
checks.push(
  [
    'fixture：缺 matchPool 的人物**仍进池**（不因数据不全而删人）',
    legacyRun.pool.size === personas.length + 1,
    `期望 ${personas.length + 1}、实际 ${legacyRun.pool.size}`,
  ],
  ['fixture：推 persona_match_pool_missing 提示级告警', missingHit.length === 1, `实际 ${missingHit.length} 条`],
  ['fixture：不得推 persona_out_of_match_pool（那不是"排除"）', explicitHit.length === 0, `实际 ${explicitHit.length} 条`],
);

let failed = 0;
for (const [name, ok, detail] of checks) {
  console.log(`${ok ? '✅ PASS' : '❌ FAIL'}  ${name}${ok ? '' : `  ← ${detail}`}`);
  if (!ok) failed += 1;
}

console.log('');
console.log(failed === 0 ? '守卫通过：进池判据只看 matchPool，restricted 不会误剔。' : `守卫失败 ${failed} 项。`);
process.exitCode = failed === 0 ? 0 : 1;
