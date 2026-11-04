/**
 * /api 数据访问层 + 引擎调用层。
 *
 * 计算路径唯一：所有「六维分 / 主次匹配 / 百分比」一律来自 src/engine 的 `match()`。
 * 前端只消费结果结构，**不自己算分**（见 src/engine/index.ts 文件头约定）。
 * 之前这里有一份 normalizeDims 在前端二次归一化，已按主控裁决删除。
 */
import { DEFAULT_THEME_WEIGHTS, match } from '../../engine/index';
import type { MatchResult } from '../../engine/index';
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

/**
 * 唯一的计算入口：把作答交给引擎，拿回完整结果。
 *
 * 权重来源优先级：data/questions.json 的 theme.weights（权威源，经 /api/questions 下发）
 *              → 缺失时回退引擎 DEFAULT_THEME_WEIGHTS（06 §9.1 设计值，非实测）。
 */
export function runMatch(
  questions: Question[],
  personas: Persona[],
  answers: Answers,
  theme?: ThemeConfig,
): MatchResult | null {
  if (!questions.length || !personas.length) return null;
  const answerList = Object.keys(answers).map((qid) => ({ questionId: qid, optionId: answers[qid] }));
  try {
    return match({
      questions: questions as Parameters<typeof match>[0]['questions'],
      personas: personas as Parameters<typeof match>[0]['personas'],
      answers: answerList,
      theme: {
        themeId: theme?.themeId ?? 'th-general',
        name: '通用题库',
        weights: theme?.weights ?? DEFAULT_THEME_WEIGHTS,
      },
    });
  } catch {
    return null;
  }
}

/** 引擎 user.x ∈ [0,1] → 展示用 0–100 整数。仅做单位换算，不做归一化。 */
export function toDisplayDims(x: Record<DimKey, number>): Dims {
  const out = {} as Dims;
  for (const k of DIM_KEYS) {
    out[k as DimKey] = Math.round(Math.min(1, Math.max(0, x[k])) * 100);
  }
  return out;
}
