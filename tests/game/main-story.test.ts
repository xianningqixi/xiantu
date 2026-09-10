import { answerDaily } from "./daily-test-helpers";
import { validateMainStory } from "../../lib/game/content/main-story-contract.mjs";
import sourceStory from "../../content-packs/main-quest/story.json";
import test from "node:test";
import assert from "node:assert/strict";
import { createWorld, applyCommand, stats, validateWorld } from "../../lib/game/engine";
import {
  currentMainStep,
  mainScene,
  mainEvent,
  mainChapters,
  MAIN_STORY_LOCK,
  MAIN_STORY,
} from "../../lib/game/main-story";
import { roadOptions } from "../../lib/game/world-map";
import { EXTENSIONS } from "../../lib/game/content/extensions";
import { CAMPAIGN_LOCKS, withCampaignContent } from "../../lib/game/campaign-content";
import { extensionScenes } from "../../lib/game/content-story";
import oldCampaignLocks from "../../lib/game/content/main-story-migrations.json";
import { migrateSave } from "../../lib/game/migrations";
import type { World, Command, LocationId } from "../../lib/game/types";
const locks = EXTENSIONS.filter((e) => e.data.journey).map((e) => e.lock);
function fresh(selected = locks) {
  const w = createWorld(
    12345,
    {
      name: "寻源人",
      sex: "male",
      aptitude: 90,
      artifact: "focus",
      mode: "simple",
      appearance: { face: 0, hair: 0, color: 0 },
    },
    "main-unit",
    40,
    { contentLocks: selected },
  );
  w.player.realm = 10;
  w.player.manual = true;
  w.player.hp = stats(w.player).maxHp;
  return w;
}
const act = (w: World, c: Command) =>
  answerDaily(applyCommand(w, c, `main:${w.revision + 1}`, w.revision));
