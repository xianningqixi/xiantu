"use client";
import { uniqueId } from './ids';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Command, Profile, SaveExpectation, WorkerRequest, WorkerResponse, World } from './types';

export function useGame(){
  const worker=useRef<Worker|null>(null);
  const pending=useRef(new Map<string,{resolve:(r:WorkerResponse)=>void;reject:(e:Error)=>void}>());
  const [world,setWorld]=useState<World|null>(null);const [ready,setReady]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const locked=useRef(false);const lastCommand=useRef({key:"",at:0});
  const ask=useCallback((input:Omit<WorkerRequest,'id'>)=>new Promise<WorkerResponse>((resolve,reject)=>{
    if(!worker.current){reject(new Error('世界尚未准备好，请稍候。'));return;}
    const id=uniqueId();pending.current.set(id,{resolve,reject});worker.current.postMessage({...input,id});
  }),[]);
  useEffect(()=>{
    const instance=new Worker(new URL('./simulation.worker.ts',import.meta.url),{type:'module'});worker.current=instance;
    instance.onmessage=(e:MessageEvent<WorkerResponse>)=>{
      const response=e.data;const waiter=pending.current.get(response.id);pending.current.delete(response.id);
      if(!waiter)return;if(response.ok)waiter.resolve(response);else waiter.reject(new Error(response.error||'操作失败。'));
    };
    instance.onerror=()=>{setError('世界加载遇到问题，请刷新页面重试；已保存的进度会保留。');setReady(true);locked.current=false;setBusy(false);for(const waiter of pending.current.values())waiter.reject(new Error('世界进程暂不可用。'));pending.current.clear();};
    ask({kind:'load'}).then(r=>setWorld(r.state??null)).catch(e=>setError(e.message)).finally(()=>setReady(true));
    return()=>{instance.terminate();worker.current=null;for(const waiter of pending.current.values())waiter.reject(new Error('页面已关闭。'));pending.current.clear();};
  },[ask]);
  const mutate=useCallback(async(input:Omit<WorkerRequest,'id'>)=>{
    if(locked.current)return false;locked.current=true;setBusy(true);setError('');
    try{const result=await ask(input);if('state'in result)setWorld(result.state??null);return true;}
    catch(e){setError(e instanceof Error?e.message:'操作没有完成。');return false;}
    finally{locked.current=false;setBusy(false);}
  },[ask]);
  const expected:SaveExpectation={saveId:world?.saveId??null,revision:world?.revision??null};
  const command=useCallback((command:Command)=>{const key=JSON.stringify(command);const now=Date.now();if(command.type!=='step'&&lastCommand.current.key===key&&now-lastCommand.current.at<400)return Promise.resolve(false);lastCommand.current={key,at:now};return mutate({kind:'command',command,revision:world?.revision,expected:{saveId:world?.saveId??null,revision:world?.revision??null}});},[mutate,world?.saveId,world?.revision]);
  return {world,ready,busy,error,setError,command,
    expected,
    create:(profile:Profile,seed:number,replace=false,snapshot=expected)=>mutate({kind:'create',profile,seed,replace,expected:snapshot}),
    importSave:(text:string,replace=false,snapshot=expected)=>mutate({kind:'import',text,replace,expected:snapshot}),
    reload:()=>mutate({kind:'load'}),
    exportSave:async()=>{try{const result=await ask({kind:'export',expected});return result.text;}catch(e){setError(e instanceof Error?e.message:'导出未完成。');return undefined;}}
  };
}
