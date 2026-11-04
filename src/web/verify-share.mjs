/**
 * 分享链接（?r=）验收脚本 —— 可重跑，不依赖 /tmp。
 *
 * 校验链路：作答 → 编码 ?r= → 新会话打开 → 页面结果 **与引擎直算结果逐项比对**。
 * 判据（与主流程一致，三条都要）：
 *   ① 六维绝对值逐维相等（±1 取整）
 *   ② 主匹配人物名相同
 *   ③ 极差 ≥ 10（防压缩）
 *
 * 用法（dev 服务需已在 5173 运行，勿重复启动）：
 *   node src/web/verify-share.mjs
 * 退出码：0 全过 / 1 有失败
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = process.env.EDGE_PATH ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.AUDIT_URL ?? 'http://127.0.0.1:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* 等待 CDP */
    }
    await sleep(200);
  }
  throw new Error('CDP 未就绪');
}

const port = 9555;
const profile = mkdtempSync(join(tmpdir(), 'edge-share-'));
const child = spawn(
  EDGE,
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-gpu', 'about:blank'],
  { stdio: 'ignore' },
);

const ws = new WebSocket(await wsUrl(port));
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
  }
});
const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const n = ++id;
    pending.set(n, { res, rej });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(String(r.exceptionDetails.exception?.description).slice(0, 200));
  return r.result.value;
};
const waitFor = async (sel, limit = 80) => {
  for (let k = 0; k < limit; k++) {
    if ((await ev(`!!document.querySelector('${sel}')`)) === true) return true;
    await sleep(250);
  }
  return false;
};

/** 读结果页：六维值 + 主人物名 */
const READ_RESULT = `(() => {
  const rows = [...document.querySelectorAll('.dim')].map((r) => ({
    name: r.querySelector('.dim__name').textContent.trim(),
    value: Number(r.querySelector('.dim__value').textContent.trim()),
  }));
  return {
    name: document.querySelector('.result__name')?.innerText?.trim() ?? null,
    values: rows.map((r) => r.value),
    spread: rows.length ? Math.max(...rows.map((r) => r.value)) - Math.min(...rows.map((r) => r.value)) : null,
  };
})()`;

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
};

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.enable');
await send('Runtime.enable');

try {
  // —— 1. 走一遍答题（全选 A），拿到结果页 + 引擎基准 ——
  await send('Page.navigate', { url: BASE });
  await waitFor('.btn--primary');
  await ev(`sessionStorage.clear()`);
  await send('Page.navigate', { url: BASE });
  await waitFor('.btn--primary');
  await ev(`document.querySelector('.btn--primary').click()`);
  await sleep(600);
  for (let i = 0; i < 20; i++) {
    if (!(await ev(`!!document.querySelector('.option')`))) break;
    await ev(`document.querySelectorAll('.option')[0].click()`);
    await sleep(180);
    const label = await ev(`(() => {
      const b = document.querySelector('.quiz__foot .btn--primary');
      if (!b || b.disabled) return null;
      const t = b.textContent; b.click(); return t;
    })()`);
    await sleep(300);
    if (label === '看结果') break;
  }
  await waitFor('.result__hero');
  await sleep(500);

  const direct = await ev(READ_RESULT);
  const saved = await ev(`sessionStorage.getItem('pa.quiz.v1')`);
  const answers = JSON.parse(saved).answers;
  console.log('\n[作答] 全选 A，题目数 =', Object.keys(answers).length);
  console.log('[直连结果] 主人物 =', direct.name, '| 六维 =', JSON.stringify(direct.values), '| 极差 =', direct.spread);

  // —— 2. 用这份 answers 生成 ?r= ——
  const token = await ev(
    `(async () => { const m = await import('/lib/share.ts'); return m.encodeAnswers(${JSON.stringify(answers)}); })()`,
  );
  console.log('[token] 长度 =', token.length, '| 前缀 =', token.slice(0, 24) + '…');

  // —— 3. 新会话打开（清空存档，模拟他人）——
  await ev(`sessionStorage.clear()`);
  await send('Page.navigate', { url: `${BASE}?r=${encodeURIComponent(token)}` });
  await waitFor('.result__hero');
  await sleep(600);
  const shared = await ev(READ_RESULT);
  console.log('[分享打开] 主人物 =', shared.name, '| 六维 =', JSON.stringify(shared.values), '| 极差 =', shared.spread);

  // —— 4. 三条判据 ——
  console.log('');
  const dimsMatch =
    shared.values.length === direct.values.length &&
    shared.values.every((v, i) => Math.abs(v - direct.values[i]) <= 1);
  check('六维绝对值与直连一致（±1）', dimsMatch, `${JSON.stringify(shared.values)} vs ${JSON.stringify(direct.values)}`);
  check('主匹配人物一致', shared.name === direct.name, `${shared.name} vs ${direct.name}`);
  check('极差 ≥ 10（防压缩）', (shared.spread ?? 0) >= 10, `极差 = ${shared.spread}`);

  // —— 5. 坏 token 降级 ——
  await ev(`sessionStorage.clear()`);
  await send('Page.navigate', { url: `${BASE}?r=!!!bad-token###` });
  await sleep(1800);
  const home = await ev(`!!document.querySelector('.btn--primary') && !document.querySelector('.result__hero')`);
  check('坏 token 静默降级回首页', home === true);
} finally {
  ws.close();
  child.kill();
  await sleep(300);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* 忽略 */
  }
}

console.log(failed === 0 ? '\n全部通过' : `\n失败 ${failed} 项`);
process.exit(failed === 0 ? 0 : 1);
