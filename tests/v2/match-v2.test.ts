import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MATCH_ENGINE_VERSION,
  buildMatcher,
  mulberry32,
  type Persona,
  type UserVec,
} from '../../src/engine-v2/match-v2.ts';
import { DIMENSIONS, DIM_WEIGHTS } from '../../src/engine-v2/project-config.ts';

const D = DIMENSIONS.length;
const weights = [...DIM_WEIGHTS];
const rp = mulberry32(3);
const cats = ['a', 'b', 'c', 'd', 'e'];
const personas: Persona[] = Array.from({ length: 60 }, (_, i) => ({
  id: 'p' + i,
  category: cats[i % 5],
  serialNo: i,
  rarity: (['common', 'rare', 'limited', 'hidden'] as const)[i % 4],
  dims: Array.from({ length: D }, () => 0.05 + 0.9 * rp()),
  tags: i % 3 === 0 ? ['tagA', 'tagB', 'tagC', 'tagD', 'tagE'] : i % 3 === 1 ? ['tagA'] : undefined,
}));
const sampler = (spread: number, centre = 0.5) => (r: () => number) =>
  Array.from({ length: D }, () => Math.min(1, Math.max(0, centre + (r() - 0.5) * spread)));
const mk = (o: object = {}, ps = personas) =>
  buildMatcher(ps, { weights, sampleUser: sampler(0.4), N: 800, seed: 1, ...o });
const ru = mulberry32(99);
const users: UserVec[] = Array.from({ length: 150 }, () =>
  Array.from({ length: D }, () => 0.2 + 0.6 * ru()),
);
const person = (id: string, category: string, serialNo: number, value: number): Persona => ({
  id,
  category,
  serialNo,
  dims: Array(D).fill(value),
  sigma: Array(D).fill(0.2),
});

// ───────────────────────── v2.1 既有行为（回归） ─────────────────────────

test('版本号已升级到 v2.2', () => {
  assert.equal(MATCH_ENGINE_VERSION, '2.2.0');
});

