import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, applyCommand, validateWorld, relationshipLabel } from "../../lib/game/engine";
import { advanceDay } from "../../lib/game/daily-simulation";
import { npcSeekSect, npcSocialize } from "../../lib/game/npc-life";
import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";
import { characterHistory, characterVitals } from "../../lib/game/character-sheet";
import { knownEvents, tellOwnRecentFacts, recordFact } from "../../lib/game/knowledge";
import { knownNpcUpdates } from "../../lib/game/story";
import { sectAdmissionReason } from "../../lib/game/sects";
import { companyReason } from "../../lib/game/intimacy";
import { advanceStopReason } from "../../lib/game/advance";
import { migrateSave } from "../../lib/game/migrations";
import { hashSeed } from "../../lib/game/rng";
import { B, stats } from "../../lib/game/rules";
import type { Actor, World } from "../../lib/game/types";
const profile = {
  name: "观世",
  sex: "female" as const,
  aptitude: 75,
  artifact: "focus" as const,
  mode: "simple" as const,
  appearance: { face: 0, hair: 0, color: 0 },
};
const world = (seed = 12345) =>
  createWorld(seed, profile, "npc-life-test", 100, { contentLocks: CAMPAIGN_LOCKS });
function pair() {
  const w = world();
  w.rulesVersion = "0.1.6";
  const [a, b] = w.npcs;
  a.location = b.location = "inn";
  w.player.location = "market";
  w.relations = [];
  const occupied = new Set(["PLAYER", ...w.npcs.slice(2).map((p) => p.id)]);
  return { w, a, b, occupied };
}
function contact(w: World, a: Actor, occupied: Set<string>) {
  advanceDay(w, new Set(w.npcs.map((p) => p.id)));
  for (const p of w.npcs) p.lastActionDay = w.day - 1;
  assert.equal(npcSocialize(w, a, occupied), true);
}
function seeker(w: World) {
  const a = w.npcs
    .slice(2, 40)
    .find(
      (p) => hashSeed(p.appearanceSeed, "sect-path") % 100 < B.world.npcLife.sectInterestPercent,
    )!;
  Object.assign(a, { realm: 1, manual: true, xp: 0, sect: "散修", personality: "爽直", hp: 50 });
  a.location = "market";
  return a;
}

test("repeated NPC contact builds both directions, records one friendship and never pairs the player", () => {
  const { w, a, b, occupied } = pair();
  const player = structuredClone(w.player);
  for (let i = 0; i < 25; i++) contact(w, a, occupied);
  assert.equal(w.relations.length, 2);
  assert.ok(w.relations.every((r) => relationshipLabel(r) === "朋友" && r.attraction === 0));
  const friends = w.events.filter((e) => e.kind === "npc-friendship");
  assert.equal(friends.length, 1);
  assert.deepEqual(new Set(friends[0].actors), new Set([a.id, b.id]));
  assert.equal(w.events.filter((e) => e.kind === "npc-meet").length, 1);
  assert.equal(w.events.filter((e) => e.kind === "social").length, 2);
  assert.equal(w.player.stones, player.stones);
  assert.equal(w.player.xp, player.xp);
  assert.equal(b.lastActionDay, w.day);
  validateWorld(w);
});

test("busy, absent, deceased and hostile targets cannot consume another NPC action", () => {
  for (const block of [
    "occupied",
    "alreadyActed",
    "attempt",
    "absent",
    "dead",
    "party",
    "grievance",
  ] as const) {
    const { w, a, b, occupied } = pair();
    w.day = 1;
    if (block === "occupied") occupied.add(b.id);
    if (block === "alreadyActed") b.lastActionDay = w.day;
    if (block === "attempt") b.attempt = { remaining: 2, chance: 8000 };
    if (block === "absent") b.location = "gate";
    if (block === "dead") b.alive = false;
    if (block === "party") w.party.push(b.id);
    if (block === "grievance")
      w.relations.push({
        from: b.id,
        to: a.id,
        favor: 0,
        trust: 0,
        attraction: 0,
        known: true,
        memories: [],
        grievance: true,
      });
    const before = structuredClone(w);
    assert.equal(npcSocialize(w, a, occupied), false, block);
    assert.deepEqual(w, before, block);
  }
});

