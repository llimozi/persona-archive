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
    // tests/v2 与 tests/e2e 不走 vitest：
    //   - tests/v2 用 node:test 编写（match-v2 v2.2 原包口径），用
    //     `node --test tests/v2/*.test.ts` 运行；
    //   - tests/e2e 用 Playwright。
    // 混跑会让 vitest 把 node:test 文件当成自己的用例而失败。
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**', 'tests/v2/**'],
    environment: 'node',
    reporters: 'default',
  },
});
