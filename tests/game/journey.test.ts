import { DAILY_EVENTS } from "../../lib/game/daily-events";
import { answerDaily } from "./daily-test-helpers";
import { currentMainStep, mainScene, hasRubbing } from "../../lib/game/main-story";
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, applyCommand, validateWorld, stats } from "../../lib/game/engine";
import { extensionScenes } from "../../lib/game/content-story";
import { EXTENSIONS } from "../../lib/game/content/extensions";
import {
  chapterWaitDays,
  roadOptions,
  regionOf,
  atlasPlaces,
  travelRoute,
  localSite,
  scheduledHome,
} from "../../lib/game/world-map";
import { advanceDay } from "../../lib/game/daily-simulation";
import { PACK, VISUAL_IDS } from "../../lib/game/content/official";
import { validateExtension } from "../../lib/game/content/extension-contract.mjs";
import { migrateSave } from "../../lib/game/migrations";
import { recordFact, knownEvents } from "../../lib/game/knowledge";
import migrations from "../../lib/game/content/journey-migrations.json";
import type { World, Command } from "../../lib/game/types";
const packs = EXTENSIONS.filter((e) => e.data.journey).sort(
  (a, b) => a.data.journey!.order - b.data.journey!.order,
);
const profile = {
  name: "行路人",
  sex: "male" as const,
  aptitude: 90,
  artifact: "focus" as const,
  mode: "simple" as const,
  appearance: { face: 0, hair: 0, color: 0 },
};
const fresh = (locks = packs.map((p) => p.lock)) =>
  createWorld(12345, profile, "journey-unit", 40, { contentLocks: locks });
