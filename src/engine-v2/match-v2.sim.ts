/**
 * match-v2.sim.ts — 四组方案对照模拟（v2.2）
 *
 *   A 原始基线（固定 σ 按稀有度、算术加权均值，用户向量不处理，无门槛）
 *   B 动态高斯核（σ 随人物库离散度、算术+几何混合，无枢纽修正、无对齐）
 *   C B + 枢纽修正（默认 γ=0.3，单角色最大 ±0.05）
 *   D C + 分位数对齐（实验方案）
 *
 * v2.2 的模拟器改动：
 *  1. 直接复用项目既定口径：src/project-config.ts 的九维公式、权重、1—5 分归一化；
 *     默认读取项目根目录 data/questions.json + data/personas.json（真实题库与 91 人矩阵）。
 *  2. 四组方案使用同一批用户、同一扰动、同一中立参照（neutral），指标定义统一；
 *     对 A 不适用的指标（次匹配空/意外空/三人重复/绝对相似度/置信度）显式标 "—"，
 *     不再把"设计上恒有第二名"当成 0% 空值参与比较。
 *  3. 并列排序规则与引擎一致：得分降序 -> serialNo 升序 -> id 升序（A 也使用）。
 *
 * 用法：
 *   node src/match-v2.sim.ts                    # 项目数据集，默认 n=2500, 标定 N=2500
 *   node src/match-v2.sim.ts --n 800 --N 1000   # 小规模
 *   node src/match-v2.sim.ts --out reports/report.txt
 *
 * 注意：模拟只验证匹配机制与统计口径，不代表"匹配准确率"。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  MATCH_ENGINE_VERSION,
  buildMatcher,
  mulberry32,
  type MatchResult,
  type Persona,
  type Rarity,
} from './match-v2.ts';
import {
  PROJECT_CONFIG_VERSION,
  computeUserVector,
  normalizeOptionScore,
  parsePersonas,
  parseQuiz,
  weightsForDimensions,
  type Quiz,
} from './project-config.ts';

// ───────────────────────────── 数据装载 ─────────────────────────────

export interface Dataset {
  quiz: Quiz;
  personas: Persona[];
  questionsPath: string;
  personasPath: string;
  questionsSha256: string;
  personasSha256: string;
}

const sha256 = (buf: Buffer): string => crypto.createHash('sha256').update(buf).digest('hex');

export function loadDataset(questionsPath?: string, personasPath?: string): Dataset {
  // 本项目真实数据目录：src/engine-v2/ → 项目根 data/
  const dataDir = path.resolve(import.meta.dirname, '..', '..', 'data');
  const qp = path.resolve(questionsPath ?? path.join(dataDir, 'questions.json'));
  const pp = path.resolve(personasPath ?? path.join(dataDir, 'personas.json'));
  const qBuf = fs.readFileSync(qp);
  const pBuf = fs.readFileSync(pp);
  const quiz = parseQuiz(JSON.parse(qBuf.toString('utf8')));
  // 尽早校验题库维度名/顺序，避免不同顺序的题库静默错配权重
  weightsForDimensions(quiz.dimensions);
  const personas = parsePersonas(JSON.parse(pBuf.toString('utf8')), quiz.dimensions);
  return {
    quiz,
    personas,
    questionsPath: qp,
    personasPath: pp,
    questionsSha256: sha256(qBuf),
    personasSha256: sha256(pBuf),
  };
}

// ───────────────────────────── 作答生成 ─────────────────────────────

const randAnswers = (quiz: Quiz, r: () => number): number[] =>
  quiz.questions.map((q) => Math.floor(r() * q.options.length));

const perturbAnswers = (quiz: Quiz, answers: number[], r: () => number, changes = 2): number[] => {
  const copy = [...answers];
  for (let i = 0; i < changes; i++) {
    const qi = Math.floor(r() * quiz.questions.length);
    copy[qi] = Math.floor(r() * quiz.questions[qi].options.length);
  }
  return copy;
};

/** 潜在画像：先抽一个九维倾向 theta，再让每题选项靠近该倾向（带温度噪声） */
const latentAnswers = (quiz: Quiz, r: () => number): number[] => {
  const dimIndex = new Map(quiz.dimensions.map((name, i) => [name, i]));
  const theta = quiz.dimensions.map(() => 0.1 + 0.8 * r());
  return quiz.questions.map((q) => {
    const weights = q.options.map((o) => {
      let loss = 0;
      let cnt = 0;
      for (const [name, rawScore] of Object.entries(o.scores)) {
        const d = dimIndex.get(name);
        if (d === undefined) continue;
        const normalized = normalizeOptionScore(rawScore, quiz.scoreScale);
        loss += (normalized - theta[d]) ** 2;
        cnt += 1;
      }
      return Math.exp(-(cnt > 0 ? loss / cnt : 0) / 0.06);
    });
    let x = r() * weights.reduce((a, b) => a + b, 0);
    let k = 0;
    while (k < q.options.length - 1 && x > weights[k]) {
      x -= weights[k];
      k += 1;
    }
    // 10% 概率随机作答，避免"潜在画像"过于理想化
    return r() < 0.1 ? Math.floor(r() * q.options.length) : k;
  });
};

