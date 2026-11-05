/**
 * /api 数据访问层 + 匹配引擎调用层。
 *
 * 2026-11-05 起，匹配改用 **match-v2 v2.2**（src/engine-v2）。
 * 旧引擎（src/engine）保留在仓库里作为历史与对照，但**不再被前端调用**。
 *
 * 计算路径唯一：所有「匹配结果 / 相似度」一律来自 match-v2 的 `buildMatcher(...).match()`，
 * 前端只消费结果结构，**不自己算分**。
 */

import {
  buildMatcher,
  type MatchResult as V2MatchResult,
  type Ranked,
} from '../../engine-v2/match-v2';
import {
  computeUserVector,
  parsePersonas,
  parseQuiz,
  weightsForDimensions,
  type Quiz,
} from '../../engine-v2/project-config';
import type { Dims, DimKey, Persona, Question, ThemeConfig } from '../../shared/types';
import { DIM_KEYS } from '../../shared/types';

export interface ListResponse<T> {
  items: T[];
  source: 'file' | 'empty' | 'invalid';
  total: number;
  warning?: string;
  /** 主题配置：权重优先取这里（data/ 为权威源） */
  theme?: ThemeConfig;
}

/** /api 列表接口统一解包：兼容裸数组与 { items } 两种形状 */
async function fetchList<T>(path: string): Promise<ListResponse<T>> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  const raw: unknown = await res.json();
  if (Array.isArray(raw)) {
    return { items: raw as T[], source: 'file', total: raw.length };
  }
  const obj = raw as Partial<ListResponse<T>>;
  const items = Array.isArray(obj?.items) ? obj.items : [];
  return {
    items,
    source: obj.source ?? (items.length ? 'file' : 'empty'),
    total: items.length,
    ...(obj.warning ? { warning: obj.warning } : {}),
    ...(obj.theme ? { theme: obj.theme } : {}),
  };
}

export function fetchQuestions(): Promise<ListResponse<Question>> {
  return fetchList<Question>('/api/questions');
}

export function fetchPersonas(): Promise<ListResponse<Persona>> {
  return fetchList<Persona>('/api/personas');
}

/** 答案映射：questionId → optionId */
export type Answers = Record<string, string>;

// ─────────────────────── match-v2 适配 ───────────────────────

/** 适配后的结果形状：保持旧调用方（App / 结果页）无需大改 */
export interface MatchResult {
  /** 主匹配 */
  main: { persona: RankedPersona } | null;
  /** 次匹配（MMR 选出） */
  secondary: { persona: RankedPersona } | null;
  /** 意外人格 */
  surprise: { persona: RankedPersona } | null;
  /** 全量排名 */
  ranking: RankedPersona[];
  /** 用户九维向量（0..1），未作答维度用 null 表示 */
  userX: (number | null)[];
  /** 稳定性置信度 0..1，0 表示未启用 */
  confidence: number;
  /** 第一名与第二名的排序分差，恒 ≥ 0 */
  margin: number;
  /** 已作答维度占比 */
  coverage: number;
}

/** 展示用角色：把 v2 的 Ranked 摊平成旧结构 */
export interface RankedPersona {
  id: string;
  name: string;
  category: string;
  tags: string[];
  /** 对外展示的匹配度 0–100，取自排序分（见 toRanked 注释）。页面叫「娱乐匹配度」，不是概率 */
  percent: number;
  /** 相对百分位 0–100，展示时必须标注「相对」 */
  percentile: number;
  /** 排序分（引擎原值，保留供调试与排序核对） */
  adjusted: number;
  /** 纯核得分 0–100（round(raw*100)）。仅内部参考，**不对外展示**，避免与排名字段语义打架 */
  similarityRaw: number;
}

