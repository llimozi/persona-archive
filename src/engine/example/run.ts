/**
 * 可复算示例的运行入口。
 *
 *   pnpm exec tsx src/engine/example/run.ts
 *
 * 输出结构与 docs/ENGINE-CALC-EXAMPLE.md 一一对应：先给中间值（g / ω / Σωg），再给最终结果。
 * 本脚本只读不写，不产生任何副作用，可反复运行对比。
 */

import { match } from '../match.js';
import { buildExampleInput } from './fixture.js';

const result = match(buildExampleInput());

const pad = (n: number, d = 6) => n.toFixed(d);

console.log('=== 六维匹配引擎 · 可复算示例 ===');
console.log('引擎版本:', result.engineVersion);
console.log('');
console.log('--- 第 1 段：用户六维分 x_d（06 §5）---');
for (const dim of ['EE', 'ST', 'AC', 'HX', 'RB', 'SR'] as const) {
  console.log(`${dim}: x=${pad(result.user.x[dim], 4)}  raw=${pad(result.user.raw[dim], 4)}`);
}
console.log('覆盖度:', pad(result.user.coverage, 4), '用户标签:', result.user.tags.join(', ') || '(无)');
console.log('');
console.log('--- 第 2 段：人物打分（06 §6.2 / §6.3 / §6.4）---');
for (const p of result.ranking) {
  console.log(`\n[${p.id}] ${p.name}  分类=${p.category}  稀有度=${p.rarity}`);
  let sumOmegaG = 0;
  let sumOmega = 0;
  for (const c of p.contributions) {
    console.log(
      `  ${c.dim}: x=${pad(c.x, 2)} mu=${pad(c.mu, 2)} σ=${pad(c.sigma, 2)} g=${pad(c.g)} ω=${pad(c.omega)} ωg=${pad(c.omega * c.g)}`,
    );
    sumOmegaG += c.omega * c.g;
    sumOmega += c.omega;
  }
  console.log(`  Σωg=${pad(sumOmegaG)}  Σω=${pad(sumOmega)}  M=${pad(sumOmegaG / sumOmega)}`);
  console.log(`  β=${pad(p.beta, 2)} (共享标签 ${p.sharedTags.join(',') || '无'})  M'=${pad(p.adjusted)}  娱乐匹配度=${p.percent}%`);
}
console.log('');
console.log('--- 第 3 段：四层抽取（06 §6.5）---');
console.log('主匹配  :', result.main ? `${result.main.persona.name} ${result.mainPercent?.label}` : '无');
console.log('次匹配  :', result.secondary ? `${result.secondary.persona.name} ${result.secondary.persona.percent}%` : '无');
console.log('隐藏人格:', result.hidden ? `${result.hidden.persona.name}` : '无（未命中规则，这是正确行为）');
console.log('意外组合:', result.surprise ? `${result.surprise.persona.name}` : `无（池 ${result.pool.size} < 门槛 40，按 06 §10.1 关闭）`);
console.log('');
console.log('--- 第 4 段：可读解释（06 §7）---');
console.log(result.explanation.mainSummary);
for (const line of result.explanation.mainDims) console.log(' ·', line);
console.log('');
console.log('免责小字（不可折叠）:', result.explanation.disclaimer);
console.log('');
console.log('--- 告警 ---');
if (result.warnings.length === 0) console.log('(无)');
for (const w of result.warnings) console.log(`[${w.code}] ${w.message}`);
