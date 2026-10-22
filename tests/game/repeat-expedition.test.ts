import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createWorld, validateWorld } from "../../lib/game/engine";
import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";
import { battleRound } from "../../lib/game/combat";
import { migrateSave } from "../../lib/game/migrations";
import { B } from "../../lib/game/rules";
import { DEPARTURE_FEE } from "../../lib/game/economy";
import type { Command, Profile, World } from "../../lib/game/types";

const profile: Profile = {
  name: "再探测试",
  sex: "male",
  aptitude: 80,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 1, color: 0 },
};

function settled(seed = 321): World {
  const w = createWorld(seed, profile, `repeat-${seed}`, 40, { contentLocks: CAMPAIGN_LOCKS });
  w.player.realm = 6;
  w.player.manual = true;
  w.player.location = "gate";
  w.player.stones = 200;
  w.story.outcome = "fulfilled";
  w.story.settledDay = w.day;
  w.lastExpeditionDay = -B.economy.expeditionCooldownDays;
  return w;
}

function send(w: World, command: Command): World {
  return applyCommand(w, command, `repeat:${w.revision}`, w.revision);
}

function resolve(w: World, outcome: "win" | "lose") {
  let guard = 0;
  while (w.battle && guard++ < 200) {
    if (outcome === "win") {
      for (const enemy of w.battle.enemies) if (enemy.hp > 0) enemy.hp = 1;
      const ally = w.battle.allies.find((a) => a.id === "PLAYER")!;
      ally.hp = ally.maxHp;
      ally.attack = 100_000;
    } else {
      const ally = w.battle.allies.find((a) => a.id === "PLAYER")!;
      ally.hp = 1;
      for (const enemy of w.battle.enemies)
        if (enemy.hp > 0) {
          enemy.maxHp = 50_000;
          enemy.hp = 50_000;
          enemy.attack = 50_000;
        }
    }
    battleRound(w, "attack");
  }
  assert.ok(guard < 200, "battle did not resolve");
}

test("after the story settles a solo cultivator can re-enter without an agreement", () => {
  const w = settled();
  const next = send(w, { type: "expedition" });
  validateWorld(next);
  assert.equal(next.player.location, "ruins");
  assert.equal(next.battle?.kind, "expedition");
  assert.deepEqual(next.battle?.loot, { stones: B.combat.repeatExpedition.baseStones, grass: 0 });
  assert.equal(next.player.stones, 200 - DEPARTURE_FEE);
});

test("winning awards loot directly, counts the run and return disbands the party", () => {
  const w = send(settled(), { type: "expedition" });
  const loot = structuredClone(w.battle!.loot!);
  const stones = w.player.stones;
  resolve(w, "win");
  assert.equal(w.battle, null);
  assert.equal(w.expeditionCount, 1);
  assert.equal(w.player.location, "ruins");
  assert.equal(w.player.stones, stones + loot.stones);
  assert.equal(w.loot, null);
  validateWorld(w);
  const back = send(w, { type: "return" });
  assert.equal(back.player.location, "market");
  assert.deepEqual(back.party, ["PLAYER"]);
  assert.match(back.notice, /散去/);
});

test("each completed run raises enemy strength and reward", () => {
  const first = send(settled(), { type: "expedition" });
  const baseAttack = first.battle!.enemies[0].attack;
  const baseLoot = first.battle!.loot!.stones;
  resolve(first, "win");
  first.player.location = "gate";
  first.lastExpeditionDay = -B.economy.expeditionCooldownDays;
  const second = send(first, { type: "expedition" });
  assert.ok(second.battle!.enemies[0].attack > baseAttack);
  assert.ok(second.battle!.loot!.stones > baseLoot);
  assert.ok(!second.battle!.lethal);
});

test("defeat and retreat end at the gate without a run count", () => {
  const w = send(settled(), { type: "expedition" });
  resolve(w, "lose");
  assert.equal(w.battle, null);
  assert.equal(w.player.location, "gate");
  assert.equal(w.expeditionCount, undefined);
  validateWorld(w);
});

test("pre-story still needs the accepted agreement and three companions", () => {
  const w = settled();
  w.story.settledDay = null;
  w.story.outcome = "none";
  assert.throws(() => send(w, { type: "expedition" }), /约定/);
});

test("fee, cooldown and party limits guard repeat runs", () => {
  const poor = settled();
  poor.player.stones = 1;
  assert.throws(() => send(poor, { type: "expedition" }), /灵石/);
  const cooling = settled();
  cooling.lastExpeditionDay = cooling.day;
  assert.throws(() => send(cooling, { type: "expedition" }), /再去|后再入山/);
  const big = settled();
  big.party = ["PLAYER", "PLAYER", "PLAYER", "PLAYER"];
  assert.throws(() => send(big, { type: "expedition" }), /队伍人数/);
});

test("run count is optional for old saves and validated when present", () => {
  const w = settled();
  const migrated = migrateSave(JSON.parse(JSON.stringify(w))).world;
  assert.equal(migrated.expeditionCount, undefined);
  w.expeditionCount = -1;
  assert.throws(() => validateWorld(w), /秘境次数/);
});

test("repeat config stays bounded and nonlethal", () => {
  const cfg = B.combat.repeatExpedition;
  assert.ok(cfg.enemyCountBase >= 1 && cfg.enemyCountCap >= cfg.enemyCountBase);
  assert.ok(cfg.rewardGrowthBpPerRun > 0 && cfg.enemyGrowthBpPerRun > 0);
  assert.equal(B.combat.storyEncounter.lethal, false);
});
