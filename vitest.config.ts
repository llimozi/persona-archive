import { defineConfig } from 'vitest/config';

/**
 * 独立于 vite.config.ts 的测试配置。
 *
 * 为什么必须单独一份：vite.config.ts 里 `root` 指向 `src/web`（前端构建需要），
 * 如果 vitest 复用它，测试文件的扫描根就变成 src/web，`tests/` 永远扫不到，
 * 配合 `--passWithNoTests` 会静默返回 0 —— 即「假绿」。
 * 所以这里 root 固定为仓库根，**不要**改成 src/web，也不要把本文件并进 vite.config.ts。
 */
export default defineConfig({
  test: {
    root: '.',
    include: ['tests/**/*.{test,spec}.ts', 'src/**/*.{test,spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    environment: 'node',
    reporters: 'default',
  },
});
