import { answerDaily } from "./daily-test-helpers";
import { npcSubject } from "../../lib/game/portrait-subject";
import { canonicalJson, simulationFingerprint } from "./semantic";
import {
  knowledgeEntries,
  recordFact,
  knownEvents,
  tellOwnRecentFacts,
} from "../../lib/game/knowledge";
import B from "../../lib/game/content/balance.json";
import { REALM_KEYS, threshold } from "../../lib/game/rules";
import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCommand,
  createWorld,
  relation,
  scene,
  stats,
  validateWorld,
  canInvite,
  partyReadiness,
  departureStatus,
  relationshipLabel,
  combatDamage,
  nextRandom,
  rollAptitude,
} from "../../lib/game/engine";
import { assertSaveExpectation } from "../../lib/game/save-guard";
import { npcPortrait, npcProfile } from "../../lib/game/npc-profile";
import { PACK } from "../../lib/game/content/official";
import type { Command, Profile, World } from "../../lib/game/types";

const profile: Profile = {
  name: "沈知微",
  sex: "female",
  aptitude: 75,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 1, color: 0 },
};
class Run {
  state: World;
  serial = 0;
  constructor(seed = 12345, count = 40) {
    this.state = createWorld(seed, profile, "test-save", count);
  }
  do(c: Command) {
    this.state = applyCommand(this.state, c, `command:${++this.serial}`, this.state.revision);
    this.state = answerDaily(this.state);
    return this.state;
  }
  finish() {
    let steps = 0;
    while (this.state.longAction) {
      assert.ok(steps++ < 35);
      this.do({ type: "step" });
    }
  }
  wait(days = 1) {
    this.do({ type: "wait", days });
    this.finish();
  }
  choose() {
    const n = scene(this.state);
    assert.ok(n?.choices.length, `No choice at ${n?.id}`);
    this.do({ type: "choose", nodeId: n.id, choiceId: n.choices[0].id });
  }
}
function prepare() {
  const r = new Run();
  for (let i = 0; i < 4; i++) r.choose();
  assert.equal(r.state.agreement?.status, "accepted");
  while (r.state.player.realm === 0) {
    r.do({ type: "train", days: 3, stoneMethod: false });
    r.finish();
    r.do({ type: "breakthrough", usePill: false, guardian: false });
    r.finish();
  }
  for (
    let i = 0;
    i < 15 &&
    r.state.npcs
      .filter((n) =>
        [PACK.roles.primary, PACK.roles.companion].includes(n.id as typeof PACK.roles.primary),
      )
      .some((n) => n.location !== "market");
    i++
  )
    r.wait();
  r.do({ type: "formParty" });
  r.do({ type: "travel", to: "gate" });
  r.do({ type: "expedition" });
  while (r.state.battle) r.do({ type: "battle", action: "attack" });
  assert.ok(r.state.loot);
  r.do({ type: "return" });
  return r;
}
test("same seed reproduces 100 NPCs; player sex/appearance do not replace fixed NPC identities", () => {
  const a = createWorld(12345, profile, "a");
  const b = createWorld(12345, { ...profile, sex: "male", name: "顾长宁" }, "b");
  assert.deepEqual(a.npcs, b.npcs);
  assert.equal(a.npcs.length, 100);
  assert.ok(a.npcs.slice(40).every((npc) => npc.sex === "female"));
  assert.notDeepEqual(a.npcs, createWorld(42, profile, "c").npcs);
  assert.equal(b.player.name, "顾长宁");
  assert.equal(b.player.sex, "male");
  assert.notEqual(b.player.id, PACK.roles.primary);
});
test("the expanded roster preserves the original forty and gives sixty adult women stable identities across seeds", () => {
  const first = createWorld(12345, profile, "expanded");
  const portraits = first.npcs.slice(40).map(npcSubject);
  assert.equal(new Set(first.npcs.slice(40).map((a) => a.name)).size, 60);
  for (const seed of [0, 42, 12345, 98765, 4294967295]) {
    const world = createWorld(seed, profile, "expanded");
    assert.deepEqual(world.npcs.slice(0, 40), createWorld(seed, profile, "legacy", 40).npcs);
    assert.deepEqual(world.npcs.slice(40).map(npcSubject), portraits);
    for (const npc of world.npcs.slice(40)) {
      assert.equal(npc.sex, "female");
      assert.equal(npc.npcTemplateId, npc.id);
      assert.ok(npc.ageDays >= 22 * 360);
      assert.ok(npc.physique!.apparentAge >= 22);
      assert.ok(npcProfile(npc).background);
    }
  }
  assert.notDeepEqual(
    first.npcs.slice(40).map((a) => [a.aptitude, a.realm, a.location]),
    createWorld(42, profile, "other")
      .npcs.slice(40)
      .map((a) => [a.aptitude, a.realm, a.location]),
  );
});
test("expanded NPC templates cannot replace the player or another saved actor", () => {
  const world = createWorld(12345, profile, "identity");
  for (const mutate of [
    (w: any) => (w.player.npcTemplateId = "NPC_0041"),
    (w: any) => (w.npcs[40].npcTemplateId = "NPC_0042"),
    (w: any) => (w.npcs[40].sex = "male"),
    (w: any) => (w.npcs[40].name = "冒名角色"),
  ]) {
    const invalid = structuredClone(world);
    mutate(invalid);
    assert.throws(() => validateWorld(invalid), /模板与存档身份/);
  }
});
test("rejected command preserves RNG, resources, revision and all source data", () => {
  const r = new Run();
  const before = JSON.stringify(r.state);
  assert.throws(() => r.do({ type: "travel", to: "ruins" }));
  assert.equal(JSON.stringify(r.state), before);
});
test("duplicate command does not repeat time or rewards", () => {
  const r = new Run();
  const first = applyCommand(r.state, { type: "work" }, "same", 0);
  const again = applyCommand(first, { type: "work" }, "same", 0);
  assert.equal(first, again);
  assert.equal(again.day, 1);
  assert.equal(again.player.stones, 12);
  assert.throws(() => applyCommand(first, { type: "work" }, "new", 0));
});
test("looking at a story is inert; learning has one shared acquisition rule", () => {
  const r = new Run();
  const before = JSON.stringify(r.state);
  scene(r.state);
  scene(r.state);
  assert.equal(JSON.stringify(r.state), before);
  r.choose();
  r.choose();
  assert.ok(r.state.player.manual);
  r.do({ type: "travel", to: "inn" });
  assert.throws(() => r.do({ type: "learn" }));
});
test("manual fallback works even when the story NPC has died", () => {
  const r = new Run();
  r.state.npcs[0].alive = false;
  r.state.npcs[0].hp = 0;
  r.do({ type: "travel", to: "inn" });
  r.do({ type: "learn" });
  assert.ok(r.state.player.manual);
});
test("chunked and daily training yield the same actors, RNG and relationship state", () => {
  const a = new Run(),
    b = new Run();
  for (const r of [a, b]) {
    r.do({ type: "travel", to: "inn" });
    r.do({ type: "learn" });
  }
  a.do({ type: "train", days: 30, stoneMethod: false });
  a.finish();
  for (let i = 0; i < 30; i++) {
    b.do({ type: "train", days: 1, stoneMethod: false });
    b.finish();
  }
  assert.deepEqual(a.state.player, b.state.player);
  assert.deepEqual(a.state.npcs, b.state.npcs);
  assert.deepEqual(a.state.rng, b.state.rng);
  assert.deepEqual(a.state.relations, b.state.relations);
  assert.equal(simulationFingerprint(a.state), simulationFingerprint(b.state));
});
test("breakthrough can fail and never kills the player", () => {
  let failures = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const r = new Run(seed);
    Object.assign(r.state.player, { realm: 9, xp: 480, hp: 170, manual: true });
    r.do({ type: "breakthrough", usePill: false, guardian: false });
    r.finish();
    if (r.state.player.realm < 10) {
      failures++;
      assert.ok(r.state.player.alive);
      assert.ok(r.state.player.hp > 0);
      assert.ok(r.state.player.xp < 480);
    }
  }
  assert.ok(failures > 0);
});
test("player minor realms wait for a manual, zero-day advancement", () => {
  const r = new Run();
  Object.assign(r.state.player, { realm: 1, xp: 39, hp: 50, manual: true });
  r.do({ type: "train", days: 1, stoneMethod: false });
  r.finish();
  assert.equal(r.state.player.realm, 1);
  const xp = r.state.player.xp,
    day = r.state.day;
  r.do({ type: "advanceMinor" });
  assert.equal(r.state.day, day);
  assert.equal(r.state.player.realm, 2);
  assert.equal(r.state.player.xp, xp - 40);
  assert.equal(r.state.player.hp, 60);
});
test("full story: agreement, 3-person combat, honor, memory and reunion", () => {
  const r = prepare();
  const before = r.state.player.stones;
  r.do({ type: "settle", honor: true, confirm: true });
  assert.equal(r.state.player.stones, before + 12);
  assert.equal(r.state.story.outcome, "fulfilled");
  assert.equal(scene(r.state)?.id, "old-friend");
  assert.equal(r.state.player.grass, 0);
  const rel = relation(r.state, PACK.roles.primary)!;
  assert.ok(rel.trust >= 15);
  assert.ok(
    rel.memories.some((id) => r.state.events.find((e) => e.id === id)?.kind === "promiseFulfilled"),
  );
  const saved = JSON.stringify(r.state);
  const loaded = JSON.parse(saved);
  validateWorld(loaded);
  assert.deepEqual(loaded, r.state);
  assert.throws(() => r.do({ type: "settle", honor: true, confirm: true }));
  r.wait(3);
  for (let i = 0; i < 6 && r.state.npcs[0].location !== "market"; i++) r.wait();
  assert.equal(scene(r.state)?.id, "reunion-honor");
  r.choose();
  assert.ok(r.state.story.flags.reunion);
  assert.equal(scene(r.state)?.id, "old-friend");
  const completed = structuredClone(r.state);
  for (let i = 0; i < 3; i++) scene(r.state);
  assert.deepEqual(r.state, completed);
  assert.throws(() => r.do({ type: "choose", nodeId: "agreement", choiceId: "accept" }));
  assert.deepEqual(r.state, completed);
  r.do({ type: "travel", to: "inn" });
  r.do({ type: "travel", to: "market" });
  assert.notEqual(scene(r.state)?.id, "agreement");
  assert.notEqual(scene(JSON.parse(JSON.stringify(r.state)))?.id, "agreement");
});
test("renewal is explicit, immediate, idempotent and preserves the previous settlement", () => {
  const r = prepare();
  r.do({ type: "settle", honor: true, confirm: true });
  const before = structuredClone(r.state);
  const command = { type: "renewAgreement" } as const;
  const next = applyCommand(before, command, "renewal", before.revision);
  assert.equal(next.agreement?.status, "accepted");
  assert.notEqual(next.agreement?.id, before.agreement?.id);
  assert.deepEqual(next.story, before.story);
  assert.deepEqual(next.events.slice(0, before.events.length), before.events);
  assert.equal(next.events.at(-1)?.kind, "agreement");
  assert.deepEqual(next.relations, before.relations);
  assert.deepEqual(next.player, before.player);
  assert.deepEqual(next.npcs, before.npcs);
  assert.equal(next.day, before.day);
  assert.deepEqual(next.rng, before.rng);
  assert.equal(applyCommand(next, command, "renewal", before.revision), next);
  assert.throws(() => applyCommand(next, command, "renewal-duplicate", next.revision));
});
test("cancelled invitations stay completed and can be renewed without replaying the first scene", () => {
  const r = new Run();
  assert.throws(() => r.do({ type: "renewAgreement" }), /初次/);
  for (let i = 0; i < 4; i++) r.choose();
  r.do({ type: "disband" });
  assert.equal(scene(r.state)?.id, "old-friend");
  assert.throws(() => r.do({ type: "choose", nodeId: "agreement", choiceId: "accept" }));
  r.do({ type: "renewAgreement" });
  assert.equal(r.state.agreement?.status, "accepted");
});
test("renewal rejects unresolved loot, breach, absent or busy companions and other locations", () => {
  const r = prepare();
  assert.throws(() => r.do({ type: "renewAgreement" }), /现有约定/);
  r.do({ type: "settle", honor: false, confirm: true });
  assert.throws(() => r.do({ type: "renewAgreement" }), /不愿/);
  r.do({ type: "compensate" });
  for (const change of [
    (w: World) => (w.player.location = "inn"),
    (w: World) => (w.npcs[1].location = "gate"),
    (w: World) => (w.npcs[1].attempt = { remaining: 2, chance: 9500 }),
    (w: World) => (w.npcs[1].alive = false),
  ]) {
    const unavailable = structuredClone(r.state);
    change(unavailable);
    const snapshot = structuredClone(unavailable);
    assert.throws(() =>
      applyCommand(unavailable, { type: "renewAgreement" }, "unavailable", unavailable.revision),
    );
    assert.deepEqual(unavailable, snapshot);
  }
  r.do({ type: "renewAgreement" });
  assert.equal(r.state.agreement?.strict, true);
  assert.equal(r.state.story.outcome, "breached");
});
test("breach requires explicit confirmation; compensation retains the original memory", () => {
  const r = prepare();
  const saved = JSON.stringify(r.state);
  assert.throws(() => r.do({ type: "settle", honor: false, confirm: false }));
  assert.equal(JSON.stringify(r.state), saved);
  r.do({ type: "settle", honor: false, confirm: true });
  assert.equal(r.state.story.outcome, "breached");
  assert.equal(canInvite(r.state), false);
  r.do({ type: "compensate" });
  assert.ok(canInvite(r.state));
  assert.equal(r.state.story.outcome, "breached");
  assert.ok(r.state.events.some((e) => e.kind === "promiseBreached"));
  assert.throws(() => r.do({ type: "compensate" }));
});
test("dead NPC cannot move, cultivate, or participate on subsequent days", () => {
  const r = new Run();
  const npc = r.state.npcs[5];
  npc.alive = false;
  npc.hp = 0;
  const previous = structuredClone(npc);
  r.wait(7);
  assert.deepEqual(r.state.npcs[5], previous);
});
test("day-15 missing companions can reliably gather without interrupting a breakthrough", () => {
  const r = new Run(4);
  for (let i = 0; i < 4; i++) r.choose();
  r.do({ type: "train", days: 7, stoneMethod: false });
  r.finish();
  r.do({ type: "breakthrough", usePill: false, guardian: false });
  r.finish();
  r.wait(3);
  r.wait(3);
  assert.equal(r.state.day, 14);
  // Availability must be a deliberate fixture, independent of evolving NPC RNG choices.
  r.state.npcs[1].location = "gate";
  assert.equal(partyReadiness(r.state).ready, false);
  const originalDay = r.state.day;
  for (let i = 0; i < 4 && !partyReadiness(r.state).ready; i++) r.do({ type: "rally" });
  assert.equal(partyReadiness(r.state).ready, true);
  assert.ok(r.state.day - originalDay <= 3);
  r.do({ type: "formParty" });
  assert.equal(r.state.party.length, 3);
});
test("rendezvous waits for an ongoing attempt and keeps the arrived companion available", () => {
  const r = new Run();
  for (let i = 0; i < 4; i++) r.choose();
  Object.assign(r.state.player, { realm: 1, hp: 50 });
  r.state.npcs[0].location = "inn";
  r.state.npcs[0].attempt = { remaining: 2, chance: 9500 };
  r.state.npcs[1].location = "gate";
  r.do({ type: "rally" });
  assert.equal(r.state.npcs[0].attempt?.remaining, 1);
  assert.equal(r.state.npcs[0].location, "inn");
  assert.equal(r.state.npcs[1].location, "market");
  r.do({ type: "rally" });
  assert.equal(r.state.npcs[0].attempt, null);
  assert.equal(r.state.npcs[1].location, "market");
  r.do({ type: "rally" });
  assert.equal(partyReadiness(r.state).ready, true);
});
test("a later breach overrides the latest response while preserving earlier fulfilled memories", () => {
  const r = prepare();
  r.do({ type: "settle", honor: true, confirm: true });
  r.do({ type: "renewAgreement" });
  while (!partyReadiness(r.state).ready) r.do({ type: "rally" });
  r.do({ type: "formParty" });
  r.do({ type: "travel", to: "gate" });
  while (!departureStatus(r.state).ready) r.wait();
  r.do({ type: "expedition" });
  while (r.state.battle) r.do({ type: "battle", action: "attack" });
  r.do({ type: "return" });
  r.do({ type: "settle", honor: false, confirm: true });
  assert.equal(r.state.story.outcome, "breached");
  assert.equal(canInvite(r.state), false);
  assert.ok(r.state.events.some((e) => e.kind === "promiseFulfilled"));
  assert.ok(r.state.events.some((e) => e.kind === "promiseBreached"));
  r.wait(3);
  for (let i = 0; i < 10 && r.state.npcs[0].location !== "market"; i++) r.wait();
  assert.equal(scene(r.state)?.id, "reunion-breach");
});
test("departure availability exposes the same cooldown and attempt restrictions as the command", () => {
  const r = prepare();
  r.do({ type: "settle", honor: true, confirm: true });
  r.do({ type: "renewAgreement" });
  r.do({ type: "formParty" });
  r.do({ type: "travel", to: "gate" });
  r.state.lastExpeditionDay = r.state.day - 2;
  assert.equal(departureStatus(r.state).remaining, 1);
  assert.equal(departureStatus(r.state).ready, false);
  assert.throws(() => r.do({ type: "expedition" }), /等候 1 日/);
  r.wait();
  assert.equal(departureStatus(r.state).ready, true);
});
test("player and NPC skills both skip exactly two own turns before becoming available", () => {
  const r = prepare();
  r.do({ type: "settle", honor: true, confirm: true });
  r.do({ type: "renewAgreement" });
  r.do({ type: "formParty" });
  r.do({ type: "travel", to: "gate" });
  r.do({ type: "expedition" });
  for (const e of r.state.battle!.enemies) {
    e.hp = 1000;
    e.maxHp = 1000;
    e.attack = 1;
  }
  r.do({ type: "battle", action: "skill" });
  assert.ok(r.state.battle!.allies.every((a) => a.cooldown === 2));
  r.do({ type: "battle", action: "attack" });
  assert.ok(r.state.battle!.allies.every((a) => a.cooldown === 1));
  r.do({ type: "battle", action: "attack" });
  assert.ok(r.state.battle!.allies.every((a) => a.cooldown === 0));
  r.do({ type: "battle", action: "skill" });
  assert.ok(r.state.battle!.allies.every((a) => a.cooldown === 2));
});
test("malformed saves are rejected while the existing released profile shape remains valid", () => {
  const r = new Run();
  assert.doesNotThrow(() => validateWorld(r.state));
  for (const mutate of [
    (w: any) => (w.profile = null),
    (w: any) => (w.profile.artifact = "invalid"),
    (w: any) => (w.story.flags = null),
    (w: any) => (w.profile.appearance.face = 99),
    (w: any) => (w.agreement = { status: "accepted" }),
  ]) {
    const bad = structuredClone(r.state);
    mutate(bad);
    assert.throws(() => validateWorld(bad));
  }
  assert.doesNotThrow(() => validateWorld(r.state));
});
test("same revision on a different character cannot authorize a stale action, replacement or export", () => {
  const a = createWorld(12345, profile, "first");
  const b = createWorld(12345, profile, "second");
  assert.throws(
    () => assertSaveExpectation(b, { saveId: a.saveId, revision: a.revision }),
    /切换角色/,
  );
  assert.doesNotThrow(() => assertSaveExpectation(a, { saveId: a.saveId, revision: a.revision }));
  assert.throws(() =>
    assertSaveExpectation(applyCommand(a, { type: "work" }, "changed", 0), {
      saveId: a.saveId,
      revision: 0,
    }),
  );
  assert.doesNotThrow(() => assertSaveExpectation(null, { saveId: null, revision: null }));
});
test("NPC portrait identities are distinct and legacy thumbnails remain deterministic without world RNG", () => {
  const w = createWorld(12345, profile, "portraits");
  const before = structuredClone(w);
  const portraits = w.npcs.map((a) => JSON.stringify(npcSubject(a)));
  assert.equal(new Set(portraits).size, 100);
  assert.deepEqual(w, before);
  for (const a of w.npcs) {
    assert.ok(npcProfile(a).background);
    assert.deepEqual(npcPortrait(w, a), npcPortrait(structuredClone(w), a));
  }
});
test("portrait identity survives elapsed time and an NPC death; rendezvous can be cancelled", () => {
  const r = new Run();
  const before = r.state.npcs.map((a) => npcPortrait(r.state, a));
  r.wait(7);
  assert.deepEqual(
    r.state.npcs.map((a) => npcPortrait(r.state, a)),
    before,
  );
  const dead = r.state.npcs[5];
  dead.alive = false;
  dead.hp = 0;
  r.state.events.push({
    id: "death-portrait-test",
    day: r.state.day,
    kind: "death",
    actors: [dead.id],
    text: "寿元已尽。",
    public: false,
  });
  r.wait(7);
  assert.deepEqual(
    r.state.npcs.map((a) => npcPortrait(r.state, a)),
    before,
  );
  const gathering = new Run();
  for (let i = 0; i < 4; i++) gathering.choose();
  Object.assign(gathering.state.player, { realm: 1, hp: 50 });
  gathering.do({ type: "rally" });
  gathering.do({ type: "disband" });
  assert.equal(gathering.state.agreement?.status, "cancelled");
  assert.deepEqual(gathering.state.party, ["PLAYER"]);
});

