/**
 * 意外组合层（06 §6.5 surprise）边界测试 + 引擎异常输入边界。
 *
 * 责任人：ENG（算法开发）。第四阶段 P1「算法边界」交付。
 *
 * ── 为什么要有这个文件 ───────────────────────────────────────────────
 * 真实池 12 人 < 设计门槛 40（06 §10.1），`surpriseEnabled` 恒为 false，
 * 意外组合层的抽取代码**在真实数据下从未被执行过**。本文件用**隔离构造数据**
 * （不读 data/、不依赖网络与文件）把该分支至少执行一次，并断言其行为。
 *
 * ── 断言命名纪律（主控 2026-11-05 要求）────────────────────────────────
 * 每条 it() 的名字必须等于它实际检查的内容。凡标「已实现」的断言，都在**改好之后的代码**上跑；
 * 改代码前先跑一遍确认会红（见 ENGINE-VERIFICATION.md §P1 的红-绿记录）。
 *
 * ── 口径 ─────────────────────────────────────────────────────────────
 * 池门槛 40 / 下限 0.55 / 差 0.12 全部是 06 与 05 的**设计值**，不是实测值。
 * 本文件不做任何阈值实测，只验证「规则被正确执行」。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_SIGMA_BY_RARITY, match, scoreAnswers } from '../../src/engine/match';
import type {
  EngineAnswer,
  EnginePersona,
  EngineQuestion,
  EngineTheme,
  MatchInput,
} from '../../src/engine/types';

// ── 隔离测试数据（全部在函数内构造，不读 data/）──────────────────────

const ZERO_WEIGHTS: EngineTheme = {
  themeId: 'th-test',
  name: '测试主题',
  weights: { EE: 1 / 6, ST: 1 / 6, AC: 1 / 6, HX: 1 / 6, RB: 1 / 6, SR: 1 / 6 },
};

/** 六维全 0.5 的人物：用户 x 全 0.5 时 g=1；用户 x 全 1 时 g=exp(-0.125/σ²) 极小 */
function persona(id: string, category: string, rarity: string, dims: number | Record<string, number> = 0.5): EnginePersona {
  const d = typeof dims === 'number' ? { EE: dims, ST: dims, AC: dims, HX: dims, RB: dims, SR: dims } : dims;
  return { id, name: `角色-${id}`, category, dims: d, rarity: rarity as EnginePersona['rarity'], tags: [] };
}

/** 两题：Q1 把六维全部推到 1（x=1），Q2 把六维全部推到 0（x=0）。选哪题即决定全表取向。 */
const QUESTIONS: EngineQuestion[] = [
  {
    id: 'q1',
    title: '全高',
    options: [
      { id: 'all-high', effects: { EE: 1, ST: 1, AC: 1, HX: 1, RB: 1, SR: 1 } },
      { id: 'all-mid', effects: { EE: 0, ST: 0, AC: 0, HX: 0, RB: 0, SR: 0 } },
    ],
  },
  {
    id: 'q2',
    title: '全低',
    options: [{ id: 'all-low', effects: { EE: -1, ST: -1, AC: -1, HX: -1, RB: -1, SR: -1 } }],
  },
];

const ANSWERS_HIGH: EngineAnswer[] = [{ questionId: 'q1', optionId: 'all-high' }];

function input(over: Partial<MatchInput> & { personas: readonly EnginePersona[] }): MatchInput {
  return {
    questions: QUESTIONS,
    answers: ANSWERS_HIGH,
    theme: ZERO_WEIGHTS,
    ...over,
  } as MatchInput;
}

/**
 * 构造 n 个「用户 x=1 时得高 M'」的池：`anchor` 是与用户完全一致的人物（M'≈1，排第一），
 * 其余为 M'≈0 的填充卡。用于把池撑过 40 门槛，让主路径真正启用。
 */
