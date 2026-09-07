import {selectedExtensions} from './content/extensions';
import type {World} from './types';
const person=(w:World,id:string)=>id==='PLAYER'?w.player:w.npcs.find(a=>a.id===id);
export function extensionScenes(w:World){
 if(w.ended||w.battle||w.loot||w.longAction)return [];
 return selectedExtensions(w.contentLocks).flatMap(({data,lock})=>{
   const f:Record<string,string|number|boolean>={location:w.player.location,'player.stones':w.player.stones,'player.manual':w.player.manual,'official.outcome':w.story.outcome};
   for(const key of data.manifest.flags)f[`flag.${key}`]=!!w.contentState[key];
   for(const id of [...data.manifest.references,...data.definitions.characters.map(a=>a.id)]){const a=person(w,id);const r=w.relations.find(r=>r.from===id&&r.to==='PLAYER');
     Object.assign(f,{[`actor.${id}.present`]:!!a?.alive&&a.location===w.player.location,[`actor.${id}.alive`]:!!a?.alive,[`actor.${id}.known`]:!!r?.known,[`actor.${id}.trust`]:r?.trust??0});
   }
   const node=[...data.storylets].sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)).find(n=>!w.contentState[n.id]&&n.participants.every(id=>f[`actor.${id}.present`])&&n.conditions.every(c=>c.op==='eq'?f[c.fact]===c.value:typeof f[c.fact]==='number'&&Number(f[c.fact])>=Number(c.value)));
   if(!node)return [];
   const fill=(text:string)=>text.replace(/\{\{([^{}]+)\.name\}\}/g,(_,id:string)=>person(w,id==='player'?'PLAYER':id)?.name??'故人');
   return [{...node,packId:data.manifest.packId,lock,body:fill(node.body),quote:node.quote?fill(node.quote):undefined,choices:node.choices.map(c=>({...c,label:fill(c.label),reply:fill(c.reply),effects:c.effects.map(e=>e.kind==='experience'?{...e,text:fill(e.text)}:e)}))}];
 });
}
