import { answerDaily } from "./daily-test-helpers";
import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createWorld, gainPerDay } from "../../lib/game/engine";
import { threshold } from "../../lib/game/rules";
import { trainingPreview } from "../../lib/game/training-preview";
import { beginActionSummary, finishActionSummary, trainingGain } from "../../lib/ui/action-summary";
import { peopleRows, relationshipDisplay } from "../../lib/ui/character-presentation";
import { objective } from "../../lib/game/presentation";
import { journeyContext, localChapterStatus } from "../../lib/game/journey-presentation";
import { validateModelDraft } from "../../lib/ai/model-draft";
import { modelDefaults } from "../../lib/ai/model-settings";
import type { Profile, World } from "../../lib/game/types";
import { PACK } from "../../lib/game/content/official";
import B from "../../lib/game/content/balance.json";
import { defaultPhysique, physiqueSchema } from "../../lib/game/physique";
import { draftSchema, profileSchema } from "../../lib/game/protocol";
import { portraitSubjectSchema, playerSubject } from "../../lib/game/portrait-subject";
const profile: Profile = {
  name: "评审回归",
  sex: "female",
  aptitude: 75,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 0, color: 0 },
};
const fresh = () => createWorld(12345, profile, "ui-review-save", 40);
test("new adult characters validate across creation draft, world and portrait pathways", () => {
  for (const sex of ["female", "male"] as const) {
    const p = {
      ...profile,
      sex,
      physique: { ...defaultPhysique(sex), apparentAge: B.world.startAgeYears },
    };
    profileSchema.parse(p);
    const draft = draftSchema.parse({
      version: 1,
      revision: 0,
      seed: 12345,
      roll: 0,
      profile: p,
      previousLook: { profile: { ...p, portraitId: "a".repeat(64) }, seed: 12345, roll: 0 },
    });
    assert.equal(draft.previousLook?.profile.portraitId, "a".repeat(64));
    const w = createWorld(12345, p, `adult-${sex}`, 40);
    assert.equal(w.player.physique?.apparentAge, B.world.startAgeYears);
    portraitSubjectSchema.parse(playerSubject(w.profile, w.seed));
    assert.equal(physiqueSchema.safeParse({ ...p.physique, apparentAge: 17 }).success, false);
  }
});
const step = (w: World, command: Parameters<typeof applyCommand>[1]) =>
  answerDaily(applyCommand(w, command, `ui:${w.revision + 1}`, w.revision));