test("friendship is witnessed locally or learned from a participant, never via profile inspection", () => {
  const { w, a, b, occupied } = pair();
  for (let i = 0; i < 5; i++) contact(w, a, occupied);
  const event = w.events.find((e) => e.kind === "npc-friendship")!;
  assert.ok(event);
  assert.ok(!knownEvents(w).some((e) => e.id === event.id));
  assert.equal(advanceStopReason(w, { kind: "importantEvent" }, w.day - 1), null);
  const before = structuredClone(w);
  assert.ok(characterHistory(w, a.id).includes(event));
  assert.ok(characterHistory(w, b.id).includes(event));
  assert.deepEqual(w, before);
  w.player.location = a.location;
  tellOwnRecentFacts(w, a.id);
  assert.ok(knownEvents(w).some((e) => e.id === event.id));
});

test("sect journeys cost real route days, suspend interaction and join only after arrival without spawning residents", () => {
  const w = world();
  const a = seeker(w);
  const identities = w.npcs.map((p) => [p.id, p.name, p.appearanceSeed]);
  const occupied = new Set(w.npcs.filter((p) => p !== a).map((p) => p.id));
  for (let i = 0; i < 20 && !a.npcJourney; i++) advanceDay(w, occupied);
  assert.ok(a.npcJourney);
  const origin = a.location;
  w.player.location = origin;
  const { total, startedDay, to } = a.npcJourney;
  const xp = a.xp,
    stones = a.stones;
  assert.equal(a.location, origin);
  assert.equal(
    w.events.findLast((e) => e.kind === "npc-depart" && e.actors.includes(a.id))?.location,
    origin,
  );
  assert.match(characterVitals(w, a.id)!.state, /赶路/);
  assert.ok(companyReason(w, w.player, a));
  assert.throws(() => applyCommand(w, { type: "meet", target: a.id }, "travel-meet", w.revision));
  assert.equal(advanceStopReason(w, { kind: "npcArrives", target: a.id }), null);
  while (a.npcJourney) {
    advanceDay(w, occupied);
    assert.equal(a.xp, xp);
    assert.equal(a.stones, stones);
    assert.equal(a.sectMembership, undefined);
    validateWorld(w);
  }
  assert.equal(w.day, startedDay + total - 1);
  assert.equal(a.location, to);
  advanceDay(w, occupied);
  assert.equal(a.sectMembership?.id, "quanzhen");
  assert.equal(a.sectMembership?.joinedDay, w.day);
  assert.equal(a.xp, xp);
  assert.deepEqual(
    w.npcs.map((p) => [p.id, p.name, p.appearanceSeed]),
    identities,
  );
  assert.equal(w.visitedSects, undefined);
  assert.equal(w.player.sectMembership, undefined);
  validateWorld(w);
  const joined = w.events.find((e) => e.kind === "sect-join" && e.actors.includes(a.id))!;
  assert.ok(joined && !joined.actors.includes("PLAYER"));
  assert.deepEqual(migrateSave(w).world, w);
});

test("existing affiliations and authored cast remain intact; admission shares adult and sect requirements", () => {
  const w = world(),
    a = seeker(w);
  w.rulesVersion = "0.1.6";
  a.location = "atlas.cangzhu";
  a.sex = "male";
  assert.ok(sectAdmissionReason(w, a, "yunv"));
  a.ageDays = 17 * B.world.daysPerYear;
  assert.ok(sectAdmissionReason(w, a, "quanzhen"));
  a.ageDays = 22 * B.world.daysPerYear;
  a.sect = "青岚宗";
  const before = structuredClone(w);
  assert.equal(npcSeekSect(w, a, new Set()), false);
  for (const p of [w.npcs[0], w.npcs[1], ...w.npcs.filter((p) => p.id.startsWith("shichai."))])
    assert.equal(npcSeekSect(w, p, new Set()), false);
  assert.deepEqual(w, before);
});

