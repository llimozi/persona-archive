/**
 * 诊断：全池排名里，某个人物最靠前能排到第几？
 *
 * 对少量随机作答，打印指定人物的 rank 分布。
 * 如果某人最好也只能排到第 3 名，那它永远不可能是 main，问题就不在数值微调。
 *
 *   npx vitest run --config vitest.config.ts tests/audit/tail-diagnosis.test.ts
 */
import { describe, it } from 'vitest';
import { match } from '../../src/engine/match';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { EnginePersona, EngineQuestion, EngineTheme, MatchInput, MatchResult } from '../../src/engine/types';

const root = resolve(__dirname, '../..');
const N = Number(process.env.SAMPLE ?? 3000);

// 监控对象：v2 名单里最容易被挤到长尾的几类人（纯梗、抽象迷因、无强人格的参考条目）。
// 旧名单里的 gulumao / papijiang / juejuezi / kpl / fen 等已随名单 v2 下线，
// 这里换成新名单中对应的「抽象迷因 / 冷门梗」代表，保持这条诊断的用途不变。
const WATCH = [
  'ani-naiwa-050',
  'ani-niulai-053',
  'mem-tungtung-056',
  'mem-bombardiro-057',
  'ani-meituan-051',
  'mem-xiaomingjianmo-043',
  'oth-shaonian-005',
];

describe('长尾诊断', () => {
  it('指定人物的最好名次', () => {
    const personas = JSON.parse(readFileSync(resolve(root, 'data/personas.json'), 'utf8')).personas as Array<
      EnginePersona & { id: string; name: string }
    >;
    const qraw = JSON.parse(readFileSync(resolve(root, 'data/questions.json'), 'utf8'));
    const questions = qraw.questions as EngineQuestion[];
    const theme = qraw.theme as EngineTheme;

    const best = new Map<string, number>(WATCH.map((id) => [id, 999]));
    const bestScore = new Map<string, number>(WATCH.map((id) => [id, 0]));
    const rankHist = new Map<string, number[]>(WATCH.map((id) => [id, []]));

    for (let i = 0; i < N; i += 1) {
      const answers = questions.map((q) => ({
        questionId: q.id,
        optionId: q.options[Math.floor(Math.random() * q.options.length)]!.id,
      }));
      const out = match({ questions, answers, personas, theme } as MatchInput) as MatchResult;
      const ranking = out.ranking;
      for (const id of WATCH) {
        const idx = ranking.findIndex((p) => p.id === id);
        if (idx < 0) continue;
        if (idx < (best.get(id) ?? 999)) best.set(id, idx);
        if (ranking[idx]!.adjusted > (bestScore.get(id) ?? 0)) bestScore.set(id, ranking[idx]!.adjusted);
        rankHist.get(id)!.push(idx);
      }
    }

    const nameOf = new Map(personas.map((p) => [p.id, p.name]));
    console.log(`\nN=${N}  (rank 从 0 开始，0=第一名即可当 main)`);
    for (const id of WATCH) {
      const hist = rankHist.get(id)!;
      const avg = hist.reduce((a, b) => a + b, 0) / hist.length;
      const top1 = hist.filter((r) => r === 0).length;
      const top5 = hist.filter((r) => r < 5).length;
      console.log(
        `  ${id.padEnd(24)} best=${String(best.get(id)).padStart(3)} avg=${avg.toFixed(1).padStart(6)} ` +
          `top1=${top1} top5=${top5} maxScore=${(bestScore.get(id) ?? 0).toFixed(3)}  ${nameOf.get(id)}`,
      );
    }
  }, 900_000);
});
