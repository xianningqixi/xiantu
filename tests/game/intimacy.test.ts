import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createWorld, validateWorld } from "../../lib/game/engine";
import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";
import { answerDaily } from "./daily-test-helpers";
import { relation } from "../../lib/game/relationships";
import { B } from "../../lib/game/rules";
import { gainPerDay } from "../../lib/game/cultivation";
import { cultivate } from "../../lib/game/cultivation";
import { aftermathLines } from "../../lib/game/intimacy-aftermath";
import { settleIntimacy, strainReason } from "../../lib/game/intimacy";
import { intimacyCodex, codexSummary, filterCodex } from "../../lib/game/intimacy-codex";
import type { Command, Profile, World } from "../../lib/game/types";

const profile: Profile = {
  name: "亲密测试",
  sex: "male",
  aptitude: 80,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 1, color: 0 },
};

function world(seed = 9191): World {
  const w = createWorld(seed, profile, `intimacy-${seed}`, 50, { contentLocks: CAMPAIGN_LOCKS });
  w.player.location = "market";
  w.player.realm = 5;
  w.player.manual = true;
  const a = w.npcs.find((x) => x.alive && x.location === "market")!;
  a.realm = 5;
  a.manual = true;
  a.ageDays = 30 * B.world.daysPerYear;
  w.player.ageDays = 30 * B.world.daysPerYear;
  for (const [from, to] of [
    ["PLAYER", a.id],
    [a.id, "PLAYER"],
  ] as const) {
    const existing = w.relations.find((r) => r.from === from && r.to === to);
    if (existing) {
      existing.known = true;
      existing.favor = 80;
      existing.trust = 60;
    } else
      w.relations.push({
        from,
        to,
        favor: 80,
        trust: 60,
        attraction: 0,
        known: true,
        memories: [],
      });
  }
  return w;
}

function send(w: World, command: Command): World {
  return answerDaily(applyCommand(w, command, `intimacy:${w.revision}`, w.revision));
}

function partner(w: World) {
  return w.player.id === "PLAYER" ? w.npcs.find((a) => a.location === w.player.location)! : null;
}

function bonded(w: World) {
  const a = partner(w)!;
  return { w, target: a.id };
}

function stats(w: World, id: string) {
  const a = id === "PLAYER" ? w.player : w.npcs.find((x) => x.id === id)!;
  return gainPerDay(w, a, false, true);
}

test("the detail preference is stored on the save and validated strictly", () => {
  const w = world();
  const next = send(w, { type: "setIntimacyDetail", detail: "explicit" });
  assert.equal(next.simulationOptions.intimacyDetail, "explicit");
  validateWorld(next);
  assert.match(next.notice, /详尽/);
  const tasteful = send(next, { type: "setIntimacyDetail", detail: "tasteful" });
  assert.equal(tasteful.simulationOptions.intimacyDetail, "tasteful");
  validateWorld(tasteful);
  const broken = structuredClone(tasteful);
  broken.simulationOptions.intimacyDetail = "spicy" as never;
  assert.throws(() => validateWorld(broken), /世界演化设置/);
});

test("dual cultivation without a method defaults to 既济 and pays both sides alike", () => {
  const { w, target } = bonded(world());
  const base = world();
  const after = send(w, { type: "intimacy", target, kind: "bond", confirmed: true });
  const before = structuredClone(after);
  const next = send(after, { type: "intimacy", target, kind: "dual", confirmed: true });
  const share = B.relationships.companionship.dualMethods.balance.selfBp;
  assert.equal(
    next.player.xp,
    before.player.xp + Math.max(1, Math.floor((stats(w, "PLAYER") * share) / B.probabilityScaleBp)),
  );
  const ally = next.npcs.find((a) => a.id === target)!;
  const allyBefore = before.npcs.find((a) => a.id === target)!;
  assert.equal(
    ally.xp,
    allyBefore.xp + Math.max(1, Math.floor((stats(w, target) * share) / B.probabilityScaleBp)),
  );
  assert.match(next.notice, /各有所得/);
  validateWorld(next);
  assert.ok(base);
});

test("采补 shifts cultivation from the partner onto the player", () => {
  const { w, target } = bonded(world());
  const bondedWorld = send(w, { type: "intimacy", target, kind: "bond", confirmed: true });
  const before = structuredClone(bondedWorld);
  const next = send(bondedWorld, {
    type: "intimacy",
    target,
    kind: "dual",
    confirmed: true,
    method: "steal",
  });
  const shares = B.relationships.companionship.dualMethods.steal;
  const mine = next.player.xp - before.player.xp;
  const ally = next.npcs.find((a) => a.id === target)!;
  const theirs = ally.xp - before.npcs.find((a) => a.id === target)!.xp;
  assert.equal(
    mine,
    Math.max(1, Math.floor((stats(w, "PLAYER") * shares.selfBp) / B.probabilityScaleBp)),
  );
  assert.equal(
    theirs,
    Math.max(1, Math.floor((stats(w, target) * shares.partnerBp) / B.probabilityScaleBp)),
  );
  assert.ok(mine > theirs, "采补应当利多己");
  assert.match(next.notice, /采得/);
});

