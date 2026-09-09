import { sectNpcAction } from "./sect-simulation";
import { continueNpcJourney, npcSeekSect, npcSocialize } from "./npc-life";
import { PACK } from "./content/official";
import { LOCATIONS, localSite, safeLocations, scheduledHome } from "./world-map";
import type { Actor, World } from "./types";
import { B, REALM_KEYS, SAFE, threshold, stats, combatDamage } from "./rules";
import { random } from "./rng";
import { updateAgreementAvailability } from "./agreement";
import { cultivate, breakthroughChance, breakthroughResult } from "./cultivation";
import { die } from "./lifecycle";
import { recordFact as record } from "./knowledge";

export function npcConflict(w: World, attacker: Actor, defender: Actor) {
  const order = [attacker, defender].sort(
    (a, b) => stats(b).speed - stats(a).speed || a.id.localeCompare(b.id),
  );
  for (const acting of order) {
    if (!acting.alive) continue;
    const target = acting.id === attacker.id ? defender : attacker;
    if (!target.alive) break;
    target.hp = Math.max(0, target.hp - combatDamage(stats(acting).attack, stats(target).defense));
    if (target.hp === 0) die(w, target, "在冲突中身亡");
  }
  for (const person of [attacker, defender]) {
    person.lastActionDay = w.day;
    if (person.alive) person.activity = "争执后休整";
  }
  const eventId = record(
    w,
    "conflict",
    `${attacker.name}与${defender.name}发生冲突，伤势与后果已经结算。`,
    [attacker.id, defender.id],
  );
  for (const [from, to] of [
    [attacker, defender],
    [defender, attacker],
  ]) {
    let r = w.relations.find((r) => r.from === from.id && r.to === to.id);
    if (!r) {
      r = {
        from: from.id,
        to: to.id,
        favor: 0,
        trust: 0,
        attraction: 0,
        known: true,
        memories: [],
      };
      w.relations.push(r);
    }
    r.grievance = true;
    r.memories.push(eventId);
  }
}

