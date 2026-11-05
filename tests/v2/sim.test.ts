import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  DIMENSIONS,
  DIM_WEIGHTS,
  computeUserVector,
  normalizeOptionScore,
  parsePersonas,
  weightsForDimensions,
  type Quiz,
} from '../../src/engine-v2/project-config.ts';
import { buildMatcher, mulberry32 } from '../../src/engine-v2/match-v2.ts';
import { loadDataset, makeUsers, runSimulation } from '../../src/engine-v2/match-v2.sim.ts';

// ───────────────────────── 项目真实口径 ─────────────────────────

test('项目权重配置：9 维、非负、总和为正', () => {
  assert.equal(DIMENSIONS.length, 9);
  assert.equal(DIM_WEIGHTS.length, 9);
  assert.ok(DIM_WEIGHTS.every((w) => Number.isFinite(w) && w > 0));
  assert.ok(DIM_WEIGHTS.reduce((a, b) => a + b, 0) > 0);
});

test('weightsForDimensions：按题库维度顺序重排，未知维度报错', () => {
  assert.deepEqual(weightsForDimensions([...DIMENSIONS]), DIM_WEIGHTS);
  const reordered = [...DIMENSIONS].reverse();
  const remapped = weightsForDimensions(reordered);
  assert.deepEqual(remapped, [...DIM_WEIGHTS].reverse());
  assert.throws(() => weightsForDimensions(['未知', ...DIMENSIONS.slice(1)]), /未知维度名/);
  assert.throws(() => weightsForDimensions(['理性']), /维度数必须是 9/);
});

test('1—5 分归一化：1->0, 5->1, 3->0.5，越界报错', () => {
  assert.equal(normalizeOptionScore(1, '1-5'), 0);
  assert.equal(normalizeOptionScore(3, '1-5'), 0.5);
  assert.equal(normalizeOptionScore(5, '1-5'), 1);
  assert.equal(normalizeOptionScore(0.25, '0-1'), 0.25);
  assert.throws(() => normalizeOptionScore(0, '1-5'), /越界/);
  assert.throws(() => normalizeOptionScore(6, '1-5'), /越界/);
  assert.throws(() => normalizeOptionScore(1.2, '0-1'), /越界/);
  assert.throws(() => normalizeOptionScore(NaN, '1-5'), /有限数字/);
});

test('computeUserVector：一题一维、按维平均、未触及维度为 null、反向题取 6-x', () => {
  // 真实口径：每题只归一个维度，optionScore 是「题目 → {选项id: 1..5}」
  const quiz: Quiz = {
    dimensions: ['MS', 'FC', 'WS'],
    scoreScale: '1-5',
    questions: [
      { id: 'q1', dimension: 'MS', reverse: false, weight: 1,
        options: [{ id: 'A', scores: { MS: 1 } }, { id: 'B', scores: { MS: 3 } }, { id: 'C', scores: { MS: 5 } }] },
      { id: 'q2', dimension: 'FC', reverse: false, weight: 1,
        options: [{ id: 'A', scores: { FC: 5 } }, { id: 'B', scores: { FC: 1 } }] },
    ],
  };
  // q1 选 C(5) → MS=1；q2 选 A(5) → FC=1；WS 未触及 → null
  assert.deepEqual(computeUserVector(quiz, [2, 0]), [1, 1, null]);
  // q1 选 A(1) → MS=0；q2 选 B(1) → FC=0
  assert.deepEqual(computeUserVector(quiz, [0, 1]), [0, 0, null]);
  // 未作答的题不计入
  assert.deepEqual(computeUserVector(quiz, [-1, 0]), [null, 1, null]);

  // 反向题：answerScore = 6 - 原始分
  const rev: Quiz = {
    dimensions: ['KD'],
    scoreScale: '1-5',
    questions: [
      { id: 'r1', dimension: 'KD', reverse: true, weight: 1,
        options: [{ id: 'A', scores: { KD: 1 } }, { id: 'B', scores: { KD: 5 } }] },
    ],
  };
  assert.deepEqual(computeUserVector(rev, [0]), [1]); // 原始 1 → 折 5 → 归一化 1
  assert.deepEqual(computeUserVector(rev, [1]), [0]); // 原始 5 → 折 1 → 归一化 0

  // 题目权重生效
  const weighted: Quiz = {
    dimensions: ['MS'],
    scoreScale: '1-5',
    questions: [
      { id: 'q1', dimension: 'MS', reverse: false, weight: 3, options: [{ id: 'A', scores: { MS: 5 } }] },
      { id: 'q2', dimension: 'MS', reverse: false, weight: 1, options: [{ id: 'A', scores: { MS: 1 } }] },
    ],
  };
  assert.deepEqual(computeUserVector(weighted, [0, 0]), [0.75]);
  assert.throws(() => computeUserVector(quiz, [0]), /答案数量/);
  assert.throws(() => computeUserVector(quiz, [9, 0]), /下标非法/);
});

