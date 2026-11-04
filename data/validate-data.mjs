#!/usr/bin/env node
/**
 * data/validate-data.mjs —— 内容数据入库硬校验（数据自校层）
 *
 * 分层契约（三层各管一段，互不重复）：
 *   1. 契约规定：src/shared/types.ts 写明 Dims 一律 0–100 百分制、六键必须齐全
 *   2. 数据自校：本脚本 —— 入库前直接拒掉，不等引擎发现
 *   3. 引擎兜底：src/engine 的 0..1 自动识别（仅作历史数据兜底）
 *
 * 用法（**必须用 tsx 运行**，见下方"运行时要求"）：
 *   npx tsx data/validate-data.mjs          # 校验，失败退出码 1
 *   npx tsx data/validate-data.mjs --json   # 机器可读输出
 *
 * 退出码：0 = 全部通过；1 = 有阻断性问题（CI/入库前必须为 0）
 *
 * 运行时要求（主控裁决方案 ②，2026-11-04）：
 *   本脚本的跨源一致性检查需要 `await import('../src/engine/index.ts')` 拿到引擎真实导出，
 *   纯 node 无法导入 .ts（会 ERR_MODULE_NOT_FOUND）。因此检测到非 tsx 运行时，
 *   直接输出"请用 npx tsx 运行"并退出 1 —— 而不是让它报一个看起来像"引擎坏了/路径错了"的错误，
 *   把人引向改引擎、改路径的错误方向。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 运行方式提示（不猜环境变量，只在 import 真正失败时给出）──────────────
// 判定依据是"能否真的 import .ts"这一事实，而不是猜 tsx 注入了什么环境变量：
// 环境变量名随 tsx 版本变化，猜错了就会误报或漏报，和解析源码一样脆弱。
const TSX_HINT = '请用 npx tsx data/validate-data.mjs 运行（本脚本需要 import TypeScript 引擎常量）';

const DATA_DIR = dirname(fileURLToPath(import.meta.url));
// 仓库根目录（src/engine 相对它解析），仅用于只读比对引擎常量
const PROJECT_ROOT = join(DATA_DIR, '..');
const DIM_KEYS = ['EE', 'ST', 'AC', 'HX', 'RB', 'SR'];
const RARITY = ['common', 'rare', 'limited', 'hidden'];
const EVIDENCE = ['VERIFIED', 'OBSERVED', 'INFERRED', 'UNKNOWN', 'BLOCKED'];
const Q_TYPES = ['single', 'scenario', 'forced', 'meme'];
const RESTRICTED_REASONS = ['thirdPartyIP', 'realPersonControversy'];

const errors = [];
const warnings = [];

const fail = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

function readJson(name) {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8'));
  } catch (e) {
    fail(name, `无法读取或解析：${e.message}`);
    return null;
  }
}

// ── 人物：dims 量纲硬断言（主控 00:05 要求） ────────────────────
function checkDims(where, dims) {
  if (!dims || typeof dims !== 'object' || Array.isArray(dims)) {
    fail(where, 'dims 缺失或不是对象');
    return;
  }
  const keys = Object.keys(dims);
  // 硬断言 1：六键必须齐全，且不得有多余键
  const missing = DIM_KEYS.filter((k) => !(k in dims));
  const extra = keys.filter((k) => !DIM_KEYS.includes(k));
  if (missing.length) fail(where, `dims 缺维度 [${missing.join(',')}]`);
  if (extra.length) fail(where, `dims 含未知维度 [${extra.join(',')}]`);

  // 硬断言 2：全部为 0–100 的整数（拒小数、拒 0–1 制、拒越界）
  for (const k of DIM_KEYS) {
    const v = dims[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      fail(where, `dims.${k} 不是有限数字（${JSON.stringify(v)}）`);
      continue;
    }
    if (!Number.isInteger(v)) fail(where, `dims.${k}=${v} 不是整数（禁止小数，须 0–100 整数）`);
    if (v < 0 || v > 100) fail(where, `dims.${k}=${v} 越界（须 0–100）`);
  }

  // 风险提示（不阻断）：整卡没有任何 >1 的值 → 引擎百分制识别会落到不确定区间
  const vals = DIM_KEYS.map((k) => dims[k]).filter((v) => typeof v === 'number');
  if (vals.length === DIM_KEYS.length && vals.every((v) => v >= 0 && v <= 1)) {
    warn(where, 'dims 全部 ≤1，引擎无法区分 0–1 制与 0–100 制（按契约应写百分制）');
  }
}

function checkPersonas(doc) {
  const list = Array.isArray(doc) ? doc : doc?.personas;
  if (!Array.isArray(list)) {
    fail('personas.json', '顶层不含 personas 数组');
    return 0;
  }
  const ids = new Set();
  for (let i = 0; i < list.length; i++) {
    const p = list[i] ?? {};
    const where = `personas[${i}] ${p.id ?? '(无 id)'}`;
    if (!p.id) fail(where, '缺少 id');
    else if (ids.has(p.id)) fail(where, `id 重复 ${p.id}`);
    else ids.add(p.id);

    if (!p.name) fail(where, '缺少 name');
    if (!p.category) fail(where, '缺少 category');
    if (!Array.isArray(p.tags) || p.tags.length === 0) fail(where, 'tags 为空或不是数组');
    if (typeof p.desc !== 'string' || !p.desc.trim()) fail(where, 'desc 为空');
    if (!p.source) fail(where, '缺少 source（必须指向 04 资料卡条目）');
    else if (!/^docs\/product-discovery\/04-[^#]+#/.test(p.source)) {
      warn(where, `source 未指向 04 资料卡：${p.source}`);
    }

    checkDims(where, p.dims);

    if (p.cardType && !['text', 'placeholder'].includes(p.cardType)) {
      fail(where, `cardType 非法：${p.cardType}`);
    }
    if (p.rarity !== undefined && !RARITY.includes(p.rarity)) {
      fail(where, `rarity 非法：${p.rarity}`);
    }
    if (p.rarity !== undefined && !p.rarityBasis) {
      fail(where, `标了 rarity=${p.rarity} 但缺 rarityBasis（须引 04 原卡依据）`);
    }
    if (p.evidence !== undefined && !EVIDENCE.includes(p.evidence)) {
      fail(where, `evidence 非法：${p.evidence}`);
    }
    // 合规：受限语义只能走 compliance，不允许用 rarity 表达
    if (p.compliance !== undefined) {
      const c = p.compliance;
      if (typeof c.restricted !== 'boolean') fail(where, 'compliance.restricted 不是布尔');
      if (!Array.isArray(c.restrictedReason)) fail(where, 'compliance.restrictedReason 不是数组');
      else {
        for (const r of c.restrictedReason) {
          if (!RESTRICTED_REASONS.includes(r)) {
            fail(where, `restrictedReason 非法：${r}（允许 ${RESTRICTED_REASONS.join('/')}）`);
          }
        }
      }
      if (typeof c.matchPool !== 'boolean') fail(where, 'compliance.matchPool 不是布尔');
      if (typeof c.resultCardEnabled !== 'boolean') fail(where, 'compliance.resultCardEnabled 不是布尔');
      // 不一致提示：restricted 但无理由
      if (c.restricted === true && (!Array.isArray(c.restrictedReason) || c.restrictedReason.length === 0)) {
        warn(where, 'compliance.restricted=true 但 restrictedReason 为空');
      }
      // 防"同一字段两种写法"（2026-11-05）：
      // 引擎现已两处都读（compliance?.restrictedReason || 顶层），顶层写法**能生效**。
      // 但契约（PersonaCompliance）只定义 compliance 一处，顶层不属契约写法。
      // 两层分工：引擎"读取时宽容"（老写法不至于静默失效），本脚本"入库时严格"（错写法不进仓库）。
      // 注意：这里拦的是**不符合契约**，不是**失效**——两者定性不同，修的地方也不同。
      if (p.restrictedReason !== undefined) {
        fail(
          where,
          'restrictedReason 写在顶层；它虽能被引擎读取，但不符合契约约定' +
            '（PersonaCompliance 只定义在 compliance 内）。请移到 compliance 内，避免依赖兼容路径',
        );
      }
      // matchPool 必须显式声明：这里用布尔类型校验即已覆盖"未声明"的情况
      //（undefined 不是 boolean → 上面的 fail 先命中）。
      // 2026-11-05 后端开发指出：原有一句 `if (c.matchPool === undefined) warn(...)`
      // 永远执行不到（被上一行的类型检查先拦），属死代码，故删除。
      // 注意：这里拦的是"入库格式"，与引擎"缺字段仍进池 + 告警"的运行时容错不冲突。
    } else {
      fail(where, '缺少 compliance（受限语义必须显式声明）');
    }
  }
  return list.length;
}

function checkQuestions(doc) {
  const list = Array.isArray(doc) ? doc : doc?.questions;
  if (!Array.isArray(list)) {
    fail('questions.json', '顶层不含 questions 数组');
    return 0;
  }
  const ids = new Set();
  for (let i = 0; i < list.length; i++) {
    const q = list[i] ?? {};
    const where = `questions[${i}] ${q.id ?? '(无 id)'}`;
    if (!q.id) fail(where, '缺少 id');
    else if (ids.has(q.id)) fail(where, `id 重复 ${q.id}`);
    else ids.add(q.id);

    if (!q.title) fail(where, '缺少 title');
    else if ([...q.title].length > 40) fail(where, `题干 ${[...q.title].length} 字，超过 40 字上限`);
    if (q.type !== undefined && !Q_TYPES.includes(q.type)) fail(where, `type 非法：${q.type}`);

    if (!Array.isArray(q.options) || q.options.length < 2) {
      fail(where, 'options 少于 2 个');
      continue;
    }
    if (q.type === 'forced' && q.options.length !== 2) {
      fail(where, `forced 题型必须恰好 2 个选项，实为 ${q.options.length}`);
    }
    const optIds = new Set();
    for (const o of q.options) {
      const ow = `${where}/${o?.id ?? '?'}`;
      if (!o?.id) fail(ow, '选项缺 id');
      else if (optIds.has(o.id)) fail(ow, '选项 id 重复');
      else optIds.add(o.id);
      if (!o?.label) fail(ow, '选项缺 label');
      if (!o?.effects || typeof o.effects !== 'object') {
        fail(ow, '选项缺 effects');
        continue;
      }
      for (const [k, v] of Object.entries(o.effects)) {
        if (!DIM_KEYS.includes(k)) fail(ow, `effects 含未知维度 ${k}`);
        if (typeof v !== 'number' || !Number.isFinite(v)) fail(ow, `effects.${k} 不是数字`);
        else if (Math.abs(v) > 1) fail(ow, `effects.${k}=${v} 超出 ±1（07 口径为 ±0.3~±0.8）`);
        else if (v !== 0 && Math.abs(v) < 0.3) warn(ow, `effects.${k}=${v} 低于 07 建议下限 ±0.3`);
      }
    }
  }
  return list.length;
}

// ── 执行 ────────────────────────────────────────────────────────
const personasDoc = readJson('personas.json');
const questionsDoc = readJson('questions.json');

let pCount = 0;
let qCount = 0;
if (personasDoc) pCount = checkPersonas(personasDoc);
if (questionsDoc) qCount = checkQuestions(questionsDoc);

// ── 跨源一致性：data 的 theme.weights 必须与引擎 DEFAULT_THEME_WEIGHTS 逐项相同 ──
//
// 背景（2026-11-04）：权重曾出现"多处各抄一份、数值互相打架"的事故（sigma 0.15/0.18/0.20）。
// 后端 checkTheme() 只能校验"和为 1.0"，拦不住"两边都是合法权重但值不同"。
// 本条覆盖该场景。
//
// 实现方式（主控裁决，2026-11-04 改）：**运行时 import 引擎导出，不解析源码文本**。
// 旧实现用 indexOf + 正则抠 match.ts 的常量，已废弃，原因：
//   解析一失效就降级成 warn 放行，退出码仍为 0、PASS 照报 —— 让人以为有保护，比没有更坏。
// 因此本函数的所有失败路径一律走 fail（error，退出码 1），**绝不降级为 warn 跳过**。
async function checkThemeConsistency(questionsDoc) {
  const theme = questionsDoc?.theme;
  if (!theme) {
    warn('questions.json', '顶层未配置 theme，前端/引擎将回退 DEFAULT_THEME_WEIGHTS');
    return;
  }
  let engineWeights;
  try {
    const engine = await import('../src/engine/index.ts');
    engineWeights = engine.DEFAULT_THEME_WEIGHTS;
  } catch (e) {
    // 不降级：取不到引擎常量 = 这条守护此刻不工作，必须让它在结果里可见。
    // 若是纯 node 运行（导不了 .ts），直接给出可执行的正确命令，而不是抛原始错误——
    // ERR_MODULE_NOT_FOUND 会让人误以为是引擎坏了或路径错了，把人引向错误方向。
    if (e?.code === 'ERR_MODULE_NOT_FOUND' || e?.code === 'ERR_UNKNOWN_FILE_EXTENSION') {
      fail('theme', `${TSX_HINT}；原始错误：${e.code}`);
    } else {
      fail(
        'theme',
        `无法运行时 import 引擎 DEFAULT_THEME_WEIGHTS（${e?.code || e?.message}）；` +
          '一致性检查无法执行，按失败处理（不降级为警告，否则会伪装成"检查通过"）',
      );
    }
    return;
  }
  if (!engineWeights || Object.keys(engineWeights).length !== DIM_KEYS.length) {
    fail(
      'theme',
      `引擎 DEFAULT_THEME_WEIGHTS 取到但内容不完整（${JSON.stringify(engineWeights)}）；` +
        '一致性检查无法执行，按失败处理',
    );
    return;
  }
  const dataWeights = theme.weights ?? {};
  for (const k of DIM_KEYS) {
    if (dataWeights[k] !== engineWeights[k]) {
      fail(
        'theme.weights',
        `${k} 数据=${dataWeights[k]} 与引擎 DEFAULT_THEME_WEIGHTS=${engineWeights[k]} 不一致` +
          '（两边都会静默取到不同权重 → 分享链接重算结果漂移，且不会有任何报错）。' +
          '注意：权重和仍可能正好等于 1.0（逐项错位、总量不变），所以「和=1.0 通过」不能代表本项通过。' +
          '改法：两边都是从 06 §9.1 转写的副本，06 §9.1 才是权威；' +
          '不一致说明至少有一边抄错了——回去核对 06 原文，再同步两边。' +
          '不要单独改某一边去迁就另一边（会让分享链接重算漂回错的那套）。',
      );
    }
  }
}

if (questionsDoc) await checkThemeConsistency(questionsDoc);

// 跨文件：题面不得引用受限人物的可识别姓名（红线 ①）
if (personasDoc && questionsDoc) {
  const list = Array.isArray(personasDoc) ? personasDoc : personasDoc.personas ?? [];
  const restrictedNames = list
    .filter((p) => p.compliance?.restricted === true && p.name)
    .map((p) => p.name);
  const qList = Array.isArray(questionsDoc) ? questionsDoc : questionsDoc.questions ?? [];
  for (const q of qList) {
    const text = [q.title, ...(q.options ?? []).map((o) => o.label)].join(' ');
    for (const n of restrictedNames) {
      if (n && text.includes(n)) {
        warn(`${q.id}`, `题面/选项出现受限人物姓名「${n}」，首版不得引用第三方人物素材`);
      }
    }
  }
}

// ── 精确计数断言（2026-11-05，算法开发建议）────────────────────────
// 背景：只"打印"警告条数，无法发现"同一条警告被推了两次"这类语义重复——
//   语法检查放行、输出看着正常（3 条），实际是 4 条。
// 做法：把当前定稿态的关键计数固定下来，**与实测不符即 error**。
//   这同时是一条"数据或规则被人改过"的显式信号，而不是静默通过。
// 维护：任何一组计数被有意改变时，必须同步改这里，并在改动记录里写明原因。
const EXPECTED = {
  personas: 12,
  questions: 10,
};
// 低幅权重警告数固定为 3（主控裁定保留的中间档选项），用于抓"重复警告/漏告警"
const EXPECTED_LOW_DELTA_WARNINGS = 3;

const lowDeltaWarnings = warnings.filter((w) => w.includes('低于 07 建议下限')).length;

if (pCount !== EXPECTED.personas) {
  fail('personas.json', `人物数 = ${pCount}，定稿基线为 ${EXPECTED.personas}（若为有意变更，请同步更新 EXPECTED）`);
}
if (qCount !== EXPECTED.questions) {
  fail('questions.json', `题目数 = ${qCount}，定稿基线为 ${EXPECTED.questions}（若为有意变更，请同步更新 EXPECTED）`);
}
if (lowDeltaWarnings !== EXPECTED_LOW_DELTA_WARNINGS) {
  fail(
    'questions.json',
    `低幅权重警告数 = ${lowDeltaWarnings}，定稿基线为 ${EXPECTED_LOW_DELTA_WARNINGS}` +
      '（多出可能是同一警告被重复推送，少了可能是该选项被改动）',
  );
}

const result = {
  ok: errors.length === 0,
  personas: pCount,
  questions: qCount,
  lowDeltaWarnings,
  errors,
  warnings,
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`personas: ${pCount}  |  questions: ${qCount}`);
  if (warnings.length) {
    console.log(`\n[警告 ${warnings.length} 条 · 不阻断]`);
    for (const w of warnings) console.log(`  ⚠ ${w}`);
  }
  if (errors.length) {
    console.log(`\n[阻断 ${errors.length} 条 · 必须修复后才能入库]`);
    for (const e of errors) console.log(`  ✗ ${e}`);
  }
  console.log(`\n结果：${result.ok ? 'PASS' : 'FAIL'}（errors=${errors.length}, warnings=${warnings.length}）`);
}

process.exit(result.ok ? 0 : 1);
