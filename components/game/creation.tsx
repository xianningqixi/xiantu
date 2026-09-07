"use client";
import { useEffect, useRef, useState } from 'react';
import { Dices, ArrowRight, Sparkles, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ARTIFACTS, COLORS, FACES, HAIRS } from '@/lib/game/content/official';
import {draftSchema} from '@/lib/game/protocol';
import {selectedExtensions} from '@/lib/game/content/extensions';
import {EXTENSIONS} from '@/lib/game/content/extensions';
import { rollAptitude } from '@/lib/game/engine';
import type { CreationDraft, Profile } from '@/lib/game/types';

export function Creation({onCreate,busy,onCancel,initialDraft,onSaveDraft}:{onCreate:(profile:Profile,seed:number,contentLocks:string[])=>void|Promise<void>;busy:boolean;onCancel?:()=>void;initialDraft?:CreationDraft|null;onSaveDraft?:(draft:Omit<CreationDraft,'revision'|'version'>)=>Promise<CreationDraft>}){
  const [seed,setSeed]=useState(String(initialDraft?.seed??12345));const [roll,setRoll]=useState(initialDraft?.roll??0);
  const [profile,setProfile]=useState<Profile>(()=>initialDraft?.profile??{name:'',sex:'female',aptitude:rollAptitude(12345,0),artifact:'focus',mode:'simple',appearance:{face:0,hair:0,color:0}});
  const [contentLocks,setContentLocks]=useState<string[]>(initialDraft?.contentLocks??[]);
  const [draftStatus,setDraftStatus]=useState(initialDraft?'创角草稿已恢复':'');
  const [submitting,setSubmitting]=useState(false);const submitLock=useRef(false);
  const draftFile=useRef<HTMLInputElement>(null);
  const exportDraft=()=>{const draft={version:1,revision:initialDraft?.revision??0,seed:Number(seed),roll,profile,contentLocks};const blob=new Blob([JSON.stringify({format:'xiantu-creation-draft-1',draft},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='仙途_创角草稿.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);};
  const importDraft=async(file:File)=>{try{if(file.size>65536)throw new Error('创角草稿超过 64 KiB。');const raw=JSON.parse(await file.text());if(raw.format!=='xiantu-creation-draft-1')throw new Error('请选择创角草稿文件；人生存档请使用页面上的导入存档入口。');const parsed=draftSchema.parse(raw.draft);selectedExtensions(parsed.contentLocks??[]);const value={seed:parsed.seed,roll:parsed.roll,profile:parsed.profile,contentLocks:parsed.contentLocks??[]};if(onSaveDraft)await onSaveDraft(value);saved.current=JSON.stringify(value);setSeed(String(value.seed));setRoll(value.roll);setProfile(value.profile);setContentLocks(value.contentLocks);setDraftStatus('创角草稿已导入并保存');}catch{setDraftStatus('创角草稿格式或内容版本不匹配，原草稿保留。');}};
  const saved=useRef(JSON.stringify({seed:Number(seed),roll,profile,contentLocks}));
  useEffect(()=>{
    const value={seed:Number(seed),roll,profile,contentLocks};const signature=JSON.stringify(value);
    if(!onSaveDraft||signature===saved.current)return;
    let active=true;setDraftStatus('正在保存创角草稿…');
    void onSaveDraft(value).then(()=>{saved.current=signature;if(active)setDraftStatus('创角草稿已保存');})
      .catch(e=>{if(active)setDraftStatus(e instanceof Error?e.message:'草稿尚未保存，请重试。');});
    return()=>{active=false;};
  },[seed,roll,profile,contentLocks,onSaveDraft]);
  const submit=async()=>{
    if(submitLock.current)return;submitLock.current=true;setSubmitting(true);
    try{if(onSaveDraft)await onSaveDraft({seed:Number(seed),roll,profile,contentLocks});await onCreate(profile,Number(seed),contentLocks);}
    catch(e){setDraftStatus(e instanceof Error?e.message:'创角尚未保存，请重试。');}
    finally{submitLock.current=false;setSubmitting(false);}
  };
  const update=<K extends keyof Profile>(key:K,value:Profile[K])=>setProfile(p=>({...p,[key]:value}));
  const reroll=()=>{const n=roll+1;setRoll(n);update('aptitude',rollAptitude(Number(seed)||0,n));};
  return <form className="creation-form" onSubmit={e=>{e.preventDefault();void submit();}}>
    <div className="form-heading"><span className="eyebrow"><Leaf size={14}/> 你的角色</span><h2 className="serif">为这一世，落笔。</h2><p>凡人之身，亦可踏上仙途。</p></div>
    <div className="identity-row"><label className="form-field"><span>姓名</span><input autoComplete="off" maxLength={16} placeholder="留一个名字在人间" value={profile.name} onChange={e=>update('name',e.target.value)}/></label>
      <fieldset><legend>性别</legend><RadioGroup className="inline-radio" value={profile.sex} onValueChange={v=>update('sex',v as Profile['sex'])}><label><RadioGroupItem value="female"/>女</label><label><RadioGroupItem value="male"/>男</label></RadioGroup></fieldset></div>
    <div className="appearance-row">{([{key:'face',label:'容貌',options:FACES},{key:'hair',label:'发式',options:HAIRS},{key:'color',label:'衣着',options:COLORS}] as const).map(f=><label className="form-field" key={f.key}><span>{f.label}</span><Select value={String(profile.appearance[f.key])} onValueChange={v=>update('appearance',{...profile.appearance,[f.key]:Number(v)})}><SelectTrigger aria-label={f.label}><SelectValue/></SelectTrigger><SelectContent>{f.options.map((o,i)=><SelectItem key={o} value={String(i)}>{o}</SelectItem>)}</SelectContent></Select></label>)}</div>
    <div className="aptitude-box"><div className="spread"><span><Sparkles size={15}/> 灵根资质</span><strong>{profile.aptitude}<small> / 100</small></strong><Button type="button" size="sm" variant="ghost" onClick={reroll}><Dices size={16}/> 重掷</Button></div><Progress aria-label="灵根资质" value={profile.aptitude}/><p>{profile.aptitude>=80?'灵台澄明，天资出众。':profile.aptitude>=50?'灵根通达，勤修可期。':'天资虽朴，向道之心不改。'} 可以不限次数重掷。</p></div>
    <fieldset className="artifact-field"><legend>伴生法宝 <span>三选其一</span></legend><RadioGroup value={profile.artifact} onValueChange={v=>update('artifact',v as Profile['artifact'])} className="artifact-choices">{ARTIFACTS.map(a=><label key={a.id} className={`artifact-option ${profile.artifact===a.id?'selected':''}`}><RadioGroupItem value={a.id} className="artifact-radio"/><span className="artifact-seal serif">{a.glyph}</span><span><strong>{a.name}</strong><small>{a.description}</small></span></label>)}</RadioGroup></fieldset>
    <details className="creation-options"><summary>游玩模式与机缘设置</summary><RadioGroup value={profile.mode} onValueChange={v=>update('mode',v as Profile['mode'])} className="mode-choices"><label><RadioGroupItem value="simple"/><span>简单 <small>适合初游，失败后可以继续。</small></span></label><label><RadioGroupItem value="complex"/><span>复杂 <small>真正死亡会结束本局；突破失败不致死。</small></span></label></RadioGroup><label className="form-field seed-field"><span>机缘种子</span><input type="number" min="0" max="4294967295" value={seed} onChange={e=>{setSeed(e.target.value);setRoll(0);update('aptitude',rollAptitude(Number(e.target.value)||0,0));}}/><small>相同种子重现相同的初始世界。</small></label></details>
    <fieldset className="content-choices"><legend>此世故事</legend>{EXTENSIONS.map(e=><label className="content-choice" key={e.lock}><input type="checkbox" checked={contentLocks.includes(e.lock)} onChange={event=>setContentLocks(locks=>event.target.checked?[...locks,e.lock]:locks.filter(lock=>lock!==e.lock))}/><span>{e.data.manifest.title}<small>可选支线 · 开局后保留本版故事</small></span></label>)}</fieldset><div className="creation-bottom">{onCancel&&<Button variant="ghost" type="button" onClick={onCancel}>回到此世</Button>}<Button className="begin-button" type="submit" disabled={busy||submitting||!profile.name.trim()}>{busy||submitting?'正在展开这一世…':'踏入仙途'}<ArrowRight size={18}/></Button></div>
    <div className="flex flex-wrap gap-2"><Button type="button" variant="ghost" size="sm" onClick={exportDraft}>导出创角草稿</Button><Button type="button" variant="ghost" size="sm" disabled={busy||submitting} onClick={()=>draftFile.current?.click()}>导入创角草稿</Button><input ref={draftFile} className="sr-only" type="file" accept=".json" aria-label="选择创角草稿" onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void importDraft(file);}}/></div><p className="save-footnote" role="status">{draftStatus||'进度保存在当前浏览器，可在游戏中导出备份。'}</p>
  </form>;
}