function toFullVector(quiz: Quiz, answers: number[]): number[] {
  const v = computeUserVector(quiz, answers);
  if (v.some((x) => x == null)) throw new Error('sim: 存在未触及维度，无法作为完整用户向量');
  return v as number[];
}

export interface SimUser {
  v: number[];
  v2: number[];
  /** 中立参照距离（与任何方案无关） */
  neutral: number[];
  neutralSorted: number[];
}

export function makeUsers(
  quiz: Quiz,
  kind: 'random' | 'latent',
  n: number,
  seed: number,
  distOf: (v: number[]) => number[],
): SimUser[] {
  const r = mulberry32(seed);
  const gen = kind === 'random' ? randAnswers : latentAnswers;
  return Array.from({ length: n }, () => {
    const a = gen(quiz, r);
    const a2 = perturbAnswers(quiz, a, r);
    const v = toFullVector(quiz, a);
    const v2 = toFullVector(quiz, a2);
    const neutral = distOf(v);
    return { v, v2, neutral, neutralSorted: [...neutral].sort((x, y) => x - y) };
  });
}

// ───────────────────────────── 四组方案 ─────────────────────────────

const RARITY_SIGMA: Record<Rarity, number> = { common: 0.22, rare: 0.18, limited: 0.18, hidden: 0.15 };

export interface ArmOutput {
  primary: string;
  secondary: string | null;
  surprise: string | null;
  confidence?: number;
  similarity?: number;
  duplicate?: boolean;
}

/** A：原始基线，固定 σ、算术加权均值；无次匹配门槛、无意外人格、无置信度 */
export function makeBaseline(personas: Persona[], weights: number[]) {
  const W = weights.reduce((a, b) => a + b, 0);
  const serial = (p: Persona) => p.serialNo ?? 0;
  return (v: number[]): ArmOutput => {
    const scored = personas.map((p) => {
      const sig = RARITY_SIGMA[p.rarity ?? 'common'];
      let s = 0;
      for (let d = 0; d < weights.length; d++) {
        s += weights[d] * Math.exp(-((v[d] - p.dims[d]) ** 2) / (2 * sig * sig));
      }
      return { id: p.id, s: s / W };
    });
    // 与引擎相同的并列规则：得分降序 -> serialNo 升序 -> id 升序
    const byId = new Map(personas.map((p) => [p.id, p]));
    scored.sort(
      (x, y) =>
        y.s - x.s ||
        serial(byId.get(x.id)!) - serial(byId.get(y.id)!) ||
        (x.id < y.id ? -1 : x.id > y.id ? 1 : 0),
    );
    return {
      primary: scored[0].id,
      secondary: scored[1]?.id ?? null,
      surprise: null,
    };
  };
}

const engineRun = (m: ReturnType<typeof buildMatcher>) => (v: number[]): ArmOutput => {
  const r: MatchResult = m.match(v);
  const ids = [r.primary.persona.id, r.secondary?.persona.id, r.surprise?.persona.id].filter(
    (x): x is string => x != null,
  );
  return {
    primary: r.primary.persona.id,
    secondary: r.secondary?.persona.id ?? null,
    surprise: r.surprise?.persona.id ?? null,
    confidence: r.confidence,
    similarity: r.primary.similarity,
    duplicate: new Set(ids).size !== ids.length,
  };
};

// ───────────────────────────── 指标评估（统一口径） ─────────────────────────────

