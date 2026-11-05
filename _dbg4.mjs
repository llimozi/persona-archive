import { chromium } from '@playwright/test';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
p.on('pageerror', e=>console.log('PAGE-ERR:', String(e).slice(0,200)));
await p.goto('http://127.0.0.1:5173//',{waitUntil:'networkidle'});
await p.getByRole('button',{name:/开始/}).click();
for(let i=0;i<30;i++){
  const opt=p.locator('button.option').first();
  if(await opt.count()===0) break;
  await opt.click(); await p.waitForTimeout(80);
  const n=p.locator('.quiz__foot button.btn--primary');
  if(await n.count()===0) break;
  if(await n.first().isDisabled()){ console.log('disabled at',i); break; }
  await n.first().click(); await p.waitForTimeout(180);
}
await p.waitForTimeout(500);
console.log('record:', await p.locator('.record').count());
console.log('text:', (await p.locator('body').innerText()).slice(0,100).replace(/\n/g,' | '));
await b.close();