test("training preview equals execution across minor realms and never mutates the world", () => {
  for (const realm of [0, 1, 2, 3] as const)
    for (const stone of [false, true])
      for (const nearFull of [false, true]) {
        const w = fresh();
        w.player.manual = true;
        w.player.realm = realm;
        w.player.xp = nearFull ? threshold(w.player) - 1 : 0;
        w.player.stones = 100;
        const before = JSON.stringify(w),
          preview = trainingPreview(w, { days: 7, mode: "ready", stone });
        assert.equal(preview.stoneBudget, stone ? 30 : 0);
        assert.equal(JSON.stringify(w), before);
        let result = step(w, preview.command);
        while (result.longAction) result = step(result, { type: "step" });
        assert.equal(result.day - w.day, preview.readyAfter);
        assert.equal(result.player.stones, 100 - (stone ? preview.readyAfter : 0));
        assert.ok(result.player.xp >= threshold(result.player));
        assert.equal(
          result.player.xp,
          w.player.xp + gainPerDay(w, w.player, stone) * preview.readyAfter,
        );
      }
});
test("conditional training refuses a full bar before spending any day or stone", () => {
  const w = fresh();
  w.player.manual = true;
  w.player.xp = threshold(w.player);
  const before = JSON.stringify(w);
  for (const mode of ["days", "ready", "important"]) {
    const preview = trainingPreview(w, { days: 30, mode, stone: false });
    assert.ok(preview.reason);
    assert.throws(() => step(w, preview.command), /圆满|停止/);
  }
  assert.equal(JSON.stringify(w), before);
});
test("completed summaries freeze results and restored actions explicitly use partial baselines", () => {
  let w = fresh();
  w.player.manual = true;
  w.player.stones = 100;
  const start = beginActionSummary(w, "train");
  w = step(w, trainingPreview(w, { days: 7, mode: "ready", stone: true }).command);
  w = step(w, { type: "step" });
  const partial = beginActionSummary(w, "train", w.longAction!.checkpoint);
  assert.equal(partial.partial, true);
  assert.equal(partial.observedFromDay, w.day);
  while (w.longAction) w = step(w, { type: "step" });
  const full = finishActionSummary(start, w, "completed"),
    resumed = finishActionSummary(partial, w, "completed");
  const frozen = JSON.stringify(full),
    gain = trainingGain(full);
  assert.equal(full.endStones - start.startStones, -full.endDay);
  assert.equal(gain, 38);
  w = step(w, { type: "work" });
  assert.equal(JSON.stringify(full), frozen);
  assert.equal(trainingGain(full), gain);
  assert.equal(resumed.startDay, 0);
  assert.equal(resumed.observedFromDay, 1);
});
test("scene objectives stay at the current dialogue, ended objectives lead to the journal", () => {
  let w = fresh();
  for (let i = 0; i < 4; i++) {
    const c = journeyContext(w),
      goal = objective(w);
    assert.ok(c.actionable);
    assert.equal(goal.anchor, c.anchor);
    assert.equal(goal.tab, "journey");
    assert.equal("location" in goal ? goal.location : undefined, w.player.location);
    w = step(w, { type: "choose", nodeId: c.official!.id, choiceId: c.official!.choices[0].id });
  }
  w.ended = true;
  assert.equal(objective(w).tab, "journal");
  assert.equal(journeyContext(w).actionable, false);
});
test("people discovery preserves the legacy known direction and does not expose unknown distant NPCs", () => {
  const w = step(fresh(), { type: "meet", target: PACK.roles.primary }),
    a = w.npcs.find((a) => a.id === PACK.roles.primary)!;
  w.relations = w.relations.filter((r) => !(r.from === "PLAYER" && r.to === a.id));
  const r = w.relations.find((r) => r.from === a.id && r.to === "PLAYER")!;
  r.known = true;
  a.location = "xiaye.market" as typeof a.location;
  const before = JSON.stringify(w);
  assert.equal(peopleRows(w, a.name, "known", "name")[0]?.id, a.id);
  assert.equal(JSON.stringify(w), before);
  r.known = false;
  assert.equal(peopleRows({ ...w }, a.name, "known", "name").length, 0);
});
test("bond display requires mutually latest recorded bonds and retains adverse attitude", () => {
  const w = fresh(),
    a = w.npcs[0],
    b = w.npcs[1];
  w.events.push({
    id: "ui-bond",
    day: 0,
    kind: "intimacy",
    text: "结侣",
    actors: ["PLAYER", a.id],
    public: false,
    intimacy: { kind: "bond", consent: "mutual" },
  });
  assert.equal(relationshipDisplay(w, "PLAYER", a.id).bonded, true);
  w.events.push({
    id: "ui-next-bond",
    day: 1,
    kind: "intimacy",
    text: "另一段结侣",
    actors: ["PLAYER", b.id],
    public: false,
    intimacy: { kind: "bond", consent: "mutual" },
  });
  assert.equal(relationshipDisplay(w, "PLAYER", a.id).bonded, false);
  assert.equal(relationshipDisplay(w, "PLAYER", b.id).bonded, true);
});
test("key-only drafts reuse personal credentials only for the fixed endpoint", () => {
  const initial = {
    ...modelDefaults("llm"),
    enabled: true,
    hasKey: true,
    source: "personal" as const,
    revision: 1,
  };
  const draft = { key: "", revision: 1 };
  assert.deepEqual(validateModelDraft(draft, initial, "llm"), {});
  assert.ok(
    validateModelDraft(draft, { ...initial, baseUrl: "https://different.example/v1" }, "llm").key,
  );
  assert.ok(validateModelDraft(draft, { ...initial, needsKey: true }, "llm").key);
  assert.ok(validateModelDraft(draft, { ...initial, source: "server" }, "llm").key);
  assert.ok(validateModelDraft({ ...draft, key: "first\nsecond" }, initial, "llm").key);
  assert.ok(validateModelDraft({ ...draft, key: "x".repeat(2049) }, initial, "llm").key);
});
