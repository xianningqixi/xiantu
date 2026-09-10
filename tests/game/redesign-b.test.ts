import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, applyCommand, validateWorld } from "../../lib/game/engine";
import { B, REALM_KEYS, stats, threshold, advanceRule } from "../../lib/game/rules";
import {
  gainPerDay,
  cultivate,
  breakthroughChance,
  breakthroughResult,
} from "../../lib/game/cultivation";
import { migrateSave } from "../../lib/game/migrations";
import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";
import type { Command, World } from "../../lib/game/types";
const profile = {
  name: "阶梯回归",
  sex: "female",
  aptitude: 90,
  artifact: "ward",
  mode: "simple",
  appearance: { face: 0, hair: 0, color: 0 },
} as const;
export const freshB = (seed = 42) =>
  createWorld(seed, profile, "redesign-b", 40, { contentLocks: CAMPAIGN_LOCKS });
export const actB = (w: World, c: Command) => applyCommand(w, c, `b:${w.revision}`, w.revision);
test("thirteen realms share gain, stats, threshold and lifespan tables; manual advancement carries overflow", () => {
  const w = freshB();
  assert.equal(REALM_KEYS.length, 13);
  for (let realm = 0; realm < 13; realm++) {
    const p = w.player;
    Object.assign(p, {
      realm,
      manual: true,
      xp: threshold({ ...p, realm }),
      hp: stats({ ...p, realm }).maxHp,
    });
    const npc = { ...p, id: w.npcs[0].id };
    assert.equal(gainPerDay(w, p), gainPerDay(w, npc));
    if (advanceRule(p).kind === "minor") {
      const before = p.xp;
      cultivate(w, p);
      assert.equal(p.realm, realm);
      const next = actB(w, { type: "advanceMinor" });
      assert.equal(next.player.realm, realm + 1);
      assert.equal(next.player.xp, before + gainPerDay(w, p) - threshold(p));
      assert.equal(next.day, w.day);
      assert.deepEqual(next.rng, w.rng);
    }
  }
});
test("manual rank, cave, focus, stone and injury obey the complete daily gain formula", () => {
  const w = freshB();
  Object.assign(w.player, { realm: 1, aptitude: 20, manualRank: 0, hp: 50 });
  assert.equal(gainPerDay(w, w.player), 12);
  w.player.aptitude = 90;
  assert.equal(gainPerDay(w, w.player), 21);
  w.player.manualRank = 3;
  w.player.cave = "market";
  w.profile.artifact = "focus";
  assert.equal(gainPerDay(w, w.player, true), 36);
  w.player.hp = 14;
  assert.equal(gainPerDay(w, w.player, true), 18);
  w.player.hp = 15;
  assert.equal(gainPerDay(w, w.player, true), 36);
});
test("minor bottlenecks reject preparations and consume insight once; failed attempts never reduce health", () => {
  const w = freshB();
  Object.assign(w.player, { realm: 6, xp: 240, hp: 115, manual: true, insight: 3, pills: 1 });
  assert.equal(breakthroughChance(w, w.player, true, true), 9500);
  assert.throws(() => actB(w, { type: "breakthrough", usePill: true, guardian: false }));
  const next = actB(w, { type: "breakthrough", usePill: false, guardian: false });
  assert.equal(next.player.insight, 0);
  assert.equal(w.player.insight, 3);
  assert.equal(next.longAction?.chance, 9500);
  Object.assign(w.player, { realm: 9, xp: 480, hp: 100 });
  breakthroughResult(w, w.player, 0);
  assert.equal(w.player.alive, true);
  assert.equal(w.player.hp, 100);
});
test("schema six remaps all legacy realms once, preserves history and in-flight resolution, and rejects bad versions", () => {
  const old: any = freshB();
  old.schemaVersion = 6;
  old.rulesVersion = "0.1.6";
  for (const [i, a] of [old.player, ...old.npcs].entries()) {
    a.realm = i % 5;
    a.xp = 100;
    a.hp = [30, 50, 70, 90, 130][a.realm];
    for (const k of ["insight", "manualRank", "skills", "qi", "jobCooldowns"]) delete a[k];
  }
  delete old.dailyEventCooldowns;
  delete old.pendingDailyEventId;
  old.player.realm = 3;
  old.player.hp = 90;
  old.longAction = {
    id: "legacy-attempt",
    checkpoint: 1,
    paidStones: 0,
    kind: "breakthrough",
    total: 3,
    remaining: 2,
    stoneMethod: false,
    chance: 8123,
    guardian: null,
  };
  const before = structuredClone(old);
  const { world: w, migrated } = migrateSave(old);
  assert.ok(migrated);
  assert.deepEqual(old, before);
  assert.equal(w.schemaVersion, 7);
  assert.equal(w.rulesVersion, "0.2.0");
  assert.equal(w.longAction?.chance, 8123);
  assert.equal(w.longAction?.rule?.targetRealm, "FOUNDATION_1");
  assert.equal(w.player.realm, 3);
  assert.equal(w.player.xp, 90);
  assert.equal(w.player.hp, 70);
  for (let i = 0; i < old.npcs.length; i++)
    assert.equal(w.npcs[i].realm, [0, 1, 2, 3, 10][old.npcs[i].realm]);
  for (const key of ["events", "relations", "knowledge", "rng", "day"] as const)
    assert.deepEqual(w[key], old[key]);
  assert.deepEqual(migrateSave(w), { world: w, migrated: false });
  validateWorld(w);
  assert.throws(() => migrateSave({ ...old, rulesVersion: "9.9.9" }));
  const invalid = structuredClone(w);
  invalid.player.manualRank = 5 as any;
  assert.throws(() => validateWorld(invalid));
});

