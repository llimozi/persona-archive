/**
 * project-config.ts — 项目既定的九维定义 / 权重 / 1—5 分归一化 / 用户向量公式
 *
 * **本文件是唯一口径**：线上匹配、模拟器、测试都从这里取维度顺序、权重、
 * 归一化与 computeUserVector，不允许任何调用方另写一套。
 *
 * ⚠️ 与 match-v2-v2.2 原包的差异（集成时按项目真实口径改造，算法主体未动）：
 *   原包 DIMENSIONS 是「理性/情感/社交/行动/审美/秩序/探索/共情/坚韧」——
 *   那是数据缺失时的重建占位；项目的真实九维是
 *   「闷骚/反差/猥琐/社牛/畜生/嘉豪/嘴欠/抽象/兑现」（代码 MS/FC/…/KD）。
 *   原包 DIM_WEIGHTS 是按位置轮转的占位公式；本项目题库未给九维权重，
 *   这里改为等权，并在下方写明出处，不沿用与项目语义无关的轮转公式。
 *
 * questions.json 真实格式（本项目现有，与包不同）：
 *   {
 *     "questions": [{
 *       "id": "q-gen-001",
 *       "dimensionId": "AB",           // 该题归属的唯一维度代码
 *       "reverse": false,              // 反向计分：6 - 原始分
 *       "optionScore": {"A": 4, ...},  // 选项 id → 1..5 原始分
 *       "questionWeight": 1,           // 默认 1
 *       "options": [{"id": "A", "label": "..."}]
 *     }]
 *   }
 *
 * personas.json 真实格式：nineDims 是按维度**代码**（MS/FC/…）索引的 0..100 对象。
 */

import type { Persona } from './match-v2.ts';
import { NINE_DIMS } from '../shared/nine-dims.ts';

export const PROJECT_CONFIG_VERSION = '2.0.0';

/** 九维顺序：01–09，与 NINE_DIMS 严格一致 */
export const DIMENSIONS: readonly string[] = NINE_DIMS.map((d) => d.key);

/** 维度代码 → 中文名（对外展示用） */
export const DIMENSION_LABELS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(NINE_DIMS.map((d) => [d.key, d.name])) as Record<string, string>,
);

export const DIMENSION_COUNT = DIMENSIONS.length;

/**
 * 九维权重（位置顺序与 DIMENSIONS 一致）。
 *
 * 来源与口径：项目题库的 theme.weights 是**旧六维**的权重，
 * 九维升级后未单独给出九维权重，因此这里按**等权**处理。
 * 这是设计值不是校准值；若后续要引入九维权重，只改这一行并在此写明出处。
 */
export const DIM_WEIGHTS: number[] = DIMENSIONS.map(() => 1 / DIMENSION_COUNT);

export const SCORE_SCALE_MIN = 1;
export const SCORE_SCALE_MAX = 5;
export type ScoreScale = '1-5' | '0-1';

/** 1—5 分归一化到 0..1；0-1 量表原样返回。越界直接报错，避免静默错位。 */
export function normalizeOptionScore(score: number, scale: ScoreScale): number {
  if (!Number.isFinite(score)) throw new Error(`project-config: 选项分数不是有限数字: ${String(score)}`);
  if (scale === '1-5') {
    // 本项目题库允许 1–5 之间的小数（题内按相对次序细分的档位），
    // 因此校验放宽为**闭区间**，不要求整数。
    if (score < SCORE_SCALE_MIN || score > SCORE_SCALE_MAX) {
      throw new Error(`project-config: 1-5 量表分数越界: ${score}`);
    }
    return (score - SCORE_SCALE_MIN) / (SCORE_SCALE_MAX - SCORE_SCALE_MIN);
  }
  if (score < 0 || score > 1) throw new Error(`project-config: 0-1 量表分数越界: ${score}`);
  return score;
}

export interface QuizOption {
  id: string;
  text?: string;
  /** 维度代码 -> 原始分（1..5） */
  scores: Record<string, number>;
}

export interface Question {
  id: string;
  /** 该题归属的唯一维度代码 */
  dimension: string;
  /** 反向计分：answerScore = 6 - 原始分 */
  reverse: boolean;
  weight: number;
  options: QuizOption[];
}

