import type { FastifyInstance } from 'fastify';
import { DIM_KEYS } from '../shared/types.js';
import { getSnapshot, refresh } from './store.js';

/** 所有 /api 路由集中注册在这里，接口契约改动需先通知前端/算法/测试。 */
export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', async () => {
    const snap = getSnapshot();
    return {
      status: 'ok',
      service: 'persona-archive-api',
      version: '0.1.0',
      uptimeSec: Math.round(process.uptime()),
      time: new Date().toISOString(),
      dims: DIM_KEYS,
      /** dims 量纲约定：一律 0–100 百分制（见 shared/types.ts） */
      dimsUnit: '0-100',
      data: snap
        ? {
            loadedAt: snap.loadedAt,
            loadMs: snap.loadMs,
            personas: {
              count: snap.personas.items.length,
              source: snap.personas.source,
              // 结构丢弃 / dims 量纲越界都会出现在这里，务必不要忽略
              ...(snap.personas.error ? { warning: snap.personas.error } : {}),
            },
            questions: {
              count: snap.questions.items.length,
              source: snap.questions.source,
              ...(snap.questions.error ? { warning: snap.questions.error } : {}),
            },
          }
        : null,
    };
  });

  app.get('/api/personas', async () => {
    const snap = getSnapshot();
    const r = snap?.personas;
    if (!r) return { items: [], source: 'empty' as const, total: 0 };
    return { items: r.items, source: r.source, total: r.items.length, ...(r.error ? { warning: r.error } : {}) };
  });

  app.get('/api/personas/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const items = (getSnapshot()?.personas.items ?? []) as Array<{ id: string }>;
    const found = items.find((p) => p.id === id);
    if (!found) return reply.code(404).send({ error: 'not_found', message: `persona ${id} 不存在` });
    return found;
  });

  app.get('/api/questions', async () => {
    const snap = getSnapshot();
    const r = snap?.questions;
    if (!r) return { items: [], source: 'empty' as const, total: 0 };
    const problems = [r.error, snap?.themeError].filter(Boolean);
    return {
      items: r.items,
      source: r.source,
      total: r.items.length,
      // 主题配置（含六维权重）随题库一起下发：前端与分享链接重算都以此为准，
      // 读不到时才回退到引擎的 DEFAULT_THEME_WEIGHTS。
      ...(snap?.theme ? { theme: snap.theme } : {}),
      ...(problems.length ? { warning: problems.join(' | ') } : {}),
    };
  });

  // 数据同学改了 data/*.json 后可不重启直接刷新内存
  app.post('/api/admin/reload', async () => {
    const snap = await refresh();
    const warnings = [snap.personas.error, snap.questions.error, snap.themeError].filter(Boolean);
    return {
      ok: true,
      loadedAt: snap.loadedAt,
      personas: snap.personas.items.length,
      questions: snap.questions.items.length,
      theme: snap.theme ? snap.theme.themeId : null,
      ...(warnings.length ? { warning: warnings.join(' | ') } : {}),
    };
  });
}
