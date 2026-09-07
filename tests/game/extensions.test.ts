import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,applyCommand,validateWorld} from '../../lib/game/engine';
import {extensionScenes} from '../../lib/game/content-story';
import {EXTENSIONS,extensionVisual} from '../../lib/game/content/extensions';
import {PACK,VISUAL_IDS} from '../../lib/game/content/official';
import {validateExtension,validateRegistry} from '../../lib/game/content/extension-contract.mjs';
import {migrateSave} from '../../lib/game/migrations';
import type {Command,World} from '../../lib/game/types';
const entry=EXTENSIONS[0];const official={roles:PACK.roles,assets:VISUAL_IDS,version:PACK.version,hash:PACK.lock.split(':')[1]};
function run(funded=true){let w=createWorld(12345,{name:'支线测试',sex:'female',aptitude:75,artifact:'focus',mode:'simple',appearance:{face:0,hair:0,color:0}},'extension-test',40,{contentLocks:[entry.lock]});let serial=0;
 const act=(c:Command)=>w=applyCommand(w,c,`extension:${++serial}`,w.revision);
 const choose=()=>{const n=extensionScenes(w)[0];assert.ok(n);return act({type:'chooseExtension',nodeId:n.id,choiceId:n.choices[0].id});};
 const prepare=()=>{w.player.location='gate';w.npcs[1].location='gate';w.player.stones=funded?20:0;};
 return {get w(){return w},act,choose,prepare};}
test('independent content pack has exact dependencies and rejects invalid capabilities, namespaces and types',()=>{
 assert.ok(entry);validateExtension(entry.data,official);
 for(const mutate of [(p:any)=>p.manifest.requiresCapabilities.push('giveGold.v1'),(p:any)=>p.storylets[0].id='other.stolen',(p:any)=>p.storylets[0].conditions=[{fact:'player.secret',op:'eq',value:true}],(p:any)=>p.storylets[0].choices[0].effects=[{kind:'progress',key:'other.flag'}]]){const p=structuredClone(entry.data);mutate(p);assert.throws(()=>validateExtension(p,official));}
 assert.throws(()=>validateRegistry([entry,entry],official),/重复/);
 const bad=structuredClone(entry);bad.data.manifest.dependencies[0].hash='0'.repeat(64);assert.throws(()=>validateRegistry([bad],official),/依赖/);
});
test('funded and zero-resource side stories use real commands and have no duplicate reward',()=>{
 for(const funded of [true,false]){const r=run(funded);r.prepare();r.choose();r.act({type:'travel',to:'market'});const before=r.w.player.stones,healing=r.w.player.healing;
 const node=extensionScenes(r.w)[0];assert.ok(node);r.choose();assert.equal(r.w.player.stones,before-(funded?8:0));assert.equal(r.w.player.healing,healing+(funded?1:0));
 assert.throws(()=>r.act({type:'chooseExtension',nodeId:node.id,choiceId:node.choices[0].id}));
 r.act({type:'travel',to:'gate'});r.w.npcs[1].location='gate';const n=extensionScenes(r.w)[0];assert.ok(n);assert.equal(extensionVisual(n.visualId).url,'');r.choose();assert.equal(extensionScenes(r.w).length,0);
 const records=r.w.events.filter(e=>e.kind==='story-choice');assert.equal(records.length,3);assert.ok(records.every(e=>e.text.length>30));validateWorld(JSON.parse(JSON.stringify(r.w)));
 }
});
test('a disappeared participant invalidates a viewed choice without mutating source',()=>{
 const r=run();r.prepare();const n=extensionScenes(r.w)[0];r.w.npcs[1].location='inn';const before=JSON.stringify(r.w);
 assert.throws(()=>r.act({type:'chooseExtension',nodeId:n.id,choiceId:n.choices[0].id}));assert.equal(JSON.stringify(r.w),before);
});
test('death after acceptance reaches an explanatory close and never speaks for the dead',()=>{
 const r=run();r.prepare();r.choose();r.w.npcs[1].alive=false;r.w.npcs[1].hp=0;
 const n=extensionScenes(r.w)[0];assert.equal(n.id,'guest.roadside.unfinished-message');assert.ok(!n.participants.includes(PACK.roles.companion));r.choose();validateWorld(r.w);assert.equal(r.w.npcs[1].alive,false);
});
test('a failed purchase rolls back all story state; old official-only saves are not relocked',()=>{
 const r=run();r.prepare();r.choose();r.act({type:'travel',to:'market'});const n=extensionScenes(r.w)[0];r.w.player.stones=0;const before=JSON.stringify(r.w);
 assert.throws(()=>r.act({type:'chooseExtension',nodeId:n.id,choiceId:n.choices[0].id}));assert.equal(JSON.stringify(r.w),before);
 const legacy:any=structuredClone(r.w);legacy.schemaVersion=2;legacy.rulesVersion='0.1.1';legacy.contentLocks=[];legacy.contentState={};legacy.negotiations=[];
 const migrated=migrateSave(legacy).world;assert.deepEqual(migrated.contentLocks,[]);assert.equal(migrated.packLock,PACK.lock);
 const bad=structuredClone(r.w);bad.contentLocks=[entry.lock+'x'];assert.throws(()=>validateWorld(bad),/版本/);
});
