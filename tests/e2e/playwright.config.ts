import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * 结果文件用**绝对路径**：相对路径会按 testDir 解析，实测曾在删除后完全不再生成。
 *
 * ⚠️ 同一坑也踩在 `webServer.command` 上过（Q-4-1，2026-11-05）：
 *    原先写相对路径 `node dist/api/src/api/server.js`，Playwright 按 **testDir**（tests/e2e）
 *    解析工作目录，拼成 `tests/e2e/dist/api/src/api/server.js` → MODULE_NOT_FOUND，裸跑必挂。
 *    本文件的规则：**任何路径都先 resolve 成绝对路径，再交给 Playwright。**
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const RESULT_JSON = resolve(HERE, 'test-results/e2e.json');

/** 仓库根：tests/e2e → 上溯两级 */
const REPO_ROOT = resolve(HERE, '../..');
const API_ENTRY = resolve(REPO_ROOT, 'dist/api/src/api/server.js');
const WEB_ENTRY = resolve(REPO_ROOT, 'dist/web/index.html');

/**
 * ⚠️ 前置条件自检（新人友好）：E2E 吃的是 `dist/` 生产产物，必须先 `pnpm build`。
 *
 * 不拦的话，缺产物时 Playwright 只会抛 `Cannot find module ...` / 页面 404，
 * 新人很难看出"哦，我忘了 build"。
 *
 * 为什么不做成"自动 build"：
 *   config 里串 `pnpm build` 会把 typecheck 也拖进每条命令，失败时错误来源混淆
 *   （到底是测试挂了还是构建挂了），且与历史上"先起稳定实例"的口径打架。
 *   所以选择**显式拦下并给出唯一正确命令**，而不是偷偷替用户构建。
 */
function assertBuilt(): void {
  const missing: string[] = [];
  if (!existsSync(API_ENTRY)) missing.push('dist/api/src/api/server.js');
  if (!existsSync(WEB_ENTRY)) missing.push('dist/web/index.html');
  if (missing.length === 0) return;
  throw new Error(
    `\n[E2E 前置条件未满足] 缺少生产产物：${missing.join('、')}\n` +
      `\n请先在仓库根执行：  pnpm build\n` +
      `然后再跑：          pnpm test:e2e\n` +
      `\n（E2E 跑的是 dist/ 产物而非 dev 服务；dist/web 由 Fastify 在同一端口 8790 托管）\n`,
  );
}

/**
 * ⚠️ 前置自检在 **config 求值期**执行：缺产物时在开任何浏览器之前就失败。
 * 用 `E2E_NO_SERVER=1`（打调用方自己起的实例）时跳过——那种场景产物由调用方负责。
 */
if (!process.env.E2E_NO_SERVER) assertBuilt();

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
    /**
     * E2E 一律关闭动效：动画会把状态切换拉长到几百毫秒，
     * 让"元素已出现但还在动画中"变成不稳定来源。
     *
     * 走的是产品自身的 `anim=off` 开关（prefersReducedMotion 的同一入口），
     * 不修改任何业务逻辑；线上用户不带这个参数，行为不受影响。
     */
    // Playwright 官方支持：让页面内 matchMedia('(prefers-reduced-motion: reduce)') 返回 true。
    // 产品据此走自身的降级路径（跳过大动画、跳过比对仪式），不改任何业务逻辑。
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'viewport-390x844', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false } },
    { name: 'viewport-360x640', use: { ...devices['Desktop Chrome'], viewport: { width: 360, height: 640 }, isMobile: false } },
  ],
  /**
   * ⚠️ 严禁改回 `pnpm dev`（主控 2026-11-05 裁定）：dev 是 tsx watch，
   * 测试期间任何文件改动都会触发热重载、打断页面，导致必现超时。
   * 这里启动的是**生产产物**（node dist/api + vite preview），不带 watch。
   *
   * 前置条件（新人必读）：E2E 吃的是 `dist/` 产物，**必须先 `pnpm build`**。
   * 产物缺失或过期时，这里会明确报错并提示，而不是抛出难懂的 MODULE_NOT_FOUND。
   */
  webServer: process.env.E2E_NO_SERVER
    ? undefined
    : {
        command: `node "${API_ENTRY}"`,
        /** 显式锁定仓库根，杜绝路径被按 testDir 解析（Q-4-1 根因） */
        cwd: REPO_ROOT,
        url: 'http://127.0.0.1:8790/api/health',
        reuseExistingServer: true,
        timeout: 120_000,
        env: { API_PORT: '8790', NODE_ENV: 'production' },
      },
});
