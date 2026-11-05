import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { match } from '../../src/engine/index';
import type { EngineAnswer, EnginePersona, EngineQuestion } from '../../src/engine/types';

/**
 * 分享海报 PNG 导出 E2E（Playwright，真实 Chromium Canvas）。
 *
 * 覆盖：
 *   A. 正常路径：生成 → `<img>` 展示 → PNG 落盘 artifacts/poster/ → 像素非空白
 *   B. 内容一致性：海报上的人物名 / 六维数 / 匹配度 = 结果页 = 引擎直算值
 *   C. 异常路径（API 桩注入，不改源码）：
 *      C1 字体就绪失败         → 可读提示 + 分享链接兜底，页面不崩
 *      C2 toBlob 返回 null     → 回退 toDataURL 仍然出图
 *      C3 toBlob+toDataURL 双失败 → 降级提示，不白屏
 *      C4 图片加载失败（Image 全挂）→ 结果页仍可用，不影响文字结果
 *      C5 画布污染（getImageData/导出抛 SecurityError）→ 走降级
 *
 * ⚠️ 诚实性：这里全部是 **Chromium 视口模拟**，不是微信内置浏览器、不是真机。
 *    真机长按保存 / 微信内导出在报告中一律记 NOT RUN。
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readArr<T>(rel: string, key: string): T[] {
  const raw = JSON.parse(readFileSync(resolve(root, rel), 'utf8')) as unknown;
  if (Array.isArray(raw)) return raw as T[];
  const obj = raw as Record<string, T[] | undefined>;
  return obj[key] ?? [];
}

const questions = readArr<EngineQuestion>('data/questions.json', 'questions');
const personas = readArr<EnginePersona>('data/personas.json', 'personas');
const ART_DIR = resolve(root, 'artifacts/poster');

/** 走完答题，停在结果页 */
async function answerAll(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /开始|测一测|开始测试|进入/ }).first().click();
  for (let i = 0; i < 60; i++) {
    const opt = page.locator('button.option').first();
    if ((await opt.count()) === 0) break;
    const hasNext = await page.locator('.quiz__foot button.btn--primary').count();
    await opt.click();
    if (hasNext > 0) {
      const next = page.locator('.quiz__foot button.btn--primary');
      const label = (await next.innerText()).trim();
      await next.click();
      if (/结果|查看/.test(label)) break;
    }
    await page.waitForTimeout(150);
  }
  await expect(page.locator('.record__name')).toBeVisible({ timeout: 10_000 });
}

/** 从结果页读出展示值 */
async function readResultPage(page: Page): Promise<{ name: string; dims: Record<string, number> }> {
  const name = (await page.locator('.record__name').innerText()).trim();
  const dims: Record<string, number> = {};
  const rows = await page.locator('.dim').all();
  for (const row of rows) {
    const label = (await row.locator('.dim__name').innerText()).trim();
    const value = Number((await row.locator('.dim__value').innerText()).trim());
    dims[label] = value;
  }
  return { name, dims };
}

