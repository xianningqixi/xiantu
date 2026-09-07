import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {createServer,type Server} from 'node:http';
import {Readable} from 'node:stream';
let server:Server,script=readFileSync('dist/client/sw.js','utf8');
const original=script,upstream=process.env.XIANTU_TEST_URL??'http://127.0.0.1:3100';
test.use({baseURL:'http://127.0.0.1:3125'});
test.beforeAll(async()=>{server=createServer(async(req,res)=>{try{if(req.url?.split('?')[0]==='/sw.js'){res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});res.end(script);return;}const result=await fetch(upstream+(req.url??'/'),{method:req.method,headers:{'Accept-Encoding':'identity'}});res.writeHead(result.status,Object.fromEntries([...result.headers].filter(([key])=>!['content-encoding','content-length','transfer-encoding'].includes(key))));if(result.body)Readable.fromWeb(result.body as any).pipe(res);else res.end();}catch{res.writeHead(502);res.end();}});await new Promise<void>(resolve=>server.listen(3125,'127.0.0.1',resolve));});
test.afterAll(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
test('production core can close and reopen offline, act and recover the saved day',async({page,context})=>{
 const manifest=await page.request.get('/offline-manifest.json');test.skip(!manifest.ok(),'Production-only: development has no service worker');const metadata=await manifest.json();test.skip(!metadata.available,'Production-only');
 await page.goto('/');await page.getByRole('textbox',{name:'姓名',exact:true}).fill('离线修士');await page.getByRole('button',{name:'踏入仙途',exact:true}).click();await expect(page.getByText('离线可用',{exact:true})).toBeVisible({timeout:30000});
 const cached=await page.evaluate(async()=>{const keys=await caches.keys();const cache=await caches.open(keys.find(k=>k.startsWith('xiantu-core-'))!);return(await cache.keys()).map(r=>new URL(r.url).pathname);});for(const file of metadata.files)expect(cached).toContain(file);
 await context.setOffline(true);await page.close();const reopened=await context.newPage();await reopened.goto('/');await expect(reopened.getByRole('heading',{name:'离线修士',exact:true})).toBeVisible();
 await reopened.getByRole('button',{name:'接些坊市杂务 1 日 · 获得 6 灵石',exact:true}).click();await expect(reopened.locator('header').getByText('第 2 日',{exact:true})).toBeVisible();await reopened.reload();await expect(reopened.locator('header').getByText('第 2 日',{exact:true})).toBeVisible();
 await reopened.getByRole('button',{name:'与林晚自由交涉',exact:true}).click();await expect(reopened.getByRole('dialog')).toContainText('当前离线');await expect(reopened.getByRole('button',{name:'提出商议',exact:true})).toBeDisabled();
});
test('waiting update keeps the active version and refuses another open game tab before explicit activation',async({page,context})=>{
 const manifest=await page.request.get('/offline-manifest.json');test.skip(!manifest.ok(),'Production-only');test.skip(!(await manifest.json()).available,'Production-only');script=original;
 await page.goto('/');await page.getByRole('textbox',{name:'姓名',exact:true}).fill('更新修士');await page.getByRole('button',{name:'踏入仙途',exact:true}).click();await expect(page.getByText('离线可用',{exact:true})).toBeVisible({timeout:30000});
 const other=await context.newPage();await other.goto('/');await expect(other.getByRole('heading',{name:'更新修士',exact:true})).toBeVisible();
 try{
  script=original.replace(/const VERSION = "([^"]+)"/,'const VERSION = "$1-qa-update"');
  await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();await r!.update();});await expect(page.getByRole('button',{name:'应用更新并重开'})).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'应用更新并重开'}).click();await expect(page.getByText('请先关闭其他游戏或预览页面，再应用更新。')).toBeVisible();
  await other.close();await page.getByRole('button',{name:'应用更新并重开'}).click();await expect(page.getByRole('heading',{name:'更新修士',exact:true})).toBeVisible();await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.controller?.state)).toBe('activated');
  expect(await page.evaluate(async()=>await caches.keys())).toEqual(expect.arrayContaining([expect.stringContaining('-qa-update')]));
 }finally{script=original;}
});

test('a failed update retains the old cache, and a paused long action blocks activation',async({page})=>{
 script=original;await page.goto('/');await page.getByRole('textbox',{name:'姓名',exact:true}).fill('安全更新');await page.getByRole('button',{name:'踏入仙途',exact:true}).click();await expect(page.getByText('离线可用',{exact:true})).toBeVisible({timeout:30000});
 const cachesBefore=await page.evaluate(()=>caches.keys());
 try{
  script=original.replace(/const VERSION = "([^"]+)"/,'const VERSION = "$1-qa-failure"').replace('const CORE = [','const CORE = ["/missing-update-qa",');
  await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration())!.update();});await expect(page.getByText('离线内容未准备完整，请联网重开后重试。')).toBeVisible({timeout:30000});expect(await page.evaluate(()=>caches.keys())).toEqual(cachesBefore);
  await page.locator('.travel-options').getByRole('button',{name:/听雨客栈/}).click();await expect(page.locator('.place-heading h1')).toHaveText('听雨客栈');await page.getByRole('button',{name:/向店家领取/}).click();await page.getByRole('tab',{name:'修行',exact:true}).click();await page.getByRole('radio',{name:'30 日',exact:true}).check();await page.getByRole('button',{name:/开始闭关/}).click();await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();await page.getByRole('button',{name:'暂停',exact:true}).click();
  script=original.replace(/const VERSION = "([^"]+)"/,'const VERSION = "$1-qa-safe"');await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration())!.update();});await expect(page.getByRole('button',{name:'请先结束当前行动'})).toBeDisabled({timeout:30000});await page.getByRole('button',{name:'结束修行',exact:true}).click();await expect(page.getByRole('button',{name:'应用更新并重开'})).toBeEnabled();await page.getByRole('button',{name:'应用更新并重开'}).click();await expect(page.getByRole('heading',{name:'安全更新',exact:true})).toBeVisible();
 }finally{script=original;}
});