export interface Quiz {
  dimensions: string[];
  scoreScale: ScoreScale;
  questions: Question[];
}

/**
 * 用户九维向量。
 *
 * 每一维 = 该维上所有已答题目的（归一化后）分数按题目 weight 的加权平均；
 * 该维从未被任何已答题目触及时为 null（未作答语义，**不会**用 0 冒充满分）。
 */
export function computeUserVector(quiz: Quiz, answers: (number | null)[]): (number | null)[] {
  const D = quiz.dimensions.length;
  const dimIndex = new Map(quiz.dimensions.map((name, i) => [name, i]));
  const sums = new Array<number>(D).fill(0);
  const wsums = new Array<number>(D).fill(0);
  if (!Array.isArray(answers) || answers.length !== quiz.questions.length) {
    throw new Error(`project-config: 答案数量必须是题目数 ${quiz.questions.length}`);
  }
  answers.forEach((a, qi) => {
    if (a == null || a < 0) return;
    const q = quiz.questions[qi]!;
    if (!Number.isInteger(a) || a >= q.options.length) {
      throw new Error(`project-config: 第 ${qi} 题答案下标非法: ${a}`);
    }
    const qw = q.weight;
    if (!Number.isFinite(qw) || qw <= 0) throw new Error(`project-config: 第 ${qi} 题 weight 非法: ${qw}`);
    const option = q.options[a]!;
    for (const [dimCode, raw] of Object.entries(option.scores)) {
      const d = dimIndex.get(dimCode);
      if (d === undefined) throw new Error(`project-config: 未知维度 "${dimCode}"（第 ${qi} 题）`);
      // 反向题：6 - 原值，再做 1..5 → 0..1 归一化
      const effective = q.reverse ? SCORE_SCALE_MAX + SCORE_SCALE_MIN - raw : raw;
      const v = normalizeOptionScore(effective, quiz.scoreScale);
      sums[d]! += v * qw;
      wsums[d]! += qw;
    }
  });
  return sums.map((s, d) => (wsums[d]! > 0 ? s / wsums[d]! : null));
}

/** 校验并解析真实 questions.json，返回规范化的 Quiz */
export function parseQuiz(input: unknown): Quiz {
  if (input == null || typeof input !== 'object') throw new Error('project-config: questions.json 必须是对象');
  const obj = input as Record<string, unknown>;
  const rawQuestions = obj.questions;
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    throw new Error('project-config: questions.json 缺少非空 questions 数组');
  }

  const dimensions = [...DIMENSIONS];
  const dimSet = new Set(dimensions);

  const questions: Question[] = rawQuestions.map((q, qi) => {
    if (q == null || typeof q !== 'object') throw new Error(`project-config: 第 ${qi} 题必须是对象`);
    const qo = q as Record<string, unknown>;
    if (typeof qo.id !== 'string' || qo.id.length === 0) throw new Error(`project-config: 第 ${qi} 题缺少 id`);

    // 真实格式用 dimensionId（维度代码）；同时兼容 dimension 字段名
    const dimension = String(qo.dimensionId ?? qo.dimension ?? '');
    if (!dimension) throw new Error(`project-config: 第 ${qi} 题缺少 dimensionId`);
    if (!dimSet.has(dimension)) throw new Error(`project-config: 第 ${qi} 题维度非法: ${dimension}`);

    if (!Array.isArray(qo.options) || qo.options.length === 0) {
      throw new Error(`project-config: 第 ${qi} 题缺少 options`);
    }
    const rawScores = (qo.optionScore ?? qo.scores) as Record<string, unknown> | undefined;
    if (rawScores == null || typeof rawScores !== 'object' || Array.isArray(rawScores)) {
      throw new Error(`project-config: 第 ${qi} 题缺少 optionScore`);
    }

    const reverse = qo.reverse === true;
    const weightRaw = qo.questionWeight ?? qo.weight ?? 1;
    const weight = Number(weightRaw);
    if (!Number.isFinite(weight) || weight <= 0) throw new Error(`project-config: 第 ${qi} 题 weight 非法`);

    const options: QuizOption[] = (qo.options as unknown[]).map((o, oi) => {
      if (o == null || typeof o !== 'object') throw new Error(`project-config: 第 ${qi} 题第 ${oi} 个选项必须是对象`);
      const oo = o as Record<string, unknown>;
      const id = String(oo.id ?? '');
      if (!id) throw new Error(`project-config: 第 ${qi} 题第 ${oi} 个选项缺少 id`);
      const raw = Number(rawScores[id]);
      if (!Number.isFinite(raw)) {
        throw new Error(`project-config: 第 ${qi} 题选项 ${id} 缺少分值`);
      }
      // 允许小数：题库用 1–5 之间的两位小数细分档位（见文件头说明）
      if (raw < SCORE_SCALE_MIN || raw > SCORE_SCALE_MAX) {
        throw new Error(`project-config: 第 ${qi} 题选项 ${id} 分值越界: ${raw}`);
      }
      // 每题只归一个维度：该题的分值即该维度的原始分
      return { id, text: typeof oo.label === 'string' ? oo.label : undefined, scores: { [dimension]: raw } };
    });

    return { id: qo.id, dimension, reverse, weight, options };
  });

  return { dimensions, scoreScale: '1-5', questions };
}

