/**
 * 只读排查脚本：抓取页面实际写入 localStorage / sessionStorage / cookie 的内容。
 * 不修改任何源码，仅用 CDP 读取运行时状态。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const BASE = process.env.AUDIT_URL ?? 'http://127.0.0.1:5173/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wsUrl(port) {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* wait */
    }
    await sleep(200);
  }
  throw new Error('CDP 未就绪');
}

const port = 9677;
const profile = mkdtempSync(join(tmpdir(), 'edge-audit-'));
const child = spawn(
  EDGE,
  ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--disable-gpu', 'about:blank'],
  { stdio: 'ignore' },
);

let ws;
try {
  ws = new WebSocket(await wsUrl(port));
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
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: BASE });
  await sleep(2500);

  console.log('=== 初始 localStorage ===');
  console.log(await ev(`JSON.stringify(Object.keys(localStorage).map(k=>({k,v:localStorage.getItem(k)})))`));
  console.log('=== 初始 sessionStorage ===');
  console.log(await ev(`JSON.stringify(Object.keys(sessionStorage).map(k=>({k,v:sessionStorage.getItem(k)})))`));
  console.log('=== cookie ===');
  console.log(await ev(`JSON.stringify({cookie:document.cookie, len:document.cookie.length})`));
  console.log('=== indexedDB 数据库 ===');
  console.log(await ev(`(async()=>{try{const d=await indexedDB.databases();return JSON.stringify(d)}catch(e){return 'err:'+e.message}})()`));

  // 进入答题并作答，观察写入
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/开始答题/.test(x.textContent));if(b)b.click();return !!b})()`);
  await sleep(800);
  const opts = await ev(`(()=>{const bs=[...document.querySelectorAll('button')];return JSON.stringify(bs.map((b,i)=>({i,t:b.textContent.trim().slice(0,20)})))})()`);
  console.log('=== 答题页按钮 ===');
  console.log(opts);

  // 选第一个选项
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^A/.test(x.textContent.trim()));if(b)b.click();return !!b})()`);
  await sleep(600);
  await ev(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>/下一题/.test(x.textContent));if(b)b.click();return !!b})()`);
  await sleep(600);

  console.log('');
  console.log('=== 作答后 sessionStorage 实际内容 ===');
  const saved = await ev(`sessionStorage.getItem('pa.quiz.v1')`);
  console.log(saved);
  console.log('=== 作答后 localStorage ===');
  console.log(await ev(`JSON.stringify(Object.keys(localStorage))`));
  console.log('=== 作答后 cookie ===');
  console.log(await ev(`JSON.stringify({cookie:document.cookie})`));
  console.log('=== 全部 storage 键名汇总 ===');
  console.log(await ev(`JSON.stringify({local:Object.keys(localStorage),session:Object.keys(sessionStorage),cookie:document.cookie})`));
  console.log('=== 当前 URL（是否含结果参数） ===');
  console.log(await ev(`location.href`));
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  child.kill();
  await sleep(500);
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
}
