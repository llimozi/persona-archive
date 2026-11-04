/**
 * 六维匹配引擎单测。责任人：风控审查（QA）。
 * 判据来源：docs/DEV-CONTROL.md §3「人格系统」行 + docs/TEST-PLAN.md §3。
 *
 * 两类用例：
 *  A. 表达式求值（src/engine/expression.ts 已落地）→ 现在就真跑，不当占位。
 *  B. 匹配主函数（src/engine/index.ts 的 matchPersonas）→ 未落地时 ctx.skip() 并计入未跑，
 *     **绝不用 skip 冒充通过**。
 *
 * ⚠️ 阈值/α/β 等全部是**设计值**，不是实测值（见 src/engine/types.ts 头注）。
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evalCondition, wildcardMatch, parseExpression } from '../../src/engine/expression';
import type {
  EngineAnswer,
  EnginePersona,
  EngineQuestion,
  MatchInput,
  MatchResult,
} from '../../src/engine/types';

const DIM_KEYS = ['EE', 'ST', 'AC', 'HX', 'RB', 'SR'] as const;
const root = resolve(__dirname, '../..');

// ───────────────────────────── A. 表达式求值 ─────────────────────────────

describe('引擎 · 表达式求值', () => {
  it('parseExpression 解析 AND/OR 比较式', () => {
    const e = parseExpression('ST < 0.30 AND EE > 0.70');
    expect(e.kind).toBe('and');
  });

  it('evalCondition 正常求值返回布尔', () => {
    const v = { EE: 0.8, ST: 0.2, AC: 0.5, HX: 0.5, RB: 0.5, SR: 0.5 };
    expect(evalCondition('ST < 0.30 AND EE > 0.70', v)).toBe(true);
    expect(evalCondition('ST > 0.30 AND EE > 0.70', v)).toBe(false);
  });

  // 契约（src/engine/expression.ts 注释）：未知维度按 0.5 中性参与比较；语法错误才返回 null
  it('缺失维度按 0.5 中性求值，不抛异常', () => {
    const vals = { EE: 0.5 } as Record<string, number>;
    expect(() => evalCondition('ST < 0.30', vals)).not.toThrow();
    expect(evalCondition('ST < 0.30', vals)).toBe(false); // 0.5 < 0.30 = false
    expect(evalCondition('ST > 0.30', vals)).toBe(true); // 0.5 > 0.30 = true
  });

  it('语法错误返回 null 而不是抛异常', () => {
    expect(evalCondition('ST <', {} as Record<string, number>)).toBeNull();
  });

  it('wildcardMatch 支持 ani-* 与精确匹配', () => {
    expect(wildcardMatch('ani-*', 'ani-001')).toBe(true);
    expect(wildcardMatch('ani-*', 'hist-001')).toBe(false);
    expect(wildcardMatch('lit-001', 'lit-001')).toBe(true);
  });
});

// ───────────────────────────── B. 匹配主函数 ─────────────────────────────

const indexTs = resolve(root, 'src/engine/index.ts');
const engineReady = existsSync(indexTs);
const notReady = 'src/engine/index.ts 不存在 → NOT IMPLEMENTED（不是 PASS）';

type MatchFn = (input: MatchInput) => MatchResult;

/** 真实契约：src/engine/index.ts 导出 `match()`（见其头注与本文件 A 区） */
async function loadMatchFn(): Promise<MatchFn | null> {
  if (!engineReady) return null;
  try {
    const mod = (await import('../../src/engine/index')) as Record<string, unknown>;
    return typeof mod.match === 'function' ? (mod.match as MatchFn) : null;
  } catch {
    return null;
  }
}

function readArr<T>(rel: string, key: string): T[] {
  const raw = JSON.parse(readFileSync(resolve(root, rel), 'utf8'));
  if (Array.isArray(raw)) return raw as T[];
  return (raw[key] ?? raw.items ?? raw.data ?? []) as T[];
}

