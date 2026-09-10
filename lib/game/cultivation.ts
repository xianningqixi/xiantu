import { STONE_METHOD } from "./economy";
import { REALMS } from "./content/official";
import { localSite } from "./world-map";
import type { Actor, AttemptRule, World } from "./types";
import { B, advanceRule, threshold, stats, requireRule, realmIndex } from "./rules";
import { random } from "./rng";
import { recordFact as record } from "./knowledge";

export function learn(w: World, a: Actor) {
  requireRule(!a.manual, "已经学会这册功法，无需重复领取。");
  a.manual = true;
  if (a.id === "PLAYER") {
    w.notice = "你学会了《基础吐纳诀》，现在可以开始修炼。";
    record(w, "manual", "你读过入门经书，将吐纳法门记在心中。");
  }
}
export function inCave(a: Actor) {
  return !!a.cave && localSite(a.location, "market") === a.cave;
}
export function gainPerDay(w: World, a: Actor, stoneMethod = false, dualPractice = false) {
  const tier = advanceRule(a).tier;
  const base = {
    mortal: B.cultivation.mortalDailyBaseGain,
    qi: B.cultivation.qiDailyBaseGain,
    foundation: B.cultivation.foundationDailyBaseGain,
  };
  const gain =
    base[tier as keyof typeof base] +
    Math.floor(a.aptitude / B.cultivation.aptitudeGainDivisor) +
    B.cultivation.manualRanks[a.manualRank].gain +
    (a.id === "PLAYER" && w.profile.artifact === "focus"
      ? B.artifacts.ARTIFACT_FOCUS.cultivationFlatGainPerDay
      : 0) +
    (stoneMethod ? STONE_METHOD.additionalExperiencePerDay : 0) +
    (a.sectMembership?.artLearned
      ? B.sects.growth[a.sectMembership.id].dailyGain +
        (dualPractice ? B.sects.growth[a.sectMembership.id].dualGain : 0)
      : 0) +
    (inCave(a) ? B.cultivation.cave.dailyGain : 0);
  return Math.max(
    1,
    Math.floor(
      gain *
        (a.hp * B.probabilityScaleBp < stats(a).maxHp * B.cultivation.injuredHpThresholdBp
          ? (B.probabilityScaleBp - B.cultivation.injuredGainPenaltyBp) / B.probabilityScaleBp
          : 1),
    ),
  );
}
function advance(w: World, a: Actor, rule: AttemptRule) {
  const target = realmIndex(rule.targetRealm!);
  requireRule(target >= 0, "此境界尚未开放晋升。");
  a.xp = B.cultivation.excessExperienceCarryForward
    ? Math.max(0, a.xp - rule.requiredExperience)
    : 0;
  a.realm = target;
  a.hp = stats(a).maxHp;
}
export function advanceMinor(w: World, a: Actor) {
  requireRule(
    a.alive && a.manual && advanceRule(a).kind === "minor" && a.xp >= threshold(a),
    "修为圆满后方可冲关。",
  );
  advance(w, a, advanceRule(a));
  const text = `${a.name}冲关成功，修为提升至${REALMS[a.realm]}。`;
  record(w, "advance", text, [a.id]);
  if (a.id === "PLAYER") w.notice = text;
}
export function cultivate(w: World, a: Actor, stoneMethod = false, dualPractice = false) {
  requireRule(a.alive && a.manual, "修炼需要先习得功法。");
  if (stoneMethod) {
    requireRule(
      a.stones >= STONE_METHOD.costSpiritStonesPerDay,
      "灵石不足。",
      "INSUFFICIENT_RESOURCES",
    );
    a.stones -= STONE_METHOD.costSpiritStonesPerDay;
  }
  a.xp += gainPerDay(w, a, stoneMethod, dualPractice);
  a.activity = "静心修炼";
  if (B.cultivation.minorAdvanceAutoForPlayerAndNpc[a.id === "PLAYER" ? "player" : "npc"])
    while (advanceRule(a).kind === "minor" && a.xp >= threshold(a)) advanceMinor(w, a);
}
export function breakthroughChance(w: World, a: Actor, pill: boolean, guardian: boolean) {
  const rule = advanceRule(a),
    config = B.cultivation.breakthrough;
  if (rule.kind === "minor") return B.probabilityScaleBp;
  if (rule.kind === "cap") return 0;
  return Math.max(
    config.successFloorBp,
    Math.min(
      config.successCeilingBp,
      rule.baseSuccessBp +
        a.aptitude * config.aptitudeBonusBpPerPoint +
        (rule.kind === "major" && pill ? config.pillBonusBp : 0) +
        (rule.kind === "major" && guardian ? config.guardianBonusBp : 0) +
        Math.min(a.insight * B.cultivation.insight.perPointBp, B.cultivation.insight.maxBonusBp),
    ),
  );
}
export function breakthroughResult(
  w: World,
  a: Actor,
  chance: number,
  rule: AttemptRule = advanceRule(a),
) {
  const passed = random(w, "simulation", B.probabilityScaleBp) < chance;
  if (passed) {
    advance(w, a, rule);
    a.goal = "稳固境界，继续修行";
    record(w, "breakthrough", `${a.name}突破成功，踏入${REALMS[a.realm]}。`, [a.id]);
  } else {
    const severe =
      rule.severeFailureConditionalBp > 0 &&
      random(w, "simulation", B.probabilityScaleBp) < rule.severeFailureConditionalBp;
    if (severe) {
      a.realm -= B.cultivation.breakthrough.severeLossQiLayers;
      a.xp = B.cultivation.breakthrough.experienceAfterSevereLayerLoss;
      a.hp = Math.min(a.hp, stats(a).maxHp);
    } else a.xp -= Math.ceil((a.xp * rule.failureExperienceLossBp) / B.probabilityScaleBp);
    record(
      w,
      "breakthrough-failed",
      `${a.name}突破未成，${severe ? "境界跌落一层" : "损失了部分修为"}，性命无碍。`,
      [a.id],
    );
  }
  a.readyDay = w.day + B.world.npcMajorAttemptPreparationDays;
  return passed;
}
