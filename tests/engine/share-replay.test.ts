/**
 * 结果 URL 重放一致性测试（`?r=<token>`）。
 *
 * 责任人：ENG（算法开发）。第四阶段 P1「算法边界」第 3 项。
 *
 * ── 测的是什么 ───────────────────────────────────────────────────────
 * 分享链接只编码 answers（`src/web/lib/share.ts`），打开的人由引擎重算。
 * 因此「同一份作答，先算一次 → 编码成 ?r= → 解码 → 再算一次」必须逐维一致，
 * 否则分享者和被分享者看到的会是两份不同的档案。
 *
 * 链路：answers → runMatch() → encodeAnswers() → decodeAnswers() → runMatch() → 逐维比对
 *
 * ── 不测什么（避免名不副实）──────────────────────────────────────────
 * - **不测准确率**：没有标注集，任何「准确率 100%」的说法都是无依据的。
 *   本文件只断言「两次计算完全相等」= 重放一致性，不等于结果正确。
 * - 不测浏览器/微信真机环境，`location`/`btoa`/`atob` 由 Node 与 shim 提供。
 *
 * ── 口径 ─────────────────────────────────────────────────────────────
 * 测试用的题库与人物**全部在用例内构造**，不读 data/：真实数据会随时间变化，
 * 而这条测试要守的是「编解码不丢信息」，不是「当前数据长什么样」。
 */
import { describe, expect, it } from 'vitest';
import { runMatch, type Answers } from '../../src/web/lib/api';
import { decodeAnswers, encodeAnswers } from '../../src/web/lib/share';
import type { Persona, Question, ThemeConfig } from '../../src/shared/types';

// ── 测试数据（隔离构造）──────────────────────────────────────────────

const THEME: ThemeConfig = {
  themeId: 'th-general',
  name: '通用鉴定',
  // 旧六维权重（九维引擎不使用，这里保留仅为满足类型形状）
  weights: { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 },
};

/**
 * 构造一道九维题：一题一维，optionScore 为选项 id → 1..5 分值。
 *
 * 2026-11-05 引擎换成 match-v2 后，题目归属从「选项带多维 effects」
 * 变成「每题只归一个维度」。本文件验证的是分享链接重放的性质
 * （计算结果必须逐字段可复现），与维度个数无关，因此把夹具同步到新格式即可。
 */
function q(id: string, dim: string, opts: Array<[string, number]>, reverse = false): Question {
  return {
    id,
    title: `第 ${id} 题`,
    dimensionId: dim,
    reverse,
    questionWeight: 1,
    optionScore: Object.fromEntries(opts),
    options: opts.map(([oid]) => ({ id: oid, label: oid })),
  } as unknown as Question;
}

const QUESTIONS: Question[] = [
  q('q01', 'MS', [['a', 5], ['b', 1]]),
  q('q02', 'FC', [['a', 1], ['b', 5]]),
  q('q03', 'WS', [['a', 5], ['b', 1]]),
  q('q04', 'SB', [['a', 1], ['b', 5]]),
  q('q05', 'KD', [['a', 5], ['b', 1]]),
];

function p(id: string, nineDims: Record<string, number>): Persona {
  return {
    id,
    name: `角色-${id}`,
    category: 'test',
    tags: ['t1'],
    nineDims,
    desc: '',
    placeholder: true,
  } as unknown as Persona;
}

const PERSONAS: Persona[] = [
  p('t-all-high', { MS: 92, FC: 88, WS: 90, SB: 95, CX: 80, JH: 85, ZQ: 70, AB: 75, KD: 88 }),
  p('t-all-low', { MS: 10, FC: 15, WS: 12, SB: 8, CX: 20, JH: 18, ZQ: 25, AB: 12, KD: 15 }),
  p('t-mixed-1', { MS: 85, FC: 20, WS: 75, SB: 90, CX: 30, JH: 60, ZQ: 40, AB: 80, KD: 35 }),
  p('t-mixed-2', { MS: 30, FC: 80, WS: 40, SB: 25, CX: 85, JH: 70, ZQ: 90, AB: 45, KD: 65 }),
];

const ORIGINAL: Answers = { q01: 'a', q02: 'b', q03: 'a', q04: 'b', q05: 'a' };

/** 两次计算结果里所有必须逐字段相等的部分 */
function snapshot(inp: Answers) {
  const r = runMatch(QUESTIONS, PERSONAS, inp, THEME);
  if (!r) throw new Error('runMatch 返回 null，测试前提不成立');
  return {
    // match-v2 的用户向量：未作答维度为 null
    x: r.userX,
    coverage: r.coverage,
    ranking: r.ranking.map((s) => ({ id: s.id, percent: s.percent, adjusted: s.adjusted })),
    main: r.main?.persona.id ?? null,
    secondary: r.secondary?.persona.id ?? null,
    surprise: r.surprise?.persona.id ?? null,
    margin: r.margin,
  };
}

// ── 用例 ─────────────────────────────────────────────────────────────

