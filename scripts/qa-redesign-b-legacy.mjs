import { build } from "esbuild";
import { resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
// Run against a checkout of d8ac3e4 (or released 0.1.6), never the current 0.2.0 engine.
const baseline = resolve(process.argv[2] ?? "../xiantu");
const output = resolve(process.argv[3] ?? "tests/game/fixtures/redesign-b");
const result = await build({
  stdin: {
    contents: `
import {createWorld,applyCommand,scene,threshold,validateWorld} from ${JSON.stringify(baseline + "/lib/game/engine.ts")};
import {CAMPAIGN_LOCKS} from ${JSON.stringify(baseline + "/lib/game/campaign-content.ts")};
export function generate(){
let w=createWorld(12345,{name:"旧档筑基行者",sex:"female",aptitude:90,artifact:"focus",mode:"simple",appearance:{face:0,hair:0,color:0}},"legacy-0.1.6-b",100,{contentLocks:CAMPAIGN_LOCKS});
let inflight;
const act=c=>{w=applyCommand(w,c,"legacy:"+w.revision,w.revision)};
for(let i=0;i<4;i++){const n=scene(w);act({type:"choose",nodeId:n.id,choiceId:n.choices[0].id});}
while(w.player.realm<4 && w.day<100){
act({type:"train",days:7,stoneMethod:false});while(w.longAction)act({type:"step"});
if((w.player.realm===0||w.player.realm===3)&&w.player.xp>=threshold(w.player)){
act({type:"breakthrough",usePill:false,guardian:false});inflight=structuredClone(w);while(w.longAction)act({type:"step"});}}
if(w.rulesVersion!=="0.1.6"||w.schemaVersion!==6||w.player.realm!==4)throw Error("Requires a released 0.1.6 baseline checkout");
validateWorld(w);return {foundation:w,inflight};}
`,
    resolveDir: baseline,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { generate } = await import(
  `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`
);
mkdirSync(output, { recursive: true });
for (const [name, world] of Object.entries(generate()))
  writeFileSync(resolve(output, `legacy-0.1.6-${name}.json`), JSON.stringify(world));
console.log(`Wrote genuine 0.1.6 snapshots to ${output}`);
