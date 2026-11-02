import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createWorld } from "../../lib/game/engine";
import {
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_IDS,
  achievementById,
  achievementRows,
  achievementSummary,
  achievementTally,
  settleAchievements,
} from "../../lib/game/achievements";
import { validateWorld } from "../../lib/game/validate";
import type { Profile } from "../../lib/game/types";

const profile: Profile = {
  name: "成就测试",
  sex: "male",
  aptitude: 70,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 1, color: 2 },
};

test("every achievement id is unique and belongs to a declared category", () => {
  assert.equal(new Set(ACHIEVEMENT_IDS).size, ACHIEVEMENT_IDS.length);
  for (const id of ACHIEVEMENT_IDS) {
    const a = achievementById(id)!;
    assert.ok(a, id);
    assert.ok(Object.keys(ACHIEVEMENT_CATEGORIES).includes(a.category), id);
    assert.ok(a.target >= 1, id);
    assert.ok(a.title && a.description, id);
  }
});

test("the summary counts every category and starts empty", () => {
  const w = createWorld(20261030, profile, "achievement-summary");
  const summary = achievementSummary(w);
  assert.equal(summary.done, 0);
  assert.equal(summary.total, ACHIEVEMENT_IDS.length);
  assert.equal(
    Object.values(summary.byCategory).reduce((n, c) => n + c.total, 0),
    ACHIEVEMENT_IDS.length,
  );
  assert.equal(w.achievements, undefined);
});

test("a qualifying command unlocks exactly once and records a dated journal entry", () => {
  const w = createWorld(20261030, profile, "achievement-unlock");
  const unlocked = settleAchievements(w);
  assert.deepEqual(unlocked, [], "开局不该白送成就");
  w.player.manual = true;
  const again = settleAchievements(w);
  assert.deepEqual(again, ["manual-learned"]);
  assert.equal(w.achievements!["manual-learned"], w.day);
  const entry = w.events.find((e) => e.kind === "achievement")!;
  assert.match(entry.text, /功法在身/);
  assert.equal(entry.id, "achievement:manual-learned");
  assert.deepEqual(settleAchievements(w), [], "同一条成就不会重复写入");
  validateWorld(w);
});

test("the engine settles achievements as part of a normal command", () => {
  let w = createWorld(20261030, profile, "achievement-engine");
  w = applyCommand(w, { type: "wait", days: 1 }, "achievement:wait", w.revision);
  assert.equal(typeof w.achievements, "object");
  assert.equal(w.achievements!["manual-learned"], undefined);
  assert.deepEqual(w.achievements, {});
});

test("progress stops at the target even past it and hidden rows mask their copy", () => {
  const w = createWorld(20261030, profile, "achievement-rows");
  w.day = 500;
  const rows = achievementRows(w);
  const day = rows.find((r) => r.id === "day-365")!;
  assert.equal(day.current, 365);
  assert.equal(day.done, false);
  const broke = rows.find((r) => r.id === "broke")!;
  assert.equal(broke.hidden, true);
});

test("tally counts victories, retreats and defeats separately", () => {
  const w = createWorld(20261030, profile, "achievement-tally");
  w.events.push(
    { id: "e1", day: 1, kind: "battle-win", text: "", actors: ["PLAYER"], public: false, count: 3 },
    { id: "e2", day: 1, kind: "road-battle-retreat", text: "", actors: ["PLAYER"], public: false },
    { id: "e3", day: 1, kind: "road-battle-defeat", text: "", actors: ["PLAYER"], public: false },
    { id: "e4", day: 1, kind: "explore-encounter", text: "", actors: ["PLAYER"], public: false },
  );
  const t = achievementTally(w);
  assert.equal(t.victories, 1);
  assert.equal(t.retreats, 1);
  assert.equal(t.defeats, 1);
  assert.equal(t.enemiesDefeated, 3);
  assert.equal(t.exploreWins, 1);
});

test("save validation rejects an unknown id and a future unlock day", () => {
  const w = createWorld(20261030, profile, "achievement-validate");
  w.achievements = { "not-a-real-achievement": 0 };
  assert.throws(() => validateWorld(w), /成就记录不合法/);
  w.achievements = { "manual-learned": w.day + 5 };
  assert.throws(() => validateWorld(w), /成就记录不合法/);
  w.achievements = { "manual-learned": w.day };
  validateWorld(w);
});
