/**
 * 隐藏规则 / 标签规则的布尔表达式求值器。
 *
 * 为什么不用 `eval` / `new Function`：算法要求可解释、可复算、零依赖，
 * 且表达式来自内容后台（不可信输入），必须用白名单词法解析而不是动态执行。
 *
 * 支持语法（06 §6.6 的 condition 示例）：
 *   变量：EE ST AC HX RB SR
 *   数字：0.3 / .5 / 1
 *   比较：< <= > >= == !=
 *   逻辑：AND OR NOT && || ! ，括号分组
 */

export type Expression = { kind: 'and' | 'or'; items: Expression[] } | { kind: 'cmp'; dim: string; op: string; value: number } | { kind: 'not'; item: Expression };

const DIMS = new Set(['EE', 'ST', 'AC', 'HX', 'RB', 'SR']);

type Token =
  | { t: 'num'; v: number }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' };

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ t: 'lp' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ t: 'rp' });
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < source.length && /[0-9.]/.test(source[j]!)) j += 1;
      const text = source.slice(i, j);
      const v = Number(text);
      if (!Number.isFinite(v)) throw new Error(`表达式含非法数字: ${text}`);
      tokens.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < source.length && /[A-Za-z_]/.test(source[j]!)) j += 1;
      tokens.push({ t: 'ident', v: source.slice(i, j) });
      i = j;
      continue;
    }
    const two = source.slice(i, i + 2);
    if (two === '<=' || two === '>=' || two === '==' || two === '!=' || two === '&&' || two === '||') {
      tokens.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if (ch === '<' || ch === '>' || ch === '!') {
      tokens.push({ t: 'op', v: ch });
      i += 1;
      continue;
    }
    throw new Error(`表达式含非法字符: ${ch}`);
  }
  return tokens;
}

const CMP_OPS = ['<=', '>=', '==', '!=', '<', '>'] as const;

/** 解析表达式。语法错误抛异常，由调用方决定是警告还是直接失败。 */
export function parseExpression(source: string): Expression {
  const tokens = tokenize(source);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];

  const parseOr = (): Expression => {
    const items: Expression[] = [parseAnd()];
    for (;;) {
      const tk = peek();
      if (tk && ((tk.t === 'ident' && tk.v === 'OR') || (tk.t === 'op' && tk.v === '||'))) {
        pos += 1;
        items.push(parseAnd());
        continue;
      }
      break;
    }
    return items.length === 1 ? items[0]! : { kind: 'or', items };
  };

  const parseAnd = (): Expression => {
    const items: Expression[] = [parseUnary()];
    for (;;) {
      const tk = peek();
      if (tk && ((tk.t === 'ident' && tk.v === 'AND') || (tk.t === 'op' && tk.v === '&&'))) {
        pos += 1;
        items.push(parseUnary());
        continue;
      }
      break;
    }
    return items.length === 1 ? items[0]! : { kind: 'and', items };
  };

  const parseUnary = (): Expression => {
    const tk = peek();
    if (tk && ((tk.t === 'ident' && tk.v === 'NOT') || (tk.t === 'op' && tk.v === '!'))) {
      pos += 1;
      return { kind: 'not', item: parseUnary() };
    }
    return parsePrimary();
  };

  const parsePrimary = (): Expression => {
    const tk = peek();
    if (!tk) throw new Error('表达式意外结束');
    if (tk.t === 'lp') {
      pos += 1;
      const inner = parseOr();
      const close = peek();
      if (!close || close.t !== 'rp') throw new Error('表达式括号未闭合');
      pos += 1;
      return inner;
    }
    if (tk.t === 'ident' && DIMS.has(tk.v) && peek2IsCmp()) {
      pos += 1;
      const opTk = tokens[pos]!;
      pos += 1;
      const numTk = tokens[pos];
      if (!numTk || numTk.t !== 'num') throw new Error(`维度 ${tk.v} 后缺少数字`);
      pos += 1;
      return { kind: 'cmp', dim: tk.v, op: opTk.t === 'op' ? opTk.v : '=', value: numTk.v };
    }
    throw new Error(`表达式无法解析的片段: ${JSON.stringify(tk)}`);
  };

  const peek2IsCmp = (): boolean => {
    const next = tokens[pos + 1];
    return !!next && next.t === 'op' && (CMP_OPS as readonly string[]).includes(next.v);
  };

  const expr = parseOr();
  if (pos !== tokens.length) throw new Error('表达式存在多余内容');
  return expr;
}

/** 求值。`values` 为六维分（0..1）；未知维度视为 0.5 中性，但解析阶段已限制在白名单内。 */
export function evaluateExpression(expr: Expression, values: Record<string, number>): boolean {
  switch (expr.kind) {
    case 'and':
      return expr.items.every((e) => evaluateExpression(e, values));
    case 'or':
      return expr.items.some((e) => evaluateExpression(e, values));
    case 'not':
      return !evaluateExpression(expr.item, values);
    case 'cmp': {
      const v = values[expr.dim] ?? 0.5;
      switch (expr.op) {
        case '<':
          return v < expr.value;
        case '<=':
          return v <= expr.value;
        case '>':
          return v > expr.value;
        case '>=':
          return v >= expr.value;
        case '==':
          return v === expr.value;
        case '!=':
          return v !== expr.value;
        default:
          return false;
      }
    }
  }
}

/** 一步到位：字符串 → 布尔。语法错误时返回 null，由调用方记录警告。 */
export function evalCondition(source: string, values: Record<string, number>): boolean | null {
  try {
    return evaluateExpression(parseExpression(source), values);
  } catch {
    return null;
  }
}

/** 通配匹配（支持 `*`），用于隐藏规则的 candidatePool，如 `ani-*` */
export function wildcardMatch(pattern: string, value: string): boolean {
  const escaped = pattern.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${escaped.join('.*')}$`).test(value);
}
