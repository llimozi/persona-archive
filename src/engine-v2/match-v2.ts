/**
 * match-v2.ts — 九维人物匹配引擎（动态高斯核框架，v2.2）
 *
 * 保留：动态高斯核（σ 随人物库每维离散度）、算术/几何均值混合、MMR 次匹配、
 * 枢纽修正、分位数对齐实验开关、绝对相似度 + 相对百分位 + 稳定性置信度。
 *
 * v2.2 相对 v2.1 的针对性修复（算法主体不变）：
 *  1. adjusted 可能为负（raw 小于枢纽修正量时）：
 *       - 排序仍然使用 adjusted；但 MMR / 意外人格的"相对门槛"与选择权重
 *         改为基于原始核得分 raw（绝对相似度，恒在 0..1），不再用 adjusted 做比例。
 *       - margin 改为第一名与第二名的 adjusted 差，天然 >= 0。
 *  2. 正式排序与置信度模拟共用同一个排序器与并列打破规则：
 *       adjusted 降序 -> serialNo 升序 -> id 升序 -> 池内下标（保证全序、稳定）。
 *  3. 增加输入/角色/权重/sigma/模拟样本量等合法性校验，失败时抛出明确错误。
 *  4. MMR 次匹配遍历完整角色池（不再只看前 12 名）。
 *  5. 意外人格只排除"实际选中的"第一、第二人格，不再无条件跳过第二名候选。
 *  6. userTags 改为每次 match 单独传入（MatchOptions.userTags）；不传即关闭，
 *     同一引擎实例可服务不同用户，避免"全站共用一份标签"的串味问题。
 *  7. 模拟器复用项目既定九维公式与权重（见 project-config.ts）。
 *
 * 说明：没有标注数据，不能证明"更准"。页面上只能叫"娱乐匹配度"。
 */

export const MATCH_ENGINE_VERSION = '2.2.0';

export type Rarity = 'common' | 'rare' | 'limited' | 'hidden';

export interface Persona {
  id: string;
  category: string;
  rarity?: Rarity; // 仅元数据，不参与评分
  dims: number[]; // 九维，0..1
  sigma?: number[]; // 可选：逐维显式 σ（有就优先用，必须 > 0）
  tags?: string[];
  matchPool?: boolean; // false 则不参与普通匹配
  serialNo?: number;
}

/** 用户向量：0..1，未作答的维度用 null */
export type UserVec = (number | null)[];

export interface HubOptions {
  enabled?: boolean; // 默认 true
  gamma?: number; // 修正强度，默认 0.3
  maxShift?: number; // 单个角色最大修正幅度（核得分单位），默认 0.05
}

export interface Options {
  weights: number[]; // 九维权重，长度决定维度数；必须为非负有限数且总和 > 0
  sampleUser: (rnd: () => number) => number[]; // 用真实题库随机作答，返回完整九维向量（0..1）
  N?: number; // 标定用模拟人数，默认 3000，要求整数且 10..200000
  seed?: number; // 固定种子，默认 20260101，要求 32 位无符号整数
  alignment?: 'none' | 'quantile'; // 默认 'none'
  hub?: HubOptions;
  kappa?: number; // σ = kappa × 该维人物离散度，默认 1.0（全部稀有度一致）
  geoMix?: number; // 几何均值占比，默认 0.35，要求 0..1
  mmrLambda?: number; // 次匹配：相关度权重，默认 0.7，要求 0..1
  secondaryMinRel?: number; // 次匹配相对第一名的 raw 比例下限，默认 0.5，要求 0..1
  surprise?: { minRel?: number; maxSim?: number }; // 默认 {0.6, 0.55}
  confidence?: { samples?: number; noiseScale?: number }; // 默认 {30, 0.35}
}

/** 每次调用 match 时的用户级选项（不属于引擎实例，避免多用户串味） */
export interface MatchOptions {
  /** 该用户命中的标签；不传则标签加成为 0（功能默认关闭） */
  userTags?: string[];
}

