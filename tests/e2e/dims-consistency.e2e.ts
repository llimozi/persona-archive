import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { match } from '../../src/engine/index';
import type { EngineAnswer, EnginePersona, EngineQuestion } from '../../src/engine/types';

/**
 * 结果页数值与引擎一致性断言（主控 00:20 P0 要求的验收判据）。
 *
 * 判据（主控两条并用，缺一不可）：
 *   ① 极差 ≥ max(50, 期望极差-10)（防压缩/缩放型；实测 ×0.5 得 39.7 会被 ≥50 挡下）
 *   ② 六维绝对值：|page - engine.x*100| < 0.5（防平移 / 错序 / 单位换算型错误）
 * 只断言「有数字渲染出来」是不够的——52 看起来也像个合理分数，但它是错的。
 *
 * 期望值**现算引擎**，不硬编码：内容数据改一条题目的 effects 时，
 * 硬编码断言会假失败，而那不是缺陷。
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function readArr<T>(rel: string, key: string): T[] {
  const raw = JSON.parse(readFileSync(resolve(root, rel), 'utf8'));
  return Array.isArray(raw) ? (raw as T[]) : (raw[key] ?? raw.items ?? raw.data ?? []);
}

const questions = readArr<EngineQuestion>('data/questions.json', 'questions');
const personas = readArr<EnginePersona>('data/personas.json', 'personas');

test('结果页六维数值必须等于引擎 user.x*100', async ({ page }) => {
  // 断言 ④（主控要求）：/api/questions 必须透出 theme 字段。
  // 兜底路径会让测试通过，但通过的原因错了——"结果对"不等于"路径对"。
  // 命中率/容差：页面显示取整值，故用 < 0.5（页面必须等于引擎值四舍五入的结果）。
  const themeProbe = await page.request.get('/api/questions');
  expect(themeProbe.status(), '/api/questions 状态码').toBe(200);
  const themeJson = (await themeProbe.json()) as { theme?: { weights?: Record<string, number> } };
  expect(themeJson.theme, '/api/questions 未透出 theme 字段 → 前端将静默兜底，测的是错路径').toBeTruthy();
  expect(themeJson.theme?.weights, 'theme.weights 缺失').toBeTruthy();

  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const start = page.getByRole('button', { name: /开始|测一测|开始测试|进入/ }).first();
  await start.click();

  // 全选每题的【第一个】选项，与期望值计算口径保持一致
  const picked: EngineAnswer[] = [];
  for (let i = 0; i < 60; i++) {
    const opt = page.locator('button.option').first();
    if ((await opt.count()) === 0) break;

    // 记录实际点中的选项 label，用于和引擎比对
    const currentTitle = await page.locator('.question__title').innerText();
    const q = questions.find((x) => x.title === currentTitle);
    await opt.click();
    if (q) picked.push({ questionId: q.id, optionId: q.options[0]!.id });

    const next = page.locator('.quiz__foot button.btn--primary');
    await expect(next).toBeEnabled();
    await next.click();
    await page.waitForTimeout(250);
  }

  // 引擎期望值（唯一权威来源）
  // ⚠️ 权重必须来自接口（themeJson），不能用测试写死的常量。
  // 否则接口给什么、期望都不跟随，前端走兜底也发现不了（K7）。
  const theme = { themeId: themeJson.theme!.themeId ?? 'th-general', name: 'th-general', weights: themeJson.theme!.weights! };
  const expected = match({ questions, answers: picked, personas, theme });
  const expectedDims = Object.fromEntries(
    (['EE', 'ST', 'AC', 'HX', 'RB', 'SR'] as const).map((d) => [d, Math.round(expected.user.x[d] * 100)]),
  );

  // 从结果页读取展示的六维数值。
  // 页面结构是「标签一行、数值一行」（实测：情绪浓度 \n 100），所以允许跨行匹配。
  const bodyText = await page.locator('body').innerText();
  const actual: Record<string, number> = {};
  const labels: Record<string, string> = {
    EE: '情绪浓度',
    ST: '表达风格',
    AC: '行动力',
    HX: '复杂性',
    RB: '反叛度',
    SR: '社交半径',
  };
  for (const [dim, label] of Object.entries(labels)) {
    const m = bodyText.match(new RegExp(`${label}\\s*[:：]?\\s*\\n?\\s*(\\d{1,3})`));
    if (m) actual[dim] = Number(m[1]);
  }

  const rows = Object.keys(expectedDims).map(
    (d) => `${d}: 引擎=${expectedDims[d]} 页面=${actual[d] ?? '未找到'}`,
  );
  // eslint-disable-next-line no-console
  console.log('\n===== DIM 对照 =====\n' + rows.join('\n') + '\n===================');

  const missing = Object.keys(expectedDims).filter((d) => actual[d] === undefined);
  expect(missing, `结果页未渲染出这些维度：${missing.join(',')}`).toEqual([]);

  // 断言 1：极差门限。主控口径 ≥50；实测内容数据 FALSE·×0.5 得 39.7、+20 截断得 59.4，
  // 故纯 ≥10 几乎挡不住任何一类（连 ×0.5 都能过），这里取 max(50, 期望极差-10)。
  // 注意：极差只能挡"压缩/缩放"型；平移、错序、互换必须靠断言 2 的逐维绝对值。
  const actualVals = Object.values(actual);
  const actualRange = Math.max(...actualVals) - Math.min(...actualVals);
  const expectedVals = Object.values(expectedDims);
  const expectedRange = Math.max(...expectedVals) - Math.min(...expectedVals);
  expect(
    actualRange,
    `结果页六维极差 ${actualRange}（引擎期望极差 ${expectedRange}）。极差过小说明前端又套了一层归一化或整体缩放`,
  ).toBeGreaterThanOrEqual(Math.max(50, expectedRange - 10));

  // 断言 2：六个绝对值逐个比对。容差 < 0.5（主控 + 算法开发 00:0x 共同确认）：
  // 页面显示值必须是引擎值四舍五入的结果；72.7 取整必得 73，给 ±1 会放过"72.7 显示成 72"这类错误。
  for (const d of Object.keys(expectedDims)) {
    const engineRaw = expected.user.x[d as keyof typeof expected.user.x] * 100;
    expect(
      Math.abs(actual[d]! - engineRaw),
      `维度 ${d} 页面 ${actual[d]} 必须等于引擎 ${engineRaw.toFixed(4)} 的四舍五入结果`,
    ).toBeLessThan(0.5);
  }

  // 断言 3：主匹配名称（主控要求：主匹配必须是引擎选出的那个人，不是列表第一条）
  // 注：结果页当前只渲染主人物姓名与六维数值，不渲染百分比（ResultPage 只取 percent 字段但未见展示位）。
  //     故此处只断言姓名；百分比断言待前端确实渲染后再启用，不虚构需求。
  const mainName = expected.main?.persona.name;
  if (mainName) {
    expect(bodyText, `结果页未显示引擎主匹配「${mainName}」`).toContain(mainName);
  }
  // 引擎必须给出主匹配百分比（结构有效即可）。
  // 原先这里写死 toBe(74)，本质是把"某次数据下的具体取值"当成断言——
  // 人物数值一调整就会假红，而它真正想守的是"结果结构里有这个字段"。
  const pct = expected.mainPercent?.value;
  expect(typeof pct, '引擎应给出主匹配百分比（数值型）').toBe('number');
  expect(pct!, '主匹配百分比应在 0–100 之间').toBeGreaterThanOrEqual(0);
  expect(pct!, '主匹配百分比应在 0–100 之间').toBeLessThanOrEqual(100);
});