test("knowledge distinguishes private participants, local witnesses and sourced conversation", () => {
  const r = new Run();
  const [a, b, uninformed] = r.state.npcs;
  a.location = b.location = "inn";
  r.state.player.location = "market";
  uninformed.location = "gate";
  const privateId = recordFact(r.state, "secret", "一条未公开的线索。", [a.id]);
  const seenId = recordFact(r.state, "breakthrough", "客栈中气机一振。", [a.id]);
  assert.ok(!knownEvents(r.state, b.id).some((e) => e.id === privateId));
  assert.ok(knownEvents(r.state, b.id).some((e) => e.id === seenId));
  assert.ok(!knownEvents(r.state, uninformed.id).some((e) => e.id === seenId));
  assert.ok(!knownEvents(r.state).some((e) => [privateId, seenId].includes(e.id)));
  r.state.player.location = "inn";
  tellOwnRecentFacts(r.state, a.id);
  assert.equal(
    [...knowledgeEntries(r.state)].find((m) => m.eventId === privateId && m.knower === "PLAYER")
      ?.sourceActor,
    a.id,
  );
  const before = JSON.stringify(r.state);
  tellOwnRecentFacts(r.state, a.id);
  assert.equal(JSON.stringify(r.state), before);
  validateWorld(r.state);
});
test("directed relationships need distinct evidence for close friendship; grievance is explicit", () => {
  const r = new Run();
  r.choose();
  const forward = relation(r.state, PACK.roles.primary)!;
  const reverse = r.state.relations.find(
    (x) => x.from === "PLAYER" && x.to === PACK.roles.primary,
  )!;
  const before = structuredClone(reverse);
  forward.favor = 100;
  forward.trust = 100;
  forward.memories = [];
  assert.notEqual(relationshipLabel(forward), "挚友");
  forward.memories = ["a", "b", "c"];
  assert.equal(relationshipLabel(forward), "挚友");
  forward.grievance = true;
  assert.equal(relationshipLabel(forward), "仇怨未解");
  assert.deepEqual(reverse, before);
});
test("a deceased recipient produces once-only exception settlement without false betrayal", () => {
  const r = prepare();
  const a = r.state.npcs[0];
  const favor = relation(r.state, a.id)!.favor;
  a.ageDays = B.world.npcLifespanDays[REALM_KEYS[a.realm]] - 1;
  r.wait();
  assert.equal(a.alive, true); // source candidate was not mutated
  assert.equal(r.state.npcs[0].alive, false);
  assert.equal(r.state.agreement?.status, "impossible");
  const stones = r.state.player.stones;
  r.do({ type: "resolveAgreement" });
  assert.equal(r.state.player.stones, stones + 12);
  assert.equal(r.state.player.grass, 1);
  assert.equal(relation(r.state, a.id)!.favor, favor);
  assert.ok(!r.state.events.some((e) => e.kind === "promiseBreached"));
  assert.throws(() => r.do({ type: "resolveAgreement" }));
  validateWorld(r.state);
});
test("enabled NPC conflict shares damage rules and cancels a killed actor action", () => {
  const r = new Run();
  r.state.simulationOptions.backgroundConflicts = true;
  const sorted = [...r.state.npcs].sort((a, b) => a.id.localeCompare(b.id));
  const a = sorted[0],
    b = sorted[1];
  Object.assign(a, { realm: 10, hp: 120, manual: true, location: "inn" });
  Object.assign(b, { realm: 0, xp: 0, hp: 1, manual: false, location: "inn" });
  r.state.relations.push({
    from: a.id,
    to: b.id,
    favor: -100,
    trust: 0,
    attraction: 0,
    known: true,
    memories: [],
  });
  r.wait();
  const dead = r.state.npcs.find((n) => n.id === b.id)!;
  assert.equal(dead.alive, false);
  assert.equal(dead.manual, false);
  const snapshot = structuredClone(dead);
  r.wait(3);
  assert.deepEqual(
    r.state.npcs.find((n) => n.id === b.id),
    snapshot,
  );
  assert.ok(r.state.events.some((e) => e.kind === "conflict"));
  assert.equal(combatDamage(20, 3, true, true), 13);
});
test("lethal complex encounter ends life, simple mode rescues, teaching defeat is nonlethal", () => {
  for (const [mode, lethal, ends] of [
    ["complex", true, true],
    ["simple", true, false],
    ["complex", false, false],
  ] as const) {
    const r = prepare();
    r.do({ type: "settle", honor: true, confirm: true });
    r.do({ type: "renewAgreement" });
    r.do({ type: "formParty" });
    r.do({ type: "travel", to: "gate" });
    r.do({ type: "expedition" });
    r.state.profile.mode = mode;
    r.state.battle!.lethal = lethal;
    for (const a of r.state.battle!.allies) a.hp = 1;
    for (const e of r.state.battle!.enemies) {
      e.attack = 1000;
      e.speed = 1000;
    }
    while (r.state.battle) r.do({ type: "battle", action: "attack" });
    assert.equal(r.state.ended, ends);
    assert.equal(r.state.player.alive, !ends);
    assert.equal(r.state.battle, null);
    if (ends) assert.throws(() => r.do({ type: "work" }));
    validateWorld(r.state);
  }
});
test("complex lifespan death stops work rewards and remains exportable", () => {
  const r = new Run();
  r.state.profile.mode = "complex";
  r.state.player.ageDays = B.world.npcLifespanDays.MORTAL - 1;
  const stones = r.state.player.stones;
  r.do({ type: "work" });
  assert.equal(r.state.ended, true);
  assert.equal(r.state.player.stones, stones);
  assert.equal(r.state.player.hp, 0);
  validateWorld(r.state);
});
test("paid training resumes exact checkpoints and never double-charges a retried day", () => {
  const r = new Run();
  r.state.player.manual = true;
  r.state.player.stones = 50;
  r.do({ type: "train", days: 7, stoneMethod: true });
  r.do({ type: "step" });
  r.do({ type: "step" });
  r.do({ type: "step" });
  assert.equal(r.state.longAction!.checkpoint, 3);
  assert.equal(r.state.longAction!.paidStones, 3);
  const copy = JSON.parse(JSON.stringify(r.state));
  const next = applyCommand(copy, { type: "step" }, "checkpoint-retry", copy.revision);
  assert.equal(applyCommand(next, { type: "step" }, "checkpoint-retry", copy.revision), next);
  r.state = next;
  r.do({ type: "stop" });
  assert.equal(r.state.player.stones, 46);
  assert.equal(r.state.day, 4);
});

