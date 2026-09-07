"use client";
import { useState } from 'react';
import { Dices, ArrowRight, Sparkles, Leaf } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ARTIFACTS, COLORS, FACES, HAIRS } from '@/lib/game/content/official';
import { rollAptitude } from '@/lib/game/engine';
import type { Profile } from '@/lib/game/types';

export function Creation({onCreate,busy,onCancel}:{onCreate:(profile:Profile,seed:number)=>void;busy:boolean;onCancel?:()=>void}){
  const [seed,setSeed]=useState('12345');const [roll,setRoll]=useState(0);
  const [profile,setProfile]=useState<Profile>({name:'',sex:'female',aptitude:rollAptitude(12345,0),artifact:'focus',mode:'simple',appearance:{face:0,hair:0,color:0}});
  const update=<K extends keyof Profile>(key:K,value:Profile[K])=>setProfile(p=>({...p,[key]:value}));
  const reroll=()=>{const n=roll+1;setRoll(n);update('aptitude',rollAptitude(Number(seed)||0,n));};
  return <form className="creation-form" onSubmit={e=>{e.preventDefault();onCreate(profile,Number(seed));}}>
    <div className="form-heading"><span className="eyebrow"><Leaf size={14}/> 你的角色</span><h2 className="serif">为这一世，落笔。</h2><p>凡人之身，亦可踏上仙途。</p></div>
    <div className="identity-row"><label className="form-field"><span>姓名</span><input autoComplete="off" maxLength={16} placeholder="留一个名字在人间" value={profile.name} onChange={e=>update('name',e.target.value)}/></label>
      <fieldset><legend>性别</legend><RadioGroup className="inline-radio" value={profile.sex} onValueChange={v=>update('sex',v as Profile['sex'])}><label><RadioGroupItem value="female"/>女</label><label><RadioGroupItem value="male"/>男</label></RadioGroup></fieldset></div>
    <div className="appearance-row">{([{key:'face',label:'容貌',options:FACES},{key:'hair',label:'发式',options:HAIRS},{key:'color',label:'衣着',options:COLORS}] as const).map(f=><label className="form-field" key={f.key}><span>{f.label}</span><Select value={String(profile.appearance[f.key])} onValueChange={v=>update('appearance',{...profile.appearance,[f.key]:Number(v)})}><SelectTrigger aria-label={f.label}><SelectValue/></SelectTrigger><SelectContent>{f.options.map((o,i)=><SelectItem key={o} value={String(i)}>{o}</SelectItem>)}</SelectContent></Select></label>)}</div>
    <div className="aptitude-box"><div className="spread"><span><Sparkles size={15}/> 灵根资质</span><strong>{profile.aptitude}<small> / 100</small></strong><Button type="button" size="sm" variant="ghost" onClick={reroll}><Dices size={16}/> 重掷</Button></div><Progress aria-label="灵根资质" value={profile.aptitude}/><p>{profile.aptitude>=80?'灵台澄明，天资出众。':profile.aptitude>=50?'灵根通达，勤修可期。':'天资虽朴，向道之心不改。'} 可以不限次数重掷。</p></div>
    <fieldset className="artifact-field"><legend>伴生法宝 <span>三选其一</span></legend><RadioGroup value={profile.artifact} onValueChange={v=>update('artifact',v as Profile['artifact'])} className="artifact-choices">{ARTIFACTS.map(a=><label key={a.id} className={`artifact-option ${profile.artifact===a.id?'selected':''}`}><RadioGroupItem value={a.id} className="artifact-radio"/><span className="artifact-seal serif">{a.glyph}</span><span><strong>{a.name}</strong><small>{a.description}</small></span></label>)}</RadioGroup></fieldset>
    <details className="creation-options"><summary>游玩模式与机缘设置</summary><RadioGroup value={profile.mode} onValueChange={v=>update('mode',v as Profile['mode'])} className="mode-choices"><label><RadioGroupItem value="simple"/><span>简单 <small>适合初游，失败后可以继续。</small></span></label><label><RadioGroupItem value="complex"/><span>复杂 <small>真正死亡会结束本局；突破失败不致死。</small></span></label></RadioGroup><label className="form-field seed-field"><span>机缘种子</span><input type="number" min="0" max="4294967295" value={seed} onChange={e=>{setSeed(e.target.value);setRoll(0);update('aptitude',rollAptitude(Number(e.target.value)||0,0));}}/><small>相同种子重现相同的初始世界。</small></label></details>
    <div className="creation-bottom">{onCancel&&<Button variant="ghost" type="button" onClick={onCancel}>回到此世</Button>}<Button className="begin-button" type="submit" disabled={busy||!profile.name.trim()}>{busy?'正在展开这一世…':'踏入仙途'}<ArrowRight size={18}/></Button></div>
    <p className="save-footnote">进度保存在当前浏览器，可在游戏中导出备份。</p>
  </form>;
}