/** 从真实题库构造固定作答：每题选第一个选项 */
function fixedAnswers(questions: EngineQuestion[]): EngineAnswer[] {
  return questions.map((q) => ({ questionId: q.id, optionId: q.options[0]?.id ?? '' }));
}

describe('引擎 · 匹配主函数', () => {
  const questions = readArr<EngineQuestion>('data/questions.json', 'questions');
  const personas = readArr<EnginePersona>('data/personas.json', 'personas');
  const theme = {
    themeId: 't-mvp',
    name: 'MVP 默认主题',
    weights: { EE: 1 / 6, ST: 1 / 6, AC: 1 / 6, HX: 1 / 6, RB: 1 / 6, SR: 1 / 6 },
  };

  it('match 已导出', async (ctx) => {
    if (!engineReady) {
      ctx.skip(notReady);
      return;
    }
    expect(await loadMatchFn(), 'src/engine/index.ts 存在但没有导出 match()').toBeTypeOf('function');
  });

  const guarded = (name: string, body: (fn: MatchFn) => void | Promise<void>) =>
    it(name, async (ctx) => {
      const fn = await loadMatchFn();
      if (!fn) {
        ctx.skip(notReady);
        return;
      }
      if (questions.length === 0 || personas.length === 0) {
        ctx.skip('data/questions.json 或 data/personas.json 为空 → 依赖内容数据，未跑（不是 PASS）');
        return;
      }
      await body(fn);
    });

  guarded('确定性：同输入连续跑 5 次完全一致', (fn) => {
    const input: MatchInput = { questions, answers: fixedAnswers(questions), personas, theme };
    const first = JSON.stringify(fn(input));
    for (let i = 0; i < 4; i++) expect(JSON.stringify(fn(input))).toBe(first);
  });

  guarded('输出结构含主/次/隐藏/意外四段', (fn) => {
    const out = fn({ questions, answers: fixedAnswers(questions), personas, theme });
    for (const k of ['main', 'secondary', 'hidden', 'surprise'] as const) {
      expect(Object.prototype.hasOwnProperty.call(out, k), `结果缺 ${k} 字段`).toBe(true);
    }
    expect(out.main, '主匹配为空（池非空时不应为 null）').not.toBeNull();
  });

  guarded('不修改入参（纯函数）', (fn) => {
    const answers = fixedAnswers(questions);
    const qSnap = JSON.stringify(questions);
    const pSnap = JSON.stringify(personas);
    const aSnap = JSON.stringify(answers);
    fn({ questions, answers, personas, theme });
    expect(JSON.stringify(questions)).toBe(qSnap);
    expect(JSON.stringify(personas)).toBe(pSnap);
    expect(JSON.stringify(answers)).toBe(aSnap);
  });

  guarded('六维取值域：x_d ∈ [0,1]，且 rank 无重复人物', (fn) => {
    const out = fn({ questions, answers: fixedAnswers(questions), personas, theme });
    for (const d of DIM_KEYS) {
      expect(Number.isFinite(out.user.x[d]), `user.x.${d} 非有限数`).toBe(true);
      expect(out.user.x[d]).toBeGreaterThanOrEqual(0);
      expect(out.user.x[d]).toBeLessThanOrEqual(1);
    }
    const ids = out.ranking.map((r) => r.id);
    expect(ids.length - new Set(ids).size, '排名里出现重复人物').toBe(0);
  });

  guarded('极值鲁棒：空作答不抛异常，四段结构仍在', (fn) => {
    expect(() => {
      const out = fn({ questions, answers: [], personas, theme });
      expect(out).toHaveProperty('main');
    }).not.toThrow();
  });

  guarded('极值鲁棒：单题作答不抛异常', (fn) => {
    expect(() => fn({ questions, answers: [fixedAnswers(questions)[0]], personas, theme })).not.toThrow();
  });

  guarded('极值鲁棒：超出池子的人物数（池 < 门槛关闭意外层）', (fn) => {
    const out = fn({ questions, answers: fixedAnswers(questions), personas, theme });
    expect(typeof out.pool.size).toBe('number');
    expect(typeof out.pool.surpriseEnabled).toBe('boolean');
  });
});

