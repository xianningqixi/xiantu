import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCommand, createWorld, relation, scene, stats, validateWorld, canInvite, partyReadiness, departureStatus } from '../../lib/game/engine';
import { assertSaveExpectation } from '../../lib/game/save-guard';
import { npcPortrait, npcProfile } from '../../lib/game/npc-profile';
import { PACK } from '../../lib/game/content/official';
import type { Command, Profile, World } from '../../lib/game/types';

const profile:Profile={name:'沈知微',sex:'female',aptitude:75,artifact:'focus',mode:'simple',appearance:{face:0,hair:1,color:0}};
class Run{
  state:World; serial=0;
  constructor(seed=12345,count=40){this.state=createWorld(seed,profile,'test-save',count);}
  do(c:Command){this.state=applyCommand(this.state,c,`command:${++this.serial}`,this.state.revision);return this.state;}
  finish(){let steps=0;while(this.state.longAction){assert.ok(steps++<35);this.do({type:'step'});}}
  wait(days=1){this.do({type:'wait',days});this.finish();}
  choose(){const n=scene(this.state);assert.ok(n?.choices.length,`No choice at ${n?.id}`);this.do({type:'choose',nodeId:n.id,choiceId:n.choices[0].id});}
}
function prepare(){
  const r=new Run();for(let i=0;i<4;i++)r.choose();assert.equal(r.state.agreement?.status,'accepted');
  while(r.state.player.realm===0){r.do({type:'train',days:3,stoneMethod:false});r.finish();r.do({type:'breakthrough',usePill:false,guardian:false});r.finish();}
  for(let i=0;i<15&&r.state.npcs.filter(n=>[PACK.roles.primary,PACK.roles.companion].includes(n.id as typeof PACK.roles.primary)).some(n=>n.location!=='market');i++)r.wait();
  r.do({type:'formParty'});r.do({type:'travel',to:'gate'});r.do({type:'expedition'});
  while(r.state.battle)r.do({type:'battle',action:'attack'});
  assert.ok(r.state.loot);r.do({type:'return'});return r;
}
test('same seed reproduces 40 NPCs; player sex/appearance do not replace the NPC protagonist',()=>{
  const a=createWorld(12345,profile,'a');const b=createWorld(12345,{...profile,sex:'male',name:'顾长宁'},'b');
  assert.deepEqual(a.npcs,b.npcs);assert.equal(a.npcs.length,40);assert.notDeepEqual(a.npcs,createWorld(42,profile,'c').npcs);
  assert.equal(b.player.name,'顾长宁');assert.equal(b.player.sex,'male');assert.notEqual(b.player.id,PACK.roles.primary);
});
test('rejected command preserves RNG, resources, revision and all source data',()=>{
  const r=new Run();const before=JSON.stringify(r.state);assert.throws(()=>r.do({type:'travel',to:'ruins'}));assert.equal(JSON.stringify(r.state),before);
});
test('duplicate command does not repeat time or rewards',()=>{
  const r=new Run();const first=applyCommand(r.state,{type:'work'},'same',0);const again=applyCommand(first,{type:'work'},'same',0);
  assert.equal(first,again);assert.equal(again.day,1);assert.equal(again.player.stones,12);
  assert.throws(()=>applyCommand(first,{type:'work'},'new',0));
});
test('looking at a story is inert; learning has one shared acquisition rule',()=>{
  const r=new Run();const before=JSON.stringify(r.state);scene(r.state);scene(r.state);assert.equal(JSON.stringify(r.state),before);
  r.choose();r.choose();assert.ok(r.state.player.manual);r.do({type:'travel',to:'inn'});assert.throws(()=>r.do({type:'learn'}));
});
test('manual fallback works even when the story NPC has died',()=>{
  const r=new Run();r.state.npcs[0].alive=false;r.state.npcs[0].hp=0;r.do({type:'travel',to:'inn'});r.do({type:'learn'});assert.ok(r.state.player.manual);
});
test('chunked and daily training yield the same actors, RNG and relationship state',()=>{
  const a=new Run(),b=new Run();for(const r of [a,b]){r.do({type:'travel',to:'inn'});r.do({type:'learn'});}
  a.do({type:'train',days:30,stoneMethod:false});a.finish();for(let i=0;i<30;i++){b.do({type:'train',days:1,stoneMethod:false});b.finish();}
  assert.deepEqual(a.state.player,b.state.player);assert.deepEqual(a.state.npcs,b.state.npcs);assert.deepEqual(a.state.rng,b.state.rng);assert.deepEqual(a.state.relations,b.state.relations);
});
test('breakthrough can fail and never kills the player',()=>{
  let failures=0;
  for(let seed=1;seed<=40;seed++){const r=new Run(seed);Object.assign(r.state.player,{realm:3,xp:100,hp:90,manual:true});r.do({type:'breakthrough',usePill:false,guardian:false});r.finish();if(r.state.player.realm<4){failures++;assert.ok(r.state.player.alive);assert.ok(r.state.player.hp>0);assert.ok(r.state.player.xp<100);}}
  assert.ok(failures>0);
});
test('ordinary player minor realms progress automatically',()=>{
  const r=new Run();Object.assign(r.state.player,{realm:1,xp:39,hp:50,manual:true});r.do({type:'train',days:1,stoneMethod:false});r.finish();assert.equal(r.state.player.realm,2);assert.equal(r.state.player.xp,0);assert.equal(r.state.player.hp,70);
});
test('full story: agreement, 3-person combat, honor, memory and reunion',()=>{
  const r=prepare();const before=r.state.player.stones;r.do({type:'settle',honor:true,confirm:true});assert.equal(r.state.player.stones,before+12);assert.equal(r.state.story.outcome,'fulfilled');assert.equal(r.state.player.grass,0);
  const rel=relation(r.state,PACK.roles.primary)!;assert.ok(rel.trust>=15);assert.ok(rel.memories.some(id=>r.state.events.find(e=>e.id===id)?.kind==='promiseFulfilled'));
  const saved=JSON.stringify(r.state);const loaded=JSON.parse(saved);validateWorld(loaded);assert.deepEqual(loaded,r.state);assert.throws(()=>r.do({type:'settle',honor:true,confirm:true}));
  r.wait(3);for(let i=0;i<6&&r.state.npcs[0].location!=='market';i++)r.wait();assert.equal(scene(r.state)?.id,'reunion-honor');r.choose();assert.ok(r.state.story.flags.reunion);
});
test('breach requires explicit confirmation; compensation retains the original memory',()=>{
  const r=prepare();const saved=JSON.stringify(r.state);assert.throws(()=>r.do({type:'settle',honor:false,confirm:false}));assert.equal(JSON.stringify(r.state),saved);
  r.do({type:'settle',honor:false,confirm:true});assert.equal(r.state.story.outcome,'breached');assert.equal(canInvite(r.state),false);
  r.do({type:'compensate'});assert.ok(canInvite(r.state));assert.equal(r.state.story.outcome,'breached');assert.ok(r.state.events.some(e=>e.kind==='promiseBreached'));assert.throws(()=>r.do({type:'compensate'}));
});
test('dead NPC cannot move, cultivate, or participate on subsequent days',()=>{
  const r=new Run();const npc=r.state.npcs[5];npc.alive=false;npc.hp=0;const previous=structuredClone(npc);r.wait(7);assert.deepEqual(r.state.npcs[5],previous);
});
test('day-15 missing companions can reliably gather without interrupting a breakthrough',()=>{
  const r=new Run(4);for(let i=0;i<4;i++)r.choose();r.do({type:'train',days:7,stoneMethod:false});r.finish();r.do({type:'breakthrough',usePill:false,guardian:false});r.finish();r.wait(3);r.wait(3);
  assert.equal(r.state.day,14);assert.equal(partyReadiness(r.state).ready,false);
  const originalDay=r.state.day;
  for(let i=0;i<4&&!partyReadiness(r.state).ready;i++)r.do({type:'rally'});
  assert.equal(partyReadiness(r.state).ready,true);assert.ok(r.state.day-originalDay<=3);
  r.do({type:'formParty'});assert.equal(r.state.party.length,3);
});
test('rendezvous waits for an ongoing attempt and keeps the arrived companion available',()=>{
  const r=new Run();for(let i=0;i<4;i++)r.choose();Object.assign(r.state.player,{realm:1,hp:50});
  r.state.npcs[0].location='inn';r.state.npcs[0].attempt={remaining:2,chance:9500};r.state.npcs[1].location='gate';
  r.do({type:'rally'});assert.equal(r.state.npcs[0].attempt?.remaining,1);assert.equal(r.state.npcs[0].location,'inn');assert.equal(r.state.npcs[1].location,'market');
  r.do({type:'rally'});assert.equal(r.state.npcs[0].attempt,null);assert.equal(r.state.npcs[1].location,'market');
  r.do({type:'rally'});assert.equal(partyReadiness(r.state).ready,true);
});
test('a later breach overrides the latest response while preserving earlier fulfilled memories',()=>{
  const r=prepare();r.do({type:'settle',honor:true,confirm:true});r.choose();
  while(!partyReadiness(r.state).ready)r.do({type:'rally'});
  r.do({type:'formParty'});r.do({type:'travel',to:'gate'});while(!departureStatus(r.state).ready)r.wait();
  r.do({type:'expedition'});while(r.state.battle)r.do({type:'battle',action:'attack'});r.do({type:'return'});r.do({type:'settle',honor:false,confirm:true});
  assert.equal(r.state.story.outcome,'breached');assert.equal(canInvite(r.state),false);assert.ok(r.state.events.some(e=>e.kind==='promiseFulfilled'));assert.ok(r.state.events.some(e=>e.kind==='promiseBreached'));
  r.wait(3);for(let i=0;i<10&&r.state.npcs[0].location!=='market';i++)r.wait();assert.equal(scene(r.state)?.id,'reunion-breach');
});
test('departure availability exposes the same cooldown and attempt restrictions as the command',()=>{
  const r=prepare();r.do({type:'settle',honor:true,confirm:true});r.choose();r.do({type:'formParty'});r.do({type:'travel',to:'gate'});r.state.lastExpeditionDay=r.state.day-2;
  assert.equal(departureStatus(r.state).remaining,1);assert.equal(departureStatus(r.state).ready,false);assert.throws(()=>r.do({type:'expedition'}),/等候 1 日/);
  r.wait();assert.equal(departureStatus(r.state).ready,true);
});
test('player and NPC skills both skip exactly two own turns before becoming available',()=>{
  const r=prepare();r.do({type:'settle',honor:true,confirm:true});r.choose();r.do({type:'formParty'});r.do({type:'travel',to:'gate'});r.do({type:'expedition'});
  for(const e of r.state.battle!.enemies){e.hp=1000;e.maxHp=1000;e.attack=1;}
  r.do({type:'battle',action:'skill'});assert.ok(r.state.battle!.allies.every(a=>a.cooldown===2));
  r.do({type:'battle',action:'attack'});assert.ok(r.state.battle!.allies.every(a=>a.cooldown===1));
  r.do({type:'battle',action:'attack'});assert.ok(r.state.battle!.allies.every(a=>a.cooldown===0));
  r.do({type:'battle',action:'skill'});assert.ok(r.state.battle!.allies.every(a=>a.cooldown===2));
});
test('malformed saves are rejected while the existing released profile shape remains valid',()=>{
  const r=new Run();assert.doesNotThrow(()=>validateWorld(r.state));
  for(const mutate of [(w:any)=>w.profile=null,(w:any)=>w.profile.artifact='invalid',(w:any)=>w.story.flags=null,(w:any)=>w.profile.appearance.face=99,(w:any)=>w.agreement={status:'accepted'}]){const bad=structuredClone(r.state);mutate(bad);assert.throws(()=>validateWorld(bad));}
  assert.doesNotThrow(()=>validateWorld(r.state));
});
test('same revision on a different character cannot authorize a stale action, replacement or export',()=>{
  const a=createWorld(12345,profile,'first');const b=createWorld(12345,profile,'second');
  assert.throws(()=>assertSaveExpectation(b,{saveId:a.saveId,revision:a.revision}),/切换角色/);
  assert.doesNotThrow(()=>assertSaveExpectation(a,{saveId:a.saveId,revision:a.revision}));
  assert.throws(()=>assertSaveExpectation(applyCommand(a,{type:'work'},'changed',0),{saveId:a.saveId,revision:0}));
  assert.doesNotThrow(()=>assertSaveExpectation(null,{saveId:null,revision:null}));
});
test('default-world NPC portraits are distinct, deterministic, and do not consume world RNG',()=>{
  const w=createWorld(12345,profile,'portraits');const before=structuredClone(w);const portraits=w.npcs.map(a=>JSON.stringify(npcPortrait(w,a)));
  assert.equal(new Set(portraits).size,40);assert.deepEqual(w,before);for(const a of w.npcs){assert.ok(npcProfile(a).background);assert.deepEqual(npcPortrait(w,a),npcPortrait(structuredClone(w),a));}
});
test('portrait identity survives elapsed time and an NPC death; rendezvous can be cancelled',()=>{
  const r=new Run();const before=r.state.npcs.map(a=>npcPortrait(r.state,a));r.wait(7);
  assert.deepEqual(r.state.npcs.map(a=>npcPortrait(r.state,a)),before);
  const dead=r.state.npcs[5];dead.alive=false;dead.hp=0;r.state.events.push({id:'death-portrait-test',day:r.state.day,kind:'death',actors:[dead.id],text:'寿元已尽。',public:false});
  r.wait(7);assert.deepEqual(r.state.npcs.map(a=>npcPortrait(r.state,a)),before);
  const gathering=new Run();for(let i=0;i<4;i++)gathering.choose();Object.assign(gathering.state.player,{realm:1,hp:50});gathering.do({type:'rally'});gathering.do({type:'disband'});assert.equal(gathering.state.agreement?.status,'cancelled');assert.deepEqual(gathering.state.party,['PLAYER']);
});
test('100 NPCs over 3650 days retain valid identities, locations and life rules',()=>{
  const r=new Run(12345,100);for(let i=0;i<521;i++)r.wait(7);r.wait(3);assert.equal(r.state.day,3650);assert.equal(r.state.npcs.length,100);validateWorld(r.state);
  assert.ok(r.state.npcs.every(n=>n.hp>=0&&n.hp<=stats(n).maxHp));
});
