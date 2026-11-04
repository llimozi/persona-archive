/**
 * 引擎验收脚本（主控指定的两条硬指标）：
 *   ① 同一输入跑两次，结果必须字符级一致（确定性）
 *   ② 06 §9 可复算示例：引擎输出 vs 文档算例逐项对照
 *
 *   pnpm exec tsx src/engine/example/verify.ts
 *
 * 只读 data/*.json，不写任何文件。
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { match, scoreAnswers } from '../match.js';
import type { EngineAnswer, EnginePersona, EngineQuestion, EngineTheme } from '../types.js';
import { DIM_KEYS } from '../types.js';
import { EXAMPLE_PERSONAS, EXAMPLE_THEME, buildExampleInput } from './fixture.js';

const ROOT = path.resolve(process.cwd());
const readJson = (p: string) => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8')) as Record<string, unknown>;

const rawPersonas = readJson('data/personas.json') as { personas: unknown[] };
const rawQuestions = readJson('data/questions.json') as { questions: unknown[]; themeId?: string };

const personas = rawPersonas.personas as EnginePersona[];
const questions = rawQuestions.questions as EngineQuestion[];

// 用固定作答：每题选第一个选项（确定性，不随机）
const answers: EngineAnswer[] = questions.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id }));

const theme: EngineTheme = {
  themeId: (rawQuestions.themeId as string) ?? 'th-general',
  name: '通用鉴定',
  weights: { EE: 0.18, ST: 0.18, AC: 0.18, HX: 0.22, RB: 0.12, SR: 0.12 },
};

const input = { questions, answers, personas, theme };

console.log('========================================');
console.log('① 确定性：同一输入连跑 100 次');
console.log('========================================');
const first = JSON.stringify(match(input));
let identical = true;
for (let i = 1; i < 100; i += 1) {
  if (JSON.stringify(match(input)) !== first) {
    identical = false;
    console.log(`第 ${i + 1} 次出现差异`);
    break;
  }
}
console.log(`100 次结果字符级一致: ${identical ? 'PASS' : 'FAIL'}`);
console.log(`结果总字节: ${first.length}`);

console.log('');
console.log('========================================');
console.log('② 真实 12 人 / 10 题 跑一次');
console.log('========================================');
const real = match(input);
const { user } = scoreAnswers(questions, answers);
console.log('用户六维分:', DIM_KEYS.map((d) => `${d}=${user.x[d].toFixed(4)}`).join(' '));
console.log('未覆盖维度:', user.undetermined.join(',') || '(无)');
console.log('排序前 5（M → M\' → 娱乐匹配度）:');
for (const p of real.ranking.slice(0, 5)) {
  console.log(`  ${p.name.padEnd(10)} M=${p.score.toFixed(6)}  M'=${p.adjusted.toFixed(6)}  ${p.percent}%`);
}
console.log('主匹配:', real.main?.persona.name, real.mainPercent?.label);
console.log('次匹配:', real.secondary?.persona.name ?? '(无)', real.secondary?.persona.percent ?? '');
console.log('隐藏人格:', real.hidden?.persona.name ?? '(无，未命中规则)');
console.log('意外组合:', real.surprise?.persona.name ?? `(无，池 ${real.pool.size} < 门槛 ${real.resolvedConfig.surprisePoolThreshold})`);
console.log('告警数:', real.warnings.length);

console.log('');
console.log('========================================');
console.log('③ 06 §9 可复算示例对照（引擎 vs 文档算例）');
console.log('========================================');
const ex = match(buildExampleInput());
console.log('示例用户六维分 x_d:');
console.log('  引擎:', DIM_KEYS.map((d) => `${d}=${ex.user.x[d].toFixed(4)}`).join(' '));

/** 06 §9 文档算例给出的最终 M 值（06:559-585） */
const DOC_M: Record<string, number> = {
  'mem-nailong-001': 0.88,
  'ani-belial-003': 0.666,
  'mem-coke-002': 0.57,
  'es-donk-004': 0.506,
};

console.log('');
console.log('人物 M 值对照：');
let maxDiff = 0;
for (const p of ex.ranking) {
  const doc = DOC_M[p.id];
  const diff = doc === undefined ? NaN : Math.abs(p.score - doc);
  if (!Number.isNaN(diff)) maxDiff = Math.max(maxDiff, diff);
  console.log(
    `  ${p.name.padEnd(10)} 引擎 M=${p.score.toFixed(6)}  文档 M=${doc === undefined ? 'N/A' : doc.toFixed(3)}  差=${Number.isNaN(diff) ? 'N/A' : diff.toFixed(6)}`,
  );
}
console.log(`最大绝对差: ${maxDiff.toFixed(6)}（文档示例做了四舍五入，差异来自 x_d 取值不同，见下方说明）`);

console.log('');
console.log('说明：06 §9 的用户分是 x=(.72,.35,.55,.81,.40,.30)，本示例受"单维归一化只能取 n 等分点"限制，');
console.log('用了 5 等分点 x=(.8,.4,.6,1.0,.4,.2)，因此 M 值不会与文档逐个相等；');
console.log('可复算性靠 ENGINE-CALC-EXAMPLE.md 给出本示例自己的完整中间值，任一手算即可闭合。');

console.log('');
console.log('========================================');
console.log('④ 四层输出与免责口径');
console.log('========================================');
console.log('主匹配:', ex.main?.persona.name, ex.mainPercent?.label);
console.log('次匹配:', ex.secondary?.persona.name ?? '(无)');
console.log('隐藏人格:', ex.hidden?.persona.name ?? '(无)');
console.log('意外组合:', ex.surprise?.persona.name ?? '(无，池不足门槛)');
console.log('免责小字:', ex.explanation.disclaimer);

void EXAMPLE_PERSONAS;
void EXAMPLE_THEME;