test("migrated battle snapshots finish without overflowing the new actor HP cap", async () => {
  const { fighter, finishBattle } = await import("../../lib/game/combat");
  const w = freshB();
  Object.assign(w.player, { realm: 3, hp: 70 });
  w.battle = {
    id: "legacy-battle",
    round: 1,
    allies: [{ ...fighter(w.player), hp: 90, maxHp: 90 }],
    enemies: [],
    logs: [],
    auto: false,
    lethal: false,
  };
  const snapshot = structuredClone(w.battle);
  finishBattle(w, "retreat");
  assert.equal(w.player.hp, 70);
  assert.equal(snapshot.allies[0].hp, 90);
  assert.equal(w.battle, null);
});

import {
  DAILY_EVENTS,
  chooseDailyEvent,
  rollDailyEvent,
  settleDailyGifts,
  dailyScene,
} from "../../lib/game/daily-events";
test("daily pool has ten of each category; 100 waiting days are deterministic, frequent and never repeat consecutively", () => {
  for (const category of ["sighting", "choice", "risk"])
    assert.equal(DAILY_EVENTS.filter((n) => n.category === category).length, 10);
  const run = () => {
    const w = freshB(42);
    w.player.realm = 3;
    for (let d = 1; d <= 100; d++) {
      w.day = d;
      rollDailyEvent(w, "wait");
      if (w.pendingDailyEventId) {
        const n = DAILY_EVENTS.find((n) => n.id === w.pendingDailyEventId)!;
        chooseDailyEvent(w, n.id, n.category === "risk" ? "face" : "decline");
      }
    }
    return w;
  };
  const w = run(),
    events = w.events.filter((e) => e.kind === "daily-event");
  assert.ok(events.length >= 15, `only ${events.length} events`);
  events.forEach((e, i) => {
    if (i) assert.notEqual(e.daily!.nodeId, events[i - 1].daily!.nodeId);
  });
  assert.deepEqual(w, run());
});
test("daily choice pauses a paid retreat at its durable checkpoint; reload and retry never duplicate costs", () => {
  let w = freshB(1);
  Object.assign(w.player, { manual: true, stones: 200, realm: 3 });
  w = actB(w, { type: "train", days: 30, stoneMethod: true });
  while (w.longAction && !w.pendingDailyEventId) w = actB(w, { type: "step" });
  assert.ok(w.pendingDailyEventId);
  assert.ok(w.longAction);
  const before = structuredClone(w),
    n = DAILY_EVENTS.find((n) => n.id === w.pendingDailyEventId)!;
  assert.equal(dailyScene(w)?.id, n.id);
  assert.throws(() => actB(w, { type: "step" }), /先回应/);
  const c: Command = {
    type: "choose",
    nodeId: n.id,
    choiceId: n.category === "risk" ? "face" : "decline",
  };
  w = applyCommand(JSON.parse(JSON.stringify(w)), c, "daily-retry", w.revision);
  assert.deepEqual(w.longAction, before.longAction);
  assert.equal(w.day, before.day);
  assert.deepEqual(applyCommand(w, c, "daily-retry", before.revision), w);
  assert.equal(actB(w, { type: "step" }).longAction?.checkpoint, before.longAction!.checkpoint + 1);
});
test("cave retreats suppress ordinary events; negative daily costs are atomic and promised gifts settle once", () => {
  const w = freshB(42);
  Object.assign(w.player, { realm: 3, cave: "market" });
  for (let d = 1; d <= 100; d++) {
    w.day = d;
    rollDailyEvent(w, "train");
    if (w.pendingDailyEventId) chooseDailyEvent(w, w.pendingDailyEventId, "face");
  }
  assert.ok(
    w.events
      .filter((e) => e.kind === "daily-event")
      .every((e) => DAILY_EVENTS.find((n) => n.id === e.daily!.nodeId)!.category === "risk"),
  );
  const a = freshB(12345);
  for (let d = 1; d < 2000 && a.pendingDailyEventId !== "daily.injured-traveler"; d++) {
    if (a.pendingDailyEventId) chooseDailyEvent(a, a.pendingDailyEventId, "decline");
    a.day = d;
    rollDailyEvent(a, "wait");
  }
  assert.equal(a.pendingDailyEventId, "daily.injured-traveler");
  a.player.healing = 0;
  const original = structuredClone(a);
  assert.throws(
    () => actB(a, { type: "choose", nodeId: a.pendingDailyEventId!, choiceId: "help" }),
    /物资不足/,
  );
  assert.deepEqual(a, original);
  a.player.healing = 1;
  chooseDailyEvent(a, a.pendingDailyEventId!, "help");
  const stones = a.player.stones;
  a.day += 6;
  settleDailyGifts(a);
  assert.equal(a.player.stones, stones);
  a.day++;
  settleDailyGifts(a);
  settleDailyGifts(a);
  assert.equal(a.player.stones, stones + 5);
});

