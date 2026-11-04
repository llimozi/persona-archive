/**
 * 严格按 06 §6.3 正文公式的手算算例（主控 2026-11-05 裁定后要求补）。
 *
 *   pnpm exec tsx src/engine/example/check-s63-manual.ts
 *
 * 为什么单独做：06 §9.3 的算例在"只用主题权重"的简化下计算，与 §6.3 正文不一致
 * （06 §9.3 分母 0.88 = 主题权重之和，未含 (1-α)·norm 项）。
 * 主控裁定：以 §6.3 正文为准；§9.3 记为文档已知偏差。
 * 于是「正确实现」反而缺一个第三方能手算的对照——本文件补上。
 *
 * 设计原则：数字取到四位小数、每一步都能用计算器复现，且**不依赖任何题库**。
 */

import { match } from '../match.js';
import type { EngineAnswer, EnginePersona, EngineQuestion, EngineTheme } from '../types.js';
import { DIM_KEYS } from '../types.js';

const ALPHA = 0.6;

/** 用户六维分（4 位小数，可由 100 等分题目精确表达：x=k/100） */
const USER_X = { EE: 1.0, ST: 0.8, AC: 0.6, HX: 0.4, RB: 0.2, SR: 0.0 } as const;

/** 主题权重（06 §9.1 th-general，和 = 1.0） */
const WEIGHTS = { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 } as const;

/**
 * 单个人物，六维全设，σ 全 0.10（易手算）。
 *
 * ⚠️ μ 必须让**每个维度的偏离量各不相同**，否则所有 g 相等、Σω 恒等于"主题权重和"
 * 之外的常数，两套口径会算出同一个 M，算例就没有鉴别力（第一版就踩了这个坑：
 * 六个偏离量全是 0.20，M 恰好 0.135335，§6.3 与 §9.3 结果相同，等于白做）。
 */
const P: EnginePersona = {
  id: 'manual-001',
  name: '手算示例人物',
  category: 'demo',
  dims: { EE: 0.9, ST: 0.5, AC: 0.7, HX: 0.1, RB: 0.6, SR: 0.3 },
  sigma: { EE: 0.1, ST: 0.1, AC: 0.1, HX: 0.1, RB: 0.1, SR: 0.1 },
  serialNo: 1,
};

const theme: EngineTheme = { themeId: 'manual', name: '手算示例', weights: { ...WEIGHTS } };

/** 每维 100 道题编码 x = k/100 */
const N = 100;
const questions: EngineQuestion[] = [];
for (const dim of DIM_KEYS) {
  for (let i = 1; i <= N; i += 1) {
    questions.push({
      id: `${dim}-${i}`,
      weight: 1,
      options: [
        { id: 'P', effects: { [dim]: 1 } },
        { id: 'N', effects: { [dim]: -1 } },
      ],
    });
  }
}
const answers: EngineAnswer[] = [];
for (const dim of DIM_KEYS) {
  const k = Math.round(USER_X[dim] * N);
  for (let i = 1; i <= N; i += 1) answers.push({ questionId: `${dim}-${i}`, optionId: i <= k ? 'P' : 'N' });
}

const result = match({ questions, answers, personas: [P], theme });
const p = result.main!.persona;

console.log('=== 严格按 06 §6.3 正文的手算算例 ===');
console.log('α = 0.6；人物六维全设（|D_p| = 6，等权 → norm(weight) = 1/6）');
console.log('');
console.log('维度   x      μ      σ      x−μ      (x−μ)²   2σ²      g=exp(…)  ω_d=0.6w+0.4·(1/6)   ωg');
console.log('─'.repeat(104));

let sumOmegaG = 0;
let sumOmega = 0;
const rows: string[] = [];
for (const dim of DIM_KEYS) {
  const c = p.contributions.find((k) => k.dim === dim)!;
  const d = c.x - c.mu;
  const twoSigmaSq = 2 * c.sigma * c.sigma;
  const omega = ALPHA * WEIGHTS[dim] + (1 - ALPHA) * (1 / DIM_KEYS.length);
  sumOmegaG += omega * c.g;
  sumOmega += omega;
  rows.push(
    `${dim.padEnd(5)} ${c.x.toFixed(2)}  ${c.mu.toFixed(2)}  ${c.sigma.toFixed(2)}  ${d.toFixed(2).padStart(6)}  ${(d * d).toFixed(4)}  ${twoSigmaSq.toFixed(3)}  ${c.g.toFixed(6)}  ${omega.toFixed(4)}              ${(omega * c.g).toFixed(6)}`,
  );
}
console.log(rows.join('\n'));
console.log('─'.repeat(104));
console.log(`Σωg = ${sumOmegaG.toFixed(6)}`);
console.log(`Σω  = ${sumOmega.toFixed(6)}`);
console.log(`M   = Σωg / Σω = ${(sumOmegaG / sumOmega).toFixed(6)}`);
console.log(`引擎 M = ${p.score.toFixed(6)}   ${Math.abs(sumOmegaG / sumOmega - p.score) < 1e-9 ? '✅ 手算一致' : '❌ 不一致'}`);
console.log('');

// 与"§9.3 简化口径"对照，说明两者差异来源
let simpleNum = 0;
let simpleDen = 0;
for (const dim of DIM_KEYS) {
  const c = p.contributions.find((k) => k.dim === dim)!;
  simpleNum += WEIGHTS[dim] * c.g;
  simpleDen += WEIGHTS[dim];
}
console.log(`若按 §9.3 的简化口径（只用主题权重）：M = ${(simpleNum / simpleDen).toFixed(6)}`);
console.log(`与 §6.3 口径相差 ${Math.abs(simpleNum / simpleDen - p.score).toFixed(6)} —— 这就是 06 §9.3 与正文的偏差来源。`);
console.log('');

const diff = Math.abs(sumOmegaG / sumOmega - p.score);
const hasPower = Math.abs(simpleNum / simpleDen - p.score) > 1e-6;
console.log(
  diff < 1e-9 && hasPower
    ? '✅ 通过：手算链与引擎逐位一致，且本算例能区分 §6.3 与 §9.3 两套口径，第三方可独立复核。'
    : diff >= 1e-9
      ? '❌ 失败：手算与引擎不一致。'
      : '❌ 失败：算例无法区分两套口径。',
);
process.exitCode = diff < 1e-9 && hasPower ? 0 : 1;
