/**
 * 展示口径回归测试：页面上的「娱乐匹配度」必须与排名严格同源。
 *
 * 背景（2026-11-05 审计）：
 *   引擎给两个数——`similarity`（纯核得分）与 `adjusted`（排序分）。
 *   排名按 adjusted，但展示曾经用 similarity，两者会打架：
 *   枢纽修正最多 ±0.05，足以让第 2 名的 similarity 高于第 1 名。
 *   实测 2000 次随机作答，12.6% 的情况出现「排名第 2 的分数反而更高」，
 *   用户会看到「主匹配 56%、第二人格 57%」这种无法解释的组合。
 *
 * 修复方式：展示值改用 adjusted（见 src/web/lib/api.ts 的 toRanked）。
 * 本测试锁住这条不变量，防止以后有人把展示值改回 similarity。
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runMatch } from '../../src/web/lib/api';

const root = resolve(__dirname, '../..');

interface RawQ {
  id: string;
  options: Array<{ id: string }>;
}

const questions = (JSON.parse(readFileSync(resolve(root, 'data/questions.json'), 'utf8')) as {
  questions: RawQ[];
}).questions;

const personas = (JSON.parse(readFileSync(resolve(root, 'data/personas.json'), 'utf8')) as {
  personas: Array<Record<string, unknown>>;
}).personas;

/** 简单可复现的伪随机，避免测试结果随运行波动 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomAnswers(seed: number): Record<string, string> {
  const rnd = mulberry32(seed);
  const out: Record<string, string> = {};
  for (const q of questions) {
    out[q.id] = q.options[Math.floor(rnd() * q.options.length)]!.id;
  }
  return out;
}

describe('展示口径：匹配度与排名必须同源', () => {
  it('排名靠前的展示分一定不低于靠后的（不允许下位反超）', () => {
    let violations = 0;
    let checked = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const r = runMatch(questions as never, personas as never, randomAnswers(seed));
      if (!r) continue;
      for (let i = 1; i < r.ranking.length; i += 1) {
        checked += 1;
        expect(
          r.ranking[i - 1]!.percent >= r.ranking[i]!.percent,
          `第 ${i} 名（${r.ranking[i]!.id} ${r.ranking[i]!.percent}%）不应高于第 ${i + 1} 名（${r.ranking[i - 1]!.id} ${r.ranking[i - 1]!.percent}%）`,
        ).toBe(true);
        if (r.ranking[i - 1]!.percent < r.ranking[i]!.percent) violations += 1;
      }
    }
    expect(checked).toBeGreaterThan(200);
    expect(violations, '出现下位反超说明展示值又改回了 similarity').toBe(0);
  });

  it('次匹配的展示分不得高于主匹配', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const r = runMatch(questions as never, personas as never, randomAnswers(seed));
      if (!r?.secondary || !r.main) continue;
      expect(
        r.secondary.persona.percent,
        `次匹配 ${r.secondary.persona.id} 的展示分不应高于主匹配 ${r.main.persona.id}`,
      ).toBeLessThanOrEqual(r.main.persona.percent);
    }
  });

  it('展示分是 0–100 的整数，不出现负分或越界', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const r = runMatch(questions as never, personas as never, randomAnswers(seed));
      if (!r) continue;
      for (const x of r.ranking) {
        expect(Number.isInteger(x.percent), `${x.id} 展示分应为整数`).toBe(true);
        expect(x.percent).toBeGreaterThanOrEqual(0);
        expect(x.percent).toBeLessThanOrEqual(100);
      }
    }
  });

  it('主匹配就是排名第一的那个人', () => {
    for (let seed = 1; seed <= 12; seed += 1) {
      const r = runMatch(questions as never, personas as never, randomAnswers(seed));
      if (!r?.main) continue;
      expect(r.main.persona.id).toBe(r.ranking[0]!.id);
    }
  });
});