import { commandDays } from "../../lib/game/action-cost";
import { settleJob } from "../../lib/game/jobs";
import { answerDaily } from "./daily-test-helpers";
import { settleSectStipends, sectExchange } from "../../lib/game/sects";
import { sectById } from "../../lib/game/sect-content";
test("new economic commands enforce place, realm, inventory, exact prices and duplicate protection", () => {
  let w = freshB();
  Object.assign(w.player, { realm: 1, manual: true, stones: 600, location: "inn" });
  const day = w.day,
    oldGain = gainPerDay(w, w.player);
  w = actB(w, { type: "upgradeManual" });
  assert.equal(w.player.manualRank, 1);
  assert.equal(w.player.stones, 560);
  assert.equal(gainPerDay(w, w.player), oldGain + 2);
  assert.throws(() => actB(w, { type: "upgradeManual" }), /境界/);
  w.player.location = "market";
  w = actB(w, { type: "buy", item: "qi" });
  assert.equal(w.player.qi, 1);
  assert.equal(w.player.stones, 540);
  const xp = w.player.xp;
  w = actB(w, { type: "use", item: "qi" });
  assert.equal(w.player.xp - xp, 20);
  assert.equal(w.player.qi, 0);
  assert.equal(w.day, day);
  w.player.grass = 2;
  w = actB(w, { type: "sell", item: "grass", quantity: 2 });
  assert.equal(w.player.stones, 590);
  assert.equal(w.player.grass, 0);
  const before = structuredClone(w);
  assert.throws(() => actB(w, { type: "sell", item: "grass", quantity: 1 }), /物资不足/);
  assert.deepEqual(w, before);
  assert.throws(() => actB(w, { type: "rentCave" }), /炼气三层/);
  Object.assign(w.player, { realm: 3, hp: 70 });
  const rng = structuredClone(w.rng);
  const c = { type: "rentCave" } as const;
  w = applyCommand(w, c, "rent-once", w.revision);
  assert.equal(w.player.cave, "market");
  assert.equal(w.player.stones, 390);
  assert.deepEqual(applyCommand(w, c, "rent-once", 0), w);
  assert.throws(() => actB(w, c), /尚未置办/);
  assert.deepEqual(w.rng, rng);
});
test("jobs use configured location, realm, duration, rewards, deterministic rolls and four receipts", () => {
  let w = freshB(42);
  assert.throws(() => actB(w, { type: "work", job: "escort" }), /条件/);
  const start = w.day;
  w = answerDaily(actB(w, { type: "work", job: "chores" }));
  assert.equal(w.day - start, 1);
  w.player.location = "inn";
  assert.throws(() => actB(w, { type: "work", job: "chores" }), /条件/);
  Object.assign(w.player, { realm: 3, hp: 70, location: "market" });
  assert.equal(commandDays(w, { type: "work", job: "escort" }), 2);
  const before = w.day;
  w = answerDaily(actB(w, { type: "work", job: "escort" }));
  assert.equal(w.day - before, 2);
  w.player.location = "atlas.cangzhu";
  w = answerDaily(actB(w, { type: "work", job: "herbs" }));
  assert.ok(w.events.some((e) => e.kind === "work" && e.text.includes("4 枚灵石")));
  const run = () => {
    const s = freshB(12345);
    for (let i = 0; i < 100; i++) settleJob(s, "herbs");
    return s;
  };
  const a = run();
  assert.deepEqual(a, run());
  assert.ok(a.player.grass > 20 && a.player.grass < 60);
  assert.ok(a.events.some((e) => e.kind === "encounter"));
  assert.equal(a.battle, null);
  assert.equal(
    new Set(a.events.filter((e) => e.kind === "work").map((e) => e.text.split(" 获得")[0])).size,
    4,
  );
});
test("sect stipends share the same thirty-day clock and contribution exchanges survive rejoining", () => {
  let w = freshB(42);
  w.player.location = sectById("quanzhen")!.home;
  w = actB(w, { type: "visitSect", sectId: "quanzhen" });
  w = actB(w, { type: "joinSect", sectId: "quanzhen", confirmed: true });
  w.player.sectMembership!.contribution = 40;
  w.player.sectMembership!.earned = 40;
  const stones = w.player.stones;
  w.day = 29;
  settleSectStipends(w);
  assert.equal(w.player.stones, stones);
  w.day = 30;
  settleSectStipends(w);
  settleSectStipends(w);
  assert.equal(w.player.stones, stones + 20);
  w = actB(w, { type: "sectExchange" });
  assert.equal(w.player.pills, 1);
  assert.equal(w.player.sectMembership!.contribution, 20);
  w = actB(w, { type: "sectExchange" });
  assert.equal(w.player.pills, 2);
  assert.equal(w.player.sectMembership!.contribution, 0);
  assert.throws(() => actB(w, { type: "sectExchange" }), /贡献不足/);
  w = actB(w, { type: "leaveSect" });
  w = actB(w, { type: "joinSect", sectId: "quanzhen", confirmed: true });
  validateWorld(w);
  assert.equal(w.player.sectMembership!.contribution, 0);
});