function bigPool(n: number, extras: EnginePersona[]): EnginePersona[] {
  const anchor = persona('p-anchor', 'cat-main', 'common', 1);
  const fillers: EnginePersona[] = [];
  for (let i = 0; i < Math.max(0, n - 1 - extras.length); i += 1) {
    fillers.push(persona(`p-fill-${String(i).padStart(2, '0')}`, 'cat-fill', 'common', 0));
  }
  return [anchor, ...fillers, ...extras];
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ══════════════════════════════════════════════════════════════════
// 1. 层开关：池门槛（06 §10.1 `06:626` / 05 §2.1 A3，设计值 40）
// ══════════════════════════════════════════════════════════════════

describe('意外组合层 · 池门槛开关', () => {
  it('池 12 人（真实池规模）→ surpriseEnabled=false 且 surprise=null，并给 surprise_disabled_small_pool 告警', () => {
    const personas = Array.from({ length: 12 }, (_, i) => persona(`p${i}`, `cat-${i}`, 'common'));
    const out = match(input({ personas }));
    expect(out.pool.size).toBe(12);
    expect(out.pool.surpriseEnabled).toBe(false);
    expect(out.surprise).toBeNull();
    expect(out.warnings.some((w) => w.code === 'surprise_disabled_small_pool')).toBe(true);
  });

  it('池 39 人（门槛 -1）→ 仍关闭', () => {
    const out = match(input({ personas: bigPool(39, []) }));
    expect(out.pool.size).toBe(39);
    expect(out.pool.surpriseEnabled).toBe(false);
    expect(out.surprise).toBeNull();
  });

  it('兜底分支不得返回主匹配本人（主匹配即 limited/hidden 时）', () => {
    // 构造：主匹配 anchor 本身是 hidden、六维与用户完全一致（必然排第一），
    // 填充卡也全在同一个分类（A 分支要求"不同分类"，必然无命中）→ 只能走 B 兜底。
    // 若兜底扫描全表时不排除 main，就会返回 surprise === main，与「意外」定义矛盾。
    const anchor = persona('p-anchor', 'cat-main', 'hidden', 1);
    const fillers: EnginePersona[] = [];
    for (let i = 0; i < 39; i += 1) {
      fillers.push(persona(`p-same-${String(i).padStart(2, '0')}`, 'cat-main', 'hidden', 0));
    }
    const out = match(input({ personas: [anchor, ...fillers] }));
    expect(out.pool.surpriseEnabled).toBe(true);
    expect(out.surprise).not.toBeNull();
    expect(out.surprise!.persona.id, '意外组合不得等于主匹配本人').not.toBe(out.main!.persona.id);
  });

  it('池 40 人（门槛边界，含等号）→ surpriseEnabled=true，层被启用', () => {
    const out = match(input({ personas: bigPool(40, []) }));
    expect(out.pool.size).toBe(40);
    expect(out.pool.surpriseEnabled).toBe(true);
    expect(out.warnings.some((w) => w.code === 'surprise_disabled_small_pool')).toBe(false);
  });

  it('门槛判定用「进池后人数」：40 人里有 1 人 matchPool=false → 有效池 39 → 关闭', () => {
    const base = bigPool(40, []);
    const withRestricted = base.map((p, i) =>
      i === base.length - 1
        ? ({ ...p, compliance: { matchPool: false } } as unknown as EnginePersona)
        : p,
    );
    const out = match(input({ personas: withRestricted }));
    expect(out.pool.size).toBe(39);
    expect(out.pool.surpriseEnabled).toBe(false);
  });

  it('resolvedConfig.surprisePoolThreshold 默认 40，且可被 config 覆盖（本测试靠它把分支跑起来）', () => {
    expect(DEFAULT_CONFIG.surprisePoolThreshold).toBe(40);
    const out = match({
      ...input({ personas: bigPool(3, []) }),
      config: { surprisePoolThreshold: 3 },
    });
    expect(out.resolvedConfig.surprisePoolThreshold).toBe(3);
    expect(out.pool.surpriseEnabled).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════
// 2. 触发路径（门槛已过的前提下，06 §6.5 A 主规则）
// ══════════════════════════════════════════════════════════════════

describe('意外组合层 · 触发路径（A 主规则命中）', () => {
  it('不同分类 + 无 peer + M\'≥0.55 + 位次差≥2 → 命中，且选中人与位次都符合预期', () => {
    // 前两名都是 cat-main（同分类），第三名才是 cat-other → 位次差恰好 2，满足边界
    const personas = bigPool(40, [
      persona('p-second', 'cat-main', 'common', 1),
      persona('p-other', 'cat-other', 'common', 1),
    ]);
    const out = match(input({ personas }));
    expect(out.pool.surpriseEnabled).toBe(true);
    expect(out.main?.persona.id).toBe('p-anchor');
    expect(out.surprise?.persona.id).toBe('p-other');
    const idx = out.ranking.findIndex((p) => p.id === 'p-other');
    expect(idx).toBeGreaterThanOrEqual(2); // ≥2 位差这一条被真的检查了
    expect(out.surprise?.note).toContain('意外组合');
    expect(out.explanation.surpriseSummary).toContain('意外组合');
  });

  it('位次差 = 1（不同分类的人排在 L[1]）→ 不取它，改用更靠后的合格者', () => {
    const personas = bigPool(40, [
      persona('p-near', 'cat-other', 'common', 1), // 排 L[1]，位次差 1，被 ≥2 位约束排除
      persona('p-far', 'cat-other2', 'common', 1), // 排 L[2]，合格
    ]);
    const out = match(input({ personas }));
    expect(out.ranking[1]?.id).toBe('p-near');
    expect(out.surprise?.persona.id).toBe('p-far');
  });

  it('候选与 main 有 peer 关系 → 跳过该人，取下一个合格的', () => {
    const personas = bigPool(40, [
      persona('p-peer', 'cat-other', 'common', 1),
      persona('p-ok', 'cat-other2', 'common', 1),
    ]);
    const out = match({
      ...input({ personas }),
      relations: [{ a: 'p-anchor', b: 'p-peer', kind: 'peer' }],
    });
    expect(out.ranking[1]?.id).toBe('p-peer');
    expect(out.surprise?.persona.id).toBe('p-ok');
  });
});

// ══════════════════════════════════════════════════════════════════
// 3. 不触发路径（A 无命中 → B 兜底 → C 不输出）
// ══════════════════════════════════════════════════════════════════

describe('意外组合层 · 不触发路径与兜底', () => {
  it('全池与 main 同分类 → A 无命中 → surprise=null', () => {
    const personas = Array.from({ length: 40 }, (_, i) => persona(`p${String(i).padStart(2, '0')}`, 'cat-only', 'common'));
    const out = match(input({ personas }));
    expect(out.pool.surpriseEnabled).toBe(true);
    expect(out.surprise).toBeNull();
    // 全同分类时任何人都不合格：A 分支真的跑过，而不是被门槛短路
    expect(out.ranking.every((p) => p.category === 'cat-only')).toBe(true);
  });

  it('不同分类者 M\'<0.55（设计下限）→ A 无命中 → surprise=null', () => {
    // 用户 x=1；fill 人物 dims 全 0、σ 默认 0.22 → g=exp(-1/(2*0.22²))≈3e-5，远低于 0.55
    const personas = Array.from({ length: 40 }, (_, i) => persona(`p${String(i).padStart(2, '0')}`, `cat-${i}`, 'common', 0));
    const out = match(input({ personas }));
    expect(out.pool.surpriseEnabled).toBe(true);
    expect(out.ranking.every((p) => p.adjusted < 0.55)).toBe(true); // 前提成立
    expect(out.surprise).toBeNull();
  });

  it('A 无命中但池中有 rarity=limited → 走兜底分支，取第一个 limited', () => {
    const personas = Array.from({ length: 40 }, (_, i) => persona(`p${String(i).padStart(2, '0')}`, 'cat-only', 'common'));
    personas[5] = persona('p-limited', 'cat-only', 'limited', 0.5);
    const out = match(input({ personas }));
    expect(out.surprise?.persona.id).toBe('p-limited');
    expect(out.surprise?.note).toContain('兜底');
    expect(out.surprise?.note).toContain('limited');
  });

  it('兜底分支取的是「排序后最靠前」的 limited/hidden，不是「数组里先出现」的那个', () => {
    // 关键：数组中 hidden 在前（下标 3）、limited 在后（下标 9），但 limited 的默认 σ=0.18 比
    // hidden 的 σ=0.15 宽容，同一 x 下 g 更大 → limited 排序更靠前。若实现写成「数组第一个」，
    // 这里必然拿到 p-hidden-first 而失败。
    const personas = Array.from({ length: 40 }, (_, i) => persona(`p${String(i).padStart(2, '0')}`, 'cat-only', 'common', 0));
    personas[0] = persona('p-anchor', 'cat-main', 'common', 1);
    personas[3] = persona('p-hidden-first', 'cat-only', 'hidden', 0.5); // 数组在前，排序在后
    personas[9] = persona('p-limited-later', 'cat-only', 'limited', 0.5); // 数组在后，排序在前
    const out = match(input({ personas }));
    const limitedIdx = out.ranking.findIndex((p) => p.id === 'p-limited-later');
    const hiddenIdx = out.ranking.findIndex((p) => p.id === 'p-hidden-first');
    expect(limitedIdx).toBeLessThan(hiddenIdx); // 前提：排序确实与数组顺序相反
    expect(out.surprise?.persona.id).toBe('p-limited-later');
    expect(out.surprise?.note).toContain('limited');
  });

  it('池 ≥40 且 A 与 B 都无命中（无不同分类、无 limited/hidden）→ surprise=null，无兜底误报', () => {
    const personas = Array.from({ length: 40 }, (_, i) => persona(`p${String(i).padStart(2, '0')}`, 'cat-only', 'common'));
    const out = match(input({ personas }));
    expect(out.surprise).toBeNull();
    expect(out.explanation.surpriseSummary).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// 4. 空数据与异常输入（不崩、不产出伪造结果）
// ══════════════════════════════════════════════════════════════════

describe('异常输入 · 空数据', () => {
  it('personas 为空数组 → main/secondary/hidden/surprise 全 null，六维分照常产出，给 pool_empty', () => {
    const out = match(input({ personas: [] }));
    expect(out.pool.size).toBe(0);
    expect(out.main).toBeNull();
    expect(out.secondary).toBeNull();
    expect(out.hidden).toBeNull();
    expect(out.surprise).toBeNull();
    expect(out.mainPercent).toBeNull();
    expect(out.ranking).toEqual([]);
    expect(out.warnings.some((w) => w.code === 'pool_empty')).toBe(true);
    // 空池也要给出六维分，否则前端无法展示「你答了但没有可匹配人物」
    expect(out.user.x.EE).toBe(1);
  });

  it('answers 为空 → 六维全部 undetermined、x=0.5，给 no_answers，且不产出主匹配以外的伪造结果', () => {
    const out = match(input({ personas: [persona('p1', 'cat-a', 'common')], answers: [] }));
    expect(out.user.undetermined).toEqual(['EE', 'ST', 'AC', 'HX', 'RB', 'SR']);
    expect(out.warnings.some((w) => w.code === 'no_answers')).toBe(true);
    // undetermined 维度不参与人物加权 → 每人都被跳过 → 无主匹配
    expect(out.main).toBeNull();
  });

  it('questions 为空 → answerCoverage=0，作答全部作废为 unknown_question', () => {
    const out = match(input({ personas: [persona('p1', 'cat-a', 'common')], questions: [] }));
    expect(out.user.answerCoverage).toBe(0);
    expect(out.warnings.some((w) => w.code === 'answer_unknown_question')).toBe(true);
  });

  it('人物无任何 dims → 报 persona_no_dims，不进 ranking', () => {
    const p = { id: 'p-empty', name: '空维人物', category: 'c', dims: {} } as EnginePersona;
    const out = match(input({ personas: [p] }));
    expect(out.ranking).toHaveLength(0);
    expect(out.warnings.some((w) => w.code === 'persona_no_dims')).toBe(true);
    expect(out.main).toBeNull();
  });
});

describe('异常输入 · 缺题 / 缺选项 / 非法 optionId / 重复作答', () => {
  it('作答引用不存在的题目 → answer_unknown_question，该条不计分', () => {
    const out = match(
      input({
        personas: [persona('p1', 'cat-a', 'common')],
        answers: [{ questionId: 'q-not-exist', optionId: 'all-high' }],
      }),
    );
    expect(out.warnings.some((w) => w.code === 'answer_unknown_question')).toBe(true);
    expect(out.user.perQuestion).toEqual([]);
  });

  it('作答引用该题不存在的选项（非法 optionId）→ answer_unknown_option，该题不计分', () => {
    const out = match(
      input({
        personas: [persona('p1', 'cat-a', 'common')],
        answers: [{ questionId: 'q1', optionId: 'all-low' }], // all-low 属于 q2，不属于 q1
      }),
    );
    expect(out.warnings.some((w) => w.code === 'answer_unknown_option')).toBe(true);
    expect(out.user.perQuestion).toEqual([]);
  });

  it('选项 effects 全为 0 → 视为该题未覆盖任何维度，六维仍 undetermined', () => {
    const out = match(input({ personas: [persona('p1', 'cat-a', 'common')], answers: [{ questionId: 'q1', optionId: 'all-mid' }] }));
    expect(out.user.perQuestion).toHaveLength(1); // 题被消费了
    expect(out.user.undetermined).toHaveLength(6); // 但没有覆盖任何维度
  });

  it('同一题重复作答 → answer_duplicate，只采用第一次，分值不累加两次', () => {
    const dup = match(
      input({
        personas: [persona('p1', 'cat-a', 'common')],
        answers: [
          { questionId: 'q1', optionId: 'all-high' },
          { questionId: 'q1', optionId: 'all-low' },
          { questionId: 'q2', optionId: 'all-low' },
        ],
      }),
    );
    expect(dup.warnings.some((w) => w.code === 'answer_duplicate')).toBe(true);
    // q1 只算一次 all-high(+1)，q2 算 all-low(-1) → 分子 0、分母 2 → S=0 → x=0.5
    expect(dup.user.raw.EE).toBe(0);
    expect(dup.user.x.EE).toBe(0.5);
  });

  it('同一题目 id 在题库里出现两次 → 后一条覆盖前一条（按 Map.set 语义），不重复计分', () => {
    const out = scoreAnswers(
      [
        { id: 'q1', options: [{ id: 'a', effects: { EE: 1 } }] },
        { id: 'q1', options: [{ id: 'b', effects: { EE: -1 } }] },
      ],
      [{ questionId: 'q1', optionId: 'b' }],
    );
    // 取后一条定义：只有 b 存在 → EE 原始分 -1
    expect(out.user.raw.EE).toBe(-1);
  });

  it('delta 超出 [-1,1] 建议范围 → delta_out_of_range 告警，但仍按原值计入', () => {
    const out = scoreAnswers(
      [{ id: 'q1', options: [{ id: 'a', effects: { EE: 3 } }] }],
      [{ questionId: 'q1', optionId: 'a' }],
    );
    expect(out.warnings.some((w) => w.code === 'delta_out_of_range')).toBe(true);
    expect(out.user.raw.EE).toBe(1); // 3/|3| = 1
  });
});

// ══════════════════════════════════════════════════════════════════
// 5. 确定性（06 §6.7 C2）：同样输入重跑，结果字符级相同
// ══════════════════════════════════════════════════════════════════

describe('确定性 · 意外组合层不引入随机', () => {
  it('同一份输入连续算 50 次，JSON 序列化结果字符级相同（含 surprise 层）', () => {
    const personas = bigPool(40, [
      persona('p-second', 'cat-main', 'common', 1),
      persona('p-other', 'cat-other', 'common', 1),
      persona('p-limited-tie', 'cat-other', 'limited', 1),
    ]);
    const inp = input({ personas });
    const first = JSON.stringify(match(inp));
    for (let i = 0; i < 50; i += 1) expect(JSON.stringify(match(inp))).toBe(first);
    expect(JSON.parse(first).surprise).not.toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════
// 6. sigma 缺省值口径（只验证「取值来自哪里」，不验证「合不合理」）
// ══════════════════════════════════════════════════════════════════

describe('sigma 缺省值 · 取值来源断言', () => {
  it('DEFAULT_SIGMA_BY_RARITY 四档取值与代码常量一致：common 0.22 / rare 0.18 / limited 0.18 / hidden 0.15', () => {
    expect(DEFAULT_SIGMA_BY_RARITY).toEqual({ common: 0.22, rare: 0.18, limited: 0.18, hidden: 0.15 });
  });

  it('人物未填 sigma 时，contributions 里的 sigma 等于该 rarity 的默认值', () => {
    const personas = [
      persona('p-common', 'cat-a', 'common'),
      persona('p-rare', 'cat-a', 'rare'),
      persona('p-hidden', 'cat-a', 'hidden'),
      persona('p-limited', 'cat-a', 'limited'),
    ];
    const out = match(input({ personas }));
    for (const p of out.ranking) {
      const expected = DEFAULT_SIGMA_BY_RARITY[p.rarity];
      expect(p.contributions.every((c) => c.sigma === expected)).toBe(true);
    }
  });

  it('人物显式填了 sigma → 用人物值，不被 rarity 默认值覆盖', () => {
    const p = { ...persona('p-explicit', 'cat-a', 'common'), sigma: { EE: 0.05 } } as EnginePersona;
    const out = match(input({ personas: [p] }));
    const ee = out.ranking[0]!.contributions.find((c) => c.dim === 'EE');
    expect(ee?.sigma).toBe(0.05);
  });

  it('人物未填 rarity → 按 common 兜底（sigmaFor 的 `?? common` 分支）', () => {
    const p = { id: 'p-no-rarity', name: '无稀有度', category: 'c', dims: { EE: 0.5, ST: 0.5, AC: 0.5, HX: 0.5, RB: 0.5, SR: 0.5 } } as EnginePersona;
    const out = match(input({ personas: [p] }));
    expect(out.ranking[0]!.contributions.every((c) => c.sigma === DEFAULT_SIGMA_BY_RARITY.common)).toBe(true);
  });
});
