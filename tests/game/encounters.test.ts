import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createWorld, validateWorld } from "../../lib/game/engine";
import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";
import { maybeRoadEncounter, exploreEncounter } from "../../lib/game/encounters";
import { battleRound } from "../../lib/game/combat";
import { B } from "../../lib/game/rules";
import type { Command, Profile, World } from "../../lib/game/types";

const profile: Profile = {
  name: "遭遇测试",
  sex: "female",
  aptitude: 75,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 1, color: 0 },
};

function world(seed = 12345, realm = 4): World {
  const w = createWorld(seed, profile, `encounter-${seed}`, 40, { contentLocks: CAMPAIGN_LOCKS });
  w.player.realm = realm;
  // Road ambushes only start once the main story has settled.
  w.story.outcome = "fulfilled";
  w.story.settledDay = w.day;
  return w;
}

function send(w: World, command: Command): World {
  return applyCommand(w, command, `encounter-cmd:${w.revision}`, w.revision);
}

function resolve(w: World, outcome: "win" | "lose" = "win") {
  let guard = 0;
  while (w.battle && guard++ < 200) {
    if (outcome === "win") {
      for (const enemy of w.battle.enemies) if (enemy.hp > 0) enemy.hp = 1;
      const ally = w.battle.allies.find((a) => a.id === "PLAYER")!;
      ally.hp = ally.maxHp;
      ally.attack = 10_000;
    } else {
      const ally = w.battle.allies.find((a) => a.id === "PLAYER")!;
      ally.hp = 1;
      for (const enemy of w.battle.enemies)
        if (enemy.hp > 0) {
          enemy.hp = 10_000;
          enemy.maxHp = 10_000;
          enemy.attack = 10_000;
        }
    }
    battleRound(w, "attack");
  }
  assert.ok(guard < 200, "battle did not resolve");
}

test("road encounters roll about twelve percent per day outside the starting region", () => {
  let hits = 0;
  const runs = 400;
  for (let seed = 1; seed <= runs; seed++) {
    const w = world(seed);
    w.player.location = "atlas.yunmeng";
    if (maybeRoadEncounter(w, "atlas.wendao")) hits++;
  }
  const rate = hits / runs;
  assert.ok(rate > 0.07 && rate < 0.18, `unexpected road encounter rate ${rate}`);
});

test("the starting region, safe town legs and low realms never roll road encounters", () => {
  for (let seed = 1; seed <= 120; seed++) {
    const local = world(seed);
    local.player.location = "market";
    assert.equal(maybeRoadEncounter(local, "inn"), null);
    assert.equal(maybeRoadEncounter(local, "gate"), null);
    local.player.location = "gate";
    assert.equal(maybeRoadEncounter(local, "atlas.cangzhu"), null);
    const weak = world(seed, 3);
    weak.player.location = "atlas.yunmeng";
    assert.equal(maybeRoadEncounter(weak, "atlas.wendao"), null);
  }
});

test("winning a road encounter pays its loot and finishes the interrupted journey", () => {
  let w: World | null = null;
  for (let seed = 1; seed <= 200 && !w; seed++) {
    const candidate = world(seed);
    candidate.player.location = "atlas.yunmeng";
    const battle = maybeRoadEncounter(candidate, "atlas.wendao");
    if (battle) {
      candidate.battle = battle;
      w = candidate;
    }
  }
  assert.ok(w, "no road encounter produced");
  const loot = structuredClone(w!.battle!.loot!);
  const stones = w!.player.stones;
  validateWorld(w!);
  resolve(w!, "win");
  assert.equal(w!.battle, null);
  assert.equal(w!.player.location, "atlas.wendao");
  assert.equal(w!.player.stones, stones + loot.stones);
});

test("losing a road encounter leaves the party where the ambush happened", () => {
  let w: World | null = null;
  for (let seed = 1; seed <= 200 && !w; seed++) {
    const candidate = world(seed);
    candidate.player.location = "atlas.yunmeng";
    const battle = maybeRoadEncounter(candidate, "atlas.wendao");
    if (battle) {
      candidate.battle = battle;
      w = candidate;
    }
  }
  assert.ok(w);
  resolve(w!, "lose");
  assert.equal(w!.battle, null);
  assert.equal(w!.player.location, "atlas.yunmeng");
  assert.ok(w!.player.hp >= 1);
});

test("wilderness exploration costs a day, then locks the site for its cooldown", () => {
  const w = world(5);
  w.player.location = "atlas.cangzhu";
  const day = w.day;
  const next = send(w, { type: "explore" });
  assert.equal(next.day, day + 1);
  assert.deepEqual(next.player.exploreDays, { "atlas.cangzhu": next.day });
  const settled = structuredClone(next);
  settled.battle = null;
  assert.throws(() => send(settled, { type: "explore" }), /刚探索过/);
});

test("exploration rejects towns, loot trips and ruins battles without writing time", () => {
  const w = world();
  w.player.location = "market";
  assert.throws(() => send(w, { type: "explore" }), /郊野/);
  const wild = world();
  wild.player.location = "atlas.cangzhu";
  wild.loot = { stones: 1, grass: 1, expeditionId: "old" };
  assert.throws(() => send(wild, { type: "explore" }), /战利品/);
});

