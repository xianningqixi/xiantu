import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createWorld, validateWorld } from "../../lib/game/engine";
import { journeyActions } from "../../lib/game/journey-actions";
import { commandDays } from "../../lib/game/action-cost";
import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";
import { SECTS } from "../../lib/game/sect-content";
import { B, stats, threshold } from "../../lib/game/rules";
import { LOCATIONS, localSite, locationEnabled, locationKind } from "../../lib/game/world-map";
import type { Command, World, LocationId } from "../../lib/game/types";

function world() {
  return createWorld(
    42,
    {
      name: "游历行人",
      sex: "female",
      aptitude: 75,
      artifact: "focus",
      mode: "simple",
      appearance: { face: 0, hair: 0, color: 0 },
    },
    "journey-actions",
    40,
    { contentLocks: CAMPAIGN_LOCKS },
  );
}
function run(w: World, c: Command) {
  return applyCommand(w, c, `action:${w.revision}`, w.revision);
}
function use(w: World, id: string) {
  const a = journeyActions(w).find((a) => a.id === id);
  assert.ok(a?.command, `missing command ${id}`);
  const next = run(w, a.command);
  assert.equal(next.day - w.day, commandDays(w, a.command));
  validateWorld(next);
  return next;
}

test("every enabled inn learns locally for free; other places route to the named local inn", () => {
  for (const id of Object.keys(LOCATIONS) as LocationId[]) {
    let w = world();
    if (id === "ruins" || !locationEnabled(w, id)) continue;
    if (id !== w.player.location) w = run(w, { type: "travel", to: id });
    const before = structuredClone(w);
    const a = journeyActions(w).find((a) => a.id === "practice")!;
    assert.deepEqual(w, before, "projection changed a save");
    if (locationKind(id) !== "inn") {
      assert.deepEqual(a.command, { type: "travel", to: localSite(id, "inn") });
      assert.ok(a.hint.includes(LOCATIONS[localSite(id, "inn")].name));
      w = use(w, "practice");
    }
    const unlearned = structuredClone(w);
    assert.equal(journeyActions(w).find((a) => a.id === "practice")!.command?.type, "learn");
    w = use(w, "practice");
    assert.equal(w.player.manual, true);
    assert.equal(w.player.stones, unlearned.player.stones);
    assert.deepEqual(w.rng, unlearned.rng);
    assert.equal(journeyActions(w).find((a) => a.id === "practice")!.tab, "cultivation");
  }
});

test("market work is offered only in markets and pays the projected balance reward", () => {
  let w = world();
  const before = structuredClone(w);
  const work = journeyActions(w).find((a) => a.id === "work")!;
  assert.ok(work.hint.includes(String(B.actions.workSpiritStoneReward)));
  w = use(w, "work");
  assert.equal(w.player.stones - before.player.stones, B.actions.workSpiritStoneReward);
  for (const to of ["inn", "gate", "atlas.cangzhu"] as LocationId[]) {
    w = run(w, { type: "travel", to });
    assert.ok(!journeyActions(w).some((a) => a.command?.type === "work"));
  }
});

test("sect shortcuts change after visit, voluntary admission, contribution earnings and art learning", () => {
  for (const sect of SECTS) {
    let w = run(world(), { type: "travel", to: sect.home });
    w = use(w, "sect");
    assert.equal(journeyActions(w).find((a) => a.id === "sect")!.anchor, "sect-panel");
    assert.ok(!journeyActions(w).some((a) => a.command?.type === "joinSect"));
    w = run(w, { type: "joinSect", sectId: sect.id, confirmed: true });
    assert.ok(!journeyActions(w).some((a) => a.id === "sect-art"));
    while (w.player.sectMembership!.contribution < B.sects.artContributionCost) {
      const before = w;
      w = use(w, "sect-task");
      assert.equal(w.player.stones - before.player.stones, B.sects.taskStones);
      assert.equal(
        w.player.sectMembership!.contribution - before.player.sectMembership!.contribution,
        B.sects.taskContribution,
      );
    }
    w = use(w, "sect-art");
    assert.ok(w.player.sectMembership!.artLearned);
    assert.ok(!journeyActions(w).some((a) => a.id === "sect-art"));
    w = run(w, { type: "travel", to: "market" });
    assert.ok(!journeyActions(w).some((a) => a.id.startsWith("sect")));
  }
});

test("breakthrough readiness and injury alter shortcuts without writing time, RNG, rewards or memory", () => {
  let w = run(world(), { type: "travel", to: "inn" });
  w = use(w, "practice");
  for (const realm of [0, 1, 2, 3, 4]) {
    w.player.realm = realm;
    w.player.xp = threshold(w.player);
    w.player.hp = stats(w.player).maxHp - 1;
    const before = structuredClone(w);
    const actions = journeyActions(w);
    assert.equal(
      actions.find((a) => a.id === "practice")!.title === "准备突破",
      realm === 0 || realm === 3,
    );
    assert.equal(actions.find((a) => a.id === "rest")!.title, "调养伤势");
    assert.deepEqual(w, before);
  }
  w.player.location = "ruins";
  assert.deepEqual(journeyActions(w), []);
});
