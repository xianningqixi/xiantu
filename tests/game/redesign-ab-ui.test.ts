import test from "node:test";
import assert from "node:assert/strict";
import {
  objective,
  presentationUnlocks,
  presentationShows,
  presentationActionVisible,
} from "../../lib/game/presentation";
import { realmPresentation, practicePreview } from "../../lib/ui/realm-presentation";
import { REALM_KEYS, advanceRule, threshold, realmIndex } from "../../lib/game/rules";
import { realmFixture, fixtureFor, advanceFixture } from "./redesign-ab-fixtures";
import { applyCommand } from "../../lib/game/engine";
import { dailyScene } from "../../lib/game/daily-events";

test("all thirteen realm projections execute the configured advancement and preserve read-only state", () => {
  for (const [realm, key] of REALM_KEYS.entries()) {
    const w = realmFixture(realm),
      before = structuredClone(w),
      rule = advanceRule(w.player),
      view = realmPresentation(w.player),
      goal = objective(w);
    assert.equal(view.kind, rule.kind, key);
    assert.equal(view.preparation, rule.kind === "major", key);
    if (rule.kind === "minor") assert.equal(goal.command?.type, "advanceMinor", key);
    else if (rule.kind === "cap")
      assert.ok(
        !goal.command || !["train", "advanceMinor", "breakthrough"].includes(goal.command.type),
        key,
      );
    else assert.equal(goal.anchor, "breakthrough-preparation", key);
    assert.ok(practicePreview(w).reason, key);
    presentationUnlocks(w);
    assert.deepEqual(w, before, key);
    if (rule.kind !== "cap") {
      const actual = fixtureFor(realm),
        next = advanceFixture(actual);
      assert.equal(next.player.realm, realmIndex(rule.targetRealm!), key);
      assert.equal(next.player.xp, 5, key);
      assert.equal(next.day - actual.day, rule.days, key);
      assert.equal(next.player.alive, true, key);
    }
  }
});
test("unlocks evaluate configured property paths, comparisons and boolean prerequisites at every boundary", () => {
  for (const realm of REALM_KEYS.keys()) {
    const w = realmFixture(realm);
    assert.equal(presentationShows(w, "tab.people"), realm >= realmIndex("QI_1"));
    assert.equal(presentationShows(w, "travel.four-cities"), realm >= realmIndex("QI_3"));
    assert.equal(presentationShows(w, "visitSect"), realm >= realmIndex("QI_5"));
    assert.equal(presentationShows(w, "intimacy.bond"), realm >= realmIndex("FOUNDATION_1"));
    assert.equal(presentationShows(w, "training-settings"), true);
    assert.equal(presentationActionVisible(w, { type: "formParty" }), realm >= realmIndex("QI_3"));
    assert.equal(presentationActionVisible(w, { type: "expedition" }), realm >= realmIndex("QI_3"));
    assert.equal(
      presentationActionVisible(w, { type: "meet", target: "NPC_LIN_WAN" }),
      realm >= realmIndex("QI_1"),
    );
    w.player.manual = false;
    assert.equal(presentationShows(w, "training-settings"), false);
    assert.equal(presentationShows(w, "unknown.feature"), false);
  }
});
test("a durable pending daily choice takes precedence over the saved long-action pause", () => {
  let w = realmFixture(realmIndex("QI_3"), 1);
  w.player.xp = 0;
  w = applyCommand(w, { type: "train", days: 30, stoneMethod: false }, "train", w.revision);
  for (let i = 0; i < 30 && !w.pendingDailyEventId; i++)
    w = applyCommand(w, { type: "step" }, `step${i}`, w.revision);
  assert.ok(w.pendingDailyEventId);
  const before = structuredClone(w),
    goal = objective(w),
    node = dailyScene(w)!;
  assert.equal(goal.command?.type, "choose");
  assert.equal(goal.choices?.length, node.choices.length);
  assert.deepEqual(w, before);
  const command = goal.choices!.find(
    (c) => c.command.type === "choose" && ["decline", "face"].includes(c.command.choiceId),
  )!.command;
  const next = applyCommand(w, command, "reply", w.revision);
  assert.equal(next.pendingDailyEventId, null);
  assert.deepEqual(next.longAction, w.longAction);
  assert.throws(() => applyCommand(w, { type: "work" }, "unrelated", w.revision));
});
test("ordinary failure and severe setback remain nonfatal and reproject the actual new rule", () => {
  for (const result of ["ordinary", "setback"] as const) {
    const w = fixtureFor(realmIndex("QI_9"), result),
      next = advanceFixture(w);
    assert.equal(next.player.alive, true);
    assert.ok(next.player.hp > 0);
    assert.equal(next.player.realm, w.player.realm - (result === "setback" ? 1 : 0));
    assert.equal(realmPresentation(next.player).kind, advanceRule(next.player).kind);
    assert.ok(next.player.xp < threshold(next.player));
  }
});
