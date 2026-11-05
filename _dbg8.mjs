import { chromium } from '@playwright/test';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
p.on('pageerror',e=>console.log('PAGEERR:',String(e).slice(0,400)));
await p.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
await p.getByRole('button',{name:/开始/}).click();
for(let i=0;i<32;i++){
  const opt=p.locator('button.option').first();
  if(await opt.count()===0) break;
  await opt.click(); await p.waitForTimeout(80);
  const n=p.locator('.quiz__foot button.btn--primary');
  if(await n.count()===0) break;
  const disabled=await n.first().isDisabled();
  const txt=(await n.first().innerText()).trim().replace(/\n/g,'');
  if(i>=23) console.log(`i=${i} txt=${txt} disabled=${disabled}`);
  if(disabled) break;
  await n.first().click(); await p.waitForTimeout(200);
  if(await p.locator('.record').count()) { console.log('RECORD at',i); break; }
  if(await p.locator('[data-testid="ritual-overlay"]').count()) { console.log('RITUAL at',i); break; }
}
await b.close();
