import { chromium } from '@playwright/test';
const b=await chromium.launch();
const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.goto('http://127.0.0.1:5173/',{waitUntil:'networkidle'});
await p.getByRole('button',{name:/开始/}).click();
for(let i=0;i<26;i++){
  const opt=p.locator('button.option').first();
  if(await opt.count()===0) break;
  await opt.click(); await p.waitForTimeout(70);
  await p.locator('.quiz__foot button.btn--primary').click();
  await p.waitForTimeout(190);
}
const st = await p.evaluate(()=>({
  url: location.href,
  hasR: new URL(location.href).searchParams.get('r') ? 'YES' : 'no',
  storage: sessionStorage.getItem('pa.quiz.v1')?.slice(0,120),
}));
console.log(JSON.stringify(st,null,1));
await b.close();
