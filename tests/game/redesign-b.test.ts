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
