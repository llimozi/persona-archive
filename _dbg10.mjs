import { chromium } from '@playwright/test';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
p.on('console',m=>{ if(m.text().includes('DEBUG')) console.log('LOG:', m.text()); });
await p.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
await p.getByRole('button',{name:/开始/}).click();
for(let i=0;i<26;i++){
  const opt=p.locator('button.option').first();
  if(await opt.count()===0) break;
  await opt.click(); await p.waitForTimeout(70);
  await p.locator('.quiz__foot button.btn--primary').click();
  await p.waitForTimeout(190);
}
await p.waitForTimeout(500);
console.log('ritual:', await p.locator('[data-testid="ritual-overlay"]').count());
await b.close();
