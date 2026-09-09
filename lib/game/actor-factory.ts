import type { Actor } from "./types";
import { B, REALM_KEYS } from "./rules";
import { defaultPhysique } from "./physique";

export function createActor(
  id: string,
  name: string,
  realm: number,
  age: number,
  aptitude: number,
  seed: number,
): Actor {
  return {
    id,
    name,
    sex: seed % 2 ? "female" : "male",
    ageDays: age * B.world.daysPerYear,
    appearanceSeed: seed,
    physique: defaultPhysique(seed % 2 ? "female" : "male", seed),
    aptitude,
    personality: ["谨慎", "爽直", "重情", "寡言", "豁达"][seed % 5],
    sect: ["散修", "青岚宗", "归云门"][seed % 3],
    goal: realm === 0 ? "寻得功法，踏入仙途" : "积蓄修为，筹备下一次突破",
    realm,
    xp: 0,
    hp: B.combat.realmStats[REALM_KEYS[realm]].maxHp,
    stones: B.creation.startingSpiritStones,
    healing: B.creation.startingHealingPills,
    pills: 0,
    grass: 0,
    manual: realm > 0,
    alive: true,
    location: "market",
    activity: "在坊市停留",
    readyDay: B.world.npcMajorAttemptPreparationDays,
    lastActionDay: -1,
    attempt: null,
  };
}
