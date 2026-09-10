import { mkdirSync, writeFileSync } from "node:fs";
import { fixtureFor } from "../tests/game/redesign-ab-fixtures";
import { REALM_KEYS, realmIndex } from "../lib/game/rules";
const output = process.env.XIANTU_AB_FIXTURES ?? "/tmp/xiantu-ab-fixtures";
mkdirSync(output, { recursive: true });
for (const realm of REALM_KEYS.keys())
  writeFileSync(`${output}/realm-${realm}.json`, JSON.stringify(fixtureFor(realm)));
for (const kind of ["ordinary", "setback"] as const)
  writeFileSync(`${output}/${kind}.json`, JSON.stringify(fixtureFor(realmIndex("QI_9"), kind)));
console.log(
  `13 realm and 2 failure fixtures created at ${output}. Controlled scenario setup; subsequent actions use real rules.`,
);

import { realmFixture } from "../tests/game/redesign-ab-fixtures";
import {
  applyCommand,
  knownNpcUpdates,
  validateWorld,
  createWorld,
  scene,
  stats,
} from "../lib/game/engine";
import type { Command } from "../lib/game/types";
let economy = realmFixture(realmIndex("QI_7"));
economy.player.location = "market";
economy.player.xp = 0;
economy.player.hp -= 10;
const run = (command: Command) => {
  economy = applyCommand(economy, command, `economy:${economy.revision}`, economy.revision);
};
for (const npc of economy.npcs.filter((a) => a.location === "market"))
  run({ type: "meet", target: npc.id });
validateWorld(economy);
writeFileSync(`${output}/economy.json`, JSON.stringify(economy));
for (const item of ["healing", "pills", "grass", "qi"] as const) run({ type: "buy", item });
for (const item of ["healing", "pills", "grass"] as const) run({ type: "sell", item, quantity: 1 });
run({ type: "use", item: "qi" });
run({ type: "train", days: 7, stoneMethod: false });
run({ type: "step" });
writeFileSync(
  `${output}/economy-news.json`,
  JSON.stringify(knownNpcUpdates(economy).filter((e) => e.day === economy.day)),
);

// Controlled battle/settlement layouts; all transitions use the production rules.
let w = createWorld(
  12345,
  {
    name: "战斗布局验收",
    sex: "female",
    aptitude: 75,
    artifact: "focus",
    mode: "simple",
    appearance: { face: 0, hair: 1, color: 0 },
  },
  "layout-battle",
  40,
);
const runBattle = (c: any) => {
  w = applyCommand(w, c, `layout:${w.revision}`, w.revision);
};
for (let i = 0; i < 4; i++) {
  const n = scene(w)!;
  runBattle({ type: "choose", nodeId: n.id, choiceId: n.choices[0].id });
}
w.player.realm = 3;
w.player.xp = 0;
w.player.hp = stats(w.player).maxHp;
w.player.stones = 100;
for (const a of w.npcs.filter((a) => ["NPC_LIN_WAN", "NPC_ZHOU_AN"].includes(a.id))) {
  a.location = "market";
  a.hp = stats(a).maxHp;
}
validateWorld(w);
runBattle({ type: "formParty" });
runBattle({ type: "travel", to: "gate" });
runBattle({ type: "expedition" });
writeFileSync(`${output}/layout-battle.json`, JSON.stringify(w));
while (w.battle) runBattle({ type: "battle", action: "attack" });
runBattle({ type: "return" });
writeFileSync(`${output}/layout-loot.json`, JSON.stringify(w));
