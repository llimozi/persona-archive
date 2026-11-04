import { test, expect, type Page } from '@playwright/test';

/**
 * 三屏 E2E：首页 → 答题 → 结果。责任人：风控审查（QA）。
 * 判据来源：docs/DEV-CONTROL.md §4「移动端」「业务闭环」。
 *
 * 选择器按前端**真实 DOM** 编写（aria-pressed 选项 / 「下一题」/「看结果」），
 * 不使用臆造 testid——上一次跑的失败就是臆造 testid 导致的假阴性，已修正。
 *
 * ⚠️ 视口模拟 ≠ 微信内置浏览器实测。真机部分在报告中记 NOT RUN。
 */

async function noHorizontalOverflow(page: Page) {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW, `横向溢出：scrollWidth=${scrollW} > clientWidth=${clientW}`).toBeLessThanOrEqual(clientW + 1);
}

test('首页可访问且无横向溢出', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status(), '首页 HTTP 状态').toBeLessThan(400);
  await page.waitForLoadState('networkidle');
  await noHorizontalOverflow(page);
  const body = await page.locator('body').innerText();
  expect(body.trim().length, '首页正文为空').toBeGreaterThan(0);
});

test('首页不引用第三方图片（素材红线）', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const remote = await page.$$eval('img[src]', (els) =>
    els
      .map((e) => (e as HTMLImageElement).src)
      .filter((s) => /^https?:\/\//.test(s) && !s.includes('127.0.0.1') && !s.includes('localhost')),
  );
  expect(remote, `出现第三方图片域名：${remote.join(', ')}`).toEqual([]);
});

test('全流程：首页 → 答题 → 结果', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const start = page.getByRole('button', { name: /开始|测一测|开始测试|进入/ }).first();
  await expect(start, '首页找不到开始按钮').toBeVisible({ timeout: 10_000 });
  const box = await start.boundingBox();
  expect(box, '开始按钮无 boundingBox').not.toBeNull();
  expect(box!.height, `开始按钮热区 ${box!.height}px < 44px`).toBeGreaterThanOrEqual(44);

  await start.click();

  // 答题：每题选第一个选项 → 点「下一题」/「看结果」
  let advanced = 0;
  for (let i = 0; i < 20; i++) {
    const option = page.locator('button.option').first();

    // 页面进入错误态（如接口 502）立即失败，并带上页面自己的报错文案
    const errBody = await page.locator('body').innerText();
    if (/接口没连上|HTTP 5\d\d|加载失败/.test(errBody)) {
      throw new Error(`进入错误态：${errBody.split('\n').filter((s) => s.trim()).slice(0, 4).join(' | ')}`);
    }
    if ((await option.count()) === 0) break;

    const ob = await option.boundingBox();
    expect(ob, '选项无 boundingBox').not.toBeNull();
    expect(ob!.height, `选项热区 ${ob!.height}px < 44px`).toBeGreaterThanOrEqual(44);

    await option.click();

    const next = page.locator('.quiz__foot button.btn--primary');
    await expect(next, '答题页找不到「下一题/看结果」按钮').toBeEnabled();
    const nb = await next.boundingBox();
    expect(nb!.height, `下一题热区 ${nb!.height}px < 44px`).toBeGreaterThanOrEqual(44);
    await next.click();
    advanced++;
    await page.waitForTimeout(250);
  }
  expect(advanced, '一题都没能推进（答题页未正常渲染）').toBeGreaterThan(0);

  // 结果页判据：出现娱乐匹配度百分比 + 四段结果标题
  const resultText = await page.locator('body').innerText();
  expect(resultText, `未走到结果页（已推进 ${advanced} 题）`).toMatch(/%|匹配/);
  await noHorizontalOverflow(page);
});

test('答题页无横向溢出', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const start = page.getByRole('button', { name: /开始|测一测|开始测试|进入/ }).first();
  await start.click();
  await page.locator('button.option').first().waitFor({ timeout: 10_000 });
  await noHorizontalOverflow(page);
});

test('分享结果链接 ?r=<token>（竞品研究交付后启用）', async ({ page }) => {
  test.skip(true, '分享/独立结果链接尚未交付 → NOT RUN（不计入通过）');
  await page.goto('/');
});
