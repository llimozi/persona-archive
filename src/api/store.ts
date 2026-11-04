import type { LoadResult, ThemeConfig } from '../shared/types.js';
import { loadPersonas, loadQuestions, loadTheme } from './dataStore.js';

/**
 * 内存数据快照：启动时加载一次，之后可由 /api/admin/reload 热重载。
 * 单进程单实例，不做缓存失效，够 MVP 用。
 */

interface Snapshot {
  personas: LoadResult<unknown>;
  questions: LoadResult<unknown>;
  /** 主题配置（含六维权重）。null 表示数据里没配，由调用方用引擎兜底 */
  theme: ThemeConfig | null;
  themeError?: string;
  loadedAt: string;
  loadMs: number;
}

let snapshot: Snapshot | null = null;

export async function refresh(): Promise<Snapshot> {
  const started = performance.now();
  const [personas, questions, theme] = await Promise.all([loadPersonas(), loadQuestions(), loadTheme()]);
  snapshot = {
    personas: personas as LoadResult<unknown>,
    questions: questions as LoadResult<unknown>,
    theme: theme.value,
    ...(theme.error ? { themeError: theme.error } : {}),
    loadedAt: new Date().toISOString(),
    loadMs: Math.round(performance.now() - started),
  };
  return snapshot;
}

export function getSnapshot(): Snapshot | null {
  return snapshot;
}

export function statusLine(): string {
  if (!snapshot) return 'data: 未加载';
  const p = snapshot.personas;
  const q = snapshot.questions;
  const t = snapshot.theme ? snapshot.theme.themeId : '未配置';
  return `data: personas=${p.items.length}(${p.source}) questions=${q.items.length}(${q.source}) theme=${t} in ${snapshot.loadMs}ms`;
}
