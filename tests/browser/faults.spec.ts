import {test,expect,type Page} from '@playwright/test';
test.use({serviceWorkers:'block'});
const injection=`
let __xiantuFault='';
self.addEventListener('message',e=>{if(e.data?.__xiantuTestFault){__xiantuFault=e.data.__xiantuTestFault;e.stopImmediatePropagation();}});
const __post=self.postMessage.bind(self);self.postMessage=(data,...args)=>{if(__xiantuFault==='lostAck'&&data.ok&&data.state){__xiantuFault='';return;}return __post(data,...args);};
const __open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{const req=__open(...args);req.addEventListener('success',()=>{const db=req.result,transaction=db.transaction.bind(db);db.transaction=(...args)=>{const tx=transaction(...args),objectStore=tx.objectStore.bind(tx);tx.objectStore=name=>{const store=objectStore(name);if(name==='saves'&&tx.mode==='readwrite'){const put=store.put.bind(store);store.put=(...args)=>{const fault=__xiantuFault.startsWith('checkpoint:')?(args[0]?.longAction?.checkpoint===4?__xiantuFault.slice(11):''):__xiantuFault;if(fault==='lostAck')__xiantuFault='lostAck';if(['abort','quota','beforePut'].includes(fault)){__xiantuFault='';if(fault==='quota')throw new DOMException('test quota','QuotaExceededError');if(fault==='beforePut'){__post({__xiantuFaultHit:true});self.close();throw new DOMException('test termination','AbortError');}const q=put(...args);q.addEventListener('success',()=>tx.abort());return q;}return put(...args);};}return store;};return tx;};});return req;};
`;
async function setup(page:Page){
 await page.addInitScript(()=>{const NativeWorker=window.Worker;window.Worker=class extends NativeWorker{constructor(url:URL|string,options?:WorkerOptions){super(url,options);(window as any).__xiantuWorker=this;this.addEventListener('message',event=>{if(event.data?.__xiantuFaultHit)(window as any).__xiantuFaultHit=true;});}};});
 await page.route(url=>/simulation\.worker.*\.(?:js|ts)$/.test(url.pathname),async route=>{const response=await route.fetch();await route.fulfill({response,body:injection+await response.text(),headers:{...response.headers(),'content-type':'application/javascript'}});});
 await page.goto('/');await page.getByRole('textbox',{name:'姓名',exact:true}).fill('故障回归');await page.getByRole('button',{name:'踏入仙途',exact:true}).click();await expect(page.getByRole('heading',{name:'故障回归',exact:true})).toBeVisible();
}
async function saved(page:Page){return page.evaluate(async()=>{const db=await new Promise<IDBDatabase>(resolve=>{const q=indexedDB.open('xiantu-qingshi');q.onsuccess=()=>resolve(q.result)});try{return await new Promise<any>(resolve=>{const tx=db.transaction('saves');const q=tx.objectStore('saves').get('current');tx.oncomplete=()=>resolve(q.result);});}finally{db.close();}});}
async function fault(page:Page,type:string){await page.evaluate(type=>(window as any).__xiantuWorker.postMessage({__xiantuTestFault:type}),type);}
for(const type of ['abort','quota'])test(`real IndexedDB ${type} keeps the old save and retry commits once`,async({page})=>{
 await setup(page);const before=await saved(page);await fault(page,type);await page.getByRole('button',{name:'接些坊市杂务 1 日 · 获得 6 灵石',exact:true}).click();await expect(page.getByRole('alert')).toContainText(type==='quota'?'存储空间不足':'保存未完成');expect(await saved(page)).toEqual(before);
 await page.getByRole('button',{name:'接些坊市杂务 1 日 · 获得 6 灵石',exact:true}).click();await expect(page.locator('header').getByText('第 2 日',{exact:true})).toBeVisible();const after=await saved(page);expect(after.player.stones).toBe(before.player.stones+6);expect(after.revision).toBe(before.revision+1);
});
for(const type of ['beforePut','lostAck'])test(`worker ${type} recovers the last complete checkpoint after reopening`,async({page})=>{
 await setup(page);const before=await saved(page);await fault(page,type);await page.getByRole('button',{name:'接些坊市杂务 1 日 · 获得 6 灵石',exact:true}).click();
 if(type==='beforePut')await expect.poll(()=>page.evaluate(()=>(window as any).__xiantuFaultHit)).toBe(true);else await expect.poll(async()=>(await saved(page)).day).toBe(1);
 await page.reload();await expect(page.getByRole('heading',{name:'故障回归',exact:true})).toBeVisible();const after=await saved(page);expect(after.day).toBe(type==='lostAck'?1:0);expect(after.player.stones).toBe(before.player.stones+(type==='lostAck'?6:0));
});
test('another IndexedDB schema upgrade closes the worker connection and permits a reload',async({page})=>{
 await setup(page);const before=await saved(page);
 await page.evaluate(()=>new Promise<void>((resolve,reject)=>{const q=indexedDB.open('xiantu-qingshi',3);q.onsuccess=()=>{q.result.close();resolve()};q.onerror=()=>reject(q.error);q.onblocked=()=>reject(new Error('Worker failed to close its old connection'));}));
 // A future physical database version is intentionally not downgraded by the old runtime.
 await page.reload();await expect(page.getByRole('alert')).toContainText('本机存档');expect(await saved(page)).toEqual(before);
});

for(const type of ['beforePut','lostAck'])test(`paid long action ${type} at checkpoint four resumes without duplicate days or cost`,async({page})=>{
 await setup(page);await page.getByRole('button',{name:'接些坊市杂务 1 日 · 获得 6 灵石',exact:true}).click();await expect(page.locator('header').getByText('第 2 日',{exact:true})).toBeVisible();await page.locator('.travel-options').getByRole('button',{name:/听雨客栈/}).click();await expect(page.locator('.place-heading h1')).toHaveText('听雨客栈');await page.getByRole('button',{name:/向店家领取/}).click();await page.getByRole('tab',{name:'修行',exact:true}).click();await page.getByRole('switch').check();await page.getByRole('radio',{name:'7 日',exact:true}).check();const before=await saved(page);
 await fault(page,`checkpoint:${type}`);await page.getByRole('button',{name:/开始闭关/}).click();
 if(type==='beforePut')await expect.poll(()=>page.evaluate(()=>(window as any).__xiantuFaultHit)).toBe(true);else await expect.poll(async()=>(await saved(page)).longAction?.checkpoint).toBe(4);
 await page.reload();await expect(page.getByText('计算已暂停，已完成的日数和进度均已保存。')).toBeVisible();const recovered=await saved(page),completed=type==='beforePut'?3:4;expect(recovered.longAction.checkpoint).toBe(completed);expect(recovered.longAction.paidStones).toBe(completed);expect(recovered.player.stones).toBe(before.player.stones-completed);expect(recovered.day).toBe(before.day+completed);
 await page.getByRole('button',{name:'继续',exact:true}).click();await expect.poll(async()=>!!(await saved(page)).longAction).toBe(false);const final=await saved(page);expect(final.day).toBe(before.day+7);expect(final.player.stones).toBe(before.player.stones-7);for(let checkpoint=1;checkpoint<=7;checkpoint++)expect(final.appliedCommands).toContain(`${recovered.saveId}:${recovered.longAction.id}:step:${checkpoint}`);
});
