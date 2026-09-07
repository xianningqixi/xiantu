import { STONE_METHOD } from "./economy";
import { REALMS } from "./content/official";
import type { Actor, World } from "./types";
import { B, advanceRule, threshold, stats, requireRule } from "./rules";
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

export function gainPerDay(w: World, a: Actor, stoneMethod = false) {
  return (
    (a.realm === 0
      ? B.cultivation.mortalDailyBaseGain
      : a.realm === 4
        ? B.cultivation.foundationDailyBaseGain
        : B.cultivation.qiDailyBaseGain) +
    Math.floor(a.aptitude / B.cultivation.aptitudeGainDivisor) +
    (a.id === "PLAYER" && w.profile.artifact === "focus"
      ? B.artifacts.ARTIFACT_FOCUS.cultivationFlatGainPerDay
      : 0) +
    (stoneMethod ? STONE_METHOD.additionalExperiencePerDay : 0)
  );
}

export function cultivate(w: World, a: Actor, stoneMethod = false) {
  requireRule(a.alive && a.manual, "修炼需要先习得功法。");
  if (stoneMethod) {
    requireRule(
      a.stones >= STONE_METHOD.costSpiritStonesPerDay,
      "灵石不足。",
      "INSUFFICIENT_RESOURCES",
    );
    a.stones -= STONE_METHOD.costSpiritStonesPerDay;
  }
  a.xp = Math.min(threshold(a), a.xp + gainPerDay(w, a, stoneMethod));
  a.activity = "静心修炼";
  if ((a.realm === 1 || a.realm === 2) && a.xp >= threshold(a)) {
    a.realm++;
    a.xp = 0;
    a.hp = stats(a).maxHp;
    record(w, "advance", `${a.name}日积月累，修为提升至${REALMS[a.realm]}。`, [a.id]);
  }
}

export function breakthroughChance(w: World, a: Actor, pill: boolean, guardian: boolean) {
  const rule = advanceRule(a);
  const config = B.cultivation.breakthrough;
  return a.realm === 0
    ? rule.baseSuccessBp
    : Math.max(
        config.successFloorBp,
        Math.min(
          config.successCeilingBp,
          rule.baseSuccessBp +
            a.aptitude * config.aptitudeBonusBpPerPoint +
            (pill ? config.pillBonusBp : 0) +
            (guardian ? config.guardianBonusBp : 0),
        ),
      );
}

export function breakthroughResult(w: World, a: Actor, chance: number) {
  const passed = random(w, "simulation", B.probabilityScaleBp) < chance;
  if (passed) {
    a.realm = a.realm === 0 ? 1 : 4;
    a.xp = 0;
    a.hp = stats(a).maxHp;
    a.goal = "稳固境界，继续修行";
    record(w, "breakthrough", `${a.name}突破成功，踏入${REALMS[a.realm]}。`, [a.id]);
  } else {
    const severe =
      a.realm > 1 &&
      random(w, "simulation", B.probabilityScaleBp) < advanceRule(a).severeFailureConditionalBp;
    if (severe) {
      a.realm--;
      a.xp = 0;
      a.hp = Math.min(a.hp, stats(a).maxHp);
    } else
      a.xp -= Math.ceil((a.xp * advanceRule(a).failureExperienceLossBp) / B.probabilityScaleBp);
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
