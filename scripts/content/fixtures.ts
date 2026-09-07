import { mkdirSync, writeFileSync } from "node:fs";
import { createWorld, validateWorld, applyCommand, scene } from "../../lib/game/engine";
import { EXTENSIONS } from "../../lib/game/content/extensions";
import { recordFact } from "../../lib/game/knowledge";
const output = "/tmp/xiantu-author-fixtures";
mkdirSync(output, { recursive: true });
for (const extension of EXTENSIONS)
  for (const stage of ["arrival", "absent", "dead", "poor", "funded"]) {
    const world = createWorld(
      12345,
      {
        name: "作者预览",
        sex: "female",
        aptitude: 75,
        artifact: "focus",
        mode: "simple",
        appearance: { face: 0, hair: 0, color: 0 },
      },
      `preview:fixture:${extension.data.manifest.packId}:${stage}`,
      40,
      { contentLocks: [extension.lock] },
    );
    const participant =
      extension.data.manifest.references[0] ?? extension.data.definitions.characters[0]?.id;
    const actor = world.npcs.find((a) => a.id === participant)!;
    world.player.location = "gate";
    actor.location = stage === "absent" ? "inn" : "gate";
    if (stage === "dead") {
      actor.alive = false;
      actor.hp = 0;
      recordFact(world, "death", `${actor.name}在预览夹具中已经离世。`, [actor.id], true);
    }
    world.player.stones = stage === "poor" ? 0 : 50;
    validateWorld(world);
    writeFileSync(
      `${output}/${extension.data.manifest.packId}-${stage}.json`,
      JSON.stringify(world, null, 2),
    );
  }
console.log(`作者夹具已生成：${output}。仅供 /author 导入，未经正常游玩不能作为验收证据。`);

// Fixed demonstration outcomes for layout/author checks, explicitly in preview.
// Normal-play honor/breach evidence is generated separately by story.spec.ts.
for (const outcome of ["fulfilled", "breached"] as const) {
  let world = createWorld(
    12345,
    {
      name: "演示数据",
      sex: "female",
      aptitude: 75,
      artifact: "focus",
      mode: "simple",
      appearance: { face: 0, hair: 0, color: 0 },
    },
    `preview:official:${outcome}`,
  );
  for (let step = 0; step < 4; step++) {
    const node = scene(world)!;
    world = applyCommand(
      world,
      { type: "choose", nodeId: node.id, choiceId: node.choices[0].id },
      `demo:${step}`,
      world.revision,
    );
  }
  world.day = 3;
  world.story.outcome = outcome;
  world.story.settledDay = 0;
  world.agreement!.status = outcome;
  recordFact(
    world,
    outcome === "fulfilled" ? "promiseFulfilled" : "promiseBreached",
    `演示数据：此前约定${outcome === "fulfilled" ? "已经履行" : "已经违背"}。`,
    ["PLAYER", world.npcs[0].id],
  );
  validateWorld(world);
  writeFileSync(`${output}/official-${outcome}.json`, JSON.stringify(world, null, 2));
}
