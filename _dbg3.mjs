import { chromium } from '@playwright/test';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
await p.getByRole('button',{name:/开始/}).click();
for(let i=0;i<40;i++){
  const opt=p.locator('button.option').first();
  if(await opt.count()===0) break;
  await opt.click(); await p.waitForTimeout(110);
  const n=p.locator('.quiz__foot button').filter({hasText:/下一题|查看我的档案/});
  if(await n.count()===0) break;
  const txt = (await n.first().innerText()).trim();
  const disabled = await n.first().isDisabled();
  console.log(`i=${i} btn="${txt}" disabled=${disabled}`);
  if (disabled) { console.log('  -> 选项未选中，停在这里'); break; }
  await n.first().click(); await p.waitForTimeout(220);
}
await b.close();