test('parsePersonas 把 0..100 的 nineDims 归一化到 0..1', () => {
  const ps = parsePersonas(
    {
      personas: [
        {
          id: 'P1',
          category: 'mem',
          serialNo: 1,
          nineDims: Object.fromEntries(DIMENSIONS.map((d) => [d, 80])),
          compliance: { matchPool: true },
        },
      ],
    },
    [...DIMENSIONS],
  );
  assert.equal(ps.length, 1);
  assert.ok(ps[0].dims.every((x) => Math.abs(x - 0.8) < 1e-12));
  assert.equal(ps[0].matchPool, true);
  assert.throws(
    () => parsePersonas({ personas: [{ id: 'P1', category: 'x' }] }, [...DIMENSIONS]),
    /nineDims/,
  );
});

// ───────────────────────── 项目冻结数据集 ─────────────────────────

test('项目数据集结构：9 维 / 1—5 分（题数与人数读真实文件，不写死）', () => {
  const ds = loadDataset();
  // 人数与题数以真实文件为准：它们的权威源是 data/*.json，
  // 测试里写死会因为一次合理的内容更新就误报，反而掩盖真正的格式问题。
  const rawQuestions = JSON.parse(fs.readFileSync(ds.questionsPath, 'utf8')) as { questions: unknown[] };
  const rawPersonas = JSON.parse(fs.readFileSync(ds.personasPath, 'utf8')) as { personas: unknown[] };
  assert.equal(ds.quiz.dimensions.length, 9);
  assert.deepEqual(ds.quiz.dimensions, [...DIMENSIONS]);
  assert.equal(ds.quiz.scoreScale, '1-5');
  assert.equal(ds.quiz.questions.length, rawQuestions.questions.length);
  assert.equal(ds.personas.length, rawPersonas.personas.length);
  assert.equal(ds.questionsSha256.length, 64);
  assert.equal(ds.personasSha256.length, 64);

  // 每维至少 1 道题（真实题库分布可能不均，不写死 4）
  for (const d of DIMENSIONS) {
    assert.ok(ds.quiz.questions.filter((q) => q.dimension === d).length >= 1, `${d} 题目数`);
  }
  // 所有选项分数都在 1..5 闭区间内（允许小数；真实题库每题选项数不固定）
  for (const q of ds.quiz.questions) {
    assert.ok(q.options.length >= 2);
    for (const o of q.options) {
      for (const v of Object.values(o.scores)) {
        // 允许小数：真实题库用两位小数细分档位（详见 project-config.ts 文件头）
        assert.ok(Number.isFinite(v) && v >= 1 && v <= 5, `${q.id} 分数越界: ${v}`);
      }
    }
  }
  // 角色矩阵：九维 0..1、序列号唯一、类别非空
  const serials = new Set<number>();
  for (const p of ds.personas) {
    assert.equal(p.dims.length, 9);
    assert.ok(p.dims.every((x) => x >= 0 && x <= 1));
    assert.ok(p.category.length > 0);
    assert.ok(Number.isInteger(p.serialNo));
    assert.ok(!serials.has(p.serialNo!));
    serials.add(p.serialNo!);
  }
});

