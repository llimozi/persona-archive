import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR } from './env.js';
import type { Question, Persona, LoadResult, ThemeConfig } from '../shared/types.js';
import { DIM_KEYS, DIM_MIN, DIM_MAX } from '../shared/types.js';

/**
 * data/ 下 JSON 的安全加载：文件缺失 / 空文件 / 解析失败 / 结构不符
 * 一律返回空数组 + 原因，**绝不抛错导致服务起不来**。
 *
 * 额外职责：加载时强制校验 `dims` 量纲（见 shared/types.ts 的 Dims 注释）。
 * 引擎内部有「0..1 自动识别」的历史兜底，但那会静默错掉一整档；
 * 所以在入库这道关口**直接拦下**量纲不合规的记录，并在 health / 列表接口透出原因。
 */

/** 量纲问题不会丢弃记录（避免整个产品因一条脏数据空掉），但必须被显式记录 */
export interface DimsIssue {
  id: string;
  detail: string;
}

async function readJsonFile<T>(filename: string): Promise<unknown> {
  const file = path.join(DATA_DIR, filename);
  const raw = await readFile(file, 'utf8');
  return JSON.parse(raw) as unknown;
}

function empty<T>(filename: string, source: LoadResult<T>['source'], error: string): LoadResult<T> {
  return { items: [], source, file: filename, error };
}

/** 支持裸数组、`{ items: [] }`、`{ personas: [] }` / `{ questions: [] }` 三种外层 */
function unwrapList(value: unknown, key: string): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (Array.isArray(obj.items)) return obj.items;
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return null;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * 检查 dims 是否合规。返回 null 表示合规，否则返回人类可读的原因（含实际值，便于定位）。
 *
 * 按约定 Dims 一律 0–100 百分制。这里拦五类问题：
 *  1. 缺键 / 值不是有限数字
 *  2. 值越界 [0,100]
 *  3. 出现小数 —— 百分制下 12 人的 72 个取值（12 卡 × 6 维）全为整数（实测范围 22–92，
 *     去重 35 个不同值），出现小数基本只有两种来源：
 *     按 0–1 制误填，或量纲混填（某一维写成 0.78、其余仍写 62/66/90）。
 *  4. 六维全部 ≤1 —— 整卡按 0–1 制填写。
 *  5. dims 缺失或不是对象
 *
 * 已知边界（**不要当成缺口去"修"，也不要描述成"已告警"**）：
 * 本守卫对**单个小整数**（如 `EE:1` 混在百分制里）**完全静默、不产生任何提示**，
 * 它会被当作合法值 1 使用。只有**六维全部 ≤1** 才触发第 4 条告警。
 * 原因：整数规则无法区分「真的是 1 分」与「本意 1% 的笔误」，为"值太小"设阈值
 * 没有客观依据——阈值取多少都是随意的，且会引入"多小算小"的第二个阈值。
 * 真正的风险是量纲混填，已由第 3 条（禁止小数）堵住。
 * 数据侧 `data/validate-data.mjs` 口径一致：只对整卡全 ≤1 警告，不对单个小整数告警。
 *
 * 第 3 条是内容数据上报的真实缺口：`{EE: 0.78, ST: 62, ...}` 每种取值都在 [0,100] 内、
 * 也不是"六维全 ≤1"，前几条规则全部放行，但整卡量纲已经错了。
 * 引擎对 0..1 有自动识别兜底，一旦误判就会**静默错掉一整档且不报错**，
 * 所以在入库这道关口直接拦下并告警。
 */
export function checkDims(dims: unknown): string | null {
  if (!dims || typeof dims !== 'object') return 'dims 缺失或不是对象';
  const d = dims as Record<string, unknown>;
  const missing = DIM_KEYS.filter((k) => !(k in d));
  if (missing.length) return `dims 缺键 ${missing.join('/')}`;
  const values: number[] = [];
  for (const k of DIM_KEYS) {
    const v = d[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) return `dims.${k} 不是有限数字：${String(v)}`;
    if (v < DIM_MIN || v > DIM_MAX) return `dims.${k}=${v} 超出 [${DIM_MIN},${DIM_MAX}] 百分制`;
    if (!Number.isInteger(v)) {
      return `dims.${k}=${v} 不是整数（0–100 百分制禁用小数，疑似 0–1 制混填或量纲错位）`;
    }
    values.push(v);
  }
  if (values.every((v) => v <= 1)) {
    return `dims 六维全部 ≤1（${values.join('/')}），疑似按 0–1 制填写，与 0–100 百分制约定冲突`;
  }
  return null;
}

function validatePersona(v: unknown): v is Persona {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  if (!isNonEmptyString(p.id) || !isNonEmptyString(p.name)) return false;
  // dims 量纲不合规的**不丢弃**（保留数据可用性），只记问题，交由上层告警
  return typeof p.dims === 'object' && p.dims !== null;
}