/**
 * 展示口径说明（2026-11-05 审计后统一）：
 *
 * 引擎给出两个数，语义不同：
 *   - `similarity` = round(raw × 100)：**纯核得分**，只看「用户向量与角色向量的接近程度」；
 *   - `adjusted`   = raw × 标签加成 − 枢纽修正：**排序分**，排名由它决定。
 *
 * 两者会打架：枢纽修正最多 ±0.05，足以让第 2 名的 similarity 高于第 1 名。
 * 实测 2000 次随机作答，**12.6%** 的情况「排名第 2 的 similarity 反而更高」，
 * 用户会看到「主匹配 56%、第二人格 57%」这种无法解释的组合。
 *
 * 因此展示值统一用 **adjusted**，与排序严格同源：
 *   - 排名第 1 的展示分一定是全场最高，不会出现下位反超；
 *   - 在当前真实数据与默认参数下 adjusted 实测落在 0.0939~0.8707，**从不出现负值**
 *     （15 万样本 0 次为负），所以直接取整展示不会遇到负数问题。
 *
 * 注意：这**没有**改变任何排名或算法，只把「对外展示哪个数」从 raw 换成排序分。
 */
function toRanked(r: Ranked, nameOf: (id: string) => string | undefined): RankedPersona {
  // 防御性夹取：极小概率下若未来参数变动导致 adjusted 为负，展示下限压到 0，不出现负分
  const shown = Math.max(0, Math.round(r.adjusted * 100));
  return {
    id: r.persona.id,
    name: nameOf(r.persona.id) ?? r.persona.id,
    category: r.persona.category,
    tags: r.persona.tags ?? [],
    percent: shown,
    percentile: r.percentile,
    adjusted: r.adjusted,
    similarityRaw: r.similarity,
  };
}

/**
 * 唯一计算入口：把作答交给 match-v2，拿回完整结果。
 *
 * 注意事项（与旧引擎不同）：
 *  - `userTags` 已从 Options 移到**每次调用**：`match(user, { userTags })`。
 *    这里不传，即标签加成关闭（项目当前没有标签规则数据）。
 *  - `matchWeight` 已移除。
 *  - similarity = 绝对相似度；percentile = 相对百分位（两者语义不同，不可混用）。
 */
export function runMatch(
  questions: Question[],
  personas: Persona[],
  answers: Answers,
  _theme?: ThemeConfig,
): MatchResult | null {
  if (!questions.length || !personas.length) return null;

  try {
    // 题库：用真实格式解析（dimensionId / optionScore / reverse / questionWeight）
    const quiz: Quiz = parseQuiz({ questions });
    const dims = quiz.dimensions;

    // 角色：真实 nineDims（0..100 → 0..1）
    const enginePersonas = parsePersonas({ personas }, dims);

    // 作答：questionId → 选项下标
    const answersByIndex: (number | null)[] = quiz.questions.map((q) => {
      const optId = answers[q.id];
      if (!optId) return null;
      const idx = q.options.findIndex((o) => o.id === optId);
      return idx >= 0 ? idx : null;
    });

    const userVector = computeUserVector(quiz, answersByIndex);

    // 标定用的随机作答：沿用同一份题库，保证 sampleUser 与真实作答同口径
    const weights = weightsForDimensions(dims);
    const matcher = buildMatcher(enginePersonas, {
      weights,
      sampleUser: (rnd: () => number) =>
        computeUserVector(
          quiz,
          quiz.questions.map((q) => Math.floor(rnd() * q.options.length)),
        ).map((v) => v ?? 0.5),
      N: 800,
      seed: 20260101,
      confidence: { samples: 12 },
    });

    const res: V2MatchResult = matcher.match(userVector);

    const nameOf = (id: string) => personas.find((p) => p.id === id)?.name;

    return {
      main: res.primary ? { persona: toRanked(res.primary, nameOf) } : null,
      secondary: res.secondary ? { persona: toRanked(res.secondary, nameOf) } : null,
      surprise: res.surprise ? { persona: toRanked(res.surprise, nameOf) } : null,
      ranking: res.ranked.map((r) => toRanked(r, nameOf)),
      userX: userVector,
      confidence: res.confidence,
      margin: res.margin,
      coverage: res.coverage,
    };
  } catch (err) {
    // 不吞错：开发期应当能看到具体原因；对外仍然返回 null，由调用方降级
    // eslint-disable-next-line no-console
    console.error('[match-v2] 匹配失败:', err);
    return null;
  }
}

/** 旧六维展示用：项目当前已切九维，这里保留给仍在引用旧类型的代码 */
export function toDisplayDims(x: Record<DimKey, number>): Dims {
  const out = {} as Dims;
  for (const k of DIM_KEYS) {
    out[k as DimKey] = Math.round(Math.min(1, Math.max(0, x[k])) * 100);
  }
  return out;
}
