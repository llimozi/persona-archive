import { chromium } from '@playwright/test';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
p.on('console', m=>{ if(m.type()==='error') console.log('CONSOLE-ERR:', m.text().slice(0,200)); });
p.on('pageerror', e=>console.log('PAGE-ERR:', String(e).slice(0,300)));
await p.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
await p.getByRole('button',{name:/开始/}).click();
for(let i=0;i<40;i++){
  const opt=p.locator('button.option').first();
  if(await opt.count()===0) break;
  await opt.click(); await p.waitForTimeout(110);
  const n=p.locator('.quiz__foot button').filter({hasText:/下一题|查看我的档案/});
  if(await n.count()===0) break;
  await n.first().click(); await p.waitForTimeout(220);
}
await p.waitForTimeout(300);
await p.getByRole('button',{name:'查看我的档案'}).click();
await p.waitForTimeout(600);
console.log('ritual overlay:', await p.locator('[data-testid="ritual-overlay"]').count());
await p.waitForTimeout(2600);
console.log('record:', await p.locator('.record').count(), 'body:', (await p.locator('body').innerText()).slice(0,80).replace(/\n/g,' | '));
await b.close();
