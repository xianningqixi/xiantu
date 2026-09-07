import balance from "./content/balance.json";
import type { Actor, LocationId, World } from "./types";

export const B = balance;

export const REALM_KEYS = ["MORTAL", "QI_1", "QI_2", "QI_3", "FOUNDATION_1"] as const;

export const SAFE: LocationId[] = ["market", "inn", "gate"];

export const threshold = (a: Actor) => [20, 40, 60, 100, 100][a.realm];

export const stats = (a: Actor) => B.combat.realmStats[REALM_KEYS[a.realm]];

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const requireRule = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};

export const actorById = (w: World, id: string) =>
  id === "PLAYER" ? w.player : w.npcs.find((a) => a.id === id);

export function combatDamage(attack: number, defense: number, skill = false, guarding = false) {
  const power = skill
    ? Math.floor(
        (attack * B.combat.prototypeStrikeMultiplierNumerator) /
          B.combat.prototypeStrikeMultiplierDenominator,
      )
    : attack;
  return Math.max(1, Math.floor(Math.max(1, power - defense) * (guarding ? 0.5 : 1)));
}
