import { chromium } from '@playwright/test';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
const info = await p.evaluate(()=>{
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const off = new URLSearchParams(location.search).get('anim');
  let ls=null; try{ ls=localStorage.getItem('pa.anim'); }catch{}
  return { mq, off, ls, cls: document.documentElement.className };
});
console.log(JSON.stringify(info));
await b.close();
