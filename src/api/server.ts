import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { API_HOST, API_PORT, IS_PROD, WEB_DIST_DIR, WEB_PORT } from './env.js';
import { registerRoutes } from './routes.js';
import { refresh, statusLine } from './store.js';

async function main(): Promise<void> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      // pino-pretty 只在非生产环境启用，并且已列入 devDependencies
      transport: IS_PROD
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
  });

  // 启动即加载 data/*.json；加载失败也不阻塞启动（降级为空数据）
  try {
    await refresh();
  } catch (err) {
    app.log.error({ err }, '数据加载异常，服务以空数据启动');
  }

  await registerRoutes(app);

  // 生产：同一进程托管 dist/web 静态产物（单端口部署）
  // 开发：vite dev server 负责前端，这里不注册静态根，避免抢路由
  if (existsSync(WEB_DIST_DIR)) {
    await app.register(fastifyStatic, { root: WEB_DIST_DIR, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      const url = req.url ?? '/';
      if (url.startsWith('/api')) {
        return reply.code(404).send({ error: 'not_found', message: url });
      }
      return reply.sendFile('index.html');
    });
  }

  await app.listen({ port: API_PORT, host: API_HOST });
  app.log.info(statusLine());
  app.log.info(`API   → http://${API_HOST}:${API_PORT}/api/health`);
  app.log.info(`WEB   → http://127.0.0.1:${WEB_PORT}  (vite dev server)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
