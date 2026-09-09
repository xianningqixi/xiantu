import { recordFact } from "../../lib/game/knowledge";
import { intimacyKind, storyIntimacyKind } from "../../lib/game/intimacy-history";
import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createWorld, validateWorld, gainPerDay } from "../../lib/game/engine";
import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";
import { SECTS, sectById } from "../../lib/game/sect-content";
import { visitSect, joinSectReason } from "../../lib/game/sects";
import {
  intimacyHistory,
  intimacyReason,
  bondPartner,
  companyReason,
} from "../../lib/game/intimacy";
import { knownEvents, tellOwnRecentFacts, knowledgeEntries } from "../../lib/game/knowledge";
import { cultivationJourney } from "../../lib/game/growth";
import { migrateSave } from "../../lib/game/migrations";
import { advanceDay } from "../../lib/game/daily-simulation";
import { stats, B } from "../../lib/game/rules";
import { commandDays } from "../../lib/game/action-cost";
import type { Command, Profile, SectId, World } from "../../lib/game/types";
const profile: Profile = {
  name: "游历测试",
  sex: "female",
  aptitude: 75,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 1, color: 0 },
};
class Run {
  w: World;
  constructor(sex: Profile["sex"] = "female") {
    this.w = createWorld(12345, { ...profile, sex }, "sect-test", 40, {
      contentLocks: CAMPAIGN_LOCKS,
    });
  }
  do(c: Command) {
    this.w = applyCommand(this.w, c, `sect-cmd:${this.w.revision}`, this.w.revision);
    return this.w;
  }
  visit(id: SectId) {
    this.do({ type: "travel", to: sectById(id)!.home });
    this.do({ type: "visitSect", sectId: id });
  }
  join(id: SectId) {
    this.visit(id);
    this.do({ type: "joinSect", sectId: id, confirmed: true });
  }
}
function denied(run: Run, c: Command, code?: string) {
  const before = structuredClone(run.w);
  assert.throws(
    () => run.do(c),
    (e: any) => (code ? e.code === code : !!e.code),
  );
  assert.deepEqual(run.w, before, "rejected action changed the source world");
}

