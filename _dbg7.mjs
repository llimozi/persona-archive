import { chromium } from '@playwright/test';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
await p.getByRole('button',{name:/开始/}).click();
for(let i=0;i<10;i++){
  await p.locator('button.option').first().click();
  await p.waitForTimeout(90);
  await p.locator('.quiz__foot button.btn--primary').click();
  await p.waitForTimeout(250);
}
const prog = await p.locator('[data-testid="quiz-progress-text"]').innerText().catch(()=>'-');
const kicker = await p.locator('.kicker').innerText().catch(()=>'-');
console.log('progress:',prog.replace(/\n/g,' '),'| kicker:',kicker.replace(/\n/g,' '));
await b.close();
