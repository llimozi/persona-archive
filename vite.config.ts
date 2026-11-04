import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { ServerResponse } from 'node:http';

const API_PORT = Number(process.env.API_PORT ?? 8787);
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);
// 以本配置文件所在目录为锚点，保证从任何 cwd 启动路径都不跑偏（Windows 路径安全）
const ROOT = path.dirname(fileURLToPath(import.meta.url));

const API_ORIGIN = `http://127.0.0.1:${API_PORT}`;

/**
 * 把上游不可达 / 代理异常暴露成可诊断的 JSON，而不是 Vite 默认的空 500。
 * 背景：API 还没起来时 Vite proxy 会吞掉 ECONNREFUSED 返一个没有 body 的 500，
 * 排查时容易被误判成「数据有问题」。
 */
function onProxyError(
  err: NodeJS.ErrnoException,
  req: { url?: string },
  res: ServerResponse | import('node:net').Socket,
): void {
  const code = err?.code ?? 'UNKNOWN';
  const hint =
    code === 'ECONNREFUSED'
      ? ` 上游 API 未启动或尚未就绪，请先跑 pnpm dev:api（目标 ${API_ORIGIN}）`
      : code === 'ECONNRESET'
        ? ' 上游 API 连接被重置，可能正在热重载，稍后重试'
        : '';
  // eslint-disable-next-line no-console
  console.error(`[vite proxy] ${req.url ?? ''} -> ${API_ORIGIN} 失败 [${code}]${hint}`);

  if (res && 'writable' in res && res.writable && !('closed' in res && res.destroyed)) {
    const body = JSON.stringify({
      error: 'upstream_unavailable',
      code,
      upstream: API_ORIGIN,
      path: req.url,
      message: `${err?.message ?? 'proxy error'}.${hint}`,
      hint: '这是 API 端的连接问题，不是数据问题；确认 8787 端口有进程在 LISTENING 后重试。',
    });
    (res as ServerResponse).writeHead(502, {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Proxy-Error': code,
    });
    (res as ServerResponse).end(body);
  }
}

/**
 * Windows 上 chokidar/fs.watch 可能对锁定的临时文件抛 EBUSY，
 * 默认没有 error 监听时会变成未捕获异常并结束 Vite 进程。这里兜底降级为告警。
 */
function guardWatcherErrors(server: { watcher?: { on?: (e: string, cb: (err: Error) => void) => void } }): void {
  server.watcher?.on?.('error', (err: NodeJS.ErrnoException) => {
    // eslint-disable-next-line no-console
    console.warn(`[vite watch] 忽略文件监听错误 [${err?.code ?? 'UNKNOWN'}] ${err?.path ?? ''}`);
  });
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'guard-watcher-errors',
      configureServer(server) {
        guardWatcherErrors(server);
      },
    },
  ],
  root: path.join(ROOT, 'src/web'),
  publicDir: path.join(ROOT, 'public'),
  server: {
    port: WEB_PORT,
    strictPort: true,
    host: true,
    watch: {
      // Windows + 编辑器原子写入会留下 `.App.tsx.14512.xxx.tmpdir/App.tsx.tmp` 这类临时文件，
      // 被 chokidar 纳入监听后 fs.watch 抛 EBUSY，FSWatcher 的 error 事件会**直接崩掉 Vite 进程**
      // （实测导致 pnpm dev 整体退出）。忽略既匹配不到真实源码，也不会漏热更新。
      ignored: [
        '**/node_modules/**',
        '**/.git/**',
        '**/*.tmp',
        '**/*.tmpdir/**',
        '**/.*.tmpdir/**',
        '**/.~*',
        '**/*.swp',
        '**/#*#',
      ],
    },
    proxy: {
      '/api': {
        target: API_ORIGIN,
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', onProxyError);
        },
      },
    },
  },
  build: {
    outDir: path.join(ROOT, 'dist/web'),
    emptyOutDir: true,
  },
  preview: {
    port: Number(process.env.PREVIEW_PORT ?? 4173),
  },
});
