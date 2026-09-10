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
import { applyCommand, knownNpcUpdates, validateWorld } from "../lib/game/engine";
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