function command(w: World, c: Command) {
  return answerDaily(applyCommand(w, c, `journey:${w.revision + 1}`, w.revision));
}
function mature(w: World, realm: number) {
  w.player.realm = realm;
  w.player.manual = true;
  w.player.hp = stats(w.player).maxHp;
}
function finishMainChapter(w: World) {
  const current = currentMainStep(w)!;
  if (current.introPending) {
    w.player.location = current.chapter.sites.inn as World["player"]["location"];
    const intro = extensionScenes(w)[0];
    assert.ok(intro);
    w = command(w, { type: "chooseExtension", nodeId: intro.id, choiceId: intro.choices[0].id });
  }
  if (!hasRubbing(w)) recordFact(w, "survey", "测试夹具：已取得残碑拓片", ["PLAYER"]);
  const chapter = currentMainStep(w)!.chapter.id;
  for (let stepIndex = 0; stepIndex < 2; stepIndex++) {
    let step = currentMainStep(w)!;
    assert.equal(step.chapter.id, chapter);
    w.player.location = step.location;
    for (let day = 0; day < 10; day++) {
      step = currentMainStep(w)!;
      if (step.guide) {
        step.guide.location = step.location;
        step.guide.attempt = null;
      }
      if (mainScene(w)) break;
      w = command(w, { type: "rest" });
    }
    const node = mainScene(w)!;
    assert.ok(node);
    w = command(w, { type: "chooseMain", nodeId: node.id, choiceId: node.choices[0].id });
  }
  return w;
}
test("new games show no four-volume scenes and distant residents never wander into Qingshi", () => {
  let w = fresh();
  assert.deepEqual(extensionScenes(w), []);
  const remote = w.npcs.filter(
    (a) => a.id.startsWith("shichai.") && !a.id.startsWith("shichai.chunshui."),
  );
  const origins = new Map(remote.map((a) => [a.id, regionOf(a.location)]));
  for (let i = 0; i < 30; i++) w = command(w, { type: "rest" });
  for (const [id, region] of origins)
    assert.equal(regionOf(w.npcs.find((a) => a.id === id)!.location), region, id);
  assert.deepEqual(extensionScenes(w), []);
  w.player.location = "gate";
  const first = roadOptions(w);
  assert.equal(first.length, 1);
  assert.equal(first[0].name, "临江城");
  assert.equal(first[0].requirement, "");
  const arrived = command(w, { type: "travel", to: first[0].to });
  assert.equal(arrived.player.realm, 0);
  assert.equal(arrived.player.location, first[0].to);
  assert.deepEqual(extensionScenes(arrived), []);
  assert.throws(() => command(w, { type: "meet", target: "shichai.xiaye.peisi" }), /不在这里/);
});
test("growth unlocks the local introduction; chapter scenes require the intro, local presence and elapsed days", () => {
  let w = fresh();
  mature(w, 1);
  assert.deepEqual(extensionScenes(w), []);
  w = command(w, { type: "travel", to: "inn" });
  let n = extensionScenes(w)[0];
  assert.equal(n.id, "shichai.chunshui.intro");
  w = command(w, { type: "chooseExtension", nodeId: n.id, choiceId: n.choices[0].id });
  assert.equal(chapterWaitDays(w, packs[0].data), 2);
  assert.deepEqual(extensionScenes(w), []);
  const snapshot = JSON.stringify(w);
  assert.throws(() =>
    command(w, {
      type: "chooseExtension",
      nodeId: "shichai.chunshui.wenzhiwei.meet",
      choiceId: "fake",
    }),
  );
  assert.equal(JSON.stringify(w), snapshot);
  w = command(w, { type: "rest" });
  assert.deepEqual(extensionScenes(w), []);
  w = command(w, { type: "rest" });
  w.player.location = "market";
  w.npcs.find((a) => a.id === "shichai.chunshui.suqingyan")!.location = "market";
  assert.equal(extensionScenes(w)[0].id, "shichai.chunshui.suqingyan.meet");
  assert.equal(extensionScenes(w).length, 1);
});
test("regional roads are open without main clues; travel pays its exact days and survives saves", () => {
  let w = fresh();
  mature(w, 2);
  w.player.location = "gate";
  assert.equal(roadOptions(w)[0].requirement, "");
  recordFact(w, "expedition", "测试夹具：此前已有一次探索", ["PLAYER"]);
  assert.equal(roadOptions(w)[0].requirement, "");
  for (const n of packs[0].data.storylets.slice(0, 3)) w.contentState[n.id] = true;
  w = finishMainChapter(w);
  w.player.location = "gate";
  const road = roadOptions(w)[0];
  assert.equal(road.requirement, "");
  const before = w.day;
  w = command(w, { type: "travel", to: road.to });
  assert.equal(w.day, before + 3);
  assert.equal(w.player.location, "shichai.xiaye.gate");
  assert.equal(regionOf(w.npcs.find((a) => a.id === "NPC_LIN_WAN")!.location), "qingshi");
  w = command(w, { type: "travel", to: "shichai.xiaye.inn" });
  assert.equal(extensionScenes(w)[0].id, "shichai.xiaye.intro");
  assert.deepEqual(migrateSave(w).world, w);
  const home = localSite(w.player.location, "gate");
  w = command(w, { type: "travel", to: home });
  assert.equal(roadOptions(w).find((r) => r.name === "青石坊市")!.requirement, "");
  assert.equal(roadOptions(w).find((r) => r.name === "青岚山城")!.requirement, "");
});
test("solo selected later volumes remain reachable without a missing earlier pack", () => {
  let w = fresh([packs[3].lock]);
  mature(w, 10);
  recordFact(w, "expedition", "测试夹具：已探索", ["PLAYER"]);
  w.player.location = "gate";
  assert.equal(roadOptions(w)[0].name, "霜河城");
  assert.equal(roadOptions(w)[0].requirement, "");
  w = finishMainChapter(w);
  w.player.location = "gate";
  assert.equal(roadOptions(w)[0].requirement, "");
});
test("old exact four-volume saves upgrade geography while preserving progress, resources and original input", () => {
  const w = fresh();
  mature(w, 2);
  w.contentLocks = migrations.map((m) => m.from);
  for (const a of w.npcs) if (a.id.startsWith("shichai.")) a.location = "market";
  w.contentState["shichai.chunshui.suqingyan.flag.met"] = true;
  const original = structuredClone(w);
  const migrated = migrateSave(w);
  assert.equal(migrated.migrated, true);
  assert.deepEqual(w, original);
  assert.deepEqual(migrated.world.player, w.player);
  assert.deepEqual(migrated.world.contentState, w.contentState);
  assert.equal(
    regionOf(migrated.world.npcs.find((a) => a.id === "shichai.xiaye.peisi")!.location),
    "shichai.xiaye",
  );
  assert.deepEqual(migrateSave(migrated.world).world, migrated.world);
  const bad = structuredClone(w);
  bad.contentLocks[0] += "x";
  assert.throws(() => migrateSave(bad), /版本/);
});
test("unselected locations and distant event witnesses cannot be invented", () => {
  const w = fresh([packs[0].lock]);
  w.player.location = "shichai.xiaye.market";
  assert.throws(() => validateWorld(w), /地点/);
  const all = fresh();
  const remote = all.npcs.find((a) => a.id === "shichai.xiaye.peisi")!;
  recordFact(all, "work", "青石当地的杂务", ["PLAYER"]);
  assert.ok(!knownEvents(all, remote.id).some((e) => e.text === "青石当地的杂务"));
});

