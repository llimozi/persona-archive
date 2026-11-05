/**
 * 诊断：作答空间里，用户向量 x 实际落在哪一块？人物又分布在哪一块？
 *
 * 跑 N 次随机作答，打印：
 *   - 用户六维 x 的均值/标准差/分位数
 *   - 78 个人物 mu 的均值/标准差
 *   - 每个维度上"用户覆盖范围"与"人物覆盖范围"的重叠情况
 *
 *   npx vitest run --config vitest.config.ts tests/audit/space-shape.test.ts
 */
import { describe, it } from 'vitest';
import { scoreAnswers } from '../../src/engine/match';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnginePersona, EngineQuestion } from '../../src/engine/types';

const root = resolve(__dirname, '../..');
const N = Number(process.env.SAMPLE ?? 2000);
const DIMS = ['EE', 'ST', 'AC', 'HX', 'RB', 'SR'] as const;

function stats(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  const mean = a.reduce((p, c) => p + c, 0) / a.length;
  const sd = Math.sqrt(a.reduce((p, c) => p + (c - mean) ** 2, 0) / a.length);
  const q = (p: number) => s[Math.floor((s.length - 1) * p)];
  return { mean, sd, min: s[0], p10: q(0.1), p50: q(0.5), p90: q(0.9), max: s[s.length - 1] };
}

describe('作答空间形状', () => {
  it('用户向量 vs 人物坐标', () => {
    const personas = JSON.parse(readFileSync(resolve(root, 'data/personas.json'), 'utf8')).personas as Array<
      EnginePersona & { id: string; dims: Record<string, number> }
    >;
    const qraw = JSON.parse(readFileSync(resolve(root, 'data/questions.json'), 'utf8'));
    const questions = qraw.questions as EngineQuestion[];

    const userVals: Record<string, number[]> = {};
    for (const d of DIMS) userVals[d] = [];

    for (let i = 0; i < N; i += 1) {
      const answers = questions.map((q) => ({
        questionId: q.id,
        optionId: q.options[Math.floor(Math.random() * q.options.length)]!.id,
      }));
      const { user } = scoreAnswers(questions, answers);
      for (const d of DIMS) userVals[d]!.push(user.x[d]);
    }

    console.log(`\nN=${N}`);
    console.log('dim |   USER (x)                              |  PERSONA (mu, /100)');
    for (const d of DIMS) {
      const u = stats(userVals[d]!);
      const p = stats(personas.map((q) => q.dims[d]!));
      console.log(
        `${d}  | u=${u.mean.toFixed(2)} sd=${u.sd.toFixed(2)} [${u.min.toFixed(2)},${u.p10.toFixed(2)},${u.p50.toFixed(2)},${u.p90.toFixed(2)},${u.max.toFixed(2)}]` +
          ` | m=${p.mean.toFixed(0)} sd=${p.sd.toFixed(0)} [${p.min},${p.p10},${p.p50},${p.p90},${p.max}]`,
      );
    }
  }, 600_000);
});
