import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createWorld, validateWorld } from "../../lib/game/engine";
import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";
import { fighter, battleRound } from "../../lib/game/combat";
import { learnSkillReason, unlockedSkillSlots, usableSkills } from "../../lib/game/skills";
import { parseCommand } from "../../lib/game/protocol";
import { stats, B, combatDamage } from "../../lib/game/rules";
import { sectById } from "../../lib/game/sect-content";
import type { Actor, Command, Fighter, Profile, SkillId, World } from "../../lib/game/types";

const profile: Profile = {
  name: "技能测试",
  sex: "female",
  aptitude: 75,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 1, color: 0 },
};

function fresh(): World {
  return createWorld(12345, profile, "skills-test", 40, { contentLocks: CAMPAIGN_LOCKS });
}

function send(w: World, command: Command): World {
  return applyCommand(w, command, `skill-cmd:${w.revision}`, w.revision);
}

function enemy(id: string, overrides: Partial<Fighter> = {}): Fighter {
  return {
    id,
    name: `敌${id}`,
    maxHp: 200,
    hp: 200,
    attack: 10,
    defense: 3,
    speed: 5,
    guard: false,
    cooldown: 0,
    ...overrides,
  };
}

function battlefield(skills: SkillId[], realm = 4): { w: World; ally: Fighter } {
  const w = fresh();
  Object.assign(w.player, { realm, skills, stones: 0, location: "ruins" });
  w.player.hp = stats(w.player).maxHp;
  w.party = ["PLAYER"];
  w.battle = {
    id: "skills-battle",
    round: 1,
    allies: [fighter(w.player)],
    enemies: [enemy("ENEMY_1")],
    logs: ["战斗开始。"],
    auto: false,
    lethal: false,
  };
  return { w, ally: w.battle.allies[0] };
}

test("inn and sect skills require their published cost, place and membership", () => {
  const w = fresh();
  Object.assign(w.player, { realm: 4, stones: 80 });
  w.player.location = "inn";
  assert.equal(learnSkillReason(w, "yufeng"), null);
  const learned = send(w, { type: "learnSkill", skill: "yufeng" });
  assert.deepEqual(learned.player.skills, ["qingmang", "yufeng"]);
  assert.equal(learned.player.stones, 0);
  assert.throws(() => send(learned, { type: "learnSkill", skill: "yufeng" }), /已经学过/);

  const poor = fresh();
  Object.assign(poor.player, { realm: 4, stones: 79 });
  poor.player.location = "inn";
  assert.match(learnSkillReason(poor, "yufeng")!, /79|80/);
  assert.throws(() => send(poor, { type: "learnSkill", skill: "yufeng" }), /80/);

  const sect = fresh();
  sect.player.location = sectById("yunv")!.home;
  const visited = send(sect, { type: "visitSect", sectId: "yunv" });
  const enrolled = send(visited, { type: "joinSect", sectId: "yunv", confirmed: true });
  enrolled.player.sectMembership!.contribution = B.sects.skillContributionCost - 1;
  assert.throws(() => send(enrolled, { type: "learnSkill", skill: "bingxin" }), /贡献/);
  enrolled.player.sectMembership!.contribution = B.sects.skillContributionCost;
  const gained = send(enrolled, { type: "learnSkill", skill: "bingxin" });
  assert.equal(gained.player.sectMembership!.contribution, 0);
  assert.ok(gained.player.skills.includes("bingxin"));
  assert.throws(() => send(gained, { type: "learnSkill", skill: "shexin" }), /宗门/);
});

test("skill slots unlock by realm and only the first learned skills enter battle", () => {
  const w = fresh();
  Object.assign(w.player, { realm: 0, skills: ["qingmang"] });
  assert.equal(unlockedSkillSlots(w.player), 1);
  assert.deepEqual(usableSkills(w.player), ["qingmang"]);
  Object.assign(w.player, { realm: 4, skills: ["qingmang", "yufeng", "bingxin"] });
  assert.equal(unlockedSkillSlots(w.player), 2);
  assert.deepEqual(usableSkills(w.player), ["qingmang", "yufeng"]);
  Object.assign(w.player, { realm: 10 });
  assert.equal(unlockedSkillSlots(w.player), 3);

  const { w: battle } = battlefield(["qingmang", "yufeng", "bingxin"]);
  assert.throws(() => battleRound(battle, "skill", undefined, "bingxin"), /尚未学会这门功法/);
  assert.doesNotThrow(() => battleRound(battle, "skill", undefined, "yufeng"));
});

