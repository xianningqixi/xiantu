import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {applyCommand,createWorld,validateWorld} from '../../lib/game/engine';
import type {Command,Profile,World} from '../../lib/game/types';
import B from '../../lib/game/content/balance.json';
const profile:Profile={name:'十年回归',sex:'female',aptitude:75,artifact:'focus',mode:'simple',appearance:{face:0,hair:0,color:0}};
const digest=(w:World)=>createHash('sha256').update(JSON.stringify(w)).digest('hex');
const directory=process.env.XIANTU_STRESS_OUTPUT??'/tmp/xiantu-stress';
const bundleSHA256=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');mkdirSync(directory,{recursive:true});
for(const seed of B.world.stressTestSeeds)test(`seed ${seed}: 100 NPC / 3650 days with checkpoint recovery`,()=>{
  let w=createWorld(seed,profile,`stress:${seed}`,100),serial=0;const began=performance.now();let maxMs=0;
  const command=(c:Command)=>{const started=performance.now();try{w=applyCommand(w,c,`stress:${++serial}`,w.revision);}catch(error){writeFileSync(`${directory}/failure-${seed}.json`,JSON.stringify({seed,day:w.day,revision:w.revision,command:c,recent:w.events.slice(-10),error:String(error)}));throw error;}maxMs=Math.max(maxMs,performance.now()-started);};
  let checkpoint:World|undefined;
  while(w.day<3650){
    if(!w.longAction)command({type:'wait',days:w.day<3647?7:3});
    command({type:'step'});
    if(w.day===40)checkpoint=JSON.parse(JSON.stringify(w));
    if(w.day===100){
      let recovered=checkpoint!;let replaySerial=recovered.revision;
      while(recovered.day<100){const c:Command=recovered.longAction?{type:'step'}:{type:'wait',days:7};recovered=applyCommand(recovered,c,`stress:${++replaySerial}`,recovered.revision);}
      assert.equal(digest(recovered),digest(w));
    }
    if(w.day%365===0)console.log(JSON.stringify({seed,day:w.day,seconds:+((performance.now()-began)/1000).toFixed(2)}));
  }
  validateWorld(w);assert.equal(w.npcs.length,100);
  const json=JSON.stringify(w);const report={seed,bundleSHA256,platform:process.platform,node:process.version,prettyExportBytes:Buffer.byteLength(JSON.stringify(w,null,2)),rules:w.rulesVersion,schema:w.schemaVersion,packLock:w.packLock,days:w.day,commands:serial,alive:w.npcs.filter(n=>n.alive).length,dead:w.npcs.filter(n=>!n.alive).length,bytes:Buffer.byteLength(json),seconds:+((performance.now()-began)/1000).toFixed(2),maxCommandMs:+maxMs.toFixed(2),fingerprint:digest(w),checkpointRecovery:'passed'};
  writeFileSync(`${directory}/${seed}.json`,JSON.stringify(report,null,2));writeFileSync(`${directory}/save-${seed}.json`,json);console.log(JSON.stringify(report));
});
