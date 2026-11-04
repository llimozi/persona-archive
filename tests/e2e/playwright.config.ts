import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/** 结果文件用**绝对路径**：相对路径会按 testDir 解析，实测曾在删除后完全不再生成。 */
const HERE = dirname(fileURLToPath(import.meta.url));
const RESULT_JSON = resolve(HERE, 'test-results/e2e.json');

/**
 * E2E 配置。责任人：风控审查（QA）。
 * 位置放在 tests/** 内，根 package.json 只需一行 `test:e2e` 脚本。
 *
 * ⚠️ 诚实性：这里的 viewport 是**视口模拟**，不是微信内置浏览器实测。
 *    真机 / 微信内验证在报告中一律记 NOT RUN。
 */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.e2e\.ts$/,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  /** Windows 下多 worker 并发写 trace 会触发 ENOENT（test-results 目录被并发清理），固定单 worker */
  workers: 1,
  reporter: [['list'], ['json', { outputFile: RESULT_JSON }]],
  use: {
    /**
     * ⚠️ 默认值必须是**安全的那个**（主控 2026-11-05 裁定）。
     * 5173 是 `tsx watch` 的 dev 端口，任何文件改动都会触发热重载、页面状态被重置，
     * 导致 networkidle 永不满足 → 30s 超时。E2E 一律打不带 watch 的稳定实例。
     */
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8790',
    /** trace 改为 off：保留截图取证即可，避免 Windows 并发写 trace 的 ENOENT 假失败 */
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'viewport-390x844', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false } },
    { name: 'viewport-360x640', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 640 }, isMobile: false } },
  ],
  /**
   * ⚠️ 严禁改回 `pnpm dev`（主控 2026-11-05 裁定）：dev 是 tsx watch，
   * 测试期间任何文件改动都会触发热重载、打断页面，导致必现超时。
   * 这里启动的是**生产产物**（node dist/api + vite preview），不带 watch。
   */
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'node dist/api/src/api/server.js',
        url: 'http://127.0.0.1:8790/api/health',
        reuseExistingServer: true,
        timeout: 120_000,
        env: { API_PORT: '8790', NODE_ENV: 'production' },
      },
});