test("daily lifespan deaths resolve before another NPC can start a conflict", () => {
  const r = new Run();
  r.state.simulationOptions.backgroundConflicts = true;
  const sorted = [...r.state.npcs].sort((a, b) => a.id.localeCompare(b.id));
  const [a, b] = sorted;
  a.location = b.location = "inn";
  b.ageDays = B.world.npcLifespanDays[REALM_KEYS[b.realm]] - 1;
  r.state.relations.push({
    from: a.id,
    to: b.id,
    favor: -100,
    trust: 0,
    attraction: 0,
    known: true,
    memories: [],
  });
  r.wait();
  assert.equal(r.state.npcs.find((n) => n.id === b.id)!.alive, false);
  assert.ok(!r.state.events.some((e) => e.kind === "conflict" && e.actors.includes(b.id)));
  validateWorld(r.state);
});

test("player and NPC resolve the same ordinary failure, severe failure and success from the same inputs", () => {
  const secondDraw = (seed: number) => {
    let x = seed;
    for (let i = 0; i < 2; i++) {
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
    }
    return x % 10000;
  };
  for (const result of ["ordinary", "severe", "success"]) {
    const seed = Array.from({ length: 1000 }, (_, i) => i + 1).find(
      (seed) => secondDraw(seed) < 1000 === (result === "severe"),
    )!;
    const outcomes = [];
    for (const control of ["player", "npc"]) {
      const r = new Run();
      r.state.profile.artifact = "ward";
      for (const a of r.state.npcs) {
        a.alive = false;
        a.hp = 0;
      }
      const person = control === "player" ? r.state.player : r.state.npcs[0];
      Object.assign(person, {
        realm: 6,
        xp: 240,
        hp: 115,
        manual: true,
        alive: true,
        ageDays: 18 * 360,
        aptitude: 75,
        readyDay: 0,
      });
      r.state.rng.simulation = seed;
      const chance = result === "success" ? 10000 : 0;
      r.state.longAction = {
        id: "fixture:attempt",
        checkpoint: 0,
        paidStones: 0,
        kind: control === "player" ? "breakthrough" : "wait",
        total: 1,
        remaining: 1,
        stoneMethod: false,
        chance,
        guardian: null,
      };
      if (control === "npc") person.attempt = { remaining: 1, chance };
      r.do({ type: "step" });
      const a = control === "player" ? r.state.player : r.state.npcs[0];
      outcomes.push({ realm: a.realm, xp: a.xp, hp: a.hp, alive: a.alive, readyDay: a.readyDay });
      assert.equal(a.realm, result === "success" ? 7 : result === "severe" ? 5 : 6);
      assert.equal(a.alive, true);
      assert.ok(a.hp > 0);
      assert.equal(a.xp, result === "ordinary" ? 192 : 0);
    }
    assert.deepEqual(outcomes[0], outcomes[1]);
  }
});

