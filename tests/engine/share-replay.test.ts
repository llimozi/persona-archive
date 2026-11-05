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
  // 06 §9.1 设计值，非实测
  weights: { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 },
};

function q(id: string, opts: Array<[string, Record<string, number>]>): Question {
  return { id, title: `第 ${id} 题`, options: opts.map(([oid, effects]) => ({ id: oid, label: oid, effects })) };
}

const QUESTIONS: Question[] = [
  q('q01', [
    ['a', { EE: 1, HX: 1 }],
    ['b', { EE: -1, HX: -1 }],
  ]),
  q('q02', [
    ['a', { ST: 1, RB: 1 }],
    ['b', { ST: -1, RB: -1 }],
  ]),
  q('q03', [
    ['a', { AC: 1, SR: 1 }],
    ['b', { AC: -1, SR: -1 }],
  ]),
  q('q04', [
    ['a', { EE: 0.5, ST: 0.5, AC: 0.5 }],
    ['b', { HX: -0.5, RB: -0.5, SR: -0.5 }],
  ]),
  q('q05', [
    ['a', { HX: 1 }],
    ['b', { SR: 1 }],
  ]),
];

function p(id: string, dims: Record<string, number>): Persona {
  return {
    id,
    name: `角色-${id}`,
    category: 'test',
    tags: ['t1'],
    dims: dims as Persona['dims'],
    desc: '',
    placeholder: true,
  };
}

const PERSONAS: Persona[] = [
  p('t-all-high', { EE: 92, ST: 88, AC: 90, HX: 95, RB: 80, SR: 85 }),
  p('t-all-low', { EE: 10, ST: 15, AC: 12, HX: 8, RB: 20, SR: 18 }),
  p('t-mixed-1', { EE: 85, ST: 20, AC: 75, HX: 90, RB: 30, SR: 60 }),
  p('t-mixed-2', { EE: 30, ST: 80, AC: 40, HX: 25, RB: 85, SR: 70 }),
];

const ORIGINAL: Answers = { q01: 'a', q02: 'b', q03: 'a', q04: 'b', q05: 'a' };

/** 两次计算结果里所有必须逐字段相等的部分 */
function snapshot(inp: Answers) {
  const r = runMatch(QUESTIONS, PERSONAS, inp, THEME);
  if (!r) throw new Error('runMatch 返回 null，测试前提不成立');
  return {
    x: r.user.x,
    raw: r.user.raw,
    undetermined: r.user.undetermined,
    coverage: r.user.coverage,
    ranking: r.ranking.map((s) => ({ id: s.id, score: s.score, adjusted: s.adjusted, percent: s.percent })),
    main: r.main?.persona.id ?? null,
    secondary: r.secondary?.persona.id ?? null,
    hidden: r.hidden?.persona.id ?? null,
    surprise: r.surprise?.persona.id ?? null,
    mainPercent: r.mainPercent,
    engineVersion: r.engineVersion,
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
  it('原始计算 vs 重放计算：六维 x 逐维完全相等（===，非近似）', () => {
    const original = runMatch(QUESTIONS, PERSONAS, ORIGINAL, THEME)!;
    const replayed = runMatch(QUESTIONS, PERSONAS, decodeAnswers(encodeAnswers(ORIGINAL))!, THEME)!;
    for (const k of ['EE', 'ST', 'AC', 'HX', 'RB', 'SR'] as const) {
      expect(replayed.user.x[k]).toBe(original.user.x[k]);
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
        for (const k of ['EE', 'ST', 'AC', 'HX', 'RB', 'SR'] as const) {
          expect(replayed.user.x[k]).toBe(original.user.x[k]);
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
    const r = runMatch(QUESTIONS, PERSONAS, decodeAnswers(encodeAnswers(tampered))!, THEME)!;
    expect(r.user.undetermined).toHaveLength(6); // 有效题目为 0 → 六维全未覆盖
    expect(r.main).toBeNull(); // 没有维度可比 → 不产出主匹配
    expect(r.warnings.some((w) => w.code === 'answer_unknown_option')).toBe(true);
  });
});