function rubbing(w: World) {
  w = openVolume(w);
  if (w.player.location === "inn") w = act(w, { type: "travel", to: "market" });
  w = act(w, { type: "travel", to: "gate" });
  w = act(w, { type: "surveyRuins" });
  return act(w, { type: "travel", to: "market" });
}
function openVolume(w: World) {
  const step = currentMainStep(w);
  if (!step?.introPending) return w;
  w.player.location = step.chapter.sites.inn as LocationId;
  const intro = extensionScenes(w).find((n) => n.id === step.volume!.data.journey!.introId)!;
  assert.ok(intro);
  return act(w, { type: "chooseExtension", nodeId: intro.id, choiceId: intro.choices[0].id });
}
function choose(w: World) {
  const n = mainScene(w);
  assert.ok(n);
  return act(w, { type: "chooseMain", nodeId: n.id, choiceId: n.choices[0].id });
}
function prepareCurrent(w: World) {
  w = openVolume(w);
  const n = currentMainStep(w)!;
  w.player.location = n.location;
  if (n.guide) {
    n.guide.location = n.location;
    n.guide.attempt = null;
  }
  for (let i = 0; i < MAIN_STORY.intervalDays + 3 && !mainScene(w); i++) {
    w = act(w, { type: "rest" });
    const s = currentMainStep(w)!;
    if (s.guide) {
      s.guide.location = s.location;
      s.guide.attempt = null;
    }
  }
  return w;
}
test("main story requires evidence, its own location, the actual NPC and elapsed days; reads are inert", () => {
  let w = fresh();
  assert.equal(mainScene(w), null);
  w = rubbing(w);
  let step = currentMainStep(w)!;
  step.guide!.location = "inn";
  assert.equal(mainScene(w), null);
  step.guide!.location = "market";
  assert.ok(mainScene(w));
  const before = structuredClone(w);
  for (let i = 0; i < 10; i++) {
    mainScene(w);
    currentMainStep(w);
    roadOptions(w);
  }
  assert.deepEqual(w, before);
  w = choose(w);
  const after = structuredClone(w);
  assert.throws(() => act(w, { type: "chooseMain", nodeId: step.id, choiceId: "listen" }));
  assert.deepEqual(w, after);
  w = act(w, { type: "travel", to: "inn" });
  assert.equal(mainScene(w), null);
  w = act(w, { type: "rest" });
  assert.equal(mainScene(w), null);
  w = act(w, { type: "rest" });
  assert.equal(mainScene(w)?.id, "main.qingshi.route");
});
test("open roads preserve main clue order, exact travel time and the four-chapter ending", () => {
  let w = rubbing(fresh());
  for (const e of EXTENSIONS.filter((e) => w.contentLocks.includes(e.lock)))
    for (const n of e.data.storylets) w.contentState[n.id] = true;
  w.player.location = "gate";
  assert.equal(roadOptions(w)[0].requirement, "");
  const earlyVisit = act(w, { type: "travel", to: "shichai.xiaye.gate" });
  assert.equal(mainScene(earlyVisit), null);
  assert.equal(currentMainStep(earlyVisit)!.chapter.id, "qingshi");
  const chapters = mainChapters(w);
  for (let index = 0; index < chapters.length; index++) {
    const chapter = chapters[index];
    w = choose(prepareCurrent(w));
    w = choose(prepareCurrent(w));
    assert.ok(mainEvent(w, chapter.discovery.id));
    if (index < chapters.length - 1) {
      w.player.location = chapter.sites.gate as LocationId;
      const road = roadOptions(w).find((r) => r.to === chapters[index + 1].sites.gate)!;
      assert.equal(road.requirement, "");
      const day = w.day;
      w = act(w, { type: "travel", to: road.to });
      assert.equal(w.day, day + road.days);
    }
  }
  assert.equal(currentMainStep(w), null);
  assert.equal(w.events.filter((e) => e.mainStory).length, 8);
  assert.equal(mainEvent(w, "main.dongxue.ending")?.mainStory?.choiceId, "seal");
  assert.deepEqual(migrateSave(w).world, w);
  const bad = structuredClone(w);
  bad.events.find((e) => e.mainStory?.nodeId === "main.dongxue.ending")!.mainStory!.choiceId =
    "invented";
  assert.throws(() => validateWorld(bad), /选项/);
});
test("a dead guide leads to archived evidence, never a speaking replacement or a blocked campaign", () => {
  let w = rubbing(fresh());
  const guide = w.npcs.find((a) => a.id === "NPC_ZHOU_AN")!;
  guide.alive = false;
  guide.hp = 0;
  w.player.location = "inn";
  const scene = mainScene(w)!;
  assert.ok(scene);
  assert.equal(scene.guide, null);
  assert.deepEqual(scene.participants, []);
  assert.match(scene.body, /离世/);
  w = choose(w);
  const event = mainEvent(w, scene.id)!;
  assert.deepEqual(event.actors, ["PLAYER"]);
  assert.equal(w.npcs.find((a) => a.id === guide.id)!.alive, false);
});
test("old saves gain only a versioned campaign lock; malformed or unknown main histories are rejected", () => {
  const old = fresh();
  delete old.campaignLock;
  const original = structuredClone(old);
  const migrated = migrateSave(old);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.world.campaignLock, MAIN_STORY_LOCK);
  assert.deepEqual(old, original);
  const { campaignLock, ...rest } = migrated.world;
  assert.deepEqual(rest, old);
  const bad = structuredClone(migrated.world);
  bad.campaignLock = "main.quest@9.9.9:unknown";
  assert.throws(() => migrateSave(bad), /主线/);
});
test("a sole later volume follows the base main clue without depending on unselected side stories", () => {
  let w = rubbing(
    fresh([EXTENSIONS.find((e) => e.data.manifest.packId === "shichai.dongxue")!.lock]),
  );
  assert.deepEqual(
    mainChapters(w).map((c) => c.id),
    ["qingshi", "dongxue"],
  );
  w = choose(prepareCurrent(w));
  w = choose(prepareCurrent(w));
  w.player.location = "gate";
  assert.equal(roadOptions(w)[0].requirement, "");
  assert.equal(roadOptions(w)[0].name, "霜河城");
});

test("main history rejects malformed metadata, forged identities and out-of-place records", () => {
  const w = choose(prepareCurrent(rubbing(fresh())));
  for (const patch of [
    (event: any) => {
      event.mainStory = null;
    },
    (event: any) => {
      delete event.mainStory;
    },
    (event: any) => {
      event.location = "gate";
    },
    (event: any) => {
      event.actors = ["PLAYER", "NPC_LIN_WAN"];
    },
  ]) {
    const invalid = structuredClone(w);
    patch(invalid.events.find((event) => event.mainStory));
    assert.throws(() => validateWorld(invalid), /主线/);
  }
});