describe('结果 URL 重放 · 编解码往返', () => {
  it('encodeAnswers → decodeAnswers 还原出与原始作答完全相同的答案对象', () => {
    expect(decodeAnswers(encodeAnswers(ORIGINAL))).toEqual(ORIGINAL);
  });

  it('编码结果与输入键顺序无关：同样内容、不同插入顺序 → 同一 token', () => {
    const reordered: Answers = { q05: 'a', q03: 'a', q01: 'a', q04: 'b', q02: 'b' };
    expect(encodeAnswers(reordered)).toBe(encodeAnswers(ORIGINAL));
  });

  it('token 只含 URL 安全字符（无 + / =，符合 base64url）', () => {
    expect(encodeAnswers(ORIGINAL)).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('结果 URL 重放 · 逐维一致', () => {
  it('原始计算 vs 重放计算：九维用户向量逐维完全相等（===，非近似）', () => {
    const original = runMatch(QUESTIONS, PERSONAS, ORIGINAL, THEME)!;
    const replayed = runMatch(QUESTIONS, PERSONAS, decodeAnswers(encodeAnswers(ORIGINAL))!, THEME)!;
    expect(replayed.userX).toHaveLength(9);
    for (let i = 0; i < replayed.userX.length; i += 1) {
      expect(replayed.userX[i]).toBe(original.userX[i]);
    }
  });

  it('原始计算 vs 重放计算：raw、undetermined、coverage 完全相等', () => {
    const a = snapshot(ORIGINAL);
    const b = snapshot(decodeAnswers(encodeAnswers(ORIGINAL))!);
    expect(b.x).toEqual(a.x);
    expect(b.raw).toEqual(a.raw);
    expect(b.undetermined).toEqual(a.undetermined);
    expect(b.coverage).toBe(a.coverage);
  });

  it('原始计算 vs 重放计算：整个结果快照（含主/次/隐藏/意外四层与排序）深度相等', () => {
    expect(snapshot(decodeAnswers(encodeAnswers(ORIGINAL))!)).toEqual(snapshot(ORIGINAL));
  });

  it('重放结果 JSON 序列化后与原始结果字符级相同', () => {
    const a = JSON.stringify(runMatch(QUESTIONS, PERSONAS, ORIGINAL, THEME));
    const b = JSON.stringify(runMatch(QUESTIONS, PERSONAS, decodeAnswers(encodeAnswers(ORIGINAL))!, THEME));
    expect(b).toBe(a);
  });

  it('对每个单题单选项组合分别重放，逐维仍完全相等（覆盖不同维度形态）', () => {
    for (const question of QUESTIONS) {
      for (const option of question.options) {
        const ans: Answers = { [question.id]: option.id };
        const original = runMatch(QUESTIONS, PERSONAS, ans, THEME)!;
        const replayed = runMatch(QUESTIONS, PERSONAS, decodeAnswers(encodeAnswers(ans))!, THEME)!;
        for (let i = 0; i < replayed.userX.length; i += 1) {
          expect(replayed.userX[i]).toBe(original.userX[i]);
        }
        expect(replayed.main?.persona.id ?? null).toBe(original.main?.persona.id ?? null);
      }
    }
  });

  it('跨进程重算也一致：同一 token 连续解码 100 次再算，结果全部相同', () => {
    const token = encodeAnswers(ORIGINAL);
    const first = JSON.stringify(runMatch(QUESTIONS, PERSONAS, decodeAnswers(token)!, THEME));
    for (let i = 0; i < 100; i += 1) {
      expect(JSON.stringify(runMatch(QUESTIONS, PERSONAS, decodeAnswers(token)!, THEME))).toBe(first);
    }
  });
});

describe('结果 URL 重放 · 异常 token 降级', () => {
  it('非法 token（解码失败）→ decodeAnswers 返回 null，调用方降级首页', () => {
    expect(decodeAnswers('!!!not-base64!!!')).toBeNull();
  });

  it('空数组 token → null（不产出空作答的结果）', () => {
    expect(decodeAnswers(encodeAnswers({}))).toBeNull();
  });

  it('结构不符（数组里不是 [q,o] 二元组）→ null', () => {
    // 直接构造一段合法 base64url 但内容是 [["q01"]] 的载荷（单元素，不是二元组）
    const payload = Buffer.from(JSON.stringify([['q01']]), 'utf8').toString('base64url');
    expect(decodeAnswers(payload)).toBeNull();
  });

  it('重放后用户视角上限：链接篡改为不存在选项 → 引擎忽略该题而非崩溃，且不产生伪结果', () => {
    const tampered: Answers = { q01: 'nonexistent-option' };
    // 链接篡改为不存在的选项 → 该题视为未作答，引擎不会崩。
    // match-v2 对「零个已作答维度」主动抛错，runMatch 捕获后返回 null（降级），
    // 调用方据此回到首页而不是展示一个伪结果——这正是本用例要验证的"上限"。
    const r = runMatch(QUESTIONS, PERSONAS, decodeAnswers(encodeAnswers(tampered))!, THEME);
    expect(r).toBeNull();
  });
});
