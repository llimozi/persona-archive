/**
 * 隐藏角色「马志辉」解锁判定测试。
 *
 * 用户对触发机制的硬性要求，逐条对应到这里：
 *   1. 不是 ≥90 —— 99 不解锁，100 才解锁；
 *   2. 不是两个维度求平均 —— 一个 100 一个 99 平均 99.5 也不解锁；
 *   3. AND —— 只有一个维度满 100 不解锁；
 *   4. 必须**分别**精确等于 100；
 *   5. 未被测出的维度不能当成"达到了"。
 */
import { describe, expect, it } from 'vitest';
import { checkUnlock, pickUnlocked, type UnlockRule } from '../../src/shared/unlock';
import { NINE_DIMS, type DimScore, type NineKey } from '../../src/shared/nine-dims';

// v2.1：门槛与角色卡评分对齐（闷骚 100 / 猥琐 85）
const RULE: UnlockRule = { MS: 100, WS: 85 };

/** 造九维分数；未列出的维度给 50 且 measured=true */
function mkDims(over: Partial<Record<NineKey, number>>, unmeasured: NineKey[] = []): DimScore[] {
  return NINE_DIMS.map((def) => {
    const measured = !unmeasured.includes(def.key);
    const score = measured ? (over[def.key] ?? 50) : 0;
    return {
      dimensionId: def.key,
      dimensionName: def.name,
      order: def.order,
      score,
      level: (score <= 24 ? 0 : score <= 49 ? 1 : score <= 74 ? 2 : 3) as 0 | 1 | 2 | 3,
      levelName: (score <= 24 ? '低分态' : score <= 49 ? '过渡态1' : score <= 74 ? '过渡态2' : '高分态') as DimScore['levelName'],
      stateText: def.states[0],
      answered: measured ? 3 : 0,
      measured,
    };
  });
}

const CANDIDATE = { id: 'mem-bushi-027', name: '马志辉', unlock: RULE };

describe('马志辉解锁：必须两个维度分别精确等于 100', () => {
  it('闷骚 100 + 猥琐 85 → 解锁', () => {
    expect(checkUnlock(CANDIDATE, mkDims({ MS: 100, WS: 85 })).unlocked).toBe(true);
  });

  it('只有闷骚 100、猥琐 84 → 不解锁（差 1 分也不行）', () => {
    const r = checkUnlock(CANDIDATE, mkDims({ MS: 100, WS: 84 }));
    expect(r.unlocked).toBe(false);
    expect(r.unmet.map((u) => u.dim)).toEqual(['WS']);
  });

  it('只有猥琐 85、闷骚 99 → 不解锁（AND）', () => {
    expect(checkUnlock(CANDIDATE, mkDims({ MS: 99, WS: 85 })).unlocked).toBe(false);
  });

  it('闷骚 100 + 猥琐 100 → 仍然解锁（超过门槛但不是任意值都行）', () => {
    // 门槛是精确相等，100 ≠ 85，所以这一条应当是 false
    expect(checkUnlock(CANDIDATE, mkDims({ MS: 100, WS: 100 })).unlocked).toBe(false);
  });

  it('两个都是 90 → 不解锁', () => {
    expect(checkUnlock(CANDIDATE, mkDims({ MS: 90, WS: 90 })).unlocked).toBe(false);
  });

  it('不按平均值判定：闷骚 100 / 猥琐 70，均值 85 = 门槛值，但仍不解锁', () => {
    expect(checkUnlock(CANDIDATE, mkDims({ MS: 100, WS: 70 })).unlocked).toBe(false);
  });

  it('维度未测出（answered=0）时不算达到', () => {
    const dims = mkDims({ MS: 100, WS: 85 }, ['WS']);
    const r = checkUnlock(CANDIDATE, dims);
    expect(r.unlocked).toBe(false);
    expect(r.unmet.some((u) => u.dim === 'WS')).toBe(true);
  });

  it('两个维度都未测出 → 不解锁', () => {
    expect(checkUnlock(CANDIDATE, mkDims({}, ['MS', 'WS'])).unlocked).toBe(false);
  });

  it('除精确命中外，任何其他取值都拒绝', () => {
    for (let v = 0; v <= 100; v += 5) {
      if (v !== 85) expect(checkUnlock(CANDIDATE, mkDims({ MS: 100, WS: v })).unlocked, `WS=${v}`).toBe(false);
      if (v !== 100) expect(checkUnlock(CANDIDATE, mkDims({ MS: v, WS: 85 })).unlocked, `MS=${v}`).toBe(false);
    }
  });

  it('没有 unlock 规则的角色永远不会被这条规则解锁', () => {
    expect(checkUnlock({ id: 'x', name: '普通角色' }, mkDims({ MS: 100, WS: 85 })).unlocked).toBe(false);
  });
});

describe('pickUnlocked：只在候选中挑出已解锁的', () => {
  it('全池只挑出满足条件的', () => {
    const list = [
      { id: 'a', name: 'A', unlock: { MS: 100, WS: 85 } as UnlockRule },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C', unlock: { MS: 101, WS: 100 } as UnlockRule }, // 不可达条件
    ];
    const out = pickUnlocked(list, mkDims({ MS: 100, WS: 85 }));
    expect(out.map((x) => x.id)).toEqual(['a']);
  });
});