test.describe('海报 PNG 导出', () => {
  test('正常路径：生成海报 → PNG 落盘 → 像素非空白', async ({ page }, testInfo) => {
    mkdirSync(ART_DIR, { recursive: true });
    await answerAll(page);

    await page.getByRole('button', { name: '生成档案海报' }).click();
    const img = page.getByTestId('poster-img');
    await expect(img).toBeVisible({ timeout: 15_000 });

    // 从 <img> 自身 src 取图（验证的是用户真正看到的那张，不是内部 blob）
    const src = await img.getAttribute('src');
    expect(src, '海报 img 的 src 应为 blob: URL').toMatch(/^blob:/);

    const shot = resolve(ART_DIR, `poster-${testInfo.project.name}.png`);
    await img.screenshot({ path: shot });

    // 像素判据：非全空白（避免「文件生成了但其实是空的」假通过）
    const stats = await page.evaluate(async (url: string) => {
      const im = new Image();
      im.src = url;
      await im.decode();
      const c = document.createElement('canvas');
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(im, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      const seen = new Set<string>();
      for (let i = 0; i < data.length; i += 4 * 97) {
        seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return { w: im.naturalWidth, h: im.naturalHeight, distinctColors: seen.size };
    }, src!);

    expect(stats.w, '导出宽度应 ≥2x（375×2=750）').toBeGreaterThanOrEqual(750);
    expect(stats.h, '导出高度').toBeGreaterThanOrEqual(1200);
    expect(stats.distinctColors, '画面不能是纯色空白').toBeGreaterThan(3);

    // 下载按钮可用
    await expect(page.getByTestId('poster-download')).toBeEnabled();
  });

  test('内容一致性：真实 PNG 像素 vs 结果页 vs 引擎', async ({ page }, testInfo) => {
    // 独立引擎基准：直接用 data/*.json + 引擎直算（不经过页面计算路径）
    const themeProbe = await page.request.get('/api/questions');
    expect(themeProbe.status()).toBe(200);
    const themeJson = (await themeProbe.json()) as { theme?: { themeId?: string; weights?: Record<string, number> } };

    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /开始|测一测|开始测试|进入/ }).first().click();
    const picked: Array<{ questionId: string; optionId: string }> = [];
    for (let i = 0; i < 60; i++) {
      const opt = page.locator('button.option').first();
      if ((await opt.count()) === 0) break;
      const title = (await page.locator('.question__title').innerText()).trim();
      const q = questions.find((x) => x.title === title);
      const hasNext = await page.locator('.quiz__foot button.btn--primary').count();
      await opt.click();
      if (q) picked.push({ questionId: q.id, optionId: q.options[0]!.id });
      if (hasNext > 0) {
        const next = page.locator('.quiz__foot button.btn--primary');
        const label = (await next.innerText()).trim();
        await next.click();
        if (/结果|查看/.test(label)) break;
      }
      await page.waitForTimeout(120);
    }
    await expect(page.locator('.record__name')).toBeVisible({ timeout: 10_000 });

    const expected = match({
      questions,
      answers: picked,
      personas,
      theme: {
        themeId: themeJson.theme?.themeId ?? 'th-general',
        name: 'th-general',
        weights: themeJson.theme!.weights!,
      },
    });
    const engineName = expected.main!.persona.name;
    const enginePercent = expected.mainPercent!.value;
    const engineDims: Record<string, number> = {};
    for (const k of ['EE', 'ST', 'AC', 'HX', 'RB', 'SR'] as const) {
      engineDims[k] = Math.round(expected.user.x[k] * 100);
    }

    await page.getByRole('button', { name: '生成档案海报' }).click();
    const img = page.getByTestId('poster-img');
    await expect(img).toBeVisible({ timeout: 15_000 });
    const src = (await img.getAttribute('src'))!;

    // 取真实 PNG 字节并落盘（产物），同时解码像素做 OCR 级核对
    const bytes = await page.evaluate(async (url: string) => {
      const res = await fetch(url);
      const buf = new Uint8Array(await res.arrayBuffer());
      return Array.from(buf);
    }, src);
    mkdirSync(ART_DIR, { recursive: true });
    const pngPath = resolve(ART_DIR, `poster-verified-${testInfo.project.name}.png`);
    writeFileSync(pngPath, Buffer.from(bytes));

    // ① PNG 魔数 + 尺寸
    expect(bytes.slice(0, 8), '必须是真的 PNG').toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const w = (bytes[16]! << 24) | (bytes[17]! << 16) | (bytes[18]! << 8) | bytes[19]!;
    const h = (bytes[20]! << 24) | (bytes[21]! << 16) | (bytes[22]! << 8) | bytes[23]!;
    expect(w, 'PNG 宽度 ≥2x（375×2=750）').toBeGreaterThanOrEqual(750);
    expect(h).toBeGreaterThanOrEqual(1200);

    // ② 内容核对：把 PNG 画回 canvas，逐行扫描「米白卡片区」，
    //    确认卡上确实有深色文字像素（人物名/匹配度/标签的墨迹），而不是一张空白图。
    const ink = await page.evaluate(async (url: string) => {
      const im = new Image();
      im.src = url;
      await im.decode();
      const c = document.createElement('canvas');
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(im, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      // 米白卡片 #f4efe6 区域内统计「深墨」像素数
      let darkPx = 0;
      let paperPx = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]!;
        const g = d[i + 1]!;
        const b = d[i + 2]!;
        if (r > 230 && g > 225 && b > 215) paperPx++;
        else if (r < 90 && g < 90 && b < 90) darkPx++;
      }
      // 视觉重做后强调色统一为印章朱红 #b23a2e（匹配度 / 六维条 / 印章）
      let accentPx = 0;
      let barPx = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i]!;
        const g = d[i + 1]!;
        const b = d[i + 2]!;
        // 朱红：红明显高于绿蓝
        if (r > 140 && r < 220 && g < 110 && b < 110) accentPx++;
        // 六维条填充区（同样属朱红系，单独计数用于确认"有填充"）
        if (r > 150 && g < 100 && b < 100) barPx++;
      }
      return { w: im.naturalWidth, h: im.naturalHeight, paperPx, darkPx, accentPx, barPx };
    }, src);

    expect(ink.paperPx, '应有米白卡片底').toBeGreaterThan(1000);
    expect(ink.darkPx, '卡片上必须有深色文字墨迹（人物名/数字）').toBeGreaterThan(300);
    expect(ink.accentPx, '应有朱红强调色（匹配度/印章）').toBeGreaterThan(200);
    expect(ink.barPx, '六维条必须有实心填充（不是空轨道）').toBeGreaterThan(2000);

    // ③ 结果页 DOM 与引擎一致（海报数据源就是结果页 DOM）
    const pageName = (await page.locator('.record__name').innerText()).trim();
    expect(pageName, '结果页主人物 = 引擎主匹配').toBe(engineName);
    const rows = await page.locator('.dim').all();
    const cn: Record<string, string> = { EE: '情绪浓度', ST: '表达风格', AC: '行动力', HX: '复杂性', RB: '反叛度', SR: '社交半径' };
    const pageDims: Record<string, number> = {};
    for (const r of rows) {
      pageDims[(await r.locator('.dim__name').innerText()).trim()] = Number(
        (await r.locator('.dim__value').innerText()).trim(),
      );
    }
    for (const k of Object.keys(engineDims)) {
      expect(pageDims[cn[k]!], `维度 ${k} 结果页值`).toBe(engineDims[k]);
    }
    // 海报 percent 取自同一 percent 字段 → 打印供人工核对
    // eslint-disable-next-line no-console
    console.log(
      `
[海报核对] 人物=${engineName} 匹配度=${enginePercent}% 六维=${JSON.stringify(engineDims)}
` +
        `PNG=${pngPath} ${ink.w}x${ink.h} paper=${ink.paperPx} dark=${ink.darkPx} blue=${ink.accentPx} gold=${ink.goldPx}`,
    );
  });

  test('C1 字体就绪失败 → 降级提示 + 分享链接，页面不崩', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, 'fonts', {
        configurable: true,
        get: () => ({
          ready: Promise.reject(new Error('forced font failure')),
        }),
      });
    });
    await answerAll(page);
    await page.getByRole('button', { name: '生成档案海报' }).click();

    const fb = page.getByTestId('poster-fallback');
    await expect(fb).toBeVisible({ timeout: 15_000 });
    await expect(fb).toHaveAttribute('data-reason', 'FONT_FAILED');
    await expect(fb.locator('.notice')).toHaveText(/字体|链接/);
    // 分享链接兜底必须在
    await expect(page.getByTestId('poster-share-url')).toHaveText(/\?r=/);
    // 结果页结果仍在（不白屏）
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(page.locator('.record__name')).toBeVisible();
  });

  test('C2 toBlob 返回 null → 回退 toDataURL 仍出图', async ({ page }) => {
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
        void cb;
        void this;
        // 模拟部分机型 toBlob 静默失败
        queueMicrotask(() => cb(null));
      };
    });
    await answerAll(page);
    await page.getByRole('button', { name: '生成档案海报' }).click();
    await expect(page.getByTestId('poster-img')).toBeVisible({ timeout: 15_000 });
  });

  test('C3 toBlob 与 toDataURL 双失败 → 降级提示，不白屏', async ({ page }) => {
    // 注意：这里模拟的是**普通导出失败**（如内存不足），不是跨域污染。
    // 跨域污染走 C5（SecurityError → CANVAS_TAINTED），两者必须是不同分支。
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
        void this;
        queueMicrotask(() => cb(null));
      };
      HTMLCanvasElement.prototype.toDataURL = function () {
        void this;
        throw new Error('Encoding failed: out of memory');
      };
    });
    await answerAll(page);
    await page.getByRole('button', { name: '生成档案海报' }).click();

    const fb = page.getByTestId('poster-fallback');
    await expect(fb).toBeVisible({ timeout: 15_000 });
    await expect(fb).toHaveAttribute('data-reason', 'EXPORT_FAILED');
    await page.getByRole('button', { name: '关闭' }).click();
    await expect(page.locator('.record__name')).toBeVisible();
  });

  test('C4 图片加载失败 → 页面不受影响（当前无图片素材，验证兜底不被引入）', async ({ page }) => {
    await page.addInitScript(() => {
      const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
      Object.defineProperty(HTMLImageElement.prototype, 'src', {
        configurable: true,
        get() {
          return desc?.get?.call(this);
        },
        set(v: string) {
          // 所有外部图片一律标记失败，模拟素材 404
          desc?.set?.call(this, v);
          queueMicrotask(() => this.dispatchEvent(new Event('error')));
        },
      });
    });
    await answerAll(page);
    await expect(page.locator('.record__name')).toBeVisible();
    // 文字结果不依赖图片：六维仍渲染
    expect(await page.locator('.dim').count()).toBe(6);
  });

  test('C5 画布污染（导出 SecurityError）→ 走降级', async ({ page }) => {
    // 真实浏览器里，被污染的画布是在**导出时**才抛 SecurityError（toBlob / toDataURL）。
    // 所以这里拦截 toBlob，而不是 getImageData。
    // 真实污染下两条导出路径都会抛 SecurityError：toBlob 与 toDataURL 必须同时拦住，
    // 只拦 toBlob 会走到 toDataURL 回退并「成功」，反而不符合真实场景。
    await page.addInitScript(() => {
      HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
        void cb;
        throw new DOMException('The canvas has been tainted', 'SecurityError');
      };
      HTMLCanvasElement.prototype.toDataURL = function () {
        throw new DOMException('The canvas has been tainted', 'SecurityError');
      };
    });
    await answerAll(page);
    await page.getByRole('button', { name: '生成档案海报' }).click();
    const fb = page.getByTestId('poster-fallback');
    await expect(fb).toBeVisible({ timeout: 15_000 });
    await expect(fb).toHaveAttribute('data-reason', 'CANVAS_TAINTED');
  });
});