test("xorshift golden vectors, object-key permutations and one hundred rerolls preserve the seed contract", () => {
  let x = 1;
  for (const expected of [270369, 67634689, 2647435461, 307599695, 2398689233]) {
    x = nextRandom(x);
    assert.equal(x, expected);
  }
  const w = createWorld(12345, profile, "permutation");
  const reordered = Object.fromEntries(Object.entries(w).reverse()) as World;
  assert.equal(canonicalJson(w), canonicalJson(reordered));
  assert.equal(simulationFingerprint(w), simulationFingerprint(reordered));
  assert.deepEqual(
    applyCommand(w, { type: "work" }, "stable", 0),
    applyCommand(reordered, { type: "work" }, "stable", 0),
  );
  for (let roll = 0; roll < 100; roll++) {
    const aptitude = rollAptitude(12345, roll);
    assert.ok(aptitude >= 1 && aptitude <= 100);
    assert.deepEqual(createWorld(12345, { ...profile, aptitude }, "reroll").npcs, w.npcs);
  }
});

test("schema four knowledge migration preserves provenance and bounded receipts retain old-ID protection", async () => {
  const { migrateSave } = await import("../../lib/game/migrations");
  let world = createWorld(42, profile, "compact-migration");
  for (let i = 0; i < 140; i++)
    world = answerDaily(applyCommand(world, { type: "work" }, `work-${i}`, world.revision));
  assert.equal(Object.keys(world.commandReceipts).length, B.limits.recentCommandReceipts);
  assert.equal(world.receiptHistory.count, world.revision - B.limits.recentCommandReceipts);
  assert.notEqual(world.receiptHistory.hash, "0".repeat(64));
  assert.equal(applyCommand(world, { type: "work" }, "work-139", 0), world);
  assert.throws(
    () => applyCommand(world, { type: "work" }, "work-0", 0),
    (e: unknown) => !!e && typeof e === "object" && "code" in e && e.code === "COMMAND_ID_REUSE",
  );
  const evidence = [...knowledgeEntries(world)];
  const legacy = { ...structuredClone(world), schemaVersion: 4, knowledge: evidence };
  const before = JSON.stringify(legacy);
  const { world: migrated, migrated: changed } = migrateSave(legacy);
  assert.equal(changed, true);
  assert.deepEqual([...knowledgeEntries(migrated)], evidence);
  assert.deepEqual(migrated.rng, world.rng);
  assert.equal(migrated.day, world.day);
  assert.equal(JSON.stringify(legacy), before);
  const corrupt = structuredClone(migrated);
  corrupt.knowledge[corrupt.events[0].id][0][0] = 999;
  assert.throws(() => validateWorld(corrupt));
});

