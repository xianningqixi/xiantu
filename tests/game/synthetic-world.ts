import { answerDaily } from "./daily-test-helpers";
import { applyCommand, createWorld, scene, validateWorld } from "../../lib/game/engine";
import type { Command, Profile } from "../../lib/game/types";

// Purely generated at test runtime. No browser export, fixture JSON or personal data is read.
export function syntheticFixture(stage: "early" | "evolved", legacy = false) {
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
  // Released-schema fixtures use already affiliated NPCs so modern autonomous
  // enrolment/journey fields cannot masquerade as historical version-one data.
  if (legacy) for (const a of world.npcs.slice(2)) a.sect = "青岚宗";
  let serial = 0;
  const act = (command: Command) => {
    world = answerDaily(applyCommand(world, command, `generated:${++serial}`, world.revision));
  };
  // Exercise structured promises and memories as well as NPC daily evolution.
  for (let i = 0; i < 4; i++) {
    const node = scene(world);
    if (!node?.choices[0]) throw new Error("Synthetic story setup is unavailable");
    act({ type: "choose", nodeId: node.id, choiceId: node.choices[0].id });
  }
  const targetDay = stage === "early" ? 8 : 39;
  while (world.day < targetDay) act({ type: legacy ? "rest" : "work" });
  validateWorld(world);
  return world;
}