test("malformed journeys and incompatible older versions are rejected without repairing state", () => {
  const w = world(),
    a = seeker(w);
  const occupied = new Set(w.npcs.filter((p) => p !== a).map((p) => p.id));
  for (let i = 0; i < 20 && !a.npcJourney; i++) advanceDay(w, occupied);
  assert.ok(a.npcJourney);
  const index = w.npcs.indexOf(a);
  for (const change of [
    (v: World) => (v.rulesVersion = "0.1.5"),
    (v: World) => (v.npcs[index].npcJourney!.remaining = 999),
    (v: World) => (v.npcs[index].npcJourney!.startedDay = v.day + 1),
    (v: World) => (v.npcs[index].npcJourney!.total = 1.5),
    (v: World) => (v.npcs[index].npcJourney!.to = "ruins"),
    (v: World) => (v.player.npcJourney = { ...v.npcs[index].npcJourney! }),
  ]) {
    const copy = structuredClone(w);
    change(copy);
    assert.throws(() => migrateSave(copy));
  }
  const dead = structuredClone(w);
  dead.npcs[index].ageDays = B.world.npcLifespanDays.QI_1 - 1;
  advanceDay(dead, occupied);
  assert.equal(dead.npcs[index].alive, false);
  assert.equal(dead.npcs[index].npcJourney, undefined);
  validateWorld(dead);
});

test("known social milestones remain visible among cultivation updates", () => {
  const { w, a, b, occupied } = pair();
  w.player.location = "inn";
  w.relations.push({
    from: a.id,
    to: "PLAYER",
    favor: 0,
    trust: 0,
    attraction: 0,
    known: true,
    memories: [],
  });
  for (let i = 0; i < 5; i++) contact(w, a, occupied);
  for (let i = 0; i < 8; i++) recordFact(w, "advance", "修为增长。", [a.id]);
  assert.ok(knownNpcUpdates(w).some((e) => e.kind === "npc-friendship"));
  assert.equal(knownNpcUpdates(w).length, B.world.npcLife.newsLimit);
  assert.ok(advanceStopReason(w, { kind: "importantEvent" }, w.day - 1));
});

test("seeded NPC lives are deterministic, diverse and bounded over one year", () => {
  const samples: World[] = [];
  for (const seed of [1, 42, 12345]) {
    const w = world(seed);
    const original = structuredClone(w);
    const replay = structuredClone(w);
    for (let day = 0; day < B.world.daysPerYear; day++) {
      advanceDay(w);
      advanceDay(replay);
      if (day % 30 === 0) validateWorld(w);
    }
    validateWorld(w);
    assert.deepEqual(w, replay);
    assert.equal(w.npcs.length, original.npcs.length);
    assert.deepEqual(w.profile, original.profile);
    assert.equal(w.player.stones, original.player.stones);
    assert.equal(w.player.xp, original.player.xp);
    assert.equal(w.rng.combat, original.rng.combat);
    for (const kind of [
      "npc-meet",
      "npc-friendship",
      "npc-depart",
      "npc-arrive",
      "sect-join",
      "sect-task",
      "sect-art",
    ])
      assert.ok(
        w.events.some((e) => e.kind === kind),
        `${seed}: missing ${kind}`,
      );
    for (const a of w.npcs) {
      assert.ok(
        w.events.filter((e) => e.kind === "sect-task" && e.actors.includes(a.id)).length <= 1,
      );
      assert.ok(
        w.relations.filter((r) => r.from === a.id && r.to !== "PLAYER").length <=
          B.world.npcLife.newContactLimit + 2,
      );
    }
    samples.push(w);
  }
  assert.deepEqual(
    new Set(
      samples.flatMap((w) =>
        w.npcs.flatMap((a) => (a.sectMembership ? [a.sectMembership.id] : [])),
      ),
    ),
    new Set(["yunv", "hehuan", "quanzhen"]),
  );
});