test("shared-event trends record actual relationship changes and do not claim increases at the cap", async () => {
  const { memory } = await import("../../lib/game/relationships");
  const world = createWorld(42, profile, "trend-test");
  memory(world, PACK.roles.primary, "sharedVictory", "并肩取胜。");
  assert.deepEqual(world.events.at(-1)?.relationshipChange, { favor: 8, trust: 6 });
  const edge = relation(world, PACK.roles.primary)!;
  edge.favor = 100;
  edge.trust = 100;
  memory(world, PACK.roles.primary, "sharedVictory", "再次并肩取胜。");
  assert.deepEqual(world.events.at(-1)?.relationshipChange, { favor: 0, trust: 0 });
  validateWorld(world);
});

test("character inspection uses shared combat attributes, live battle HP and preserved death state without writing the world", async () => {
  const { characterVitals } = await import("../../lib/game/character-sheet");
  const { fighter } = await import("../../lib/game/combat");
  const w = createWorld(12345, profile, "sheet-test");
  const before = structuredClone(w);
  for (const a of [w.player, ...w.npcs]) {
    const sheet = characterVitals(w, a.id)!;
    assert.equal(sheet.hp, a.hp);
    for (const key of ["maxHp", "attack", "defense", "speed"] as const)
      assert.equal(sheet[key], stats(a)[key]);
  }
  assert.deepEqual(w, before);
  const actor = w.npcs[0];
  const ally = fighter(actor);
  ally.hp = 3;
  w.battle = {
    id: "sheet-battle",
    round: 1,
    allies: [ally],
    enemies: [],
    logs: [],
    auto: false,
    lethal: false,
  };
  assert.equal(characterVitals(w, actor.id)!.hp, 3);
  assert.equal(actor.hp, before.npcs[0].hp);
  w.battle = null;
  actor.alive = false;
  actor.hp = 0;
  assert.equal(characterVitals(w, actor.id)!.state, "已逝");
  assert.equal(characterVitals(w, actor.id)!.hp, 0);
});

