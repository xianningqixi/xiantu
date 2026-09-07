import { REALMS } from "./content/official";
import type { Actor, World } from "./types";
import { threshold, stats, requireRule } from "./rules";
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
    (a.realm === 0 ? 4 : 10) +
    Math.floor(a.aptitude / 25) +
    (a.id === "PLAYER" && w.profile.artifact === "focus" ? 2 : 0) +
    (stoneMethod ? 4 : 0)
  );
}

export function cultivate(w: World, a: Actor, stoneMethod = false) {
  requireRule(a.alive && a.manual, "修炼需要先习得功法。");
  if (stoneMethod) {
    requireRule(a.stones >= 1, "灵石不足。");
    a.stones--;
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
  return a.realm === 0
    ? 9500
    : Math.min(9500, 6500 + a.aptitude * 10 + (pill ? 1500 : 0) + (guardian ? 1000 : 0));
}

export function breakthroughResult(w: World, a: Actor, chance: number) {
  const passed = random(w, "simulation", 10000) < chance;
  if (passed) {
    a.realm = a.realm === 0 ? 1 : 4;
    a.xp = 0;
    a.hp = stats(a).maxHp;
    a.goal = "稳固境界，继续修行";
    record(w, "breakthrough", `${a.name}突破成功，踏入${REALMS[a.realm]}。`, [a.id]);
  } else {
    const severe = a.realm > 1 && random(w, "simulation", 10000) < 1000;
    if (severe) {
      a.realm--;
      a.xp = 0;
      a.hp = Math.min(a.hp, stats(a).maxHp);
    } else a.xp -= Math.ceil(a.xp * 0.2);
    record(
      w,
      "breakthrough-failed",
      `${a.name}突破未成，${severe ? "境界跌落一层" : "损失了部分修为"}，性命无碍。`,
      [a.id],
    );
  }
  a.readyDay = w.day + 7;
  return passed;
}
