import { chromium } from '@playwright/test';
const b = await chromium.launch();
const c = await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2});
const p = await c.newPage();
await p.goto('http://127.0.0.1:5173/', {waitUntil:'networkidle'});
await p.getByRole('button',{name:/开始/}).click();
for (let i=0;i<26;i++){
  const opt = p.locator('button.option').first();
  if (await opt.count()===0) break;
  await opt.click();
  await p.waitForTimeout(70);
  const n = p.locator('.quiz__foot button.btn--primary');
  if (await n.count()===0) break;
  if (await n.first().isDisabled()) break;
  await n.first().click();
  await p.waitForTimeout(190);
  if (await p.locator('[data-testid="ritual-overlay"]').count()) break;
}
const t0 = Date.now();
for (const at of [150, 450, 900, 1300, 1750, 2100, 2400]) {
  const w = at - (Date.now() - t0);
  if (w > 0) await p.waitForTimeout(w);
  await p.screenshot({path:`artifacts/visual/anim/ritual-${at}.png`});
}
await p.waitForTimeout(2200);
await p.screenshot({path:'artifacts/visual/anim/result-after.png', fullPage:true});
console.log('record:', await p.locator('.record').count());
await b.close();