test("intimacy afterwards leaves a temperament-aware line in the notice", () => {
  const { w, target } = bonded(world());
  const ally = w.npcs.find((a) => a.id === target)!;
  ally.personality = "沉静 · 只信书";
  const next = send(w, { type: "intimacy", target, kind: "bond", confirmed: true });
  assert.match(next.notice, /道侣/);
  assert.ok(next.notice.length > 24);
  validateWorld(next);
});

test("aftermath lines come from the matching temperament and fall back safely", () => {
  const base = partner(world())!;
  const cold = aftermathLines("night", { ...base, personality: "清冷" } as never, base);
  const loud = aftermathLines("night", { ...base, personality: "泼辣" } as never, base);
  const odd = aftermathLines("night", { ...base, personality: "无可描述" } as never, base);
  assert.notDeepEqual(cold, loud);
  assert.equal(cold.length, 3);
  assert.equal(odd.length, 3);
  assert.deepEqual(aftermathLines("bond", base, base).length, 2);
});

test("cultivate honours an explicit gain multiplier without touching the base rule", () => {
  const w = world();
  const plain = structuredClone(w),
    halved = structuredClone(w),
    base = w.player.xp;
  cultivate(w, w.player, false, true);
  cultivate(plain, plain.player, false, true);
  cultivate(halved, halved.player, false, true, B.probabilityScaleBp / 2);
  const full = w.player.xp - base,
    half = halved.player.xp - base;
  assert.equal(full, plain.player.xp - base);
  assert.ok(full >= 2);
  assert.ok(Math.abs(full - half * 2) <= 1, `full=${full} half=${half}`);
});

test("repeated stealing drains the partner and both sides earn less", () => {
  const { w, target } = bonded(world());
  let cur = send(w, { type: "intimacy", target, kind: "bond", confirmed: true });
  const config = B.relationships.companionship.dualMethods.steal;
  const sample = () => {
    const before = structuredClone(cur);
    const next = send(cur, {
      type: "intimacy",
      target,
      kind: "dual",
      confirmed: true,
      method: "steal",
    });
    const mine = next.player.xp - before.player.xp;
    const ally = next.npcs.find((a) => a.id === target)!;
    const theirs = ally.xp - before.npcs.find((a) => a.id === target)!.xp;
    cur = next;
    return { mine, theirs };
  };
  const first = sample();
  sample();
  const third = sample();
  assert.ok(third.mine < first.mine, "采干后自己也少得");
  assert.ok(third.theirs < first.theirs, "采干后对方更少");
  assert.ok(third.theirs < third.mine);
  assert.match(cur.notice, /根基被榨得发虚/);
  validateWorld(cur);
});

test("resting past the strain window resets the streak", () => {
  const { w, target } = bonded(world());
  let cur = send(w, { type: "intimacy", target, kind: "bond", confirmed: true });
  for (let i = 0; i < 3; i++)
    cur = send(cur, { type: "intimacy", target, kind: "dual", confirmed: true, method: "steal" });
  const edge = cur.relations.find((r) => r.from === target && r.to === "PLAYER")!;
  assert.equal(edge.interactions!.stealStreak, 3);
  assert.match(strainReason(cur, cur.player, cur.npcs.find((a) => a.id === target)!), /连采 3 次/);
  cur.day += B.relationships.companionship.dualMethods.steal.strainDays + 1;
  const before = structuredClone(cur);
  const next = send(cur, {
    type: "intimacy",
    target,
    kind: "dual",
    confirmed: true,
    method: "steal",
  });
  const edgeAfter = next.relations.find((r) => r.from === target && r.to === "PLAYER")!;
  assert.equal(edgeAfter.interactions!.stealStreak, 1);
  assert.ok(next.player.xp - before.player.xp >= before.player.xp - before.player.xp);
  validateWorld(next);
});