test("青芒剑诀 uses its configured multiplier instead of the legacy prototype ratio", () => {
  const { w, ally } = battlefield(["qingmang"]);
  const target = w.battle!.enemies[0];
  const expected = combatDamage(
    ally.attack,
    target.defense,
    true,
    false,
    B.combat.skills.qingmang.damageMultiplierBp,
  );
  battleRound(w, "skill", undefined, "qingmang");
  assert.equal(target.hp, target.maxHp - expected);
  assert.equal(ally.cooldown, B.combat.skills.qingmang.cooldown);
});

test("冰心诀 restores its configured share of max HP and clears the cooldown after three turns", () => {
  const { w, ally } = battlefield(["qingmang", "bingxin"], 10);
  w.battle!.enemies[0].attack = 0;
  ally.hp = 1;
  ally.cooldown = 0;
  battleRound(w, "skill", undefined, "bingxin");
  const healed = Math.min(
    ally.maxHp,
    1 + Math.ceil((ally.maxHp * B.combat.skills.bingxin.healMaxHpBp) / 10000),
  );
  // The enemy chips the minimum damage after the heal.
  assert.equal(ally.hp, healed - 1);
  assert.ok(healed > 1);
  assert.equal(ally.cooldown, B.combat.skills.bingxin.cooldown);
  assert.throws(() => battleRound(w, "skill", undefined, "bingxin"), /调息/);
});

test("摄心术 makes the target lose its next activation", () => {
  const { w, ally } = battlefield(["qingmang", "shexin"], 10);
  const target = w.battle!.enemies[0];
  target.speed = 999;
  target.attack = 0;
  battleRound(w, "skill", undefined, "shexin");
  assert.equal(target.skipTurns, B.combat.skills.shexin.skipTargetTurns);
  assert.ok(w.battle!.logs.some((line) => line.includes("心神失守")));
  const before = ally.hp;
  battleRound(w, "attack");
  assert.equal(target.skipTurns, 0);
  assert.ok(w.battle!.logs.some((line) => line.includes("心神恍惚")));
  assert.ok(ally.hp <= before);
});

test("太极归元 guards and reflects half of the incoming damage", () => {
  const { w, ally } = battlefield(["qingmang", "taiji"], 10);
  const target = w.battle!.enemies[0];
  target.attack = 40;
  ally.hp = ally.maxHp;
  battleRound(w, "skill", undefined, "taiji");
  assert.ok(ally.hp < ally.maxHp, "guard still reduces but does not nullify damage");
  assert.ok(target.hp < target.maxHp, "reflected damage reaches the attacker");
  assert.ok(w.battle!.logs.some((line) => line.includes("反弹")));
});

test("御风步 guards and grants the first action next round", () => {
  const { w, ally } = battlefield(["qingmang", "yufeng"], 10);
  ally.speed = 1;
  w.battle!.enemies[0].speed = 100;
  w.battle!.enemies[0].attack = 0;
  battleRound(w, "skill", undefined, "yufeng");
  assert.equal(ally.firstNext, true);
  battleRound(w, "attack");
  const playerLines = w.battle!.logs.filter((line) => line.startsWith(ally.name));
  assert.ok(playerLines.length > 0);
  const firstNewLine = w.battle!.logs.findIndex((line) => line.includes("御风步")) + 1;
  assert.ok(w.battle!.logs[firstNewLine]?.startsWith(ally.name));
});

test("battle commands parse an explicit skill id and reject unknown or malformed ones", () => {
  assert.deepEqual(parseCommand({ type: "battle", action: "skill", skill: "bingxin" }), {
    type: "battle",
    action: "skill",
    skill: "bingxin",
  });
  assert.throws(() => parseCommand({ type: "battle", action: "skill", skill: "nope" }));
  assert.throws(() => parseCommand({ type: "learnSkill", skill: "nope" }));
});

test("learned skills and battle snapshots survive save validation", () => {
  const { w, ally } = battlefield(["qingmang", "yufeng", "taiji"], 10);
  ally.skipTurns = 1;
  ally.reflectBp = 5000;
  ally.firstNext = true;
  validateWorld(w);
  w.player.skills = ["qingmang", "unknown" as SkillId];
  assert.throws(() => validateWorld(w));
});

test("old saves without battle skill extras still validate and finish", () => {
  const { w } = battlefield(["qingmang"]);
  delete w.battle!.allies[0].skipTurns;
  delete w.battle!.allies[0].reflectBp;
  delete w.battle!.allies[0].firstNext;
  validateWorld(w);
  battleRound(w, "attack");
  assert.ok(w.battle === null || w.battle.round === 2);
});