test("scheduled local home visits preserve occupied days, breakthroughs, parties and regional boundaries", () => {
  for (const mode of ["free", "occupied", "attempt", "party", "away"] as const) {
    const w = fresh();
    w.day = 6;
    const actor = w.npcs.find((a) => a.id === "shichai.chunshui.suqingyan")!;
    actor.location = mode === "away" ? "shichai.xiaye.inn" : "inn";
    if (mode === "attempt") actor.attempt = { remaining: 2, chance: 7000 };
    if (mode === "party") w.party.push(actor.id);
    const xp = actor.xp,
      stones = actor.stones;
    assert.equal(scheduledHome(actor, 6), null);
    if (mode === "away") assert.equal(scheduledHome(actor, 7), null);
    advanceDay(w, new Set(mode === "occupied" ? ["PLAYER", actor.id] : ["PLAYER"]));
    assert.equal(actor.lastActionDay, 7);
    if (mode === "free") {
      assert.equal(actor.location, "market");
      assert.match(actor.activity, /日常事务/);
      assert.equal(actor.xp, xp);
      assert.equal(actor.stones, stones);
    } else if (mode === "away") assert.equal(regionOf(actor.location), "shichai.xiaye");
    else assert.equal(actor.location, "inn");
    if (mode === "attempt") assert.equal(actor.attempt?.remaining, 1);
  }
});
test("journey contracts reject invalid routes, undeclared files, wrong site kinds and unknown introductions", () => {
  const official = {
    roles: PACK.roles,
    assets: VISUAL_IDS,
    version: PACK.version,
    hash: PACK.lock.split(":")[1],
  };
  for (const mutate of [
    (p: any) => {
      p.journey.introId = "shichai.xiaye.missing";
    },
    (p: any) => {
      p.journey.locations.gate = "shichai.xiaye.market";
    },
    (p: any) => {
      p.definitions.locations["shichai.xiaye.gate"].destinations = ["missing.gate"];
    },
    (p: any) => {
      p.manifest.entryFiles.journey = "../journey.json";
    },
    (p: any) => {
      delete p.manifest.entryFiles.journey;
    },
    (p: any) => {
      p.definitions.characters[0].homeVisitIntervalDays = 0;
    },
  ]) {
    const pack = structuredClone(packs[1].data);
    mutate(pack);
    assert.throws(() => validateExtension(pack, official));
  }
});

test("all four chapters open only in their own town and return roads stay usable", () => {
  let w = fresh();
  mature(w, 10);
  recordFact(w, "expedition", "测试夹具：已探索并返回", ["PLAYER"]);
  for (const { data } of packs) {
    const j = data.journey!;
    w.player.location = j.locations.inn as World["player"]["location"];
    assert.equal(extensionScenes(w)[0]?.id, j.introId);
    const intro = extensionScenes(w)[0];
    w = command(w, { type: "chooseExtension", nodeId: intro.id, choiceId: intro.choices[0].id });
    for (const node of data.storylets.slice(0, j.clueCount)) w.contentState[node.id] = true;
    w = finishMainChapter(w);
    w.player.location = j.locations.gate as World["player"]["location"];
    const next = roadOptions(w).find(
      (r) => r.name !== packs[Math.max(0, j.order - 2)].data.journey!.regionName,
    );
    if (j.order < 4) {
      assert.ok(next && !next.requirement);
      const before = w.day;
      w = command(w, { type: "travel", to: next.to });
      assert.equal(w.day, before + next.days);
    }
  }
  assert.deepEqual(
    roadOptions(w).map((r) => [r.name, r.requirement]),
    [["青岚山城", ""]],
  );
});
test("rally cannot move companions across cities in a single day", () => {
  let w = fresh();
  mature(w, 2);
  w.agreement = {
    terms: "story",
    id: "agreement:fixture",
    status: "accepted",
    members: ["PLAYER", "NPC_LIN_WAN", "NPC_ZHOU_AN"],
    recipient: "NPC_LIN_WAN",
    expeditionId: null,
    strict: false,
  };
  w.player.location = "shichai.xiaye.inn";
  const before = structuredClone(w);
  assert.throws(() => command(w, { type: "rally" }), /所在的城镇/);
  assert.deepEqual(w, before);
});