// ─────────────────── C. 防回归：进池判据（主控 23:56 要求的硬断言） ───────────────────

/**
 * 这条断言的价值**不是证明现在正确，而是保证以后不会被改坏**。
 * 背景：真实数据 12 人里 10 人 compliance.restricted=true、但 matchPool 全为 true。
 * 若有人把进池判据误用成 `restricted === true`，池会从 12 人掉到 2 人——
 * 而其余所有用例依然会绿（因为没有任何断言比较池大小）。
 */
describe('引擎 · 进池判据防回归', () => {
  it('真实数据 12 人全部入池，出池 0 人', async (ctx) => {
    const fn = await loadMatchFn();
    if (!fn) {
      ctx.skip(notReady);
      return;
    }
    const questions = readArr<EngineQuestion>('data/questions.json', 'questions');
    const personas = readArr<EnginePersona>('data/personas.json', 'personas');
    if (!questions.length || !personas.length) {
      ctx.skip('数据为空 → 未跑（不是 PASS）');
      return;
    }
    const theme = {
      themeId: 't-mvp',
      name: 'MVP 默认主题',
      weights: { EE: 1 / 6, ST: 1 / 6, AC: 1 / 6, HX: 1 / 6, RB: 1 / 6, SR: 1 / 6 },
    };
    const out = fn({ questions, answers: fixedAnswers(questions), personas, theme });

    const excluded = out.warnings.filter((w) => w.code === 'persona_out_of_match_pool');
    expect(personas.length, '真实数据应恰为 12 人').toBe(12);
    expect(excluded.length, `出池人数应为 0，实际 ${excluded.length}：${excluded.map((w) => w.message).join('; ')}`).toBe(0);
    expect(out.pool.size, '池大小应等于人物总数 12（restricted=true 不得把人挡在池外）').toBe(12);
    expect(out.ranking.length, 'ranking 条数应等于 12').toBe(12);
  });
});

// ───────────── D. 逐档 σ 断言（防「改数值但集合不变」这类静默错误） ─────────────

/**
 * 主控 00:10 要求补的第 2 类变异：`hidden: 0.15 → 0.22`。
 * 这类改动**入池人数不变、集合不变、主匹配可能也不变**，只有逐档 σ 断言能抓。
 * 后端开发的量纲守卫案例是同一性质：守卫守的是「值合不合法」，不是「行为对不对」。
 */
describe('引擎 · 逐档 σ 取值', () => {
  it('四档 σ 缺省值与档位分布一致，且四档均有真实数据覆盖', async (ctx) => {
    const mod = (await import('../../src/engine/index')) as Record<string, unknown>;
    const table = mod.DEFAULT_SIGMA_BY_RARITY as Record<string, number> | undefined;
    if (!table) {
      ctx.skip('引擎未导出 DEFAULT_SIGMA_BY_RARITY → NOT IMPLEMENTED（不是 PASS）');
      return;
    }

    // 1) 逐档取值断言：数值一改必须 FAIL
    expect(table.common, 'common σ 应为 0.22（06:657 原文值）').toBe(0.22);
    expect(table.rare, 'rare σ 应为 0.18（06:657 原文值）').toBe(0.18);
    expect(table.limited, 'limited σ 应为 0.18（本实现取值，非 06 原文）').toBe(0.18);
    expect(table.hidden, 'hidden σ 应为 0.15（06:657 原文值）').toBe(0.15);

    // 2) 真实数据四档均有覆盖（防某档退化为死分支）
    const personas = readArr<EnginePersona & { rarity?: string }>('data/personas.json', 'personas');
    if (!personas.length) {
      ctx.skip('data/personas.json 为空 → 未跑（不是 PASS）');
      return;
    }
    const counts: Record<string, number> = {};
    for (const p of personas) counts[p.rarity ?? 'undefined'] = (counts[p.rarity ?? 'undefined'] ?? 0) + 1;

    for (const r of ['common', 'rare', 'limited', 'hidden']) {
      expect(counts[r] ?? 0, `稀有度 ${r} 无真实数据覆盖（死分支）`).toBeGreaterThan(0);
    }
    expect(
      Object.keys(counts).filter((k) => !['common', 'rare', 'limited', 'hidden'].includes(k)),
      `出现未定义稀有度：${JSON.stringify(counts)}`,
    ).toEqual([]);
    expect(personas.length, '人物总数应为 12').toBe(12);
  });

  it('σ 只从 rarity 兜底取值时，无人填 sigma 也不得抛异常', async (ctx) => {
    const fn = await loadMatchFn();
    if (!fn) {
      ctx.skip(notReady);
      return;
    }
    const questions = readArr<EngineQuestion>('data/questions.json', 'questions');
    const raw = readArr<EnginePersona & { sigma?: unknown }>('data/personas.json', 'personas');
    if (!questions.length || !raw.length) {
      ctx.skip('数据为空 → 未跑（不是 PASS）');
      return;
    }
    const withSigma = raw.filter((p) => p.sigma !== undefined);
    expect(withSigma.length, '应无人物自填 sigma（全部走 rarity 兜底）').toBe(0);

    const theme = {
      themeId: 't-mvp',
      name: 'MVP 默认主题',
      weights: { EE: 1 / 6, ST: 1 / 6, AC: 1 / 6, HX: 1 / 6, RB: 1 / 6, SR: 1 / 6 },
    };
    expect(() => fn({ questions, answers: fixedAnswers(questions), personas: raw, theme })).not.toThrow();
  });
});