/** 校验并解析真实 personas.json，转成引擎 Persona（nineDims 0..100 -> 0..1） */
export function parsePersonas(input: unknown, dimensions: string[]): Persona[] {
  if (input == null || typeof input !== 'object') throw new Error('project-config: personas.json 必须是对象');
  const obj = input as Record<string, unknown>;
  const arr = Array.isArray(obj) ? obj : obj.personas;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error('project-config: personas.json 缺少非空 personas 数组');
  }
  return arr.map((p, i) => {
    if (p == null || typeof p !== 'object') throw new Error(`project-config: 第 ${i} 个角色必须是对象`);
    const po = p as Record<string, unknown>;
    if (typeof po.id !== 'string' || po.id.length === 0) throw new Error(`project-config: 第 ${i} 个角色缺少 id`);
    if (typeof po.category !== 'string' || po.category.length === 0) {
      throw new Error(`project-config: 角色 ${po.id} 缺少 category`);
    }
    const nd = (po.nineDims ?? po.dims) as unknown;
    let values: number[];
    if (Array.isArray(nd)) {
      if (nd.length !== dimensions.length) throw new Error(`project-config: 角色 ${po.id} 九维数量不是 ${dimensions.length}`);
      values = nd.map((x) => {
        const n = Number(x);
        if (!Number.isFinite(n)) throw new Error(`project-config: 角色 ${po.id} 九维数据非法: ${String(x)}`);
        return n > 1 ? n / 100 : n;
      });
    } else if (nd != null && typeof nd === 'object') {
      values = dimensions.map((name) => {
        const n = Number((nd as Record<string, unknown>)[name]);
        if (!Number.isFinite(n)) throw new Error(`project-config: 角色 ${po.id} 缺少维度 ${name}`);
        return n > 1 ? n / 100 : n;
      });
    } else {
      throw new Error(`project-config: 角色 ${po.id} 缺少 nineDims`);
    }
    const tags = Array.isArray(po.tags) ? po.tags.map((t) => String(t)) : undefined;
    const compliance = po.compliance as Record<string, unknown> | undefined;
    const rarity = typeof po.rarity === 'string' ? (po.rarity as Persona['rarity']) : undefined;
    const serialNo = po.serialNo === undefined ? i : Number(po.serialNo);
    return {
      id: po.id,
      category: po.category,
      rarity,
      dims: values,
      sigma: undefined,
      tags,
      matchPool: compliance?.matchPool === false ? false : true,
      serialNo,
    } satisfies Persona;
  });
}

/** 按题库实际维度顺序返回权重 */
export function weightsForDimensions(dimensions: string[]): number[] {
  if (dimensions.length !== DIMENSION_COUNT) {
    throw new Error(`project-config: 维度数必须是 ${DIMENSION_COUNT}，收到 ${dimensions.length}`);
  }
  return dimensions.map((name) => {
    const i = DIMENSIONS.indexOf(name);
    if (i < 0) throw new Error(`project-config: 未知维度名 "${name}"，无法匹配权重`);
    return DIM_WEIGHTS[i]!;
  });
}

export { DIMENSIONS as PROJECT_DIMENSIONS };
