/**
 * 视口实测脚本（前端自测用，不属于交付产物）。
 * 用本机 Edge 无头模式 + CDP，在指定视口下量：
 *   - 文档横向溢出（scrollWidth > clientWidth）
 *   - 所有可点元素的实际热区
 *   - 逐屏走查：首页 → 答题 → 结果
 * 用法: node scripts/viewport-audit.mjs [390] [360]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.AUDIT_URL ?? 'http://127.0.0.1:5173/';
const widths = process.argv.slice(2).map(Number).filter(Boolean);
const TARGETS = widths.length ? widths : [390, 360];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getWsUrl(port) {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* 还没起来 */
    }
    await sleep(200);
  }
  throw new Error('CDP 未就绪');
}

function makeClient(ws) {
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
}

/** 在页面里执行，返回结构化测量结果 */
const MEASURE = `(() => {
  const de = document.documentElement;
  const doc = {
    clientWidth: de.clientWidth,
    scrollWidth: de.scrollWidth,
    innerWidth: window.innerWidth,
    overflowX: de.scrollWidth > de.clientWidth,
    overflowPx: Math.max(0, de.scrollWidth - de.clientWidth),
  };
  // 找出真正撑破视口的元素
  const offenders = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    if (r.right > de.clientWidth + 0.5 || r.left < -0.5) {
      offenders.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 40)) || '',
        left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width),
      });
    }
  }
  // 热区：所有 button / [role=button] / a
  const hits = [];
  for (const el of document.querySelectorAll('button, [role="button"], a[href]')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    hits.push({
      text: (el.textContent || '').trim().slice(0, 14),
      cls: (el.className && String(el.className).slice(0, 30)) || '',
      w: Math.round(r.width), h: Math.round(r.height),
      small: Math.round(r.height) < 44 || Math.round(r.width) < 44,
    });
  }
  return { doc, offenders: offenders.slice(0, 12), hits };
})()`;

async function run() {
  const profile = mkdtempSync(join(tmpdir(), 'edge-audit-'));
  const port = 9333;
  const child = spawn(EDGE, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--disable-gpu',
    'about:blank',
  ], { stdio: 'ignore' });

  const out = [];
  try {
    const wsUrl = await getWsUrl(port);
    const ws = new WebSocket(wsUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    const send = makeClient(ws);

    for (const w of TARGETS) {
      const h = w === 360 ? 640 : 844;
      await send('Emulation.setDeviceMetricsOverride', {
        width: w, height: h, deviceScaleFactor: 2, mobile: true,
      });
      await send('Page.enable');
      await send('Runtime.enable');

      const nav = async (url) => {
        await send('Page.navigate', { url });
        await sleep(1400);
      };
      const ev = async (expr) => {
        const r = await send('Runtime.evaluate', {
          expression: expr, awaitPromise: true, returnByValue: true,
        });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
        return r.result.value;
      };

      const screens = {};

      // —— 首页 ——
      await nav(BASE);
      await ev(`sessionStorage.clear()`);
      await nav(BASE);
      screens.home = await ev(MEASURE);
      const shotHome = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });

      // —— 答题页：点开始，选第 1 题的 A ——
      await ev(`document.querySelector('.btn--primary').click()`);
      await sleep(400);
      await ev(`document.querySelector('.option').click()`);
      await sleep(250);
      screens.quiz = await ev(MEASURE);
      const shotQuiz = await send('Page.captureScreenshot', { format: 'png' });

      // —— 结果页：答完 10 题（每题选第一个选项）——
      // 注意：必须「先点选项 → 等 React 提交 → 再点下一题」分两步。
      // 若在同一次 evaluate 里连点，按钮的 disabled 还没被 React 更新，点击会被吞掉。
      for (let i = 0; i < 10; i++) {
        const picked = await ev(`(() => {
          const o = document.querySelector('.option');
          if (!o) return false;
          o.click();
          return true;
        })()`);
        if (!picked) break;
        await sleep(180);
        await ev(`(() => {
          const b = document.querySelector('.quiz__foot .btn--primary');
          if (!b || b.disabled) return false;
          b.click();
          return true;
        })()`);
        await sleep(280);
      }
      await sleep(500);
      screens.result = await ev(MEASURE);
      const shotResult = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });

      const resultTitle = await ev(`document.querySelector('.result__name')?.innerText ?? null`);
      out.push({ viewport: `${w}x${h}`, screens, resultTitle,
        shots: { home: shotHome.data, quiz: shotQuiz.data, result: shotResult.data } });

      // 落盘截图
      const { writeFileSync, mkdirSync } = await import('node:fs');
      mkdirSync('artifacts/screenshots', { recursive: true });
      writeFileSync(`artifacts/screenshots/${w}-home.png`, Buffer.from(shotHome.data, 'base64'));
      writeFileSync(`artifacts/screenshots/${w}-quiz.png`, Buffer.from(shotQuiz.data, 'base64'));
      writeFileSync(`artifacts/screenshots/${w}-result.png`, Buffer.from(shotResult.data, 'base64'));
    }
    ws.close();
  } finally {
    child.kill();
    await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }

  // 汇总打印
  for (const o of out) {
    console.log(`\n===== 视口 ${o.viewport} =====`);
    for (const [name, m] of Object.entries(o.screens)) {
      const label = { home: '首页', quiz: '答题页', result: '结果页' }[name];
      console.log(`[${label}] 溢出=${m.doc.overflowX ? `是 +${m.doc.overflowPx}px` : '否'} ` +
        `(clientWidth=${m.doc.clientWidth}, scrollWidth=${m.doc.scrollWidth}) ` +
        `可点元素=${m.hits.length} 小于44px=${m.hits.filter((x) => x.small).length}`);
      if (m.offenders.length) {
        console.log('   越界元素:', JSON.stringify(m.offenders.slice(0, 5)));
      }
      const small = m.hits.filter((x) => x.small);
      if (small.length) console.log('   小热区:', JSON.stringify(small.slice(0, 6)));
    }
    console.log(`[结果页主人物] ${o.resultTitle ?? '(空)'}`);
  }
}

run().catch((e) => {
  console.error('审计失败:', e.message);
  process.exit(1);
});