function validateQuestion(v: unknown): v is Question {
  if (!v || typeof v !== 'object') return false;
  const q = v as Record<string, unknown>;
  return isNonEmptyString(q.id) && isNonEmptyString(q.title) && Array.isArray(q.options);
}

/** 供 store.ts 在加载后调用，收集所有量纲问题 */
export function collectDimsIssues(items: Persona[]): DimsIssue[] {
  const issues: DimsIssue[] = [];
  for (const p of items) {
    const detail = checkDims((p as { dims?: unknown }).dims);
    if (detail) issues.push({ id: p.id, detail });
  }
  return issues;
}

/**
 * 校验 theme 配置（06 §4.2）：六维齐全、均为数字、且**和近似 1.0**。
 * 引擎不静默归一，权重和不是 1 会直接让匹配结果整体失真，所以这里必须报出来。
 * 返回 null 表示合规；不合规时返回说明（不阻断，降级为空并由路由透出）。
 *
 * ⚠️ 本函数**只校验六维之和**，不校验每一项是否等于 06 §9.1 的原文值。
 * 已知边界：`EE:0.1800001 + SR:0.1199999` 这类「逐项错位但和仍为 1.0」的情况，
 * 这里必然放行——它由 `data/validate-data.mjs` 的逐项字面量比对负责。
 * 两层不可互相替代：本层守「整体比例」，数据侧守「每一项抄没抄对」。
 */
export function checkTheme(t: unknown): string | null {
  if (t === undefined || t === null) return null; // 未配置 = 合法（用引擎兜底）
  if (typeof t !== 'object') return 'theme 不是对象';
  const theme = t as Record<string, unknown>;
  if (!isNonEmptyString(theme.themeId)) return 'theme.themeId 缺失或为空';
  const w = theme.weights;
  if (!w || typeof w !== 'object') return 'theme.weights 缺失或不是对象';
  const wd = w as Record<string, unknown>;
  let sum = 0;
  for (const k of DIM_KEYS) {
    const v = wd[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) return `theme.weights.${k} 不是有限数字：${String(v)}`;
    if (v < 0 || v > 1) return `theme.weights.${k}=${v} 超出 [0,1]`;
    sum += v;
  }
  if (Math.abs(sum - 1) > 1e-6) {
    return (
      `theme.weights 六维之和 = ${sum}，设计要求 1.0（引擎不静默归一）。` +
      `注意：本检查只校验「和」，不校验逐项数值是否与 06 §9.1 一致——` +
      `逐项由 data/validate-data.mjs 的跨源比对覆盖。`
    );
  }
  return null;
}

/** theme 的加载结果：未配置为 null；配置非法时原样返回 unknown 供路由判断 */
export async function loadTheme(): Promise<{ value: ThemeConfig | null; error?: string }> {
  let parsed: unknown;
  try {
    parsed = await readJsonFile('questions.json');
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e?.code === 'ENOENT') return { value: null };
    return { value: null, error: `theme 读取失败：${e?.message ?? String(err)}` };
  }
  if (!parsed || typeof parsed !== 'object') return { value: null };
  const raw = (parsed as Record<string, unknown>).theme;
  const problem = checkTheme(raw);
  if (problem) return { value: null, error: problem };
  return { value: (raw as ThemeConfig) ?? null };
}

async function loadList<T>(
  filename: string,
  key: string,
  guard: (v: unknown) => v is T,
): Promise<LoadResult<T>> {
  let parsed: unknown;
  try {
    parsed = await readJsonFile(filename);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    // 文件不存在 = 合法空态（数据同学还没交）
    if (e?.code === 'ENOENT') return empty<T>(filename, 'empty', 'file not found');
    return empty<T>(filename, 'invalid', e?.message ?? String(err));
  }

  const list = unwrapList(parsed, key);
  if (list === null) {
    return empty<T>(filename, 'invalid', 'JSON 顶层不是数组，也不含 items/' + key + ' 数组');
  }

  const items = list.filter(guard);
  const dropped = list.length - items.length;
  const dimsIssues = key === 'personas' ? collectDimsIssues(items as unknown as Persona[]) : [];
  const problems: string[] = [];
  if (dropped > 0) problems.push(`${dropped} 条记录结构不合法已丢弃`);
  if (dimsIssues.length > 0) {
    problems.push(
      `${dimsIssues.length} 条记录 dims 不合百分制量纲（引擎会静默错档）：` +
        dimsIssues.map((i) => `${i.id}(${i.detail})`).join('; '),
    );
  }

  return {
    items,
    source: 'file',
    file: filename,
    ...(problems.length > 0 ? { error: problems.join(' | ') } : {}),
  };
}

export function loadPersonas(): Promise<LoadResult<Persona>> {
  return loadList<Persona>('personas.json', 'personas', validatePersona);
}

export function loadQuestions(): Promise<LoadResult<Question>> {
  return loadList<Question>('questions.json', 'questions', validateQuestion);
}
