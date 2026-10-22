import { answerDaily } from "./daily-test-helpers";
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
  liaisonReason,
  bondPartner,
  companyReason,
  settleIntimacy,
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
    this.w = answerDaily(this.w);
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
  const night = r.w.events.at(-1)!;
  assert.equal(night.intimacy?.kind, "night");
  assert.match(night.text, /到达高潮/);
  assert.match(night.text, /这段经过只写在两人的生平里/);
  const young = structuredClone(r.w);
  young.player.ageDays = 20 * B.world.daysPerYear;
  const mild = settleIntimacy(
    young,
    young.player,
    young.npcs.find((n) => n.id === target)!,
    "night",
  );
  assert.match(mild, /这段亲密经历只记于两人的生平/);
  assert.equal(young.rng.simulation, r.w.rng.simulation);
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
  assert.ok(
    events
      .filter((e) => e.intimacy?.kind === "dual")
      .every((e) => e.text.includes("调和气机、互相照应")),
  );
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
test("secret affairs, discovered cheating and watched infidelity stay adult, private and consequential", () => {
  const config = B.relationships.companionship;
  const hehuan = new Run("male");
  hehuan.visit("hehuan");
  const yan = "SECT_HEHUAN_YAN";
  const rong = "SECT_HEHUAN_RONG";
  for (let i = 0; i < 120 && bondPartner(hehuan.w, yan)?.id !== rong; i++) {
    advanceDay(hehuan.w);
    hehuan.w = answerDaily(hehuan.w);
  }
  assert.equal(bondPartner(hehuan.w, yan)?.id, rong);
  hehuan.do({ type: "meet", target: yan });
  const affair: Command = {
    type: "liaison",
    target: yan,
    play: "affair",
    stance: "secret",
    confirmed: true,
  };
  denied(hehuan, affair);
  assert.match(
    liaisonReason(
      hehuan.w,
      hehuan.w.npcs.find((n) => n.id === yan),
      "affair",
      "secret",
    ),
    /私下亲热/,
  );
  hehuan.do({ type: "liaison", target: yan, play: "tryst", stance: "secret", confirmed: true });
  denied(hehuan, {
    type: "liaison",
    target: yan,
    play: "tryst",
    stance: "mark",
    confirmed: true,
  });
  const xp = hehuan.w.player.xp;
  const stones = hehuan.w.player.stones;
  hehuan.do(affair);
  const secret = hehuan.w.events.findLast((event) => event.intimacy?.kind === "affair")!;
  assert.equal(secret.intimacy?.kind, "affair");
  assert.deepEqual(secret.intimacy?.betrayed, [rong]);
  assert.match(secret.text, /高潮/);
  assert.match(secret.text, /背着容照夜的出轨/);
  assert.match(secret.text, /这段偷情只写在当事人的生平里/);
  assert.equal(hehuan.w.player.xp, xp);
  assert.equal(hehuan.w.player.stones, stones);
  assert.ok(
    !knownEvents(hehuan.w, rong).some((event) => event.id === secret.id || event.kind === "scandal"),
    "spouse learned the secret",
  );
  assert.equal([...knowledgeEntries(hehuan.w)].filter((k) => k.eventId === secret.id).length, 2);
  hehuan.do({ type: "liaison", target: yan, play: "affair", stance: "mark", confirmed: true });
  const exposed = knownEvents(hehuan.w, rong).find((event) => event.kind === "scandal");
  assert.ok(exposed, "spouse missed the trace");
  assert.match(exposed!.text, /发现了这场出轨/);
  assert.ok(
    !knownEvents(hehuan.w, rong).some((event) => event.intimacy?.kind === "affair"),
    "spouse received the intimate record",
  );
  assert.ok(
    hehuan.w.relations.some((edge) => edge.from === rong && edge.to === "PLAYER" && edge.grievance),
  );
  assert.ok(
    hehuan.w.relations.some((edge) => edge.from === rong && edge.to === yan && edge.grievance),
  );
  assert.ok(
    hehuan.w.events
      .filter((event) => event.intimacy?.kind === "dual")
      .every((event) => event.text.includes("调和气机、互相照应")),
    "npc dual text changed",
  );
  validateWorld(hehuan.w);

  const watched = new Run("female");
  watched.join("quanzhen");
  const ning = "SECT_QUAN_NING";
  const chang = "SECT_QUAN_CHANG";
  watched.do({ type: "meet", target: ning });
  watched.w.player.ageDays = 20 * B.world.daysPerYear;
  denied(watched, {
    type: "liaison",
    target: ning,
    play: "tryst",
    stance: "secret",
    confirmed: true,
  });
  assert.match(
    liaisonReason(
      watched.w,
      watched.w.npcs.find((n) => n.id === ning),
      "tryst",
      "secret",
    ),
    /二十一/,
  );
  watched.w.player.ageDays = 21 * B.world.daysPerYear;
  for (let i = 0; i < 4; i++) watched.do({ type: "spendTime", target: ning });
  watched.do({ type: "intimacy", kind: "bond", target: ning, confirmed: true });
  watched.do({ type: "meet", target: chang });
  const trust = watched.w.relations.find(
    (edge) => edge.from === "PLAYER" && edge.to === ning,
  )!.trust;
  watched.do({
    type: "liaison",
    target: chang,
    play: "witness",
    stance: "indulge",
    confirmed: true,
  });
  const ntr = watched.w.events.findLast((event) => event.intimacy?.kind === "ntr")!;
  assert.equal(ntr.intimacy?.kind, "ntr");
  assert.deepEqual(ntr.actors, ["PLAYER", ning, chang]);
  assert.deepEqual(ntr.intimacy?.betrayed, ["PLAYER"]);
  assert.match(ntr.text, /寝取/);
  assert.match(ntr.text, /高潮/);
  assert.match(ntr.text, /这一夜的寝取写在三人的生平里/);
  assert.equal(
    watched.w.relations.find((edge) => edge.from === "PLAYER" && edge.to === ning)!.trust,
    trust - config.indulgeTrustLoss,
  );
  assert.equal(
    watched.w.relations.find((edge) => edge.from === "PLAYER" && edge.to === ning)?.grievance,
    undefined,
  );
  assert.ok(knownEvents(watched.w).some((event) => event.id === ntr.id));
  assert.ok(!knownEvents(watched.w).some((event) => event.intimacy?.kind === "affair"));
  const beforeSever = watched.w.relations.find(
    (edge) => edge.from === "PLAYER" && edge.to === ning,
  )!.trust;
  watched.do({
    type: "liaison",
    target: chang,
    play: "witness",
    stance: "sever",
    confirmed: true,
  });
  const broken = watched.w.relations.find((edge) => edge.from === "PLAYER" && edge.to === ning)!;
  assert.equal(broken.grievance, true);
  assert.equal(broken.trust, beforeSever - config.exposeTrustLoss);
  assert.match(
    intimacyReason(
      watched.w,
      watched.w.player,
      watched.w.npcs.find((n) => n.id === ning),
      "night",
    ),
    /仇怨/,
  );
  watched.visit("yunv");
  watched.do({ type: "meet", target: "SECT_YUNV_GU" });
  denied(watched, {
    type: "liaison",
    target: "SECT_YUNV_GU",
    play: "tryst",
    stance: "secret",
    confirmed: true,
  });
  assert.match(
    liaisonReason(
      watched.w,
      watched.w.npcs.find((n) => n.id === "SECT_YUNV_GU"),
      "tryst",
      "secret",
    ),
    /守贞/,
  );
  validateWorld(watched.w);
});