// ───────── E. σ 取用逻辑（端到端）：表对 ≠ 每个人取到的对 ─────────

/**
 * 为什么单独一条：上面的四档断言守的是 **常量表**。
 * 表对了，`sigmaFor()` 里仍可能取错（读错字段 / 拼错档位名 / 传错参数），
 * 这时表断言全绿。这里从 `match()` 的公开输出 `ranking[].contributions[].sigma`
 * 反推每个人物实际用的 σ，验的是取用逻辑本身。
 */
describe('引擎 · σ 取用逻辑（逐人端到端）', () => {
  it('每个人物在结果里实际取到的 σ 等于其 rarity 对应的档位值', async (ctx) => {
    const mod = (await import('../../src/engine/index')) as Record<string, unknown>;
    const fn = await loadMatchFn();
    const table = mod.DEFAULT_SIGMA_BY_RARITY as Record<string, number> | undefined;
    if (!fn || !table) {
      ctx.skip(notReady);
      return;
    }
    const questions = readArr<EngineQuestion>('data/questions.json', 'questions');
    const personas = readArr<EnginePersona & { rarity?: string }>('data/personas.json', 'personas');
    if (!questions.length || !personas.length) {
      ctx.skip('数据为空 → 未跑（不是 PASS）');
      return;
    }
    const rarityOf = new Map(personas.map((p) => [p.id, p.rarity ?? 'common']));
    const theme = {
      themeId: 't-mvp',
      name: 'MVP 默认主题',
      weights: { EE: 1 / 6, ST: 1 / 6, AC: 1 / 6, HX: 1 / 6, RB: 1 / 6, SR: 1 / 6 },
    };
    const out = fn({ questions, answers: fixedAnswers(questions), personas, theme });

    let checked = 0;
    const mismatches: string[] = [];
    for (const r of out.ranking) {
      const rarity = rarityOf.get(r.id) ?? 'common';
      const expected = table[rarity];
      for (const c of r.contributions) {
        checked++;
        // 精确比较：σ 是档位常量，不该出现浮点漂移
        if (Math.abs(c.sigma - expected) > 1e-9) {
          mismatches.push(`${r.id}(${rarity}) ${c.dim}: 实际 ${c.sigma} ≠ 期望 ${expected}`);
        }
      }
    }

    expect(checked, '未检查到任何贡献项，断言失去意义').toBeGreaterThan(0);
    expect(mismatches, `σ 取用逻辑错误：\n${mismatches.slice(0, 8).join('\n')}`).toEqual([]);
  });
});
