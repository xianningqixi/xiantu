import balance from "./content/balance.json";
import type { Actor, LocationId, World } from "./types";

export const B = balance;

export const REALM_KEYS = [
  "MORTAL",
  "QI_1",
  "QI_2",
  "QI_3",
  "QI_4",
  "QI_5",
  "QI_6",
  "QI_7",
  "QI_8",
  "QI_9",
  "FOUNDATION_1",
  "FOUNDATION_2",
  "FOUNDATION_3",
] as const;

export const realmIndex = (key: string) => REALM_KEYS.indexOf(key as (typeof REALM_KEYS)[number]);
/** Authored API 1/2 character indices use the released five-realm scale. */
export const legacyRealmIndex = (realm: number) => [0, 1, 2, 3, 10][realm];

export const SAFE: LocationId[] = ["market", "inn", "gate"];

export const advanceRule = (a: Actor) => B.cultivation.advanceRules[REALM_KEYS[a.realm]];
export const threshold = (a: Actor) => advanceRule(a).requiredExperience;

export const stats = (a: Actor) => B.combat.realmStats[REALM_KEYS[a.realm]];

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export { requireRule } from "./errors";

export const actorById = (w: World, id: string) =>
  id === "PLAYER" ? w.player : w.npcs.find((a) => a.id === id);

export function combatDamage(attack: number, defense: number, skill = false, guarding = false) {
  const power = skill
    ? Math.floor(
        (attack * B.combat.prototypeStrikeMultiplierNumerator) /
          B.combat.prototypeStrikeMultiplierDenominator,
      )
    : attack;
  return Math.max(
    B.combat.basicAttackMinDamage,
    Math.floor(
      Math.max(B.combat.basicAttackMinDamage, power - defense) *
        (guarding ? B.combat.guardIncomingDamageBp / B.probabilityScaleBp : 1),
    ),
  );
}