test('第一、第二、意外人格互不重复', () => {
  const m = mk();
  for (const u of users) {
    const r = m.match(u);
    const ids = [r.primary, r.secondary, r.surprise].filter(Boolean).map((x) => x!.persona.id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('不满足门槛时意外人格为 null，不强制兜底', () => {
  const same = personas.slice(0, 5).map((p) => ({ ...p, category: 'x', rarity: 'hidden' as const }));
  const r = mk({}, same).match(users[0]);
  assert.equal(r.surprise, null);
  const one = mk({}, personas.slice(0, 1)).match(users[0]);
  assert.equal(one.secondary, null);
  assert.equal(one.surprise, null);
});

test('alignment=none：排序与核得分不依赖人群标定，用户原始分数不被改写', () => {
  const a = mk({ hub: { enabled: false }, N: 600 });
  const b = buildMatcher(personas, {
    weights,
    sampleUser: sampler(0.1, 0.7),
    N: 900,
    seed: 5,
    hub: { enabled: false },
  });
  for (const u of users) {
    const ra = a.match(u);
    const rb = b.match(u);
    assert.deepEqual(ra.ranked.map((x) => x.persona.id), rb.ranked.map((x) => x.persona.id));
    assert.equal(ra.primary.raw, rb.primary.raw);
    assert.equal(ra.primary.similarity, rb.primary.similarity);
  }
});

test('alignment=quantile 是显式开关，确实会改变结果', () => {
  const n = mk({ hub: { enabled: false } });
  const q = mk({ hub: { enabled: false }, alignment: 'quantile' });
  assert.ok(users.some((u) => n.match(u).primary.persona.id !== q.match(u).primary.persona.id));
});

test('枢纽修正：幅度不超过上限，关闭后为 0', () => {
  const on = mk({ hub: { gamma: 1, maxShift: 0.02 } });
  const off = mk({ hub: { enabled: false } });
  assert.ok(on.calibration.hubShift.every((x) => Math.abs(x) <= 0.02 + 1e-12));
  assert.ok(on.calibration.hubShift.some((x) => Math.abs(x) > 0));
  assert.ok(off.calibration.hubShift.every((x) => x === 0));
});

test('稀有度不影响评分', () => {
  const flipped = personas.map((p) => ({ ...p, rarity: 'hidden' as const }));
  const a = mk();
  const b = mk({}, flipped);
  for (const u of users.slice(0, 50)) {
    assert.deepEqual(a.match(u).ranked.map((x) => x.raw), b.match(u).ranked.map((x) => x.raw));
  }
});

test('matchWeight 不参与评分（字段已移除，数据里即使存在也被忽略）', () => {
  const withW = personas.map((p, i) => ({ ...p, matchWeight: (i * 7) % 5 })) as Persona[];
  const a = mk();
  const b = mk({}, withW);
  for (const u of users.slice(0, 50)) {
    assert.deepEqual(
      a.match(u).ranked.map((x) => x.persona.id),
      b.match(u).ranked.map((x) => x.persona.id),
    );
  }
});

test('并列时按 serialNo、id 确定排序', () => {
  const twins: Persona[] = [
    { id: 'z', category: 'a', serialNo: 2, dims: Array(D).fill(0.5) },
    { id: 'y', category: 'b', serialNo: 1, dims: Array(D).fill(0.5) },
    { id: 'x', category: 'c', serialNo: 3, dims: Array(D).fill(0.9) },
  ];
  const r = mk({ hub: { enabled: false } }, twins).match(Array(D).fill(0.5));
  assert.deepEqual(r.ranked.slice(0, 2).map((x) => x.persona.id), ['y', 'z']);
});

test('serialNo 相同时按 id 升序打破并列', () => {
  const twins: Persona[] = [
    { id: 'z', category: 'a', serialNo: 1, dims: Array(D).fill(0.5) },
    { id: 'a', category: 'b', serialNo: 1, dims: Array(D).fill(0.5) },
    { id: 'm', category: 'c', serialNo: 1, dims: Array(D).fill(0.5) },
  ];
  const r = mk({ hub: { enabled: false } }, twins).match(Array(D).fill(0.5));
  assert.deepEqual(r.ranked.map((x) => x.persona.id), ['a', 'm', 'z']);
});

test('同输入同输出（含置信度），字段范围合法', () => {
  const m = mk();
  for (const u of users.slice(0, 40)) {
    const a = m.match(u);
    const b = m.match(u);
    assert.deepEqual(a, b);
    assert.ok(a.confidence >= 0 && a.confidence <= 1);
    assert.ok(a.margin >= 0);
    for (const r of a.ranked) {
      assert.ok(Number.isInteger(r.similarity) && r.similarity >= 0 && r.similarity <= 100);
      assert.ok(r.percentile >= 0 && r.percentile <= 100);
      assert.ok(Number.isFinite(r.raw));
      assert.ok(Number.isFinite(r.adjusted));
    }
    assert.equal(a.primary.similarity, Math.round(a.primary.raw * 100));
  }
});

test('相似度是绝对值，percentile 是相对值：二者不是同一个量', () => {
  const m = mk();
  const r = m.match(users[0]);
  assert.ok(r.ranked.some((x) => Math.abs(x.similarity - x.percentile) > 5));
});

test('部分作答：未作答维度不计分，coverage 正确；全空或维度数不对会报错', () => {
  const m = mk();
  const u = [...users[0]];
  for (let d = 5; d < D; d++) u[d] = null;
  assert.equal(m.match(u).coverage, 5 / D);
  assert.throws(() => m.match(Array(D).fill(null)), /至少要有 1 个已作答维度/);
  assert.throws(() => m.match([0.5, 0.5]), /长度必须是 9/);
});

test('matchPool=false 的角色不参与普通匹配', () => {
  const ps = personas.map((p, i) => (i === 0 ? { ...p, matchPool: false } : p));
  const r = mk({}, ps).match(users[0]);
  assert.ok(!r.ranked.some((x) => x.persona.id === 'p0'));
});

test('显式 sigma 优先于默认 σ', () => {
  const tight = personas.map((p, i) => (i === 0 ? { ...p, sigma: Array(D).fill(0.03) } : p));
  const u = users[0];
  const a = mk().match(u).ranked.find((x) => x.persona.id === 'p0')!.raw;
  const b = mk({}, tight).match(u).ranked.find((x) => x.persona.id === 'p0')!.raw;
  assert.notEqual(a, b);
});

test('置信度有信息量：高置信样本比低置信样本更稳定', () => {
  const m = mk({ N: 800 });
  const r = mulberry32(8);
  const hi = [0, 0];
  const lo = [0, 0];
  for (let i = 0; i < 400; i++) {
    const u = Array.from({ length: D }, () => 0.15 + 0.7 * r());
    const v = u.map((x) => Math.min(1, Math.max(0, x + (r() - 0.5) * 0.08)));
    const a = m.match(u);
    const same = a.primary.persona.id === m.match(v).primary.persona.id;
    const bucket = a.confidence >= 0.8 ? hi : a.confidence < 0.5 ? lo : null;
    if (bucket) {
      bucket[0] += 1;
      if (same) bucket[1] += 1;
    }
  }
  assert.ok(hi[0] > 20 && lo[0] > 20);
  assert.ok(hi[1] / hi[0] > lo[1] / lo[0]);
});

test('标定耗时（N=3000，60 角色）', () => {
  const t = Date.now();
  buildMatcher(personas, { weights, sampleUser: sampler(0.4), N: 3000, seed: 1 });
  const ms = Date.now() - t;
  console.log(`  calibration ms=${ms}`);
  assert.ok(ms < 5000);
});

// ───────────────────────── #1 adjusted 为负 / 比例口径 ─────────────────────────

test('adjusted 可以为负，但排序、margin、比例门槛仍然有限且正确', () => {
  // P 是模拟人群里的热门角色（枢纽修正为正），但该用户离 P 很远 -> P adjusted 为负
  const ps: Persona[] = [
    person('p', 'x', 1, 0.9),
    person('q', 'y', 2, 0.1),
    person('r', 'z', 3, 0.12),
  ]; // person() 显式 sigma=0.2，便于构造"raw 很小但枢纽修正为正"的场景
  const m = buildMatcher(ps, {
    weights,
    sampleUser: () => Array(D).fill(0.9), // 模拟人群集中在 p 附近，p 的枢纽修正为正
    N: 50,
    seed: 2,
  });
  const res = m.match(Array(D).fill(0.1)); // 真实用户离 p 很远
  assert.ok(res.ranked.some((x) => x.adjusted < 0), '构造场景应出现负 adjusted');
  assert.ok(res.ranked.every((x) => Number.isFinite(x.adjusted)));
  assert.ok(Number.isFinite(res.margin) && res.margin >= 0);
  assert.equal(res.primary.persona.id, 'q');
  if (res.secondary) {
    // 门槛用的是 raw 比例，不是 adjusted 比例
    assert.ok(res.secondary.raw >= 0.5 * res.primary.raw - 1e-12);
    assert.ok(res.secondary.persona.id !== res.primary.persona.id);
  }
  if (res.surprise) {
    assert.ok(res.surprise.raw >= 0.6 * res.primary.raw - 1e-12);
    assert.notEqual(res.surprise.persona.id, res.secondary?.persona.id);
  }
});

test('adjusted 为负时 MMR 仍只按 raw 相对门槛选人，不会选中 raw 明显更低的角色', () => {
  // p 的 adjusted 为负；pool 中其余角色 raw 差异明显。
  const ps: Persona[] = [
    person('p', 'x', 1, 0.95),
    person('q', 'y', 2, 0.1),
    person('r', 'z', 3, 0.55),
    person('s', 'w', 4, 0.4),
  ];
  const m = buildMatcher(ps, {
    weights,
    sampleUser: () => Array(D).fill(0.95),
    N: 50,
    seed: 3,
  });
  const res = m.match(Array(D).fill(0.1));
  if (res.secondary) {
    assert.ok(res.secondary.raw >= 0.5 * res.primary.raw - 1e-12);
  }
});

// ───────────────────────── #2 并列排序统一 ─────────────────────────

test('正式排序与置信度模拟使用同一并列规则（零噪声时置信度=1）', () => {
  const twins: Persona[] = [
    { id: 'z', category: 'a', serialNo: 2, dims: Array(D).fill(0.5) },
    { id: 'y', category: 'b', serialNo: 1, dims: Array(D).fill(0.5) },
    { id: 'x', category: 'c', serialNo: 3, dims: Array(D).fill(0.5) },
  ];
  const m = buildMatcher(twins, {
    weights,
    sampleUser: () => Array(D).fill(0.5),
    N: 50,
    seed: 1,
    hub: { enabled: false },
    confidence: { samples: 10, noiseScale: 0 },
  });
  const r = m.match(Array(D).fill(0.5));
  assert.equal(r.primary.persona.id, 'y');
  assert.equal(r.confidence, 1);
  assert.deepEqual(r.ranked.map((x) => x.persona.id), ['y', 'z', 'x']);
});

// ───────────────────────── #4 MMR 遍历完整角色池 ─────────────────────────

test('MMR 遍历完整角色池：排名 12 名之后的候选也能成为次匹配', () => {
  const top = person('a', 'x', 1, 0.5);
  const close = Array.from({ length: 12 }, (_, i) => person('b' + i, 'x', 10 + i, 0.528));
  const distant = person('c', 'y', 30, 0.4082);
  const fillers = Array.from({ length: 40 }, (_, i) => person('f' + i, 'z', 100 + i, i % 2 ? 0 : 1));
  const ps = [top, ...close, distant, ...fillers];
  const m = buildMatcher(ps, {
    weights,
    sampleUser: () => Array(D).fill(0.5),
    N: 50,
    seed: 4,
    hub: { enabled: false },
    confidence: { samples: 0 },
    secondaryMinRel: 0.5,
  });
  const r = m.match(Array(D).fill(0.5));
  assert.equal(r.primary.persona.id, 'a');
  const rankC = r.ranked.findIndex((x) => x.persona.id === 'c') + 1;
  assert.ok(rankC > 12, `c 的排名应 > 12，实际 ${rankC}`);
  assert.equal(r.secondary?.persona.id, 'c');
});

// ───────────────────────── #5 意外人格不跳过第二名候选 ─────────────────────────

test('意外人格只排除实际选中的第一、第二人格，不无条件跳过第二名候选', () => {
  const ps: Persona[] = [person('a', 'x', 1, 0.5), person('b', 'y', 2, 0.35)];
  const m = buildMatcher(ps, {
    weights,
    sampleUser: () => Array(D).fill(0.5),
    N: 50,
    seed: 5,
    hub: { enabled: false },
    confidence: { samples: 0 },
    secondaryMinRel: 0.99, // 让 b 不够格成为次匹配
    surprise: { minRel: 0.6, maxSim: 0.55 },
  });
  const r = m.match(Array(D).fill(0.5));
  assert.equal(r.secondary, null);
  // b 是总排名第 2 的候选；旧实现从 i=2 开始会跳过它，返回 null
  assert.equal(r.surprise?.persona.id, 'b');
});

// ───────────────────────── #6 userTags 改为每人单独传入 ─────────────────────────

test('userTags 每次 match 单独传入：不传即关闭，且不影响后续用户', () => {
  const m = mk({ hub: { enabled: false } });
  const u = users[0];
  const p0 = personas[0]; // tags: tagA..tagE
  const plain = m.match(u).ranked.find((x) => x.persona.id === p0.id)!;
  const tagged = m
    .match(u, { userTags: ['tagA'] })
    .ranked.find((x) => x.persona.id === p0.id)!;
  assert.equal(tagged.raw, plain.raw);
  assert.ok(tagged.adjusted > plain.adjusted);
  assert.ok(tagged.adjusted <= plain.adjusted * 1.03 + 1e-12);
  // 后续不传 tags 的调用不受影响
  assert.equal(m.match(u).primary.persona.id, m.match(u).primary.persona.id);
  assert.equal(
    m.match(u).ranked.find((x) => x.persona.id === p0.id)!.adjusted,
    plain.adjusted,
  );
});

test('标签加成封顶 3%，未知标签不加成', () => {
  const m = mk({ hub: { enabled: false } });
  const u = users[1];
  const p0 = personas[0];
  const plain = m.match(u).ranked.find((x) => x.persona.id === p0.id)!;
  const all = m.match(u, { userTags: p0.tags }).ranked.find((x) => x.persona.id === p0.id)!;
  const unknown = m
    .match(u, { userTags: ['nope', 'nope2'] })
    .ranked.find((x) => x.persona.id === p0.id)!;
  assert.ok(Math.abs(all.adjusted / plain.adjusted - 1.03) < 1e-9);
  assert.equal(unknown.adjusted, plain.adjusted);
});

test('不同用户可传入不同 userTags，互不串味', () => {
  const m = mk({ hub: { enabled: false } });
  const a = m.match(users[0], { userTags: ['tagA'] });
  const b = m.match(users[1], { userTags: ['tagB'] });
  const a2 = m.match(users[0], { userTags: ['tagA'] });
  assert.deepEqual(a, a2);
  assert.equal(a.primary.persona.id, m.match(users[0], { userTags: ['tagA'] }).primary.persona.id);
  assert.ok(Number.isFinite(b.primary.raw));
});

test('标签加成只放大 raw，不会让负 adjusted 更低（单调性）', () => {
  const ps: Persona[] = [person('p', 'x', 1, 0.9), person('q', 'y', 2, 0.1), person('r', 'z', 3, 0.12)];
  const tagged = ps.map((x, i) => (i === 2 ? { ...x, tags: ['tagA'] } : x));
  const m = buildMatcher(tagged, {
    weights,
    sampleUser: () => Array(D).fill(0.9),
    N: 50,
    seed: 9,
  });
  const u = Array(D).fill(0.1);
  const plain = m.match(u).ranked.find((x) => x.persona.id === 'r')!;
  const withTag = m.match(u, { userTags: ['tagA'] }).ranked.find((x) => x.persona.id === 'r')!;
  assert.ok(plain.adjusted < 0 || plain.adjusted >= 0); // 场景本身不限符号
  assert.ok(withTag.adjusted >= plain.adjusted, '标签命中不能让排序分变差');
});

// ───────────────────────── #3 合法性校验 ─────────────────────────

test('校验 weights：空、负数、NaN、全零', () => {
  const bad = (w: number[]) =>
    buildMatcher(personas, { weights: w, sampleUser: sampler(0.4), N: 100 });
  assert.throws(() => bad([]), /weights 必须是非空数组/);
  assert.throws(() => bad([1, -1]), /不能为负数/);
  assert.throws(() => bad([1, NaN]), /有限数字/);
  assert.throws(() => bad([0, 0]), /总和必须 > 0/);
  // 稀疏数组不能绕过校验
  const sparse: number[] = [1, 1, 1, 1, 1, 1, 1, 1, 1];
  delete (sparse as unknown as Record<string, number>)[4];
  assert.throws(() => bad(sparse), /有限数字/);
  // 每项有限但总和溢出
  assert.throws(() => bad(Array(9).fill(1e308)), /总和溢出/);
});

test('校验 N / seed / 各数值参数', () => {
  const base = { weights, sampleUser: sampler(0.4) };
  assert.throws(() => buildMatcher(personas, { ...base, N: 0 }), /N（标定模拟人数）/);
  assert.throws(() => buildMatcher(personas, { ...base, N: 5 }), /N（标定模拟人数）/);
  assert.throws(() => buildMatcher(personas, { ...base, N: 10.5 }), /整数/);
  assert.throws(() => buildMatcher(personas, { ...base, seed: -1 }), /seed/);
  assert.throws(() => buildMatcher(personas, { ...base, seed: 1.5 }), /seed/);
  assert.throws(() => buildMatcher(personas, { ...base, kappa: 0 }), /kappa/);
  assert.throws(() => buildMatcher(personas, { ...base, geoMix: 1.2 }), /geoMix/);
  assert.throws(() => buildMatcher(personas, { ...base, mmrLambda: 2 }), /mmrLambda/);
  assert.throws(() => buildMatcher(personas, { ...base, secondaryMinRel: -0.1 }), /secondaryMinRel/);
  assert.throws(() => buildMatcher(personas, { ...base, alignment: 'x' as never }), /alignment/);
  assert.throws(() => buildMatcher(personas, { ...base, hub: { gamma: -1 } }), /hub.gamma/);
  assert.throws(() => buildMatcher(personas, { ...base, hub: { maxShift: 2 } }), /hub.maxShift/);
  assert.throws(() => buildMatcher(personas, { ...base, confidence: { samples: -1 } }), /confidence.samples/);
  assert.throws(() => buildMatcher(personas, { ...base, confidence: { samples: 1.5 } }), /整数/);
  assert.throws(() => buildMatcher(personas, { ...base, confidence: { noiseScale: -1 } }), /noiseScale/);
});

test('校验角色数据：空池、维度数、越界、NaN、重复 id、sigma、category/serialNo', () => {
  const base = { weights, sampleUser: sampler(0.4), N: 100 };
  assert.throws(() => buildMatcher([], base), /personas 必须是非空数组/);
  assert.throws(
    () => buildMatcher([{ ...personas[0], dims: [0.5] }], base),
    /dims 长度必须是 9/,
  );
  assert.throws(
    () => buildMatcher([{ ...personas[0], dims: Array(D).fill(1.2) }], base),
    /0..1/,
  );
  assert.throws(
    () => buildMatcher([{ ...personas[0], dims: Array(D).fill(NaN) }], base),
    /有限数字/,
  );
  const sparseDims = Array.from({ length: D }, () => 0.5);
  delete (sparseDims as unknown as Record<string, number>)[3];
  assert.throws(
    () => buildMatcher([{ ...personas[0], dims: sparseDims }], base),
    /有限数字/,
  );
  assert.throws(
    () => buildMatcher([personas[0], { ...personas[1], id: personas[0].id }], base),
    /重复 id/,
  );
  assert.throws(
    () => buildMatcher([{ ...personas[0], sigma: [0.1] }], base),
    /sigma 长度必须是 9/,
  );
  assert.throws(
    () => buildMatcher([{ ...personas[0], sigma: Array(D).fill(0) }], base),
    /sigma\[0\] 必须 > 0/,
  );
  assert.throws(
    () => buildMatcher([{ ...personas[0], category: '' }], base),
    /category/,
  );
  assert.throws(
    () => buildMatcher([{ ...personas[0], serialNo: -2 }], base),
    /serialNo/,
  );
  assert.throws(
    () => buildMatcher(personas.map((p) => ({ ...p, matchPool: false })), base),
    /matchPool 过滤后为空/,
  );
});

test('校验 sampleUser 输出：维度数、越界、NaN', () => {
  const base = { weights, N: 100 };
  assert.throws(
    () => buildMatcher(personas, { ...base, sampleUser: () => [0.5] }),
    /sampleUser 第 0 个样本维度数/,
  );
  assert.throws(
    () => buildMatcher(personas, { ...base, sampleUser: () => Array(D).fill(1.5) }),
    /0..1/,
  );
  assert.throws(
    () => buildMatcher(personas, { ...base, sampleUser: () => Array(D).fill(NaN) }),
    /有限数字/,
  );
});

test('校验用户向量与 MatchOptions：长度、NaN、全空、userTags 类型', () => {
  const m = mk();
  assert.throws(() => m.match([0.5] as never), /长度必须是 9/);
  assert.throws(() => m.match(Array(D).fill(NaN)), /有限数字/);
  assert.throws(() => m.match(Array(D).fill(null)), /至少要有 1 个已作答维度/);
  assert.throws(() => m.match('x' as never), /用户向量必须是数组/);
  assert.throws(() => m.match(Array(D).fill(2)), /0..1 内/);
  assert.throws(() => m.match(Array(D).fill(-0.1)), /0..1 内/);
  // 已作答维度的权重全为 0：无法评分，必须报错
  const zeroWeight = buildMatcher(personas, {
    weights: [0, ...Array(D - 1).fill(1)],
    sampleUser: sampler(0.4),
    N: 100,
    seed: 1,
  });
  const onlyZeroDim: UserVec = Array(D).fill(null);
  onlyZeroDim[0] = 0.5;
  assert.throws(() => zeroWeight.match(onlyZeroDim), /已作答维度的权重总和为 0/);
  assert.throws(() => m.match(users[0], { userTags: 'tagA' as never }), /userTags/);
  assert.throws(() => m.match(users[0], { userTags: [1 as never] }), /userTags\[0\]/);
});

test('similarity 查询未知角色 id 会报错', () => {
  const m = mk();
  assert.throws(() => m.calibration.similarity('p0', 'nope'), /未知角色 id/);
});

// ───────────────────────── 边界场景 ─────────────────────────

test('边界：单角色池 / 双角色池 / 一维权重', () => {
  const one = buildMatcher([person('only', 'x', 7, 0.5)], {
    weights,
    sampleUser: () => Array(D).fill(0.5),
    N: 20,
    seed: 1,
    confidence: { samples: 3 },
  }).match(Array(D).fill(0.5));
  assert.equal(one.primary.persona.id, 'only');
  assert.equal(one.secondary, null);
  assert.equal(one.surprise, null);
  assert.equal(one.margin, 0);

  const two = buildMatcher([person('a', 'x', 1, 0.5), person('b', 'y', 2, 0.3)], {
    weights,
    sampleUser: () => Array(D).fill(0.5),
    N: 20,
    seed: 1,
    confidence: { samples: 0 },
  }).match(Array(D).fill(0.5));
  assert.equal(two.ranked.length, 2);
  assert.ok(two.secondary != null);

  const oneDim = buildMatcher(
    [
      { id: 'a', category: 'x', serialNo: 1, dims: [0.2] },
      { id: 'b', category: 'y', serialNo: 2, dims: [0.8] },
    ],
    { weights: [1], sampleUser: () => [0.5], N: 20, seed: 1, confidence: { samples: 0 } },
  ).match([0.5]);
  assert.equal(oneDim.coverage, 1);
  assert.ok(oneDim.primary.raw > 0);
});

test('边界：N 取最小值、置信度采样关闭、极端用户值', () => {
  const m = buildMatcher(personas, {
    weights,
    sampleUser: sampler(0.4),
    N: 10,
    seed: 1,
    confidence: { samples: 0 },
  });
  const r = m.match(users[0]);
  assert.equal(r.confidence, 0);
  assert.ok(Number.isFinite(r.primary.raw));

  const allZero = m.match(Array(D).fill(0));
  const allOne = m.match(Array(D).fill(1));
  assert.ok(Number.isFinite(allZero.primary.raw) && Number.isFinite(allOne.primary.raw));
  assert.ok(allZero.margin >= 0 && allOne.margin >= 0);
});

test('权重整体放大不改变排序（尺度不变）', () => {
  const a = mk({ hub: { enabled: false } });
  const b = mk({ hub: { enabled: false }, weights: weights.map((w) => w * 10) });
  for (const u of users.slice(0, 20)) {
    const ra = a.match(u);
    const rb = b.match(u);
    assert.deepEqual(ra.ranked.map((x) => x.persona.id), rb.ranked.map((x) => x.persona.id));
    assert.ok(Math.abs(ra.primary.raw - rb.primary.raw) < 1e-12);
  }
});

test('ranked 严格按统一比较器排序（含并列）', () => {
  const m = mk();
  for (const u of users.slice(0, 30)) {
    const rs = m.match(u).ranked;
    for (let i = 1; i < rs.length; i++) {
      const a = rs[i - 1];
      const b = rs[i];
      const order =
        b.adjusted - a.adjusted ||
        (a.persona.serialNo ?? 0) - (b.persona.serialNo ?? 0) ||
        (a.persona.id < b.persona.id ? -1 : a.persona.id > b.persona.id ? 1 : 0);
      // compareScored(a, b) <= 0 表示 a 应排在 b 前面
      assert.ok(order <= 0, `第 ${i} 名排序违反比较器`);
    }
  }
});
