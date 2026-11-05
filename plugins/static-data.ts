/**
 * static-data 插件：把项目根的 data/*.json 以只读静态资源提供。
 *
 * 为什么需要：前端原先通过 `/api/questions`、`/api/personas` 取数据，
 * 那是 Fastify 后端在读 data/*.json 再转发。纯静态部署（Cloudflare Pages）
 * 没有后端进程，这两个请求会 404，页面卡在加载态。
 *
 * 做法：**不复制、不生成第二份 JSON**——直接从源文件读字节输出：
 *   - 开发：中间件拦截，dev server 与 preview 都生效
 *   - 构建：additionalAssets 把源文件原样写入 dist/web/data/
 * 因此 `data/questions.json` 永远是唯一真实来源，不存在两份需要同步的数据。
 *
 * 安全边界：只暴露白名单里的两个文件，不做目录遍历。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite';

/** 允许静态暴露的数据文件（白名单，防止任意路径穿越） */
const ALLOWED = new Set(['questions.json', 'personas.json']);

export function staticDataPlugin(dataDir: string): Plugin {
  /** dev 与 preview 共用的中间件：直接读源文件返回，保证同源同字节 */
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    const name = (req.url ?? '').replace(/^\//, '').split('?')[0] ?? '';
    if (!ALLOWED.has(name)) {
      next();
      return;
    }
    const file = path.join(dataDir, name);
    if (!fs.existsSync(file)) {
      next();
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // 与线上一致：可缓存但必须重新验证，避免改数据后客户端用旧值
    res.setHeader('Cache-Control', 'no-cache');
    fs.createReadStream(file).pipe(res);
  };

  return {
    name: 'static-data',

    // 开发：直接读源文件
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/data', middleware);
    },

    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use('/data', middleware);
    },

    // 构建：把源 JSON 原样写进产物目录，字节完全一致
    generateBundle() {
      for (const name of ALLOWED) {
        const file = path.join(dataDir, name);
        if (!fs.existsSync(file)) {
          this.error(`static-data: 缺少数据文件 ${file}`);
          continue;
        }
        this.emitFile({
          type: 'asset',
          fileName: `data/${name}`,
          source: fs.readFileSync(file),
        });
      }
    },
  };
}