test("strain counters validate strictly and old edges stay valid", () => {
  const { w, target } = bonded(world());
  const bondedWorld = send(w, { type: "intimacy", target, kind: "bond", confirmed: true });
  const cur = send(bondedWorld, {
    type: "intimacy",
    target,
    kind: "dual",
    confirmed: true,
    method: "steal",
  });
  validateWorld(cur);
  const broken = structuredClone(cur);
  broken.relations.find((r) => r.from === target && r.to === "PLAYER")!.interactions!.stealStreak =
    0;
  assert.throws(() => validateWorld(broken), /关系数值不合法/);
  const legacy = structuredClone(cur);
  const edge = legacy.relations.find((r) => r.from === target && r.to === "PLAYER")!;
  delete edge.interactions!.stoleDay;
  delete edge.interactions!.stealStreak;
  validateWorld(legacy);
});

test("old saves without the detail preference still validate", () => {
  const w = world();
  delete w.simulationOptions.intimacyDetail;
  validateWorld(w);
});

test("the intimacy command rejects an unknown method", () => {
  const { w, target } = bonded(world());
  const bondedWorld = send(w, { type: "intimacy", target, kind: "bond", confirmed: true });
  assert.throws(
    () =>
      applyCommand(
        bondedWorld,
        { type: "intimacy", target, kind: "dual", confirmed: true, method: "drain" as never },
        "intimacy:bad",
        bondedWorld.revision,
      ),
    /行动参数不合法/,
  );
});

test("relationship helpers stay consistent around dual methods", () => {
  const { w, target } = bonded(world());
  const next = send(w, { type: "intimacy", target, kind: "bond", confirmed: true });
  assert.ok(relation(next, target)!.known);
});

test("the codex lists only records the player shares and counts every kind", () => {
  const { w, target } = bonded(world());
  assert.deepEqual(intimacyCodex(w), []);
  let cur = send(w, { type: "intimacy", target, kind: "bond", confirmed: true });
  cur = send(cur, { type: "intimacy", target, kind: "night", confirmed: true });
  cur = send(cur, { type: "intimacy", target, kind: "dual", confirmed: true });
  const codex = intimacyCodex(cur);
  assert.equal(codex.length, 1);
  assert.equal(codex[0].id, target);
  assert.deepEqual(codex[0].kinds, { bond: 1, night: 1, dual: 1 });
  assert.equal(codex[0].entries[0].kind, "dual", "最新的记录排在最前");
  assert.deepEqual(codexSummary(cur), { people: 1, bond: 1, night: 1, dual: 1, total: 3 });
  assert.equal(filterCodex(codex, "night")[0].entries.length, 1);
  assert.equal(filterCodex(codex, "").length, 1);
});

test("the codex keeps an authored record after its partner dies", () => {
  const { w, target } = bonded(world());
  const cur = send(w, { type: "intimacy", target, kind: "bond", confirmed: true });
  cur.npcs.find((a) => a.id === target)!.alive = false;
  const codex = intimacyCodex(cur);
  assert.equal(codex[0].alive, false);
  assert.equal(codex[0].entries.length, 1);
});

test("an outdoor night costs hit points and raises favor; an indoor one can be overheard", () => {
  const outside = world();
  outside.player.location = "atlas.cangzhu";
  const target = outside.npcs.find((a) => a.location === "market")!;
  target.location = "atlas.cangzhu";
  const bond = send(outside, {
    type: "intimacy",
    target: target.id,
    kind: "bond",
    confirmed: true,
  });
  const edge = bond.relations.find((r) => r.from === "PLAYER" && r.to === target.id)!;
  const mate = bond.npcs.find((a) => a.id === target.id)!;
  const favor = edge.favor;
  const hp = bond.player.hp;
  // settle directly: a command would advance a day and heal the damage away
  const night = structuredClone(bond);
  settleIntimacy(night, night.player, night.npcs.find((a) => a.id === target.id)!, "night");
  assert.equal(hp - night.player.hp, B.relationships.companionship.wildHpCost);
  assert.equal(
    night.relations.find((r) => r.from === "PLAYER" && r.to === target.id)!.favor,
    Math.min(
      100,
      favor + B.relationships.companionship.favorGain + B.relationships.companionship.wildFavorGain,
    ),
  );
  assert.ok(mate.alive);

  const inside = world(4242);
  const quiet = inside.npcs.find((a) => a.location === "market")!;
  let cur = send(inside, { type: "intimacy", target: quiet.id, kind: "bond", confirmed: true });
  let witnessed = false;
  for (let i = 0; i < 40 && !witnessed; i++) {
    cur = structuredClone(cur);
    settleIntimacy(cur, cur.player, cur.npcs.find((a) => a.id === quiet.id)!, "night");
    const event = cur.events.findLast((e) => e.intimacy)!;
    witnessed = (cur.knowledge[event.id]?.length ?? 0) > 2;
  }
  assert.ok(witnessed, "a nearby bystander eventually overhears an indoor night");
});