export interface Ranked {
  persona: Persona;
  raw: number; // 核得分 0..1
  adjusted: number; // 排序分 = raw × 标签加成 − 枢纽修正，可能为负
  similarity: number; // 绝对相似度 0..100（round(raw*100)）
  percentile: number; // 相对百分位 0..100，展示时必须标注"相对"
}

export interface MatchResult {
  primary: Ranked;
  secondary: Ranked | null;
  surprise: Ranked | null;
  ranked: Ranked[];
  confidence: number; // 稳定性 0..1；0 表示未启用（samples=0）
  margin: number; // 第一名领先第二名的绝对排序分差，>= 0
  coverage: number; // 已作答维度占比
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ecdf(sorted: number[], x: number): number {
  if (sorted.length === 0) return 0;
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m] < x) lo = m + 1;
    else hi = m;
  }
  const below = lo;
  hi = sorted.length;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m] <= x) lo = m + 1;
    else hi = m;
  }
  return (below + lo) / 2 / sorted.length;
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = Math.min(1, Math.max(0, p)) * (sorted.length - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  return i + 1 < sorted.length ? sorted[i] * (1 - f) + sorted[i + 1] * f : sorted[i];
}

function sd(xs: number[]): number {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
}

function hashVec(v: UserVec): number {
  let h = 2166136261;
  for (const x of v) {
    const n = x == null ? -1 : Math.round(x * 1e6);
    h = Math.imul(h ^ (n & 0xffff), 16777619);
    h = Math.imul(h ^ ((n >> 16) & 0xffff), 16777619);
  }
  return h >>> 0;
}

// ───────────────────────────── 合法性校验 ─────────────────────────────

