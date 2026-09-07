import { applyCommand, createWorld, scene, validateWorld } from "../../lib/game/engine";
import type { Command, Profile } from "../../lib/game/types";

// Purely generated at test runtime. No browser export, fixture JSON or personal data is read.
export function syntheticFixture(stage: "early" | "evolved") {
  if (stage !== "early" && stage !== "evolved") throw new Error("Unknown synthetic fixture stage");
  const profile: Profile = {
    name: "自动测试角色",
    sex: "female",
    aptitude: 75,
    artifact: "ward",
    mode: "simple",
    appearance: { face: 0, hair: 2, color: 1 },
  };
  let world = createWorld(20260907, profile, `generated-fixture:${stage}`, 40);
  let serial = 0;
  const act = (command: Command) => {
    world = applyCommand(world, command, `generated:${++serial}`, world.revision);
  };
  // Exercise structured promises and memories as well as NPC daily evolution.
  for (let i = 0; i < 4; i++) {
    const node = scene(world);
    if (!node?.choices[0]) throw new Error("Synthetic story setup is unavailable");
    act({ type: "choose", nodeId: node.id, choiceId: node.choices[0].id });
  }
  const targetDay = stage === "early" ? 8 : 39;
  while (world.day < targetDay) act({ type: "work" });
  validateWorld(world);
  return world;
}