test("profiles show the subject's own history without changing world knowledge or relationship directions", async () => {
  const { characterRelations, characterHistory } = await import("../../lib/game/character-sheet");
  const w = createWorld(12345, profile, "sheet-knowledge");
  const [a, b, c] = w.npcs;
  w.relations = [
    { from: a.id, to: b.id, favor: 52, trust: -20, attraction: 8, known: true, memories: [] },
    { from: b.id, to: a.id, favor: 3, trust: 40, attraction: 0, known: true, memories: [] },
    { from: c.id, to: a.id, favor: 7, trust: 2, attraction: 0, known: true, memories: [] },
  ];
  const secret = recordFact(w, "private-test", "未告知玩家的秘密", [a.id, b.id]);
  const shared = recordFact(w, "shared-test", "玩家亲见", ["PLAYER", a.id]);
  const witnessed = recordFact(w, "public-test", "旁观的他人经历", [c.id], true);
  assert.ok(knownEvents(w, a.id).some((e) => e.id === witnessed));
  const before = structuredClone(w);
  const peers = characterRelations(w, a.id);
  assert.equal(peers.find((r) => r.peer.id === b.id)!.outgoing!.favor, 52);
  assert.equal(peers.find((r) => r.peer.id === b.id)!.incoming!.favor, 3);
  assert.equal(peers.find((r) => r.peer.id === c.id)!.outgoing, undefined);
  assert.equal(
    characterHistory(w, a.id).some((e) => e.id === secret),
    true,
  );
  assert.equal(
    characterHistory(w, a.id).some((e) => e.id === shared),
    true,
  );
  assert.equal(
    characterHistory(w, "PLAYER").some((e) => e.id === shared),
    true,
  );
  assert.equal(
    characterHistory(w, "PLAYER").some((e) => e.id === secret),
    false,
  );
  assert.equal(
    characterHistory(w, a.id).some((e) => e.id === witnessed),
    false,
  );
  assert.equal(
    knownEvents(w).some((e) => e.id === secret),
    false,
  );
  assert.deepEqual(characterHistory(w, "absent"), []);
  assert.deepEqual(w, before);
  const summary = w.events.find((e) => e.id === secret)!;
  summary.lastDay = w.day + 2;
  summary.count = 3;
  assert.equal(characterHistory(w, a.id)[0].id, secret);
});
