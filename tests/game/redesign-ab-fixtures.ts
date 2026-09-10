import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";
import { createWorld, applyCommand, validateWorld } from "../../lib/game/engine";
import { advanceRule, threshold, stats, REALM_KEYS } from "../../lib/game/rules";
import type { World, Command } from "../../lib/game/types";
export function realmFixture(realm: number, seed = 42): World {
  const w = createWorld(
    seed,
    {
      name: `境界验收${realm}`,
      sex: "female",
      aptitude: 50,
      artifact: "ward",
      mode: "simple",
      appearance: { face: 0, hair: 0, color: 0 },
    },
    `ab-realm-${realm}-${seed}`,
    100,
    { contentLocks: CAMPAIGN_LOCKS },
  );
  Object.assign(w.player, {
    realm,
    manual: true,
    location: "atlas.luoxia",
    stones: 500,
    pills: 3,
    insight: 3,
    qi: 2,
    manualRank: 1,
  });
  w.player.xp = threshold(w.player) + 5;
  w.player.hp = stats(w.player).maxHp;
  validateWorld(w);
  return w;
}
export function advanceFixture(w: World): World {
  const c: Command =
    advanceRule(w.player).kind === "minor"
      ? { type: "advanceMinor" }
      : { type: "breakthrough", usePill: false, guardian: false };
  let next = applyCommand(w, c, `probe:${w.revision}`, w.revision);
  while (next.longAction)
    next = applyCommand(next, { type: "step" }, `probe:${next.revision}`, next.revision);
  return next;
}
export function fixtureFor(realm: number, result: "success" | "ordinary" | "setback" = "success") {
  for (let seed = 1; seed <= 1000; seed++) {
    const w = realmFixture(realm, seed),
      rule = advanceRule(w.player);
    if (rule.kind === "cap") return w;
    const next = advanceFixture(w);
    if (
      result === "success"
        ? next.player.realm > realm
        : result === "setback"
          ? next.player.realm < realm
          : next.player.realm === realm
    )
      return w;
  }
  throw new Error(`No ${result} fixture for ${REALM_KEYS[realm]}`);
}