export interface Metrics {
  n: number;
  never: number;
  maxShare: number;
  entropy: number;
  stability: number;
  neutralRank: number;
  neutralTop3: number;
  regret: number;
  secondarySim: number | null; // 分母：有次匹配的用户
  secondaryDiffCat: number | null; // 分母：有次匹配的用户
  secondaryNull: number | null; // 分母：全部用户；A 不适用
  surpriseNull: number | null; // 分母：全部用户；A 不适用
  duplicate: number | null; // 人次；A 不适用
  primarySimilarity: number | null; // 引擎专属
  confidence: number | null; // 引擎专属
  pHigh: number | null; // 置信度 >= 0.8 的用户里，扰动后仍稳定的比例
  nHigh: number;
  pLow: number | null;
  nLow: number;
}

export function evaluate(
  run: (v: number[]) => ArmOutput,
  users: SimUser[],
  ids: string[],
  idx: Map<string, number>,
  pByIdx: Persona[],
  pairSimilarity: (a: string, b: string) => number,
): Metrics {
  const n = users.length;
  const cnt = new Array(ids.length).fill(0);
  let stable = 0;
  let rankSum = 0;
  let top3 = 0;
  let regret = 0;
  let secN = 0;
  let secSim = 0;
  let secCat = 0;
  let secNullN = 0;
  let surNullN = 0;
  let dupN = 0;
  let simN = 0;
  let simSum = 0;
  let confN = 0;
  let confSum = 0;
  let hiN = 0;
  let hiS = 0;
  let loN = 0;
  let loS = 0;
  let hasSecondaryField = false;
  let hasSurpriseField = false;
  for (const u of users) {
    const o = run(u.v);
    const o2 = run(u.v2);
    const same = o.primary === o2.primary;
    if (same) stable += 1;
    const pi = idx.get(o.primary);
    if (pi === undefined) throw new Error(`sim: 未知角色 id ${o.primary}`);
    cnt[pi] += 1;
    const c = u.neutral[pi];
    const rank = u.neutralSorted.findIndex((x) => x >= c) + 1;
    rankSum += rank;
    if (rank <= 3) top3 += 1;
    regret += c - u.neutralSorted[0];

    if (o.secondary != null) {
      hasSecondaryField = true;
      secN += 1;
      secSim += pairSimilarity(o.primary, o.secondary);
      if (pByIdx[idx.get(o.secondary)!].category !== pByIdx[pi].category) secCat += 1;
    } else if (o.secondary === null) {
      hasSecondaryField = true;
      secNullN += 1;
    }
    if (o.surprise == null) {
      hasSurpriseField = true;
      surNullN += 1;
    } else {
      hasSurpriseField = true;
    }
    if (o.duplicate === true) dupN += 1;
    if (o.similarity != null) {
      simN += 1;
      simSum += o.similarity;
    }
    if (o.confidence != null) {
      confN += 1;
      confSum += o.confidence;
      if (o.confidence >= 0.8) {
        hiN += 1;
        if (same) hiS += 1;
      } else if (o.confidence < 0.5) {
        loN += 1;
        if (same) loS += 1;
      }
    }
  }
  const entropy = -cnt.reduce((s, x) => (x ? s + (x / n) * Math.log(x / n) : s), 0) / Math.log(ids.length);
  return {
    n,
    never: cnt.filter((x) => !x).length,
    maxShare: Math.max(...cnt) / n,
    entropy,
    stability: stable / n,
    neutralRank: rankSum / n,
    neutralTop3: top3 / n,
    regret: regret / n,
    secondarySim: secN > 0 ? secSim / secN : null,
    secondaryDiffCat: secN > 0 ? secCat / secN : null,
    secondaryNull: hasSecondaryField ? secNullN / n : null,
    surpriseNull: hasSurpriseField ? surNullN / n : null,
    duplicate: hasSurpriseField ? dupN : null,
    primarySimilarity: simN > 0 ? simSum / simN : null,
    confidence: confN > 0 ? confSum / confN : null,
    pHigh: hiN > 0 ? hiS / hiN : null,
    nHigh: hiN,
    pLow: loN > 0 ? loS / loN : null,
    nLow: loN,
  };
}

// ───────────────────────────── 报告 ─────────────────────────────