test("exploration outcomes cover encounters, grass, insight and quiet days deterministically", () => {
  const seen = { battle: 0, grass: 0, insight: 0, quiet: 0 };
  for (let seed = 1; seed <= 120; seed++) {
    const w = world(seed);
    w.player.location = "atlas.cangzhu";
    const before = { grass: w.player.grass, insight: w.player.insight };
    try {
      const next = send(w, { type: "explore" });
      if (next.battle) seen.battle++;
      else if (next.player.grass > before.grass) seen.grass++;
      else if (next.player.insight > before.insight) seen.insight++;
      else seen.quiet++;
    } catch {
      seen.quiet++;
    }
  }
  assert.ok(seen.battle > 0 && seen.grass > 0 && seen.insight > 0);
  assert.equal(seen.quiet + seen.battle + seen.grass + seen.insight, 120);
});

test("field battles keep optional metadata strict in the save guard", () => {
  const w = world(7);
  w.player.location = "atlas.cangzhu";
  const battle = exploreEncounter(w)!;
  if (!battle) return;
  w.battle = battle;
  validateWorld(w);
  w.battle.loot = { stones: -1, grass: 0 };
  assert.throws(() => validateWorld(w), /战斗资料/);
  w.battle.loot = undefined;
  validateWorld(w);
});

test("balance keeps encounters nonlethal unless explicitly configured", () => {
  const encounters = B.combat.encounters as unknown as Record<
    string,
    { lethal?: boolean; lethalInComplex?: boolean }
  >;
  assert.equal(encounters.bandits.lethal, false);
  assert.equal(encounters.wolves.lethal, false);
  assert.equal(encounters.steleSpirit.lethalInComplex, true);
});

test("road and wilderness encounters draw from several authored templates", () => {
  const road = new Set<string>();
  for (let seed = 1; seed <= 240; seed++) {
    const w = world(seed, 5);
    w.player.location = "atlas.yunmeng";
    const battle = maybeRoadEncounter(w, "atlas.wendao");
    if (battle) road.add(battle.enemies[0].name.replace(/·.*$/, ""));
  }
  assert.ok(road.size >= 2, `only met ${[...road].join(",")}`);
  assert.ok(
    [...road].every((name) => ["山匪", "妖狼", "采药散修", "流窜剑修", "护泉灵兽"].includes(name)),
  );
  const wild = new Set<string>();
  for (let seed = 1; seed <= 240; seed++) {
    const w = world(seed, 5);
    const battle = exploreEncounter(w);
    if (battle) wild.add(battle.enemies[0].name.replace(/·.*$/, ""));
  }
  assert.ok(wild.size >= 2);
});

function findEncounter(kind: "road" | "explore", match: (name: string) => boolean) {
  for (let seed = 1; seed <= 600; seed++) {
    const w = world(seed, 5);
    w.player.location = "atlas.yunmeng";
    const battle = kind === "road" ? maybeRoadEncounter(w, "atlas.wendao") : exploreEncounter(w);
    if (battle && match(battle.enemies[0].name)) {
      w.battle = battle;
      return w;
    }
  }
  return null;
}

test("a wandering herbalist spar ends with a little insight and modest loot", () => {
  const w = findEncounter("road", (name) => name.startsWith("采药散修"));
  assert.ok(w, "no herbalist encounter found");
  const insight = w!.player.insight;
  resolve(w!, "win");
  assert.equal(w!.player.insight, insight + 1);
  assert.match(w!.notice, /感悟/);
});

test("wounded spirit beasts guard themselves and cornered swordsmen heal once", () => {
  const beast = findEncounter("explore", (name) => name.startsWith("护泉灵兽"));
  assert.ok(beast, "no spring beast encounter found");
  const beastEnemy = beast!.battle!.enemies[0];
  beastEnemy.hp = Math.ceil(beastEnemy.maxHp * 0.3);
  battleRound(beast!, "guard");
  assert.equal(beastEnemy.guard, true);
  assert.equal(beastEnemy.cooldown, 2);
  assert.match(beast!.battle!.logs.join("\n"), /守势/);

  const rogue = findEncounter("road", (name) => name.startsWith("流窜剑修"));
  assert.ok(rogue, "no rogue swordsman encounter found");
  const rogueEnemy = rogue!.battle!.enemies[0];
  rogueEnemy.hp = Math.ceil(rogueEnemy.maxHp * 0.3);
  const before = rogueEnemy.hp;
  battleRound(rogue!, "guard");
  assert.equal(rogueEnemy.tacticUsed, true);
  assert.ok(rogueEnemy.hp > before);
  assert.match(rogue!.battle!.logs.join("\n"), /服下丹药/);
});

test("wilderness finds include buried stashes and insightful old traces", () => {
  let stash: World | null = null;
  let trace: World | null = null;
  for (let seed = 1; seed <= 300 && (!stash || !trace); seed++) {
    const w = world(seed, 5);
    w.player.location = "atlas.cangzhu";
    let next: World | null = null;
    try {
      next = send(w, { type: "explore" });
    } catch {
      continue;
    }
    if (next.battle) continue;
    if (/石匣/.test(next.notice)) stash = next;
    else if (/旧迹/.test(next.notice)) trace = next;
  }
  assert.ok(stash, "no stash outcome found");
  assert.ok(trace, "no trace outcome found");
  assert.ok(stash!.player.stones > 0);
  assert.match(trace!.notice, /感悟/);
  assert.ok(trace!.player.insight >= 1);
});

test("encounter metadata rejects unknown tactics and negative insight", () => {
  const w = findEncounter("road", (name) => name.startsWith("山匪"));
  assert.ok(w);
  validateWorld(w!);
  w!.battle!.enemies[0].tactic = "dance" as never;
  assert.throws(() => validateWorld(w!), /战斗人物/);
  w!.battle!.enemies[0].tactic = undefined;
  w!.battle!.insight = -1;
  assert.throws(() => validateWorld(w!), /战斗资料/);
});
