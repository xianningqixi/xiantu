import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createWorld, validateWorld } from "../../lib/game/engine";
import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";
import { battleRound } from "../../lib/game/combat";
import { relation } from "../../lib/game/relationships";
import { inviteReason } from "../../lib/game/companions";
import { B } from "../../lib/game/rules";
import type { Command, Profile, World } from "../../lib/game/types";

const profile: Profile = {
  name: "同行测试",
  sex: "female",
  aptitude: 80,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 1, color: 0 },
};

function world(seed = 777): World {
  const w = createWorld(seed, profile, `companion-${seed}`, 40, { contentLocks: CAMPAIGN_LOCKS });
  w.player.location = "market";
  w.player.realm = 5;
  w.player.manual = true;
  w.player.stones = 300;
  w.story.outcome = "fulfilled";
  w.story.settledDay = w.day;
  w.lastExpeditionDay = -B.economy.expeditionCooldownDays;
  return w;
}

function friendAt(w: World, index = 0): string {
  const candidates = w.npcs.filter(
    (a) => a.alive && !a.npcJourney && a.id !== w.player.id && !w.party.includes(a.id),
  );
  const actor = candidates[index % candidates.length];
  actor.location = w.player.location;
  actor.hp = Math.max(1, actor.hp);
  let r = relation(w, actor.id);
  if (!r) {
    r = {
      from: actor.id,
      to: "PLAYER",
      known: true,
      favor: 30,
      trust: 20,
      attraction: 0,
      memories: [],
    };
    w.relations.push(r);
  }
  r.known = true;
  r.favor = 30;
  r.trust = 20;
  return actor.id;
}

function send(w: World, command: Command): World {
  return applyCommand(w, command, `companion:${w.revision}`, w.revision);
}

function resolveWin(w: World) {
  let guard = 0;
  while (w.battle && guard++ < 200) {
    for (const enemy of w.battle.enemies) if (enemy.hp > 0) enemy.hp = 1;
    for (const ally of w.battle.allies) {
      ally.hp = ally.maxHp;
      ally.attack = 100_000;
    }
    battleRound(w, "attack");
  }
  assert.ok(guard < 200);
}

test("only nearby friends below the party cap can be invited", () => {
  const w = world();
  const stranger = w.npcs.find((a) => a.alive && !a.npcJourney && a.location !== "market")!;
  assert.match(inviteReason(w, stranger.id), /不在此处|交情/);
  const friend = friendAt(w);
  assert.equal(inviteReason(w, friend), "");
  const weak = relation(w, friend)!;
  weak.favor = 1;
  assert.match(inviteReason(w, friend), /交情/);
  weak.favor = 30;
  w.party = ["PLAYER", "A", "B"];
  assert.match(inviteReason(w, friend), /最多/);
});

test("an invitation joins the party and opens a split-loot agreement without spending a day", () => {
  const w = world();
  const friend = friendAt(w);
  const day = w.day,
    revision = w.revision;
  const next = send(w, { type: "inviteCompanion", target: friend });
  assert.equal(next.revision, revision + 1);
  assert.equal(next.day, day);
  assert.deepEqual(next.party, ["PLAYER", friend]);
  assert.equal(next.agreement?.terms, "split");
  assert.equal(next.agreement?.status, "accepted");
  assert.deepEqual(next.agreement?.members, ["PLAYER", friend]);
  validateWorld(next);
});

test("the party can grow to the configured cap and then refuses more", () => {
  const w = world();
  let next = send(w, { type: "inviteCompanion", target: friendAt(w) });
  next = send(next, { type: "inviteCompanion", target: friendAt(next) });
  assert.equal(next.party.length, 3);
  assert.deepEqual(next.agreement?.members, next.party);
  const extra = friendAt(next, 2);
  assert.match(inviteReason(next, extra), /最多/);
});

test("story agreements keep priority over fresh invitations", () => {
  const w = world();
  const friend = friendAt(w);
  w.agreement = {
    terms: "story",
    id: "agreement:story",
    status: "accepted",
    members: ["PLAYER", "NPC_0001", "NPC_0002"],
    recipient: "NPC_0001",
    expeditionId: null,
    strict: false,
  };
  w.party = ["PLAYER", "NPC_0001", "NPC_0002"];
  assert.match(inviteReason(w, friend), /故事约定/);
});

test("split expeditions scale with runs and divide stones and grass across the party", () => {
  const fresh = world();
  const friend = friendAt(fresh);
  const run = send(fresh, { type: "inviteCompanion", target: friend });
  run.player.location = "gate";
  const partner = run.npcs.find((a) => a.id === friend)!;
  partner.location = "gate";
  const started = send(run, { type: "expedition" });
  assert.equal(started.battle?.kind, "expedition");
  validateWorld(started);
  const loot = structuredClone(started.battle!.loot!);
  const ally = started.npcs.find((a) => a.id === friend)!;
  const paid = {
    player: started.player.stones,
    partner: ally.stones,
    grass: started.player.grass + ally.grass,
  };
  resolveWin(started);
  assert.equal(started.battle, null);
  assert.equal(started.player.stones - paid.player + (ally.stones - paid.partner), loot.stones);
  assert.equal(started.player.grass + ally.grass - paid.grass, loot.grass);
  assert.ok(started.player.stones > paid.player || ally.stones > paid.partner);
  assert.equal(started.expeditionCount, 1);
});

test("returning cancels the split agreement and disbands the party", () => {
  const w = world();
  let run = send(w, { type: "inviteCompanion", target: friendAt(w) });
  run.player.location = "gate";
  const partner = run.npcs.find((a) => a.id === run.party[1])!;
  partner.location = "gate";
  run = send(run, { type: "expedition" });
  resolveWin(run);
  const back = send(run, { type: "return" });
  assert.equal(back.player.location, "market");
  assert.deepEqual(back.party, ["PLAYER"]);
  assert.equal(back.agreement?.status, "cancelled");
  assert.match(back.notice, /散去/);
  validateWorld(back);
});

test("disband also ends a split agreement outside the ruins", () => {
  const w = world();
  const next = send(w, { type: "inviteCompanion", target: friendAt(w) });
  const off = send(next, { type: "disband" });
  assert.deepEqual(off.party, ["PLAYER"]);
  assert.equal(off.agreement?.status, "cancelled");
});

test("split agreement saves stay strict about membership", () => {
  const w = world();
  const next = send(w, { type: "inviteCompanion", target: friendAt(w) });
  validateWorld(next);
  next.agreement!.members = [next.party[1]];
  assert.throws(() => validateWorld(next), /同行约定/);
});

test("invitation commands parse strictly and reject strangers", () => {
  const w = world();
  assert.throws(() => send(w, { type: "inviteCompanion", target: "NPC_9999" }), /不在人世/);
});