export function advanceDay(w: World, occupied: Set<string> = new Set(["PLAYER"])) {
  if (w.ended) return;
  w.rulesVersion = "0.1.6";
  w.day++;
  w.player.ageDays++;
  w.player.lastActionDay = w.day;
  if (
    w.profile.mode === "complex" &&
    w.player.ageDays >= B.world.npcLifespanDays[REALM_KEYS[w.player.realm]]
  ) {
    die(w, w.player, "寿元已尽");
  }
  const ordered = [...w.npcs].sort((x, y) => x.id.localeCompare(y.id));
  // Resolve aging/death for the whole day before any actor can claim an action.
  for (const a of ordered)
    if (a.alive) {
      a.ageDays++;
      if (a.ageDays >= B.world.npcLifespanDays[REALM_KEYS[a.realm]]) die(w, a, "寿元已尽");
    }
  for (const a of ordered) {
    if (!a.alive || a.lastActionDay === w.day) continue;
    a.lastActionDay = w.day;
    if (continueNpcJourney(w, a)) continue;
    if (a.attempt) {
      a.attempt.remaining--;
      a.activity = "凝神突破，暂不外出";
      if (a.attempt.remaining === 0) {
        breakthroughResult(w, a, a.attempt.chance);
        a.attempt = null;
      }
      continue;
    }
    if (occupied.has(a.id)) {
      a.activity = w.longAction?.guardian === a.id ? "为同伴护法" : "与同伴同行";
      continue;
    }
    if (
      w.agreement?.status === "accepted" &&
      w.agreement.meeting &&
      w.agreement.members.includes(a.id) &&
      !w.party.includes(a.id)
    ) {
      const target = w.agreement.meeting.location;
      a.activity = a.location === target ? "依约等候同伴" : `前往${LOCATIONS[target].name}会合`;
      a.location = target;
      continue;
    }
    if (w.simulationOptions.backgroundConflicts && !w.party.includes(a.id)) {
      const rival = w.npcs.find(
        (b) =>
          b.id !== a.id &&
          b.alive &&
          b.hp > 0 &&
          !b.attempt &&
          !b.npcJourney &&
          !occupied.has(b.id) &&
          !w.party.includes(b.id) &&
          b.lastActionDay < w.day &&
          b.location === a.location &&
          w.relations.some((r) => r.from === a.id && r.to === b.id && r.favor <= -30),
      );
      if (rival) {
        npcConflict(w, a, rival);
        continue;
      }
    }
    const home = scheduledHome(a, w.day);
    if (home && !w.party.includes(a.id)) {
      a.location = home;
      a.activity = `回${LOCATIONS[home].name}处理日常事务`;
      continue;
    }
    if (!a.manual) {
      if (a.location !== localSite(a.location, "inn")) {
        a.location = localSite(a.location, "inn");
        a.activity = "前往客栈寻书";
      } else {
        a.manual = true;
        a.activity = "研读吐纳法门";
      }
      continue;
    }
    if (a.hp < stats(a).maxHp / 2) {
      a.hp = Math.min(stats(a).maxHp, a.hp + Math.ceil(stats(a).maxHp / 2));
      a.activity = "休养";
      continue;
    }
    const isParty = w.party.includes(a.id);
    const primary = a.id === PACK.roles.primary;
    const fixed = primary || a.id === PACK.roles.companion;
    if (
      fixed &&
      !isParty &&
      w.day % B.story.fixedNpcHomeVisitIntervalDays === 0 &&
      a.location !== localSite(a.location, "market")
    ) {
      a.location = localSite(a.location, "market");
      a.activity = "回坊市访友";
      continue;
    }
    if (primary && a.grass >= 1 && a.stones >= B.economy.pillExchange.spiritStoneCost && !a.pills) {
      a.grass--;
      a.stones -= B.economy.pillExchange.spiritStoneCost;
      a.pills++;
      a.goal = "丹药齐备，等待合适的突破时机";
      a.activity = "兑换丹药";
      continue;
    }
    if ((a.realm === 0 || a.realm === 3) && a.xp >= threshold(a) && w.day >= a.readyDay) {
      if (a.realm === 3 && !a.pills) {
        if (a.stones >= B.economy.shopPrices.ITEM_BREAKTHROUGH_PILL) {
          a.stones -= B.economy.shopPrices.ITEM_BREAKTHROUGH_PILL;
          a.pills++;
          a.activity = "购置突破丹";
        } else {
          a.stones += B.actions.workSpiritStoneReward;
          a.activity = "赚取修炼资粮";
        }
        continue;
      }
      const hasPill = a.realm > 0 && a.pills > 0;
      const chance = breakthroughChance(w, a, hasPill, false);
      if (hasPill) a.pills--;
      if (a.realm === 0) breakthroughResult(w, a, chance);
      else a.attempt = { remaining: B.cultivation.advanceRules.QI_3.days - 1, chance };
      a.activity = "凝神突破，暂不外出";
      continue;
    }
    if (npcSeekSect(w, a, occupied)) continue;
    if (sectNpcAction(w, a, occupied)) continue;
    const draw = random(w, "simulation", 100);
    const weights = B.world.npcActionWeights;
    if (draw < weights.cultivate) cultivate(w, a);
    else if (draw < weights.cultivate + weights.work) {
      a.stones += B.actions.workSpiritStoneReward;
      a.activity = "接些杂务，赚取灵石";
    } else if (draw < weights.cultivate + weights.work + weights.move && !isParty) {
      const nearby = safeLocations(a);
      a.location = nearby[random(w, "simulation", nearby.length)];
      a.activity = "在附近走动";
    } else if (draw < weights.cultivate + weights.work + weights.move + weights.socialize) {
      if (!npcSocialize(w, a, occupied)) a.activity = "访友未遇，独自整理见闻";
    } else {
      a.hp = Math.min(stats(a).maxHp, a.hp + B.world.npcIdleRestoreHp);
      a.activity = "闲坐休息";
    }
  }
  updateAgreementAvailability(w);
}
