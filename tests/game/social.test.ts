import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createWorld, validateWorld } from "../../lib/game/engine";
import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";
import { answerDaily } from "./daily-test-helpers";
import { relation } from "../../lib/game/relationships";
import { recordFact } from "../../lib/game/knowledge";
import { threshold } from "../../lib/game/rules";
import { B } from "../../lib/game/rules";
import type { Command, Profile, World } from "../../lib/game/types";

const profile: Profile = {
  name: "论道测试",
  sex: "male",
  aptitude: 80,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 1, color: 0 },
};

function world(seed = 4242): World {
  const w = createWorld(seed, profile, `social-${seed}`, 40, { contentLocks: CAMPAIGN_LOCKS });
  w.player.location = "market";
  w.player.realm = 3;
  w.player.manual = true;
  return w;
}

function edge(w: World, target: string) {
  let r = relation(w, target);
  if (!r) {
    r = {
      from: target,
      to: "PLAYER",
      favor: 30,
      trust: 20,
      attraction: 0,
      known: true,
      memories: [],
    };
    w.relations.push(r);
  }
  const mirror = w.relations.find((x) => x.from === "PLAYER" && x.to === target);
  if (!mirror)
    w.relations.push({
      from: "PLAYER",
      to: target,
      favor: r.favor,
      trust: r.trust,
      attraction: 0,
      known: true,
      memories: [],
    });
  return r;
}

function socialTarget(w: World, realm = 4, close = false) {
  const a = w.npcs.find((x) => x.alive && x.location === w.player.location)!;
  a.realm = realm;
  a.hp = Math.max(1, a.hp);
  const r = edge(w, a.id);
  r.favor = close ? 80 : 30;
  r.trust = close ? 60 : 20;
  if (close) {
    const ids = [1, 2, 3].map((i) =>
      recordFact(w, "social-test", `共同经历 ${i}`, ["PLAYER", a.id]),
    );
    for (const x of w.relations.filter(
      (x) => (x.from === a.id && x.to === "PLAYER") || (x.from === "PLAYER" && x.to === a.id),
    ))
      x.memories = [...ids];
  }
  return a.id;
}

function send(w: World, command: Command): World {
  return answerDaily(applyCommand(w, command, `social:${w.revision}`, w.revision));
}

test("discussing with a higher-realm friend costs one day and grants insight", () => {
  const w = world();
  const target = socialTarget(w, 4);
  const day = w.day,
    insight = w.player.insight;
  const next = send(w, { type: "discuss", target });
  assert.equal(next.day, day + 1);
  assert.equal(next.player.insight, insight + 1);
  assert.equal(relation(next, target)!.favor, 35);
  validateWorld(next);
  assert.match(next.notice, /论道/);
});

test("discussion is limited to friends of equal or higher realm", () => {
  const low = world();
  const target = socialTarget(low, 1);
  assert.throws(() => send(low, { type: "discuss", target }), /境界低于/);
  const stranger = world();
  const id = socialTarget(stranger, 4);
  edge(stranger, id).favor = -5;
  assert.throws(() => send(stranger, { type: "discuss", target: id }), /交情/);
});

test("discussion cooldown blocks repeats without writing time or insight", () => {
  const w = world();
  const target = socialTarget(w, 4);
  const next = send(w, { type: "discuss", target });
  const day = next.day,
    insight = next.player.insight;
  assert.throws(() => send(next, { type: "discuss", target }), /等待/);
  assert.equal(next.day, day);
  assert.equal(next.player.insight, insight);
});

test("gifts cost their item, raise favor and share a three-day cooldown", () => {
  const w = world();
  w.player.stones = 50;
  w.player.healing = 2;
  w.player.grass = 2;
  const target = socialTarget(w);
  const before = relation(w, target)!.favor;
  const withStones = send(w, { type: "gift", target });
  assert.equal(withStones.player.stones, 40);
  assert.equal(relation(withStones, target)!.favor, before + B.relationships.giftDeltas.stones);
  assert.throws(() => send(withStones, { type: "gift", target, item: "grass" }), /等待/);
});

test("gift refuses missing items and preserves state", () => {
  const w = world();
  w.player.stones = 5;
  const target = socialTarget(w);
  assert.throws(() => send(w, { type: "gift", target }), /灵石不足/);
  w.player.healing = 0;
  assert.throws(() => send(w, { type: "gift", target, item: "healing" }), /没有可赠/);
  assert.equal(w.player.stones, 5);
});

test("mentor requires a close friend three realms higher and advances xp", () => {
  const w = world();
  const target = socialTarget(w, w.player.realm + B.relationships.mentorMinRealmGap, true);
  const need = threshold(w.player);
  w.player.xp = 0;
  const next = send(w, { type: "mentor", target });
  assert.equal(next.player.xp, Math.ceil((need * B.relationships.mentorExperienceBp) / 10000));
  assert.throws(() => send(next, { type: "mentor", target }), /等待/);
});

test("mentor rejects shallow bonds and small realm gaps", () => {
  const w = world();
  const friend = socialTarget(w, w.player.realm + B.relationships.mentorMinRealmGap, false);
  assert.throws(() => send(w, { type: "mentor", target: friend }), /挚友/);
  const close = world();
  const near = socialTarget(close, close.player.realm + 1, true);
  assert.throws(() => send(close, { type: "mentor", target: near }), /高出/);
});

test("social commands parse strictly and malformed saves reject bad cooldowns", () => {
  const w = world();
  w.player.stones = 50;
  const target = socialTarget(w);
  assert.throws(
    () =>
      applyCommand(
        w,
        { type: "gift", target, item: "jade" } as unknown as Command,
        "social:bad",
        w.revision,
      ),
    /行动参数|非法/,
  );
  const next = send(w, { type: "gift", target });
  validateWorld(next);
  relation(next, target)!.interactions = { discussDay: -1 };
  assert.throws(() => validateWorld(next), /关系数值/);
});

test("old saves without social cooldowns still validate", () => {
  const w = world();
  const target = socialTarget(w);
  validateWorld(w);
  assert.equal(relation(w, target)!.interactions, undefined);
});
