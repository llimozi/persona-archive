/**
 * 静态断言：src/web 不得存在第二套算法（主控 2026-11-05 裁定）。
 *
 * 为什么需要这条：
 *   「六维 === 引擎 user.x*100」只能抓到"算错了"，抓不到"两套算法并存但当前碰巧一致"。
 *   本次 P0 就是后者——前端自造 normalizeDims，页面显示 52/51/52/51/51/49，
 *   单独看是一组"合理"的分数，没有任何报错。若只守数值断言，
 *   下一个人再写一版、且当前恰好算对时，仍然会静默分叉。
 *
 * 判据（主控原话）：grep 后必须为空，但**注释行要排除**——
 *   api.ts 里"已按主控裁决删除"这类说明是有价值的记录，不该让断言红。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const webDir = resolve(__dirname, '../../src/web');
const FORBIDDEN = /\b(normalizeDims|scoreAnswers)\b/;

/** 递归收集 src/web 下的源码文件 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

/** 去掉注释：块注释 + 行注释。只用于"是否出现禁用标识符"的判定。 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('src/web 唯一计算路径（静态断言）', () => {
  it('src/web 不得出现 normalizeDims / scoreAnswers 的代码引用（注释除外）', () => {
    const files = walk(webDir);
    expect(files.length, 'src/web 下未找到任何源码文件，断言失去意义').toBeGreaterThan(0);

    const violations: string[] = [];
    for (const f of files) {
      const raw = readFileSync(f, 'utf8');
      const stripped = stripComments(raw);
      stripped.split('\n').forEach((line, i) => {
        if (FORBIDDEN.test(line)) {
          violations.push(`${f.replace(resolve(__dirname, '../..'), '')}:${i + 1}  ${line.trim()}`);
        }
      });
    }

    expect(
      violations,
      `src/web 下出现第二套算法（必须全部走引擎 match()）：\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
