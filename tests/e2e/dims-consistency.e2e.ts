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
 *   ① 极差 ≥ 10（防压缩型错误：normalizeDims 会把极差压到 50 以下）
 *   ② 六维绝对值 = 引擎 `user.x*100` ±1（防平移 / 错序 / 单位换算型错误）
 * 只断言「有数字渲染出来」是不够的——52 看起来也像个合理分数，但它是错的。
 *
 * 期望值**现算引擎**，不硬编码：内容数据改一条题目的 effects 时，
 * 硬编码断言会假失败，而那不是缺陷。
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const THEME_WEIGHTS = { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 };

function readArr<T>(rel: string, key: string): T[] {
  const raw = JSON.parse(readFileSync(resolve(root, rel), 'utf8'));
  return Array.isArray(raw) ? (raw as T[]) : (raw[key] ?? raw.items ?? raw.data ?? []);
}

const questions = readArr<EngineQuestion>('data/questions.json', 'questions');
const personas = readArr<EnginePersona>('data/personas.json', 'personas');

test('结果页六维数值必须等于引擎 user.x*100', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  const start = page.getByRole('button', { name: /开始|测一测|开始测试|进入/ }).first();
  await start.click();

  // 全选每题的【第一个】选项，与期望值计算口径保持一致
  const picked: EngineAnswer[] = [];
  for (let i = 0; i < 15; i++) {
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
  const theme = { themeId: 'th-general', name: 'th-general', weights: THEME_WEIGHTS };
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

  // 断言 1：极差（快速失败前置）——normalizeDims 会把极差压到 50 以下，引擎真实极差 = 79
  const actualVals = Object.values(actual);
  const actualRange = Math.max(...actualVals) - Math.min(...actualVals);
  const expectedVals = Object.values(expectedDims);
  const expectedRange = Math.max(...expectedVals) - Math.min(...expectedVals);
  expect(
    actualRange,
    `结果页六维极差 ${actualRange}（引擎期望极差 ${expectedRange}）。极差 < 30 说明前端又套了一层归一化`,
  ).toBeGreaterThanOrEqual(Math.max(30, expectedRange - 10));

  // 断言 2：六个绝对值逐个比对（主控要求：极差能过但整体平移的情况必须被抓到）
  for (const d of Object.keys(expectedDims)) {
    expect(
      Math.abs(actual[d]! - expectedDims[d]!),
      `维度 ${d} 页面显示 ${actual[d]} 与引擎 ${expectedDims[d]} 不一致（允许 ±1）`,
    ).toBeLessThanOrEqual(1);
  }
});
