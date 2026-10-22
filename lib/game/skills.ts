import { B, requireRule } from "./rules";
import { LOCATIONS, locationKind } from "./world-map";
import { recordFact as record } from "./knowledge";
import type { Actor, SkillId, World } from "./types";

export interface SkillConfig {
  name: string;
  source: "initial" | "inn" | "yunv" | "hehuan" | "quanzhen";
  cooldown?: number | null;
  minRealm?: number;
  cost?: number;
  damageMultiplierBp?: number;
  healMaxHpBp?: number;
  skipTargetTurns?: number;
  guard?: boolean;
  reflectDamageBp?: number;
  effect?: string;
}

export const SKILL_IDS: SkillId[] = ["qingmang", "yufeng", "bingxin", "shexin", "taiji"];

export const skillConfig = (id: SkillId): SkillConfig =>
  (B.combat.skills as Record<SkillId, SkillConfig>)[id];

export const skillName = (id: SkillId) => skillConfig(id).name;

/** Slot count unlocks with the realm ladder; usable skills are the first N learned. */
export function unlockedSkillSlots(actor: Actor): number {
  const table = B.combat.skillSlotsByRealm as Record<string, number>;
  let slots = B.combat.initialUnlockedSkillSlotCount;
  for (const [realm, count] of Object.entries(table))
    if (actor.realm >= Number(realm)) slots = Math.max(slots, count);
  return slots;
}

export function usableSkills(actor: Actor): SkillId[] {
  return actor.skills.slice(0, unlockedSkillSlots(actor)) as SkillId[];
}

export function learnedSkill(actor: Actor, id: SkillId) {
  return actor.skills.includes(id);
}

export function skillCooldown(id: SkillId): number {
  return skillConfig(id).cooldown ?? 0;
}

/** Null when the actor may learn this skill now; otherwise the player-facing reason. */
export function learnSkillReason(w: World, skill: SkillId): string | null {
  const p = w.player,
    config = skillConfig(skill);
  if (config.source === "initial") return "入门剑诀无需再学。";
  if (learnedSkill(p, skill)) return `${config.name}已经学过。`;
  if (config.source === "inn") {
    if (locationKind(p.location) !== "inn") return `请到${LOCATIONS.inn.name}请教功法。`;
    if (p.realm < (config.minRealm ?? 0)) return "境界不足，客栈师傅不肯传授。";
    if (p.stones < (config.cost ?? 0)) return `需要 ${config.cost} 枚灵石。`;
    return null;
  }
  if (p.sectMembership?.id !== config.source) return "需要先入相应宗门。";
  if (p.sectMembership.contribution < B.sects.skillContributionCost)
    return `需要 ${B.sects.skillContributionCost} 点宗门贡献。`;
  return null;
}

export function learnSkill(w: World, skill: SkillId) {
  const p = w.player,
    config = skillConfig(skill),
    reason = learnSkillReason(w, skill);
  if (reason) requireRule(false, reason, "ACTION_UNAVAILABLE");
  if (config.source === "inn") p.stones -= config.cost ?? 0;
  else if (config.source !== "initial") {
    const membership = p.sectMembership;
    requireRule(membership, "需要先入相应宗门。");
    membership!.contribution -= B.sects.skillContributionCost;
  }
  p.skills.push(skill);
  w.notice =
    config.source === "inn"
      ? `你向客栈师傅请教，学会了${config.name}。`
      : `你以宗门贡献换得${config.name}心法口诀。`;
  record(w, "skill", w.notice, [p.id]);
}