export interface SimOptions {
  questionsPath?: string;
  personasPath?: string;
  n?: number; // 模拟用户数，默认 2500
  N?: number; // 标定模拟人数，默认 2500
  seed?: number; // 默认 7
  confidenceSamples?: number; // 引擎置信度采样数，默认 30
  quiet?: boolean;
}

const f = (x: number | null, digits = 2): string => (x == null || Number.isNaN(x) ? '—' : x.toFixed(digits));
const pc = (x: number | null): string => (x == null || Number.isNaN(x) ? '—' : `${(x * 100).toFixed(1)}%`);

export function runSimulation(opts: SimOptions = {}): string {
  const n = opts.n ?? 2500;
  const N = opts.N ?? 2500;
  const seed = opts.seed ?? 7;
  const confSamples = opts.confidenceSamples ?? 30;
  if (!Number.isInteger(n) || n < 10 || n > 20000) throw new Error('sim: n 必须是 10..20000 的整数');
  if (!Number.isInteger(N) || N < 10 || N > 20000) throw new Error('sim: N 必须是 10..20000 的整数');
  if (!Number.isInteger(seed) || seed < 0) throw new Error('sim: seed 必须是非负整数');

  const ds = loadDataset(opts.questionsPath, opts.personasPath);
  const { quiz, personas } = ds;
  const D = quiz.dimensions.length;
  // 按题库实际维度顺序取权重（不假设文件里的顺序与 DIMENSIONS 一致）
  const weights = weightsForDimensions(quiz.dimensions);
  const sampleUser = (r: () => number): number[] => toFullVector(quiz, randAnswers(quiz, r));

  const base = (o: object = {}) => ({ weights, sampleUser, N, seed, ...o });
  const mB = buildMatcher(personas, base({ hub: { enabled: false }, confidence: { samples: confSamples } }));
  const mC = buildMatcher(personas, base({ confidence: { samples: confSamples } }));
  const mD = buildMatcher(personas, base({ alignment: 'quantile', confidence: { samples: confSamples } }));

  const ids = mB.calibration.poolIds;
  const idx = new Map(ids.map((id, i) => [id, i]));
  const pByIdx = ids.map((id) => personas.find((p) => p.id === id)!);
  const psd = mB.calibration.personaSd;
  const wsum = weights.reduce((a, b) => a + b, 0);
  /** 中立参照：用户原始向量到角色的加权标准化欧氏距离（与四组方案都无关） */
  const distOf = (v: number[]): number[] =>
    pByIdx.map((p) =>
      Math.sqrt(
        weights.reduce((s, w, d) => s + w * ((v[d] - p.dims[d]) / psd[d]) ** 2, 0) / wsum,
      ),
    );

  // A 也必须只在参与普通匹配的角色池上比较，避免与 B/C/D 的人群口径不一致
  const poolPersonas = ids.map((id) => personas.find((p) => p.id === id)!);
  const baselineRun = makeBaseline(poolPersonas, weights);
  interface Arm {
    name: string;
    run: (v: number[]) => ArmOutput;
    /** 是否有次匹配门槛（A 没有，设计上恒有第二名） */
    hasSecondaryGate: boolean;
    /** 是否有意外人格（A 没有） */
    hasSurprise: boolean;
    /** 是否有引擎专属指标（绝对相似度/置信度） */
    hasEngineMetrics: boolean;
  }
  const arms: Arm[] = [
    { name: 'A 原始基线', run: baselineRun, hasSecondaryGate: false, hasSurprise: false, hasEngineMetrics: false },
    { name: 'B 动态高斯核', run: engineRun(mB), hasSecondaryGate: true, hasSurprise: true, hasEngineMetrics: true },
    { name: 'C +枢纽修正', run: engineRun(mC), hasSecondaryGate: true, hasSurprise: true, hasEngineMetrics: true },
    { name: 'D +分位数对齐', run: engineRun(mD), hasSecondaryGate: true, hasSurprise: true, hasEngineMetrics: true },
  ];

  const lines: string[] = [];
  const say = (s = '') => {
    lines.push(s);
    if (!opts.quiet) console.log(s);
  };

  say('# match-v2 v2.2 模拟报告');
  say();
  say(`- 引擎版本: ${MATCH_ENGINE_VERSION} / 项目配置: ${PROJECT_CONFIG_VERSION}`);
  say(`- 数据来源: 项目真实题库与角色矩阵（${path.relative(process.cwd(), ds.questionsPath)} + ${path.relative(process.cwd(), ds.personasPath)}，运行期间只读，未被修改）`);
  say(`- questions.json sha256: ${ds.questionsSha256}`);
  say(`- personas.json  sha256: ${ds.personasSha256}`);
  say(`- 题数 ${quiz.questions.length} | 维度 ${D} | 角色 ${personas.length} | 1—5 分归一化 | 权重来自 project-config`);
  say('- 数据校验: 上列 sha256 与 data/ 下真实文件逐字节一致，可用于确认本次模拟所用的数据集。');
  say(`- 标定 N=${N} | 模拟用户 n=${n} | seed=${seed} | 引擎置信度采样=${confSamples}`);
  say();
  say('> 模拟只验证机制、分布与统计口径，**不代表匹配准确率**；没有任何标注数据可以证明"更准"。');
  say();
  say('## 指标口径（四组统一）');
  say();
  say('1. 零出现：91 个角色中从未成为第一名的数量。');
  say('2. 最高占比：单角色最高第一名占比。');
  say('3. 熵：第一名分布的归一化熵（0..1，越高越分散）。');
  say('4. 稳定性：把每个用户 2 道题的答案改掉后，第一名不变的比例；四组使用同一扰动。');
  say('5. 中性排名均值：以用户原始向量到角色的加权标准化欧氏距离为中立参照，第一名在该参照下的平均排名（1 最好）。');
  say('6. 进中性前3：第一名进入中立参照前 3 的比例。');
  say('7. 相似度损失：第一名中立距离 − 最近角色中立距离，越小越贴近中立参照。');
  say('8. 次匹配相似度：第一、第二人格的角色对相似度（同一 sim 矩阵），分母为有次匹配的用户。');
  say('9. 次匹配异类：次匹配与主匹配 category 不同的比例，分母同上。');
  say('10. 次匹配空 / 意外空：为 null 的比例，分母为全部用户；A 没有门槛，设计上恒有第二名、无意外人格，标 "—"。');
  say('11. 三人重复：primary/secondary/surprise 去重后不足 3 人的用户人次；A 无意外人格，标 "—"。');
  say('12. 主匹配绝对相似度 / 平均置信度：仅引擎方案（B/C/D）具备，A 标 "—"。');
  say();

  const scenes: [string, SimUser[]][] = [
    ['随机作答', makeUsers(quiz, 'random', n, 101, distOf)],
    ['潜在画像作答', makeUsers(quiz, 'latent', n, 202, distOf)],
  ];

  for (const [sceneName, users] of scenes) {
    say(`## ${sceneName}（${n} 人）`);
    say();
    say('| 方案 | 零出现 | 最高占比 | 熵 | 稳定性 | 中性排名均值 | 进中性前3 | 相似度损失 | 次匹配相似度 | 次匹配异类 | 次匹配空 | 意外空 | 三人重复 |');
    say('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    const metricByArm = new Map<string, Metrics>();
    for (const arm of arms) {
      const e = evaluate(arm.run, users, ids, idx, pByIdx, mB.calibration.similarity);
      metricByArm.set(arm.name, e);
      const secNull = arm.hasSecondaryGate ? pc(e.secondaryNull) : '—';
      const surNull = arm.hasSurprise ? pc(e.surpriseNull) : '—';
      const dup = arm.hasSurprise && e.duplicate != null ? String(e.duplicate) : '—';
      say(
        `| ${arm.name} | ${e.never} | ${pc(e.maxShare)} | ${f(e.entropy, 3)} | ${pc(e.stability)} | ${f(e.neutralRank, 1)} | ${pc(e.neutralTop3)} | ${f(e.regret, 3)} | ${f(e.secondarySim)} | ${pc(e.secondaryDiffCat)} | ${secNull} | ${surNull} | ${dup} |`,
      );
    }
    say();
    say('引擎方案专属指标（A 无绝对相似度/置信度概念）：');
    say();
    say('| 方案 | 主匹配绝对相似度均值 | 平均置信度 | 稳定率(置信≥0.8) | 稳定率(置信<0.5) | 高置信样本 | 低置信样本 |');
    say('|---|---|---|---|---|---|---|');
    for (const name of ['B 动态高斯核', 'C +枢纽修正', 'D +分位数对齐']) {
      const e = metricByArm.get(name)!;
      say(
        `| ${name} | ${f(e.primarySimilarity, 1)} | ${f(e.confidence)} | ${pc(e.pHigh)} | ${pc(e.pLow)} | ${e.nHigh} | ${e.nLow} |`,
      );
    }
    say();
  }

  // ───── 参数敏感性：以 C 为默认，一次只动一个参数；统一指标口径 ─────
  const users = scenes[1][1];
  const defaultRun = arms[2].run;
  const defaultPrimary = users.map((u) => defaultRun(u.v).primary);
  say('## 参数敏感性（方案 C 为默认：γ=0.3, 上限=0.05, κ=1.0, geoMix=0.35；潜在画像用户）');
  say();
  say('| 参数 | 取值 | 与默认主匹配一致率 | 零出现 | 最高占比 | 熵 | 稳定性 | 中性排名均值 | 进中性前3 | 相似度损失 |');
  say('|---|---|---|---|---|---|---|---|---|---|');
  const sweeps: [string, string, object][] = [
    ['γ', '0（关）', { hub: { enabled: false } }],
    ['γ', '0.15', { hub: { gamma: 0.15 } }],
    ['γ', '0.3*', {}],
    ['γ', '0.5', { hub: { gamma: 0.5 } }],
    ['上限', '0.02', { hub: { maxShift: 0.02 } }],
    ['上限', '0.05*', {}],
    ['上限', '0.10', { hub: { maxShift: 0.1 } }],
    ['κ', '0.8', { kappa: 0.8 }],
    ['κ', '1.0*', {}],
    ['κ', '1.25', { kappa: 1.25 }],
    ['geoMix', '0', { geoMix: 0 }],
    ['geoMix', '0.35*', {}],
    ['geoMix', '0.7', { geoMix: 0.7 }],
  ];
  for (const [pname, value, o] of sweeps) {
    const run = engineRun(
      buildMatcher(personas, base({ confidence: { samples: 0 }, ...o })),
    );
    const e = evaluate(run, users, ids, idx, pByIdx, mB.calibration.similarity);
    const agree = users.reduce((s, u, i) => s + (run(u.v).primary === defaultPrimary[i] ? 1 : 0), 0) / users.length;
    say(
      `| ${pname} | ${value} | ${pc(agree)} | ${e.never} | ${pc(e.maxShare)} | ${f(e.entropy, 3)} | ${pc(e.stability)} | ${f(e.neutralRank, 1)} | ${pc(e.neutralTop3)} | ${f(e.regret, 3)} |`,
    );
  }
  say();
  say('## 说明与限制');
  say();
  say('- A 是"固定 σ + 算术均值 + 无门槛"的对照基线，不是生产方案。');
  say('- 分布是否均衡（零出现、熵、最高占比）只是机制指标，不等于匹配准确；本项目没有标注数据，不能计算准确率。');
  say('- 次匹配空/意外空在 A 上不适用，故不参与跨方案比较；四组真正可横向比较的是稳定性、中性参照指标与相似度损失。');
  say('- 本报告中的数据集由工作区按项目格式重建并冻结（见 data/README.md），**不是原项目那份真实矩阵**；若替换为原始题库与角色矩阵，代码与命令不变。');

  return lines.join('\n') + '\n';
}

// ───────────────────────────── CLI ─────────────────────────────

function parseArgs(argv: string[]): SimOptions {
  const get = (k: string): string | undefined => {
    const i = argv.indexOf('--' + k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const num = (k: string): number | undefined => {
    const v = get(k);
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error(`sim: --${k} 必须是数字`);
    return n;
  };
  return {
    questionsPath: get('questions'),
    personasPath: get('personas'),
    n: num('n'),
    N: num('N'),
    seed: num('seed'),
    confidenceSamples: num('confidence'),
  };
}

const isMain =
  process.argv[1] != null &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const opts = parseArgs(process.argv.slice(2));
  const outIdx = process.argv.indexOf('--out');
  const out = outIdx >= 0 ? process.argv[outIdx + 1] : undefined;
  const report = runSimulation(opts);
  if (out) {
    const outPath = path.resolve(out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, report);
    console.log(`\n报告已写入 ${outPath}`);
  }
}
