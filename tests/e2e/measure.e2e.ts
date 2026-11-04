import { test, expect } from '@playwright/test';

/** 移动端实测：热区尺寸与横向溢出。只读测量，不做断言以外的副作用。 */
test('热区与溢出实测并取证', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const rows: string[] = [];
  const vp = page.viewportSize()!;
  const doc = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  rows.push(`viewport=${vp.width}x${vp.height} scrollWidth=${doc.scrollW} clientWidth=${doc.clientW} overflow=${doc.scrollW > doc.clientW + 1}`);

  const start = page.getByRole('button', { name: /开始|测一测|开始测试|进入/ }).first();
  const sb = await start.boundingBox();
  rows.push(`[首页] 开始按钮 ${sb?.width.toFixed(0)}x${sb?.height.toFixed(0)}`);

  await start.click();
  await page.locator('button.option').first().waitFor({ timeout: 10_000 });

  const quizDoc = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  rows.push(`[答题页] scrollWidth=${quizDoc.scrollW} clientWidth=${quizDoc.clientW} overflow=${quizDoc.scrollW > quizDoc.clientW + 1}`);

  const opts = await page.locator('button.option').all();
  for (const [i, o] of opts.entries()) {
    const b = await o.boundingBox();
    rows.push(`[答题页] 选项${i + 1} ${b?.width.toFixed(0)}x${b?.height.toFixed(0)}`);
  }
  const nextBtn = page.locator('.quiz__foot button.btn--primary');
  const nb = await nextBtn.boundingBox();
  rows.push(`[答题页] 下一题 ${nb?.width.toFixed(0)}x${nb?.height.toFixed(0)}`);

  // 走完 10 题到结果页
  for (let i = 0; i < 12; i++) {
    const opt = page.locator('button.option').first();
    if ((await opt.count()) === 0) break;
    await opt.click();
    await page.locator('.quiz__foot button.btn--primary').click();
    await page.waitForTimeout(200);
  }

  const resDoc = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  rows.push(`[结果页] scrollWidth=${resDoc.scrollW} clientWidth=${resDoc.clientW} overflow=${resDoc.scrollW > resDoc.clientW + 1}`);

  // 结果页所有按钮
  const all = await page.locator('button').all();
  for (const [i, b] of all.entries()) {
    const bb = await b.boundingBox();
    if (!bb) continue;
    const txt = (await b.innerText()).replace(/\s+/g, ' ').slice(0, 16);
    rows.push(`[结果页] 按钮${i + 1} "${txt}" ${bb.width.toFixed(0)}x${bb.height.toFixed(0)}${bb.height < 44 ? '  <44 FAIL' : ''}`);
  }

  await testInfo.attach('measure.txt', { body: rows.join('\n'), contentType: 'text/plain' });
  // eslint-disable-next-line no-console
  console.log('\n===== MEASURE =====\n' + rows.join('\n') + '\n===== END =====');

  // 断言：任意按钮热区 < 44px 即失败
  const small = rows.filter((r) => r.includes('<44 FAIL'));
  expect(small, `热区不足 44px:\n${small.join('\n')}`).toEqual([]);
});
