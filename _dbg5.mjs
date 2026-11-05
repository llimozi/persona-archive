import { chromium } from '@playwright/test';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
p.on('pageerror', e=>console.log('PAGE-ERR:', String(e).slice(0,300)));
p.on('console', m=>{ if(m.type()==='error') console.log('ERR:', m.text().slice(0,250)); });
await p.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
await p.getByRole('button',{name:/开始/}).click();
for(let i=0;i<26;i++){
  const opt=p.locator('button.option').first();
  if(await opt.count()===0) break;
  await opt.click(); await p.waitForTimeout(90);
  const n=p.locator('.quiz__foot button.btn--primary');
  const txt=(await n.first().innerText()).trim();
  await n.first().click();
  await p.waitForTimeout(260);
  const ritual = await p.locator('[data-testid="ritual-overlay"]').count();
  const rec = await p.locator('.record').count();
  if (i>22) console.log(`i=${i} txt="${txt}" ritual=${ritual} record=${rec}`);
  if (ritual||rec) break;
}
await p.waitForTimeout(3000);
console.log('final record:', await p.locator('.record').count());
await b.close();