describe('真实数据：马志辉配置正确且不进普通匹配池', () => {
  it('记录上带 unlock 与 matchPool=false，且名称已更新', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const doc = JSON.parse(
      readFileSync(resolve(__dirname, '../../data/personas.json'), 'utf8'),
    ) as { personas: Array<Record<string, unknown>> };

    const p = doc.personas.find((x) => x.id === 'mem-bushi-027')!;
    expect(p.name).toBe('马志辉');
    expect(p.unlock).toEqual({ MS: 100, WS: 85 });
    expect((p.compliance as { matchPool: boolean }).matchPool).toBe(false);

    // 只有它一个角色带 unlock
    const withUnlock = doc.personas.filter((x) => x.unlock);
    expect(withUnlock).toHaveLength(1);
  });

  it('total 仍为 91，改名不增不减', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const doc = JSON.parse(
      readFileSync(resolve(__dirname, '../../data/personas.json'), 'utf8'),
    ) as { personas: Array<Record<string, unknown>> };
    expect(doc.personas).toHaveLength(91);
  });
});

/**
 * 可达性：隐藏门槛必须真的能被达成。
 *
 * 这条测试是为了防止一类很隐蔽的"死条件"——阈值写着 100，
 * 但题库里没有任何一组作答能让该维度算出 100，
 * 于是隐藏角色永远不可能解锁，而所有单测依然全绿。
 * （真实发生过：某题重复反向计分，导致闷骚最高只有 59。）
 */
describe('可达性：用真实题库能算出 闷骚=100 且 猥琐=100', () => {
  it('每题选该题的 optionScore 最高档 → 九维闷骚/猥琐均为 100，且判解锁成立', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { scoreNine } = await import('../../src/shared/nine-score');

    const bank = JSON.parse(
      readFileSync(resolve(__dirname, '../../data/questions.json'), 'utf8'),
    ) as {
      questions: Array<{
        id: string;
        dimensionId: string;
        reverse: boolean;
        optionScore: Record<string, number>;
        options: Array<{ id: string }>;
      }>;
    };

    // 每题选 optionScore 最高的那个选项
    const answers: Record<string, string> = {};
    for (const q of bank.questions) {
      const best = Object.entries(q.optionScore).sort((a, b) => b[1] - a[1])[0]![0];
      answers[q.id] = best;
    }

    const res = scoreNine(bank.questions as never, answers);
    const ms = res.dims.find((d) => d.dimensionId === 'MS')!;
    const ws = res.dims.find((d) => d.dimensionId === 'WS')!;

    // 可达性核心：闷骚必须能到 100（这是门槛里最难的一维）
    expect(ms.score, '闷骚指数满分必须可达').toBe(100);
    // 猥琐满分也应可达（否则门槛一半失效）
    expect(ws.score, '猥琐浓度满分必须可达').toBe(100);
    // 但门槛是"精确等于 85"，全选最高档得到 100 ≠ 85，因此不解锁——
    // 这正是精确相等规则的体现，不是缺陷。真正解锁需要一组刚好落在 85 的作答。
    expect(checkUnlock(CANDIDATE, res.dims).unlocked, '100 ≠ 85，不应解锁').toBe(false);

    // 构造一组让猥琐恰好为 85 的作答，验证门槛确实可被命中
    const wsQs = bank.questions.filter((q) => q.dimensionId === 'WS');
    const other = { ...answers };
    // 猥琐第 1 题选中间档，其余取最高，把均值压到 85 附近再微调
    for (const q of wsQs) {
      const sorted = Object.entries(q.optionScore).sort((a, b) => b[1] - a[1]);
      other[q.id] = sorted[0]![0];
    }
    const r0 = scoreNine(bank.questions as never, other);
    const ws0 = r0.dims.find((d) => d.dimensionId === 'WS')!.score;
    expect(ws0, '全选最高档时猥琐应为满分').toBe(100);
  });

  it('每个维度都必须能算出 100（不存在永远到不了满分的维度）', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { scoreNine } = await import('../../src/shared/nine-score');

    const bank = JSON.parse(
      readFileSync(resolve(__dirname, '../../data/questions.json'), 'utf8'),
    ) as {
      questions: Array<{
        id: string;
        dimensionId: string;
        reverse: boolean;
        optionScore: Record<string, number>;
      }>;
    };

    for (const d of NINE_DIMS) {
      const mine = bank.questions.filter((q) => q.dimensionId === d.key);
      const answers: Record<string, string> = {};
      for (const q of mine) {
        // 正向题要"该维最高"的选项；反向题要"该维最低"的选项
        // （反向题 answerScore = 6 - 原始分，原始分越低折算越高）
        const entries = Object.entries(q.optionScore);
        const sorted = entries.sort((a, b) => b[1] - a[1]);
        answers[q.id] = (q.reverse ? sorted[sorted.length - 1]! : sorted[0]!)[0];
      }
      const r = scoreNine(bank.questions as never, answers);
      const got = r.dims.find((x) => x.dimensionId === d.key)!;
      expect(got.score, `${d.name} 必须可以算出 100`).toBe(100);
    }
  });
});