test("a mortal can visit all ten atlas destinations in any order without story, reward or identity shortcuts", () => {
  let w = fresh();
  const places = atlasPlaces(w);
  assert.equal(places.length, 10);
  assert.equal(places.filter((p) => p.kind !== "town").length, 6);
  assert.deepEqual(travelRoute("market", "shichai.dongxue.gate", w), {
    days: 13,
    path: ["market", "gate", "shichai.xiaye.gate", "shichai.qiudeng.gate", "shichai.dongxue.gate"],
  });
  const initial = structuredClone(w);
  for (const from of places)
    for (const to of places)
      assert.ok(
        travelRoute(
          from.to as World["player"]["location"],
          to.to as World["player"]["location"],
          w,
        ),
      );
  assert.deepEqual(w, initial);
  for (const place of [...places].reverse()) {
    const to = place.to as World["player"]["location"];
    const route = travelRoute(w.player.location, to, w)!;
    const before = structuredClone(w);
    const id = `atlas:${w.revision + 1}`;
    w = answerDaily(applyCommand(w, { type: "travel", to }, id, w.revision));
    assert.equal(w.player.location, to);
    assert.equal(w.day, before.day + route.days);
    assert.equal(w.player.realm, 0);
    assert.equal(
      w.player.stones,
      initial.player.stones +
        w.events
          .filter((e) => e.kind === "daily-event")
          .reduce(
            (total, e) =>
              total +
              DAILY_EVENTS.find((n) => n.id === e.daily!.nodeId)!
                .effects.filter((f) => f.kind === "stones")
                .reduce((n, f) => n + (f.value ?? 0), 0),
            0,
          ),
    );
    assert.equal(w.player.name, initial.player.name);
    assert.deepEqual(
      Object.fromEntries(Object.entries(w.contentState).filter(([id]) => !id.startsWith("daily."))),
      initial.contentState,
    );
    assert.deepEqual(extensionScenes(w), []);
    assert.equal(mainScene(w), null);
    assert.equal(w.events.filter((e) => e.mainStory).length, 0);
    assert.equal(w.loot, null);
    assert.deepEqual(applyCommand(w, { type: "travel", to }, id, before.revision), w);
    assert.deepEqual(migrateSave(w).world, w);
    validateWorld(w);
  }
});

test("early NPC visits never trigger gated stories; forged choices cannot spend time or grant rewards", () => {
  let w = command(fresh(), { type: "travel", to: "shichai.xiaye.market" });
  const npc = w.npcs.find((a) => a.id === "shichai.xiaye.peisi")!;
  npc.location = w.player.location;
  npc.attempt = null;
  w = command(w, { type: "meet", target: npc.id });
  assert.deepEqual(extensionScenes(w), []);
  assert.equal(mainScene(w), null);
  assert.ok(w.relations.find((r) => r.from === npc.id && r.to === "PLAYER")!.favor >= 0);
  const snapshot = structuredClone(w);
  assert.throws(() =>
    command(w, { type: "chooseExtension", nodeId: "shichai.xiaye.intro", choiceId: "read" }),
  );
  assert.throws(() =>
    command(w, { type: "chooseMain", nodeId: "main.xiaye.ledger", choiceId: "listen" }),
  );
  assert.deepEqual(w, snapshot);
  mature(w, 2);
  w = command(w, { type: "travel", to: "shichai.xiaye.inn" });
  assert.deepEqual(extensionScenes(w), [], "realm alone cannot replace the earlier main clue");
  assert.equal(mainScene(w), null, "the earlier main clue is still required");
  w = finishMainChapter(w);
  w = command(w, { type: "travel", to: "shichai.xiaye.inn" });
  assert.equal(extensionScenes(w)[0]?.id, "shichai.xiaye.intro");
});

test("atlas routes respect installed geography, busy companions and the existing expedition settlement", () => {
  const base = fresh([packs[0].lock]);
  assert.equal(atlasPlaces(base).length, 3);
  assert.equal(travelRoute("market", "atlas.yanbo", base), null);
  for (const to of ["atlas.yanbo", "atlas.unknown", "ruins"] as const) {
    const before = structuredClone(base);
    assert.throws(() => command(base, { type: "travel", to }));
    assert.deepEqual(base, before);
  }
  const w = fresh();
  const npc = w.npcs.find((a) => a.id === "NPC_LIN_WAN")!;
  w.party.push(npc.id);
  npc.attempt = { remaining: 2, chance: 7000 };
  const before = structuredClone(w);
  assert.throws(() => command(w, { type: "travel", to: "atlas.cangzhu" }), /同伴正在突破/);
  assert.deepEqual(w, before);
});

test("previous atlas-less saves upgrade only the rules version and retain all recorded life", () => {
  const old = command(fresh(), { type: "rest" });
  for (const a of [old.player, ...old.npcs]) {
    a.realm = a.realm >= 10 ? 4 : Math.min(3, a.realm);
    a.xp = Math.min(a.xp, [20, 40, 60, 90, 100][a.realm]);
    a.hp = Math.min(a.hp, [30, 50, 60, 70, 130][a.realm]);
    a.attempt = null;
  }
  old.rulesVersion = "0.1.3";
  const before = structuredClone(old);
  const result = migrateSave(old);
  assert.equal(result.migrated, true);
  assert.equal(result.world.rulesVersion, "0.2.0");
  assert.deepEqual(
    {
      ...result.world,
      npcs: result.world.npcs.map((a) => ({ ...a, realm: a.realm === 10 ? 4 : a.realm })),
      rulesVersion: old.rulesVersion,
    },
    before,
  );
  assert.deepEqual(old, before);
  assert.equal(migrateSave(result.world).migrated, false);
  assert.equal(atlasPlaces(result.world).length, 10);
});
