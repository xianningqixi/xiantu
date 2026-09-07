/// <reference lib="webworker" />
import { uniqueId } from './ids';
import { assertSaveExpectation } from './save-guard';
import { applyCommand, createWorld, validateWorld } from './engine';
import type { WorkerRequest, WorkerResponse, World } from './types';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const openDb = () => new Promise<IDBDatabase>((resolve,reject)=>{
  const request=indexedDB.open('xiantu-qingshi',1);
  request.onupgradeneeded=()=>{ const db=request.result; db.createObjectStore('saves'); db.createObjectStore('backups'); };
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('无法打开本机存档，请检查浏览器是否允许网站存储。'));
});
const read = (db:IDBDatabase) => new Promise<World|null>((resolve,reject)=>{
  const tx=db.transaction('saves','readonly');const q=tx.objectStore('saves').get('current');
  q.onsuccess=()=>resolve(q.result??null);q.onerror=()=>reject(q.error);
});
const commit=(db:IDBDatabase,next:World,expected:World|null,backup=false)=>new Promise<void>((resolve,reject)=>{
  const tx=db.transaction(['saves','backups'],'readwrite');const saves=tx.objectStore('saves');const q=saves.get('current');let problem='';
  q.onsuccess=()=>{
    const current:World|undefined=q.result;
    if((current?.saveId??null)!==(expected?.saveId??null)||(current?.revision??null)!==(expected?.revision??null)){problem='另一页面已更新存档，已保留最新进度。请重新载入。';tx.abort();return;}
    if(backup&&current)tx.objectStore('backups').put(current,`${current.saveId}:${current.revision}`);
    saves.put(next,'current');
  };
  tx.oncomplete=()=>resolve();tx.onabort=()=>reject(new Error(problem||'保存未完成。本次行动没有写入，请保留页面并重试。'));tx.onerror=()=>{};
});
async function process(request:WorkerRequest):Promise<WorkerResponse>{
  const db=await openDb();
  try{
    const state=await read(db);
    if(request.kind==='load') {if(state)validateWorld(state);return {id:request.id,ok:true,state};}
    assertSaveExpectation(state,request.expected);
    if(request.kind==='export'){if(!state)throw new Error('尚无可导出的存档。');return{id:request.id,ok:true,text:JSON.stringify(state,null,2)};}
    let next:World;
    if(request.kind==='create'){
      if(state&&!request.replace)throw new Error('已有一段人生，请先确认开始新局。');
      if(!request.profile||request.seed===undefined)throw new Error('请完整填写角色。');
      next=createWorld(request.seed,request.profile,uniqueId());
    }else if(request.kind==='import'){
      if(!request.text||new TextEncoder().encode(request.text).length>5*1024*1024)throw new Error('存档为空或超过 5 MB。');
      if(state&&!request.replace)throw new Error('导入会替换当前进度，请先确认。');
      try{next=JSON.parse(request.text);validateWorld(next);}catch{throw new Error('存档格式、人物状态或内容版本不匹配。原进度未改变。');}
      next.saveId=uniqueId();next.revision++;
    }else{
      if(!state||!request.command||request.revision===undefined)throw new Error('请先创建或读取角色。');
      validateWorld(state);
      if(JSON.stringify(request.command).length>16384)throw new Error('行动数据过长。');
      next=applyCommand(state,request.command,request.id,request.revision);
      if(next===state)return{id:request.id,ok:true,state};
    }
    await commit(db,next,state,request.kind==='create'||request.kind==='import');
    return{id:request.id,ok:true,state:next};
  }finally{db.close();}
}
let queue=Promise.resolve();
scope.onmessage=(event:MessageEvent<WorkerRequest>)=>{
  const req=event.data;
  queue=queue.then(async()=>{
    try{scope.postMessage(await process(req));}
    catch(error){scope.postMessage({id:req.id,ok:false,error:error instanceof Error?error.message:'操作未完成，请重试。'} satisfies WorkerResponse);}
  });
};
