import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 项目根目录。
 * 优先级：显式 PROJECT_ROOT > 文件位置推断。
 * dev/build 脚本都会注入 PROJECT_ROOT=.，业务代码不依赖推断结果；
 * 推断只作为直接 `node/tsx src/api/server.ts` 时的兜底。
 */
/** 从当前模块目录向上找含 package.json 的目录。 */
function findUp(start: string, filename: string, maxDepth = 8): string | null {
  let dir = start;
  for (let i = 0; i <= maxDepth; i += 1) {
    if (existsSync(path.join(dir, filename))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveProjectRoot(): string {
  const fromEnv = process.env.PROJECT_ROOT;
  if (fromEnv && fromEnv.trim()) return path.resolve(fromEnv);
  // 源码态 src/api/env.ts 与构建态 dist/api/src/api/env.js 层级不同，
  // 统一向上回溯到最近的 package.json，避免写死层级数。
  return findUp(__dirname, 'package.json') ?? path.resolve(__dirname, '../..');
}

export const PROJECT_ROOT = resolveProjectRoot();
export const IS_PROD = process.env.NODE_ENV === 'production';

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(PROJECT_ROOT, 'data');

export const API_PORT = Number(process.env.API_PORT ?? 8787);
export const API_HOST = process.env.API_HOST ?? '127.0.0.1';
export const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);
export const WEB_DIST_DIR = path.join(PROJECT_ROOT, 'dist/web');

export { readFile, readdir, path };