test("three sects are visited at real map homes; lazy residents preserve old actors, RNG and knowledge indexes", () => {
  const r = new Run();
  const untouched = structuredClone(r.w);
  assert.equal(r.w.npcs.length, 63);
  assert.equal(r.w.visitedSects, undefined);
  assert.deepEqual(migrateSave(r.w).world, untouched);
  denied(r, { type: "visitSect", sectId: "yunv" }, "ACTION_UNAVAILABLE");
  for (const s of SECTS) {
    r.do({ type: "travel", to: s.home });
    const old = structuredClone(r.w);
    // Exercise the WeakMap index before append within this same mutable command world.
    knownEvents(r.w);
    visitSect(r.w, s.id);
    validateWorld(r.w);
    assert.deepEqual(r.w.npcs.slice(0, old.npcs.length), old.npcs);
    assert.deepEqual(r.w.rng, old.rng);
    assert.equal(r.w.day, old.day);
    assert.equal(r.w.player.name, profile.name);
    assert.ok(
      s.residents.every((a) => r.w.npcs.some((n) => n.id === a.id && n.location === s.home)),
    );
    denied(r, { type: "visitSect", sectId: s.id });
  }
  assert.equal(r.w.npcs.length, 69);
  const snapshot = structuredClone(r.w);
  cultivationJourney(r.w);
  joinSectReason(r.w, "quanzhen");
  assert.deepEqual(r.w, snapshot);
  assert.deepEqual(migrateSave(JSON.parse(JSON.stringify(r.w))).world, r.w);
});
test("sect tasks cost days, pay shared prices once, unlock shared cultivation benefits and survive reload", () => {
  for (const s of SECTS) {
    const r = new Run();
    r.join(s.id);
    const joined = structuredClone(r.w);
    assert.equal(r.w.player.manual, true);
    assert.equal(r.w.player.sect, s.name);
    denied(r, { type: "learnSectArt" }, "INSUFFICIENT_RESOURCES");
    const baseline = gainPerDay(r.w, r.w.player);
    for (let i = 0; i < 3; i++) r.do({ type: "sectTask" });
    assert.equal(r.w.day, joined.day + 3 * B.sects.taskDays);
    assert.equal(r.w.player.stones, joined.player.stones + 3 * B.sects.taskStones);
    assert.equal(r.w.player.sectMembership!.contribution, 3 * B.sects.taskContribution);
    const id = `sect-cmd:${r.w.revision - 1}`;
    assert.equal(applyCommand(r.w, { type: "sectTask" }, id, r.w.revision), r.w);
    r.do({ type: "learnSectArt" });
    assert.equal(r.w.player.sectMembership!.contribution, 0);
    assert.equal(gainPerDay(r.w, r.w.player) - baseline, B.sects.growth[s.id].dailyGain);
    const npc = { ...r.w.player, id: "NPC_TEST" };
    assert.equal(
      gainPerDay(r.w, r.w.player) - gainPerDay(r.w, npc),
      B.artifacts.ARTIFACT_FOCUS.cultivationFlatGainPerDay,
    );
    assert.equal(
      gainPerDay(r.w, npc, false, true) - gainPerDay(r.w, npc),
      B.sects.growth[s.id].dualGain,
    );
    denied(r, { type: "learnSectArt" });
    assert.deepEqual(migrateSave(r.w).world, r.w);
    r.do({ type: "leaveSect" });
    assert.equal(r.w.player.sectMembership, undefined);
    assert.equal(gainPerDay(r.w, r.w.player), baseline);
    assert.equal(
      r.w.events.filter((e) => e.kind === "sect-art" && e.actors.includes("PLAYER")).length,
      1,
    );
  }
});
test("admission, vow, availability and explicit consent reject invalid requests without partial writes", () => {
  const male = new Run("male");
  male.visit("yunv");
  denied(male, { type: "joinSect", sectId: "yunv", confirmed: true });
  const r = new Run();
  r.join("yunv");
  const target = "SECT_YUNV_GU";
  denied(r, { type: "intimacy", kind: "bond", target, confirmed: true });
  denied(r, { type: "joinSect", sectId: "hehuan", confirmed: true });
  denied(r, { type: "spendTime", target: "PLAYER" });
  denied(r, { type: "spendTime", target: "not-an-actor" });
  denied(r, { type: "intimacy", kind: "bond", target } as Command, "VALIDATION_ERROR");
  denied(
    r,
    { type: "joinSect", sectId: "yunv", confirmed: false } as unknown as Command,
    "VALIDATION_ERROR",
  );
  r.do({ type: "travel", to: "gate" });
  denied(r, { type: "sectTask" }, "ACTION_UNAVAILABLE");
});
test("relationships grow through timed company; adults choose bonds and private intimacy, with shared dual-cultivation", () => {
  const r = new Run("male");
  r.join("quanzhen");
  const target = "SECT_QUAN_NING";
  const command: Command = { type: "intimacy", kind: "bond", target, confirmed: true };
  denied(r, command);
  const before = structuredClone(r.w);
  for (let i = 0; i < 4; i++) r.do({ type: "spendTime", target });
  assert.equal(r.w.day, before.day + 4 * B.relationships.companionship.days);
  const a = () => r.w.npcs.find((a) => a.id === target)!;
  assert.ok(
    r.w.relations
      .filter((e) => [e.from, e.to].includes(target) && [e.from, e.to].includes("PLAYER"))
      .every((e) => e.trust === 40 && e.attraction === 0),
  );
  assert.equal(intimacyReason(r.w, r.w.player, a(), "bond"), "");
  r.do(command);
  assert.equal(bondPartner(r.w, "PLAYER")?.id, target);
  assert.equal(r.w.day, before.day + 4);
  r.do({ type: "intimacy", kind: "night", target, confirmed: true });
  const prev = structuredClone(r.w),
    gain = gainPerDay(r.w, r.w.player, false, true);
  r.do({ type: "intimacy", kind: "dual", target, confirmed: true });
  assert.equal(
    r.w.day,
    prev.day + commandDays(prev, { type: "intimacy", kind: "dual", target, confirmed: true }),
  );
  assert.equal(r.w.player.xp, prev.player.xp + gain);
  const event = r.w.events.at(-1)!;
  assert.deepEqual(event.intimacy, { kind: "dual", consent: "mutual" });
  assert.equal([...knowledgeEntries(r.w)].filter((k) => k.eventId === event.id).length, 2);
  const stranger = r.w.npcs.find((a) => a.id !== target)!;
  stranger.location = r.w.player.location;
  assert.ok(!tellOwnRecentFacts(r.w, target, stranger.id).some((e) => e.intimacy));
  const snapshot = structuredClone(r.w);
  intimacyHistory(r.w, target);
  intimacyReason(r.w, r.w.player, a(), "dual");
  assert.deepEqual(r.w, snapshot);
  r.do({ type: "leaveSect" });
  r.visit("yunv");
  denied(r, { type: "joinSect", sectId: "yunv", confirmed: true });
});
test("NPC partners build their own relationship during long waits; private lives do not consume player resources", () => {
  const r = new Run();
  r.visit("hehuan");
  const before = structuredClone(r.w.player);
  for (let i = 0; i < 120; i++) advanceDay(r.w);
  validateWorld(r.w);
  const events = intimacyHistory(r.w, "SECT_HEHUAN_YAN");
  assert.ok(events.some((e) => e.intimacy!.kind === "bond"));
  assert.ok(events.some((e) => e.intimacy!.kind === "dual"));
  assert.ok(events.every((e) => !e.actors.includes("PLAYER")));
  assert.ok(!knownEvents(r.w).some((e) => e.intimacy));
  assert.equal(r.w.player.xp, before.xp);
  assert.equal(r.w.player.stones, before.stones);
  assert.ok(
    r.w.npcs
      .filter((a) => a.sectMembership?.id === "hehuan")
      .every((a) => a.sectMembership!.artLearned),
  );
});
test("underage, dead, busy partners and death on the action day cannot create intimacy or rewards", () => {
  const r = new Run();
  r.join("quanzhen");
  const a = r.w.npcs.find((a) => a.id === "SECT_QUAN_NING")!;
  a.ageDays = 17 * B.world.daysPerYear;
  assert.match(intimacyReason(r.w, r.w.player, a, "bond"), /成年/);
  a.ageDays = 27 * B.world.daysPerYear;
  a.attempt = { remaining: 1, chance: 5000 };
  assert.ok(companyReason(r.w, r.w.player, a));
  a.attempt = null;
  a.alive = false;
  assert.ok(companyReason(r.w, r.w.player, a));
  a.alive = true;
  a.ageDays = B.world.npcLifespanDays.QI_2 - 1;
  const count = r.w.events.length;
  r.do({ type: "spendTime", target: a.id });
  assert.equal(r.w.npcs.find((n) => n.id === a.id)!.alive, false);
  assert.ok(!r.w.events.slice(count).some((e) => e.kind === "companionship"));
  r.w.profile.mode = "complex";
  r.w.player.ageDays = B.world.npcLifespanDays.MORTAL - 1;
  const stones = r.w.player.stones;
  r.do({ type: "sectTask" });
  assert.equal(r.w.ended, true);
  assert.equal(r.w.player.stones, stones);
  assert.equal(r.w.player.sectMembership!.earned, 0);
});
test("new optional state is strict and malformed membership, consent or private witnesses cannot load", () => {
  const r = new Run();
  r.join("quanzhen");
  for (const mutate of [
    (w: any) => w.visitedSects.push("unknown"),
    (w: any) => (w.player.sectMembership.contribution = -1),
    (w: any) => (w.player.sectMembership.earned = 10),
    (w: any) => (w.npcs.find((a: any) => a.id === "SECT_QUAN_NING").sex = "male"),
  ]) {
    const bad = structuredClone(r.w);
    mutate(bad);
    assert.throws(() => validateWorld(bad));
  }
  for (let i = 0; i < 4; i++) r.do({ type: "spendTime", target: "SECT_QUAN_NING" });
  r.do({ type: "intimacy", target: "SECT_QUAN_NING", kind: "bond", confirmed: true });
  for (const mutate of [
    (w: any) => (w.events.at(-1).intimacy.consent = "assumed"),
    (w: any) => (w.events.at(-1).public = true),
    (w: any) => w.knowledge[w.events.at(-1).id].push([1, 1, -1, w.day]),
    (w: any) => (w.events.at(-1).intimacy.kind = "night"),
  ]) {
    const bad = structuredClone(r.w);
    mutate(bad);
    assert.throws(() => validateWorld(bad));
  }
});
test("authored past intimacy is projected only from completed experiences; acquaintance and declined choices stay distinct", () => {
  const r = new Run();
  const actor = "shichai.chunshui.suqingyan";
  const node = "shichai.chunshui.suqingyan";
  const add = (stage: string, experience: boolean) => {
    if (experience) recordFact(r.w, "shared-experience", "已保存的个人经历。", ["PLAYER", actor]);
    recordFact(r.w, "story-choice", "已保存的剧情选择。", ["PLAYER", actor]);
    r.w.events.at(-1)!.storyNodeId = `${node}.${stage}`;
  };
  add("night", false);
  add("bond", true);
  assert.equal(intimacyHistory(r.w, actor).length, 0);
  assert.equal(storyIntimacyKind(`${node}.night`, `${node}.night.stop`), undefined);
  add("night", true);
  add("vow", true);
  const before = structuredClone(r.w);
  const history = intimacyHistory(r.w, actor);
  assert.deepEqual(
    history.map((e) => intimacyKind(r.w, e)),
    ["night", "bond"],
  );
  assert.equal(bondPartner(r.w, "PLAYER")?.id, actor);
  assert.ok(
    history.every((e) => e.intimacy === undefined),
    "never invent old consent fields",
  );
  assert.deepEqual(r.w, before);
  r.visit("yunv");
  denied(r, { type: "joinSect", sectId: "yunv", confirmed: true });
});
