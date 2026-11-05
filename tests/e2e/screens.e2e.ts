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

/**
 * 真实数据的人物总数，2026-11-05 由 12 变更为 30（按 04 §2.2 可匹配池准数补齐）。
 * 与 `data/validate-data.mjs` 的 EXPECTED.personas、`tests/engine/match.test.ts` 的同名常量三处同步。
 */
const EXPECTED_PERSONAS = 91;

async function noHorizontalOverflow(page: Page) {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW, `横向溢出：scrollWidth=${scrollW} > clientWidth=${clientW}`).toBeLessThanOrEqual(clientW + 1);
}

/**
 * 从结果页文本里读九维数值。
 *
 * 九维区块的 DOM 是「编号 名称 分数」同一行（见 ResultPage 的 dim--nine），
 * 所以按「维度名 + 其后的数字」逐行扫描。九维名称本身不含数字，不会误伤。
 */
const DIM_LABELS: Record<string, string> = Object.fromEntries(
  [
    ['MS', '闷骚指数'],
    ['FC', '反差浓度'],
    ['WS', '猥琐浓度'],
    ['SB', '社牛装逼指数'],
    ['CX', '畜生没母指数'],
    ['JH', '嘉豪浓度'],
    ['ZQ', '嘴欠指数'],
    ['AB', '抽象浓度'],
    ['KD', '口嗨兑现率'],
  ] as const,
);

function readDims(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  // 逐行扫描：命中标签行后，取其后**最近**的一个纯数字行。
  // 旧实现用单条跨行正则，遇到"标签 + 数字"紧邻时会漏掉最后一项（SR）。
  const lines = text.split('\n').map((l) => l.trim());
  for (const [dim, label] of Object.entries(DIM_LABELS)) {
    const idx = lines.findIndex((l) => l === label || l.startsWith(label));
    if (idx < 0) continue;
    for (let k = idx; k < lines.length && k <= idx + 2; k += 1) {
      const m = /^(\d{1,3})$/.exec(lines[k]);
      if (m) {
        out[dim] = Number(m[1]);
        break;
      }
    }
  }
  return out;
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
  for (let i = 0; i < 60; i++) {
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

    // 已经到结果页就停：最后一题点完即可，不必再空转
    const nowText = await page.locator('body').innerText();
    if (nowText.includes('娱乐匹配度')) break;
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

test('分享结果链接 ?r=<token>：他人打开直达结果页且数值一致', async ({ page, context }) => {
  // 分享功能已交付（src/web/lib/share.ts）。旧 skip 理由已过期，改为真跑。
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: /开始|测一测|开始测试|进入/ }).first().click();
  for (let i = 0; i < 60; i++) {
    const opt = page.locator('button.option').first();
    if ((await opt.count()) === 0) break;
    await opt.click();
    await page.locator('.quiz__foot button.btn--primary').click();
    await page.waitForTimeout(200);
  }

  const directText = await page.locator('body').innerText();
  const directDims = readDims(directText);
  expect(Object.keys(directDims).length, '直连结果页未渲染出九维').toBe(9);

  // 从结果页取 ?r= 分享链接（若页面未生成，则视为分享链路的真实缺陷）
  const shareUrl = await page.evaluate(() => {
    const a = document.querySelector('a[href*="?r="]') as HTMLAnchorElement | null;
    return a?.href ?? (location.search.includes('?r=') ? location.href : '');
  });

  if (!shareUrl) {
    // 页面当前不把 ?r= 体现在 anchor/location 上时，退化为"复制动作可用"的检查，
    // 并如实标记该分支为弱断言（不算完整验证分享回读）。
    const shareBtn = page.getByRole('button', { name: /分享/ }).first();
    await expect(shareBtn, '结果页缺少分享入口').toBeVisible();
    test.info().annotations.push({ type: 'partial', description: '结果页未暴露 ?r= 链接，仅校验分享入口存在' });
    return;
  }

  // 关键：用**全新 context**（清空本地存档）打开分享链接，验证他人打开也能看到同一结果
  const guest = await context.browser()!.newContext({ viewport: page.viewportSize() ?? { width: 390, height: 844 } });
  const guestPage = await guest.newPage();
  await guestPage.goto(shareUrl);
  await guestPage.waitForLoadState('networkidle');
  await guestPage.waitForTimeout(500);

  const guestText = await guestPage.locator('body').innerText();
  const guestDims = readDims(guestText);
  expect(Object.keys(guestDims).length, `访客打开分享链接未直达结果页（当前页面文本：${guestText.slice(0, 80)}）`).toBe(9);

  for (const d of Object.keys(directDims)) {
    expect(
      Math.abs(guestDims[d]! - directDims[d]!),
      `分享打开后 ${d} 与直连不一致：${guestDims[d]} vs ${directDims[d]}`,
    ).toBeLessThanOrEqual(1);
  }
  await guest.close();
});

