/**
 * 78 人池的分布与意外组合层体检（只读：不改数据、不改算法）。
 *
 *   npx vitest run --config vitest.config.ts tests/audit/pool-distribution.test.ts
 *   SAMPLE=5000（默认）
 *
 * 结论落在 stdout；硬断言只做最基本的合理性（不出现空结果、意外组合不等于主匹配、
 * 不在池外），"分布是否均匀"由人读报告判断，不把均匀硬编成断言卡住调参。
 */
import { describe, it } from 'vitest';
import { match } from '../../src/engine/match';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnginePersona, EngineQuestion, EngineTheme, MatchInput, MatchResult } from '../../src/engine/types';

const root = resolve(__dirname, '../..');
const N = Number(process.env.SAMPLE ?? 5000);

type P = EnginePersona & { id: string; name: string };

describe('池体检', () => {
  it(`随机作答 ${N} 次的分布与意外组合层`, () => {
    const personas = JSON.parse(readFileSync(resolve(root, 'data/personas.json'), 'utf8')).personas as P[];
    const qraw = JSON.parse(readFileSync(resolve(root, 'data/questions.json'), 'utf8'));
    const questions = qraw.questions as EngineQuestion[];
    const theme = qraw.theme as EngineTheme;

    const ids = personas.map((p) => p.id);
    const nameOf = new Map(personas.map((p) => [p.id, p.name]));
    const catOf = new Map(personas.map((p) => [p.id, p.category]));

    const mainCount = new Map<string, number>();
    const secondCount = new Map<string, number>();
    const surpriseCount = new Map<string, number>();
    let surpriseOn = 0;
    let surpriseNull = 0;
    let sameAsMain = 0;
    let notInPool = 0;
    let sameCategory = 0;

    for (let i = 0; i < N; i += 1) {
      const answers = questions.map((q) => ({
        questionId: q.id,
        optionId: q.options[Math.floor(Math.random() * q.options.length)]!.id,
      }));
      const out = match({ questions, answers, personas, theme } as MatchInput) as MatchResult;

      const mainId = out.main?.persona.id;
      if (mainId) mainCount.set(mainId, (mainCount.get(mainId) ?? 0) + 1);
      const secId = out.secondary?.persona.id;
      if (secId) secondCount.set(secId, (secondCount.get(secId) ?? 0) + 1);

      if (out.pool.surpriseEnabled) surpriseOn += 1;
      const spId = out.surprise?.persona.id;
      if (!spId) {
        surpriseNull += 1;
        continue;
      }
      surpriseCount.set(spId, (surpriseCount.get(spId) ?? 0) + 1);
      if (mainId && spId === mainId) sameAsMain += 1;
      if (!ids.includes(spId)) notInPool += 1;
      if (mainId && catOf.get(spId) === catOf.get(mainId)) sameCategory += 1;
    }

    const dump = (title: string, counter: Map<string, number>, total: number) => {
      const rows = ids.map((id) => ({ id, name: nameOf.get(id) ?? id, n: counter.get(id) ?? 0 }));
      rows.sort((a, b) => a.n - b.n);
      const zero = rows.filter((r) => r.n === 0);
      const pct = (n: number) => ((n / total) * 100).toFixed(2);
      console.log(`\n=== ${title} n=${total} ===`);
      console.log(`  never(${zero.length}): ${zero.map((r) => r.id).join(',') || '-'}`);
      console.log('  lowest8:');
      for (const r of rows.slice(0, 8)) console.log(`    ${r.id.padEnd(26)} ${String(r.n).padStart(5)} ${pct(r.n)}%  ${r.name}`);
      console.log('  highest8:');
      for (const r of rows.slice(-8).reverse()) console.log(`    ${r.id.padEnd(26)} ${String(r.n).padStart(5)} ${pct(r.n)}%  ${r.name}`);
      const max = (rows[rows.length - 1]?.n ?? 0) / total;
      const min = (rows[0]?.n ?? 0) / total;
      console.log(`  spread max=${(max * 100).toFixed(2)}% min=${(min * 100).toFixed(2)}% ideal=${(100 / ids.length).toFixed(2)}%`);
      return { zero: zero.length, top: rows.slice(-6).map((r) => `${r.id}:${pct(r.n)}%`) };
    };

    console.log(`\npool=${personas.length} sample=${N}`);
    console.log(`surpriseEnabled=${surpriseOn}/${N} surpriseNull=${surpriseNull}`);
    const m = dump('MAIN', mainCount, N);
    dump('SECOND', secondCount, N);
    const s = dump('SURPRISE', surpriseCount, Math.max(surpriseOn, 1));
    console.log(`\nsurprise same-as-main=${sameAsMain} not-in-pool=${notInPool} same-category-as-main=${sameCategory}`);
    console.log(`MAIN_TOP=${m.top.join(' ')}`);
    console.log(`SURPRISE_TOP=${s.top.join(' ')}`);
  }, 900_000);
});
