import { defineConfig, devices } from '@playwright/test';

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
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e.json' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173',
    /** trace 改为 off：保留截图取证即可，避免 Windows 并发写 trace 的 ENOENT 假失败 */
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'viewport-390x844', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false } },
    { name: 'viewport-360x640', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 640 }, isMobile: false } },
  ],
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: 'pnpm dev',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