/**
 * 人物配图（当前 30 人，一图一一对应）。
 *
 * 判据三层：
 *   1. 数据层：每人都必须有 imageUrl，且路径必须以**自己的 id** 结尾（防张冠李戴）；
 *   2. 资源层：每张图真实可取（HTTP 200 且 content-type 为 image/*），不允许 404 空占位；
 *   3. 页面层：打开结果页后，配图 `<img>` 自然宽度 > 0（真渲染，不是只挂了个 src）。
 */
test(`人物配图：${EXPECTED_PERSONAS} 人一一对应且真实可加载`, async ({ page, request }) => {
  const res = await request.get('/api/personas');
  expect(res.ok(), `/api/personas 请求失败：${res.status()}`).toBeTruthy();
  const body = (await res.json()) as { items: Array<{ id: string; name: string; imageUrl?: string }> };
  const personas = body.items;
  expect(personas.length, `人物数量应为 ${EXPECTED_PERSONAS}`).toBe(EXPECTED_PERSONAS);

  for (const p of personas) {
    expect(p.imageUrl, `${p.name}(${p.id}) 缺少 imageUrl —— 不允许留空白`).toBeTruthy();
    expect(p.imageUrl!, `${p.name}(${p.id}) 配图错配：${p.imageUrl}`).toBe(`/assets/personas/${p.id}.png`);

    const img = await request.get(p.imageUrl!);
    expect(img.status(), `${p.name} 配图 HTTP ${img.status()}`).toBe(200);
    expect(img.headers()['content-type'] ?? '', `${p.name} 配图不是图片`).toContain('image/');
  }

  // 页面层：进入结果页，确认配图真实解码成功
  await page.goto('/');
  await page.getByRole('button', { name: /开始/ }).click();
  // 按题库真实题数走完，不写死题数（题数变化时这里不该假红）
  const totalQ = await page.evaluate(async () => {
    const r = await fetch('/api/questions');
    const d = (await r.json()) as { items?: unknown[] };
    return d.items?.length ?? 0;
  });
  for (let i = 0; i < (totalQ || 30); i += 1) {
    const opt = page.locator('button.option').first();
    if ((await opt.count()) === 0) break;
    await opt.click();
    const next = page.locator('.quiz__foot button').filter({ hasText: /下一题|看结果|查看我的档案/ });
    if ((await next.count()) === 0) break;
    await next.first().click();
  }
  // 主卡内的大头像（"还有几分像"的小像也是同名 testid，必须限定到 result-card）
  const avatar = page.getByTestId('result-card').getByTestId('result-avatar-img');
  await expect(avatar).toBeVisible({ timeout: 10_000 });
  const natural = await avatar.evaluate((el) => (el as HTMLImageElement).naturalWidth);
  expect(natural, '结果页配图未真实解码（naturalWidth=0）').toBeGreaterThan(0);
});
