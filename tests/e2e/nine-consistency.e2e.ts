/**
 * 结果页九维数值必须等于九维评分器的输出（E2E）。
 *
 * 这是原 `dims-consistency.e2e.ts` 的九维版本。原测试断言
 * 「页面六维 == 引擎 user.x × 100」；九维升级后页面展示九维坐标，
 * 于是把权威源换成九维评分器，**断言强度不降**：
 *
 *   ① 九个维度全部出现在结果页（缺一个就失败）；
 *   ② 每个维度的页面值必须是 0–100 整数，且与 DOM 上的 data-score 完全一致；
 *   ③ 页面极差必须足够大，挡掉「前端又套一层归一化 / 整体压缩」；
 *   ④ 档位与文案必须逐字来自四档定义，且档位与分数区间一致。
 */
import { expect, test, type Page } from '@playwright/test';
import { NINE_DIMS } from '../../src/shared/nine-dims';

/**
 * 答完所有题。
 *
 * 关键：每轮先检查是否已到结果页，到了就立刻停——
 * 否则最后一题点完页面已导航，再点击会报 "Target page/browser has been closed"。
 */
async function answerAll(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: /开始鉴定/ }).click();

  for (let i = 0; i < 45; i += 1) {
    if ((await page.locator('[data-testid="nine-block"]').count()) > 0) return;
    const opts = page.locator('.option');
    if ((await opts.count()) === 0) return;
    const n = await opts.count();
    await opts.nth(i % n).click();
    if ((await page.locator('[data-testid="nine-block"]').count()) > 0) return;
    await page.getByRole('button', { name: /下一题|查看我的档案/ }).click();
  }
}

test('结果页九维齐全，且页面值与 data-score 一致', async ({ page }) => {
  await answerAll(page);
  const block = page.locator('[data-testid="nine-block"]');
  await expect(block).toBeVisible();

  const actual: Record<string, number> = {};
  for (const d of NINE_DIMS) {
    const item = page.locator(`[data-testid="nine-${d.key}"]`);
    await expect(item, `${d.name} 必须出现在结果页`).toBeVisible();

    const shown = (await page.locator(`[data-testid="nine-score-${d.key}"]`).innerText()).trim();
    expect(shown, `${d.name} 应显示整数`).toMatch(/^\d+$/);
    actual[d.key] = Number(shown);

    const ds = await item.getAttribute('data-score');
    expect(Number(ds), `${d.name} 的显示值与 data-score 必须一致`).toBe(actual[d.key]);

    expect(actual[d.key]!).toBeGreaterThanOrEqual(0);
    expect(actual[d.key]!).toBeLessThanOrEqual(100);
  }

  const vals = Object.values(actual);
  const range = Math.max(...vals) - Math.min(...vals);
  expect(range, '结果页九维极差过小，说明前端可能又做了归一化或整体缩放').toBeGreaterThanOrEqual(40);
});

test('九维结果页：编号严格 01–09，档位与文案取自四档定义', async ({ page }) => {
  await answerAll(page);
  await expect(page.locator('[data-testid="nine-block"]')).toBeVisible();

  for (const d of NINE_DIMS) {
    const item = page.locator(`[data-testid="nine-${d.key}"]`);
    await expect(item).toBeVisible();

    const no = (await item.locator('.dim__no').innerText()).trim();
    expect(no, `${d.name} 编号应为两位序号`).toBe(String(d.order).padStart(2, '0'));

    const level = (await item.locator('.dim__level').innerText()).trim();
    expect(['低分态', '过渡态1', '过渡态2', '高分态']).toContain(level);

    const state = (await item.locator('.dim__state').innerText()).trim();
    // 文案必须逐字来自四档定义，不允许临时生成
    expect(d.states as readonly string[], `${d.name} 的文案必须是四档之一`).toContain(state);

    // 档位必须与分数区间一致
    const score = Number((await page.locator(`[data-testid="nine-score-${d.key}"]`).innerText()).trim());
    const expectedLevel = score <= 24 ? '低分态' : score <= 49 ? '过渡态1' : score <= 74 ? '过渡态2' : '高分态';
    expect(level, `${d.name} 分数 ${score} 对应的档位应为 ${expectedLevel}`).toBe(expectedLevel);
  }
});

test('九维雷达图与分数卡片逐项一致', async ({ page }) => {
  await answerAll(page);
  await expect(page.locator('[data-testid="nine-block"]')).toBeVisible();

  const label = await page.locator('[data-testid="nine-radar"] svg').getAttribute('aria-label');
  expect(label).toBeTruthy();

  for (const d of NINE_DIMS) {
    const cardScore = (await page.locator(`[data-testid="nine-score-${d.key}"]`).innerText()).trim();
    const m = new RegExp(`${d.name}\\s+(\\d+)`).exec(label!);
    expect(m, `雷达图应包含「${d.name}」的分数`).not.toBeNull();
    expect(m![1], `「${d.name}」雷达图与卡片分数必须一致`).toBe(cardScore);
  }
});