test('随机作答经项目公式得到完整九维向量（与模拟器同源）', () => {
  const ds = loadDataset();
  const r = mulberry32(11);
  for (let i = 0; i < 50; i++) {
    const answers = ds.quiz.questions.map((q) => Math.floor(r() * q.options.length));
    const v = computeUserVector(ds.quiz, answers);
    assert.ok(v.every((x) => x != null), '随机作答应触及全部九维');
    assert.ok(v.every((x) => (x as number) >= 0 && (x as number) <= 1));
  }
});

test('真实角色矩阵 + 真实题库：引擎可完成完整匹配', () => {
  const ds = loadDataset();
  const r = mulberry32(12);
  const sampleUser = (rnd: () => number): number[] => {
    const answers = ds.quiz.questions.map((q) => Math.floor(rnd() * q.options.length));
    return computeUserVector(ds.quiz, answers) as number[];
  };
  const m = buildMatcher(ds.personas, {
    weights: [...DIM_WEIGHTS],
    sampleUser,
    N: 300,
    seed: 3,
    confidence: { samples: 5 },
  });
  const u = sampleUser(r);
  const res = m.match(u);
  // 期望值来自真实角色数减去不进池的角色（如隐藏角色 matchPool=false）
  const dsAll = loadDataset();
  const expected = dsAll.personas.filter((p) => p.matchPool !== false).length;
  assert.equal(res.ranked.length, expected);
  assert.equal(res.coverage, 1);
  assert.ok(res.confidence >= 0 && res.confidence <= 1);
  assert.ok(Number.isFinite(res.primary.raw) && Number.isFinite(res.primary.adjusted));
  for (const x of res.ranked) {
    assert.ok(Number.isFinite(x.raw) && Number.isFinite(x.adjusted));
    assert.ok(x.similarity >= 0 && x.similarity <= 100);
    assert.ok(x.percentile >= 0 && x.percentile <= 100);
  }
});

test('模拟器：四组方案同一批用户、统一指标口径、A 不适用项标 "—"', () => {
  const report = runSimulation({ n: 40, N: 50, seed: 7, confidenceSamples: 2, quiet: true });
  assert.match(report, /# match-v2 v2\.2 模拟报告/);
  for (const name of ['A 原始基线', 'B 动态高斯核', 'C +枢纽修正', 'D +分位数对齐']) {
    assert.ok(report.includes(name), `报告缺少方案 ${name}`);
  }
  assert.match(report, /指标口径（四组统一）/);
  assert.match(report, /—/, 'A 不适用的指标应显示为 —');
  assert.ok(!/NaN|Infinity/.test(report), '报告不应出现 NaN/Infinity');
  assert.match(report, /不代表匹配准确率/);
  assert.match(report, /维度 9/);
  assert.match(report, /sha256/);
});

test('模拟器参数校验：n / N 非法时报错', () => {
  assert.throws(() => runSimulation({ n: 5, quiet: true }), /n 必须是/);
  assert.throws(() => runSimulation({ n: 1.5, quiet: true }), /n 必须是/);
  assert.throws(() => runSimulation({ N: 5, quiet: true }), /N 必须是/);
});

test('makeUsers：同一 seed 可复现，扰动会改变部分答案', () => {
  const ds = loadDataset();
  const psd = Array(9).fill(0.2);
  const dist = (v: number[]) => psd.map((s, d) => Math.abs(v[d] - 0.5) / s);
  const a = makeUsers(ds.quiz, 'random', 20, 101, dist);
  const b = makeUsers(ds.quiz, 'random', 20, 101, dist);
  assert.deepEqual(a.map((u) => u.v), b.map((u) => u.v));
  assert.ok(a.some((u) => JSON.stringify(u.v) !== JSON.stringify(u.v2)));
  const latent = makeUsers(ds.quiz, 'latent', 20, 202, dist);
  assert.equal(latent.length, 20);
  assert.ok(latent.every((u) => u.v.length === 9 && u.v2.length === 9));
});