test("main content rejects broken actor, place, pack, node, choice and text references before packaging", () => {
  const context = {
    actors: sourceStory.chapters.map((c) => c.guide),
    locations: sourceStory.chapters.flatMap((c) => Object.values(c.sites)),
    packs: sourceStory.chapters.map((c) => c.volumePackId),
  };
  assert.doesNotThrow(() => validateMainStory(sourceStory, context));
  const edits = [
    (s: any) => {
      s.chapters[0].guide = "PLAYER";
    },
    (s: any) => {
      s.chapters[0].sites.inn = "unknown.place";
    },
    (s: any) => {
      s.chapters[1].packId = "absent.pack";
    },
    (s: any) => {
      s.chapters[0].discovery.id = s.chapters[0].dialogue.id;
    },
    (s: any) => {
      s.chapters[0].discovery.choices.push(s.chapters[0].discovery.choices[0]);
    },
    (s: any) => {
      s.chapters[0].dialogue.body = "{{unknown}}";
    },
  ];
  for (const edit of edits) {
    const input = structuredClone(sourceStory);
    edit(input);
    assert.throws(() => validateMainStory(input, context));
  }
});

test("the fixed campaign includes all four volumes and requires each local introduction before main clues", () => {
  assert.equal(CAMPAIGN_LOCKS.length, 4);
  assert.deepEqual(withCampaignContent([]), CAMPAIGN_LOCKS);
  assert.deepEqual(withCampaignContent(CAMPAIGN_LOCKS), CAMPAIGN_LOCKS);
  assert.throws(() => withCampaignContent([CAMPAIGN_LOCKS[0] + "unknown"]), /版本/);
  const w = fresh(withCampaignContent([]));
  assert.equal(mainChapters(w).length, 4);
  assert.equal(currentMainStep(w)!.introPending, true);
  assert.equal(mainScene(w), null);
  const before = structuredClone(w);
  assert.throws(() =>
    act(w, { type: "chooseMain", nodeId: "main.qingshi.rubbing", choiceId: "listen" }),
  );
  assert.deepEqual(w, before);
});

test("legacy partial campaigns retain past chapters, actors and choices while absent volumes join exactly once", () => {
  let old = rubbing(
    fresh([EXTENSIONS.find((e) => e.data.manifest.packId === "shichai.dongxue")!.lock]),
  );
  old = choose(prepareCurrent(old));
  old = choose(prepareCurrent(old));
  old = choose(prepareCurrent(old));
  old = choose(prepareCurrent(old));
  old.campaignLock = oldCampaignLocks[0];
  const before = structuredClone(old);
  const { world: joined, migrated } = migrateSave(old);
  assert.equal(migrated, true);
  assert.deepEqual(old, before);
  assert.equal(joined.contentLocks.length, 4);
  // Newly joined story residents keep their names; duplicate ordinary NPCs may be renamed.
  assert.deepEqual(
    joined.npcs.slice(0, old.npcs.length).map((actor, i) => ({ ...actor, name: old.npcs[i].name })),
    old.npcs,
  );
  assert.equal(new Set(joined.npcs.map((actor) => actor.name)).size, joined.npcs.length);
  for (const key of [
    "player",
    "rng",
    "day",
    "events",
    "relations",
    "knowledge",
    "contentState",
    "longAction",
    "appliedCommands",
    "commandReceipts",
  ] as const)
    assert.deepEqual(joined[key], old[key], key);
  assert.deepEqual(joined.campaignHistory!.chapters, ["qingshi", "dongxue"]);
  assert.equal(currentMainStep(joined)!.chapter.id, "xiaye");
  assert.equal(currentMainStep(joined)!.introPending, true);
  assert.equal(migrateSave(joined).migrated, false);
  assert.deepEqual(migrateSave(joined).world, joined);
  let continued = choose(prepareCurrent(joined));
  continued = choose(prepareCurrent(continued));
  assert.equal(currentMainStep(continued)!.chapter.id, "qiudeng");
  assert.equal(mainEvent(continued, "main.dongxue.ending")!.mainStory!.choiceId, "seal");
});