function fail(msg: string): never {
  throw new Error(`match-v2: ${msg}`);
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function assertFinite(x: unknown, name: string): asserts x is number {
  if (!isFiniteNumber(x)) fail(`${name} 必须是有限数字，收到 ${String(x)}`);
}

function assertRange(x: unknown, name: string, lo: number, hi: number): asserts x is number {
  assertFinite(x, name);
  if (x < lo || x > hi) fail(`${name} 必须在 [${lo}, ${hi}] 内，收到 ${x}`);
}

function assertIntRange(x: unknown, name: string, lo: number, hi: number): asserts x is number {
  assertFinite(x, name);
  if (!Number.isInteger(x)) fail(`${name} 必须是整数，收到 ${x}`);
  if (x < lo || x > hi) fail(`${name} 必须在 [${lo}, ${hi}] 内，收到 ${x}`);
}

function assertString(x: unknown, name: string): asserts x is string {
  if (typeof x !== 'string' || x.length === 0) fail(`${name} 必须是非空字符串，收到 ${String(x)}`);
}

function assertBoolean(x: unknown, name: string): asserts x is boolean {
  if (typeof x !== 'boolean') fail(`${name} 必须是布尔值，收到 ${String(x)}`);
}

function validatePersonas(personas: Persona[], D: number): void {
  if (!Array.isArray(personas) || personas.length === 0) fail('personas 必须是非空数组');
  const seen = new Set<string>();
  personas.forEach((p, i) => {
    const at = `personas[${i}]`;
    if (p == null || typeof p !== 'object') fail(`${at} 必须是对象`);
    assertString(p.id, `${at}.id`);
    if (seen.has(p.id)) fail(`personas 中存在重复 id: ${p.id}`);
    seen.add(p.id);
    assertString(p.category, `${at}.category`);
    if (!Array.isArray(p.dims) || p.dims.length !== D) {
      fail(`${at}.dims 长度必须是 ${D}，收到 ${Array.isArray(p.dims) ? p.dims.length : String(p.dims)}`);
    }
    for (let d = 0; d < D; d++) {
      const x = p.dims[d];
      assertFinite(x, `${at}.dims[${d}]`);
      if (x < 0 || x > 1) fail(`${at}.dims[${d}] 必须在 0..1 内，收到 ${x}`);
    }
    if (p.sigma !== undefined) {
      if (!Array.isArray(p.sigma) || p.sigma.length !== D) {
        fail(`${at}.sigma 长度必须是 ${D}`);
      }
      for (let d = 0; d < D; d++) {
        const x = p.sigma[d];
        assertFinite(x, `${at}.sigma[${d}]`);
        if (x <= 0) fail(`${at}.sigma[${d}] 必须 > 0，收到 ${x}`);
      }
    }
    if (p.tags !== undefined) {
      if (!Array.isArray(p.tags)) fail(`${at}.tags 必须是字符串数组`);
      for (let k = 0; k < p.tags.length; k++) assertString(p.tags[k], `${at}.tags[${k}]`);
    }
    if (p.matchPool !== undefined) assertBoolean(p.matchPool, `${at}.matchPool`);
    if (p.serialNo !== undefined) {
      assertFinite(p.serialNo, `${at}.serialNo`);
      if (!Number.isInteger(p.serialNo) || p.serialNo < 0) {
        fail(`${at}.serialNo 必须是非负整数，收到 ${p.serialNo}`);
      }
    }
    if (p.rarity !== undefined && !['common', 'rare', 'limited', 'hidden'].includes(p.rarity)) {
      fail(`${at}.rarity 非法: ${String(p.rarity)}`);
    }
  });
}

function validateOptions(opt: Options): void {
  if (opt == null || typeof opt !== 'object') fail('Options 必须是对象');
  if (!Array.isArray(opt.weights) || opt.weights.length === 0) fail('weights 必须是非空数组');
  const D = opt.weights.length;
  if (D > 32) fail(`weights 维度数过多（${D}），最多支持 32`);
  let wsum = 0;
  for (let d = 0; d < D; d++) {
    const w = opt.weights[d];
    assertFinite(w, `weights[${d}]`);
    if (w < 0) fail(`weights[${d}] 不能为负数，收到 ${w}`);
    wsum += w;
  }
  if (!Number.isFinite(wsum)) fail('weights 总和溢出（不是有限数）');
  if (!(wsum > 0)) fail('weights 总和必须 > 0');
  if (typeof opt.sampleUser !== 'function') fail('sampleUser 必须是函数');

  const N = opt.N ?? 3000;
  assertIntRange(N, 'N（标定模拟人数）', 10, 200000);
  if (opt.seed !== undefined) assertIntRange(opt.seed, 'seed', 0, 0xffffffff);
  if (opt.alignment !== undefined && !['none', 'quantile'].includes(opt.alignment)) {
    fail(`alignment 非法: ${String(opt.alignment)}`);
  }
  if (opt.kappa !== undefined) assertRange(opt.kappa, 'kappa', 0.0001, 100);
  if (opt.geoMix !== undefined) assertRange(opt.geoMix, 'geoMix', 0, 1);
  if (opt.mmrLambda !== undefined) assertRange(opt.mmrLambda, 'mmrLambda', 0, 1);
  if (opt.secondaryMinRel !== undefined) assertRange(opt.secondaryMinRel, 'secondaryMinRel', 0, 1);
  if (opt.hub !== undefined) {
    if (opt.hub == null || typeof opt.hub !== 'object') fail('hub 必须是对象');
    if (opt.hub.enabled !== undefined) assertBoolean(opt.hub.enabled, 'hub.enabled');
    if (opt.hub.gamma !== undefined) assertRange(opt.hub.gamma, 'hub.gamma', 0, 10);
    if (opt.hub.maxShift !== undefined) assertRange(opt.hub.maxShift, 'hub.maxShift', 0, 1);
  }
  if (opt.surprise !== undefined) {
    if (opt.surprise == null || typeof opt.surprise !== 'object') fail('surprise 必须是对象');
    if (opt.surprise.minRel !== undefined) assertRange(opt.surprise.minRel, 'surprise.minRel', 0, 1);
    if (opt.surprise.maxSim !== undefined) assertRange(opt.surprise.maxSim, 'surprise.maxSim', 0, 1);
  }
  if (opt.confidence !== undefined) {
    if (opt.confidence == null || typeof opt.confidence !== 'object') fail('confidence 必须是对象');
    if (opt.confidence.samples !== undefined) {
      assertIntRange(opt.confidence.samples, 'confidence.samples', 0, 100000);
    }
    if (opt.confidence.noiseScale !== undefined) {
      assertRange(opt.confidence.noiseScale, 'confidence.noiseScale', 0, 10);
    }
  }
}

function validateUserVector(user: UserVec, D: number): number {
  if (!Array.isArray(user)) fail('用户向量必须是数组');
  if (user.length !== D) fail(`用户向量长度必须是 ${D}，收到 ${user.length}`);
  let answered = 0;
  for (let d = 0; d < D; d++) {
    const x = user[d];
    if (x == null) continue;
    if (!isFiniteNumber(x)) fail(`用户向量第 ${d} 维不是有限数字：${String(x)}`);
    if (x < 0 || x > 1) fail(`用户向量第 ${d} 维必须在 0..1 内，收到 ${x}`);
    answered++;
  }
  if (answered === 0) fail('用户向量至少要有 1 个已作答维度');
  return answered;
}

function validateMatchOptions(mo: MatchOptions | undefined): string[] | undefined {
  if (mo === undefined || mo === null) return undefined;
  if (typeof mo !== 'object') fail('MatchOptions 必须是对象');
  const tags = mo.userTags;
  if (tags === undefined) return undefined;
  if (!Array.isArray(tags)) fail('userTags 必须是字符串数组');
  if (tags.length > 100) fail('userTags 最多 100 个');
  for (let i = 0; i < tags.length; i++) assertString(tags[i], `userTags[${i}]`);
  return tags.length > 0 ? tags : undefined;
}

// ───────────────────────────── 引擎 ─────────────────────────────

export function buildMatcher(personas: Persona[], opt: Options) {
  validateOptions(opt);
  const D = opt.weights.length;
  const N = opt.N ?? 3000;
  const seed = opt.seed ?? 20260101;
  const alignment = opt.alignment ?? 'none';
  const hubOn = opt.hub?.enabled ?? true;
  const gamma = opt.hub?.gamma ?? 0.3;
  const maxShift = opt.hub?.maxShift ?? 0.05;
  const kappa = opt.kappa ?? 1.0;
  const geoMix = opt.geoMix ?? 0.35;
  const lambda = opt.mmrLambda ?? 0.7;
  const secMinRel = opt.secondaryMinRel ?? 0.5;
  const sMinRel = opt.surprise?.minRel ?? 0.6;
  const sMaxSim = opt.surprise?.maxSim ?? 0.55;
  const confSamples = opt.confidence?.samples ?? 30;
  const noiseScale = opt.confidence?.noiseScale ?? 0.35;
  const rnd = mulberry32(seed);

  validatePersonas(personas, D);
  const pool = personas.filter((p) => p.matchPool !== false);
  if (pool.length === 0) fail('personas 在 matchPool 过滤后为空（所有角色 matchPool=false）');

  // ---- 标定：人物库分布 + 模拟人群 ----
  const personaSorted: number[][] = [];
  const personaSd: number[] = [];
  for (let d = 0; d < D; d++) {
    const col = pool.map((p) => p.dims[d]);
    personaSorted.push([...col].sort((a, b) => a - b));
    personaSd.push(Math.max(sd(col), 0.05));
  }
  const users: number[][] = [];
  for (let i = 0; i < N; i++) {
    const u = opt.sampleUser(rnd);
    if (!Array.isArray(u) || u.length !== D) {
      fail(`sampleUser 第 ${i} 个样本维度数不是 ${D}`);
    }
    for (let d = 0; d < D; d++) {
      assertFinite(u[d], `sampleUser 第 ${i} 个样本第 ${d} 维`);
      if (u[d] < 0 || u[d] > 1) fail(`sampleUser 第 ${i} 个样本第 ${d} 维必须在 0..1 内：${u[d]}`);
    }
    users.push(u);
  }
  const popSorted: number[][] = [];
  const popSd: number[] = [];
  for (let d = 0; d < D; d++) {
    const col = users.map((u) => u[d]);
    popSorted.push([...col].sort((a, b) => a - b));
    popSd.push(sd(col));
  }

  const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
  /** 唯一的用户向量预处理：默认只裁剪到 0..1，不改分布；quantile 为实验方案 */
  const prepare = (v: UserVec): UserVec =>
    v.map((x, d) => {
      if (x == null) return null;
      const c = clamp01(x);
      return alignment === 'quantile' ? quantile(personaSorted[d], ecdf(popSorted[d], c)) : c;
    });

  // ---- 核得分：σ 只取决于人物库离散度，与稀有度无关 ----
  const raw = (u: UserVec, p: Persona): number => {
    let sa = 0;
    let sl = 0;
    let sw = 0;
    for (let d = 0; d < D; d++) {
      const x = u[d];
      if (x == null) continue;
      const sig = Math.max(p.sigma?.[d] ?? kappa * personaSd[d], 0.03);
      const z = (x - p.dims[d]) / sig;
      const g = Math.exp(-0.5 * z * z);
      const w = opt.weights[d];
      sa += w * g;
      sl += w * Math.log(g + 1e-6);
      sw += w;
    }
    if (sw === 0) return 0;
    return (1 - geoMix) * (sa / sw) + geoMix * Math.exp(sl / sw);
  };

  // ---- 每个角色在模拟人群上的得分分布（percentile 与枢纽修正共用）----
  const prepared = users.map((u) => prepare(u));
  const scoreSorted: number[][] = pool.map((p) => prepared.map((u) => raw(u, p)).sort((a, b) => a - b));
  const k = Math.min(N, Math.max(10, Math.round(N * 0.02)));
  const hub = scoreSorted.map((s) => {
    let t = 0;
    for (let i = 0; i < k; i++) t += s[s.length - 1 - i];
    return t / k;
  });
  const hubMean = hub.reduce((a, b) => a + b, 0) / hub.length;
  const hubShift = hub.map((h) =>
    hubOn ? Math.max(-maxShift, Math.min(maxShift, gamma * (h - hubMean))) : 0,
  );

  // ---- 标签加成：每个用户单独传入，不传即关闭 ----
  /** 标签加成只放大 raw，不放大可能为负的 adjusted；无标签时恒为 1（功能默认关闭） */
  const tagBonus = (p: Persona, tags?: string[]): number => {
    if (!tags || tags.length === 0 || !p.tags || p.tags.length === 0) return 1;
    let c = 0;
    for (const t of p.tags) if (tags.includes(t)) c += 1;
    return 1 + Math.min(0.03, 0.01 * c);
  };

  // ---- 角色两两相似度（MMR、意外组合）----
  const wsum = opt.weights.reduce((a, b) => a + b, 0);
  const sim: number[][] = pool.map((a) =>
    pool.map((b) => {
      let s = 0;
      for (let d = 0; d < D; d++) {
        const z = (a.dims[d] - b.dims[d]) / (1.2 * personaSd[d]);
        s += opt.weights[d] * Math.exp(-0.5 * z * z);
      }
      return s / wsum;
    }),
  );

  const serialOf = (p: Persona): number => p.serialNo ?? 0;

  /**
   * 唯一的并列排序规则：adjusted 降序 -> serialNo 升序 -> id 升序 -> 池内下标。
   * 正式排序、置信度模拟、标定暴露的排序全部走这里，保证"同分同名次"。
   */
  const compareScored = (a: { j: number; adjusted: number }, b: { j: number; adjusted: number }): number => {
    if (b.adjusted !== a.adjusted) return b.adjusted - a.adjusted;
    const sa = serialOf(pool[a.j]);
    const sb = serialOf(pool[b.j]);
    if (sa !== sb) return sa - sb;
    const ia = pool[a.j].id;
    const ib = pool[b.j].id;
    if (ia !== ib) return ia < ib ? -1 : 1;
    return a.j - b.j;
  };

  const rankPrepared = (u: UserVec, tags?: string[]) => {
    const raws = pool.map((p) => raw(u, p));
    const scored = raws.map((r, j) => ({ j, adjusted: r * tagBonus(pool[j], tags) - hubShift[j] }));
    scored.sort(compareScored);
    return { raws, scored };
  };

  const scorePrepared = (u: UserVec, tags?: string[]) => {
    const { raws, scored } = rankPrepared(u, tags);
    return scored.map(({ j, adjusted }) => {
      const r = raws[j];
      return {
        j,
        row: {
          persona: pool[j],
          raw: r,
          adjusted,
          similarity: Math.round(r * 100),
          percentile: Math.round(ecdf(scoreSorted[j], r) * 1000) / 10,
        } as Ranked,
      };
    });
  };

  function match(user: UserVec, matchOptions?: MatchOptions): MatchResult {
    const answered = validateUserVector(user, D);
    const userTags = validateMatchOptions(matchOptions);
    let answeredWeight = 0;
    for (let d = 0; d < D; d++) if (user[d] != null) answeredWeight += opt.weights[d];
    if (!(answeredWeight > 0)) fail('已作答维度的权重总和为 0，无法评分');
    const preparedUser = prepare(user);
    const rows = scorePrepared(preparedUser, userTags);
    const top = rows[0];
    if (top == null) fail('内部错误：排序结果为空');

    // 相对门槛统一用 raw（绝对相似度，0..1）计算：
    // adjusted 可能为负或接近 0，用 adjusted 做比例会放大噪声、产生错误人次。
    const topRaw = top.row.raw;
    const relOf = (r: { row: Ranked }): number => (topRaw > 0 ? r.row.raw / topRaw : 0);

    // 次匹配：MMR；遍历完整角色池；不满足门槛则 null
    let secondary: (typeof rows)[number] | null = null;
    let bestMmr = -Infinity;
    for (let i = 1; i < rows.length; i++) {
      const c = rows[i];
      const rel = relOf(c);
      if (rel < secMinRel) continue;
      const same = c.row.persona.category === top.row.persona.category ? 0.15 : 0;
      const mmr = lambda * rel - (1 - lambda) * sim[top.j][c.j] - same;
      if (mmr > bestMmr) {
        bestMmr = mmr;
        secondary = c;
      }
    }

    // 意外人格：只排除实际选中的第一名、第二名；不满足门槛则 null
    let surprise: (typeof rows)[number] | null = null;
    let bestS = -Infinity;
    for (let i = 1; i < rows.length; i++) {
      const c = rows[i];
      if (c.j === top.j) continue;
      if (secondary !== null && c.j === secondary.j) continue;
      if (c.row.persona.category === top.row.persona.category) continue;
      const pairSim = sim[top.j][c.j];
      if (pairSim > sMaxSim) continue;
      const rel = relOf(c);
      if (rel < sMinRel) continue;
      const s = rel * (1 - pairSim);
      if (s > bestS) {
        bestS = s;
        surprise = c;
      }
    }

    // 置信度：对答案加小幅噪声，看第一名是否保持不变（固定种子，同输入同输出）。
    // 与正式排序共用 rankPrepared / compareScored，并列时结果一致。
    let same = 0;
    if (confSamples > 0) {
      const r = mulberry32((seed ^ hashVec(user)) >>> 0);
      for (let s = 0; s < confSamples; s++) {
        const noisy = user.map((x, d) => {
          if (x == null) return null;
          const g = Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
          return x + g * noiseScale * popSd[d];
        });
        const top1 = rankPrepared(prepare(noisy), userTags).scored[0].j;
        if (top1 === top.j) same++;
      }
    }

    const margin = rows.length > 1 ? Math.max(0, top.row.adjusted - rows[1].row.adjusted) : 0;

    return {
      primary: top.row,
      secondary: secondary ? secondary.row : null,
      surprise: surprise ? surprise.row : null,
      ranked: rows.map((r) => r.row),
      confidence: confSamples > 0 ? same / confSamples : 0,
      margin,
      coverage: answered / D,
    };
  }

  return {
    match,
    calibration: {
      version: MATCH_ENGINE_VERSION,
      D,
      N,
      k,
      alignment,
      hubOn,
      gamma,
      maxShift,
      hubShift,
      hubMean,
      personaSd,
      popSd,
      poolIds: pool.map((p) => p.id),
      weights: [...opt.weights],
      similarity: (a: string, b: string): number => {
        const i = pool.findIndex((p) => p.id === a);
        const j = pool.findIndex((p) => p.id === b);
        if (i < 0 || j < 0) fail(`similarity: 未知角色 id（${i < 0 ? a : b}）`);
        return sim[i][j];
      },
    },
  };
}
