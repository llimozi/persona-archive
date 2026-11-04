/**
 * K7 验证：前端 theme 取值路径是否端到端生效（纯函数层面）。
 *
 * 背景：`src/web` 里权重来源是 `theme?.weights ?? DEFAULT_THEME_WEIGHTS`。
 * 两边数值当前相同时，光看六维分辨不出前端用的是哪一份——这是 K7。
 *
 * 判据（主控终版）：**六维不能当判据**——它由作答归一化 `Σwδ/Σ|wδ|` 得出，
 * 权重在比值里被约掉，任何分叉都不会动它。真正会变的是 `mainPercent`。
 * 所以本测试断言：两组不同权重 → `mainPercent` 必须不同。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { match } from '../../src/engine/index';
import type { EngineAnswer, EnginePersona, EngineQuestion, EngineTheme } from '../../src/engine/types';

const root = resolve(__dirname, '../..');

function readArr<T>(rel: string, key: string): T[] {
  const raw = JSON.parse(readFileSync(resolve(root, rel), 'utf8'));
  return Array.isArray(raw) ? (raw as T[]) : (raw[key] ?? raw.items ?? []);
}

const questions = readArr<EngineQuestion>('data/questions.json', 'questions');
const personas = readArr<EnginePersona>('data/personas.json', 'personas');
const answers: EngineAnswer[] = questions.map((q) => ({ questionId: q.id, optionId: q.options[0].id }));

/** 接口原值（与 data/questions.json 的 theme.weights 一致） */
const WEIGHTS_API: EngineTheme = {
  themeId: 'th-general',
  name: '接口值',
  weights: { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 },
};

/** 分叉值（只在测试内构造，不写 data/） */
const WEIGHTS_DIVERGED: EngineTheme = {
  themeId: 'th-general',
  name: '分叉值',
  weights: { EE: 0.40, ST: 0.12, AC: 0.12, HX: 0.12, RB: 0.12, SR: 0.12 },
};

describe('K7 · theme 权重必须影响输出（纯函数）', () => {
  it('两组不同权重下 mainPercent 必须不同（证明 theme 真的参与了计算）', () => {
    if (!questions.length || !personas.length) {
      expect.fail('数据为空，K7 无法验证（不是 PASS）');
    }
    const a = match({ questions, answers, personas, theme: WEIGHTS_API });
    const b = match({ questions, answers, personas, theme: WEIGHTS_DIVERGED });

    const pa = a.mainPercent?.value;
    const pb = b.mainPercent?.value;
    expect(pa, '引擎未给出 mainPercent').toBeTypeOf('number');
    expect(pb, '引擎未给出 mainPercent').toBeTypeOf('number');

    // 这是本测试唯一的判据：权重若真的参与计算，百分比必须变化
    expect(
      pa,
      `两组权重下 mainPercent 相同（${pa}），说明 theme.weights 没有参与计算`,
    ).not.toBe(pb);
  });

  it('六维对权重不敏感（记录引擎的既有行为，防后人误当缺陷）', () => {
    const a = match({ questions, answers, personas, theme: WEIGHTS_API });
    const b = match({ questions, answers, personas, theme: WEIGHTS_DIVERGED });
    const dims = ['EE', 'ST', 'AC', 'HX', 'RB', 'SR'] as const;
    // 全选 A 时各维同向，权重在 Σwδ/Σ|wδ| 里被约掉——所以在"全同向作答"下六维不变是预期
    for (const d of dims) {
      expect(a.user.x[d], `${d} 在权重分叉下发生了位移，与"归一化约掉权重"的预期不符`).toBe(b.user.x[d]);
    }
  });
});
