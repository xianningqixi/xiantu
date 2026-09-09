import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, createWorld, validateWorld } from "../../lib/game/engine";
import { migrateSave } from "../../lib/game/migrations";
import { npcSubject, playerSubject } from "../../lib/game/portrait-subject";
import { withCampaignContent } from "../../lib/game/campaign-content";
import { portraitFeatures } from "../../lib/game/portrait-features";
import { currentPortrait, canRestorePortrait } from "../../lib/game/portrait-restore";
import type { PortraitLook } from "../../lib/game/portrait-look";
import type { Profile } from "../../lib/game/types";
import { portraitPrompt } from "../../lib/server/portrait-prompt";
import { composePortraitPrompt } from "../../lib/server/portrait-composition";

const profile: Profile = {
  name: "形貌修士",
  sex: "female",
  aptitude: 60,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 0, color: 0 },
};
const portraitId = "a".repeat(64);
test("adopting a redraw saves only appearance and image together; identity, simulation and history are unchanged", () => {
  for (const target of ["PLAYER", "NPC_LIN_WAN", "NPC_0041"]) {
    const world = createWorld(12345, profile, "redraw-" + target, undefined, {
      contentLocks: withCampaignContent([]),
    });
    const before = structuredClone(world);
    const actor = target === "PLAYER" ? world.player : world.npcs.find((a) => a.id === target)!;
    const subject =
      target === "PLAYER" ? playerSubject(world.profile, world.seed) : npcSubject(actor);
    const look: PortraitLook = {
      appearance: { face: 2, hair: 3, color: 1 },
      physique: { ...subject.physique, build: "athletic", heightCm: 180, bustCup: "B" },
      portraitFeatures: "月白长裤、平底靴与银色发簪",
    };
    const command = { type: "attachPortrait", target, portraitId, look } as const;
    const next = applyCommand(world, command, "redraw", world.revision);
    const changed = target === "PLAYER" ? next.player : next.npcs.find((a) => a.id === target)!;
    const updated =
      target === "PLAYER" ? playerSubject(next.profile, next.seed) : npcSubject(changed);
    assert.deepEqual(updated.appearance, look.appearance);
    assert.deepEqual(updated.physique, look.physique);
    assert.equal(portraitFeatures(updated), look.portraitFeatures);
    assert.equal(changed.portraitId, portraitId);
    assert.deepEqual(changed.portraitOriginal, currentPortrait(before, actor));
    const restored = structuredClone(next);
    if (target === "PLAYER") {
      restored.player = structuredClone(before.player);
      restored.profile = structuredClone(before.profile);
    } else restored.npcs[restored.npcs.findIndex((a) => a.id === target)] = structuredClone(actor);
    for (const key of [
      "revision",
      "notice",
      "appliedCommands",
      "commandReceipts",
      "receiptHistory",
    ] as const)
      Object.assign(restored, { [key]: before[key] });
    assert.deepEqual(restored, before);
    // The changed actor differs only in the explicitly adopted visual fields.
    const strip = (a: typeof actor) => {
      const {
        physique,
        portraitId,
        portraitAppearance,
        portraitFeatures,
        portraitOriginal,
        ...rest
      } = a;
      return rest;
    };
    assert.deepEqual(strip(changed), strip(actor));
    assert.deepEqual(world, before);
    assert.equal(applyCommand(next, command, "redraw", world.revision), next);
    validateWorld(next);
    assert.deepEqual(migrateSave(JSON.parse(JSON.stringify(next))).world, next);
  }
});

test("repeated redraws keep the first original and restore the player or NPC without changing their life", () => {
  for (const target of ["PLAYER", "NPC_LIN_WAN", "NPC_0041"]) {
    let w = createWorld(
      12345,
      { ...profile, portraitId: "d".repeat(64) },
      "restore-" + target,
      undefined,
      { contentLocks: withCampaignContent([]) },
    );
    const initial = structuredClone(w);
    const actor = (world: typeof w) =>
      target === "PLAYER" ? world.player : world.npcs.find((a) => a.id === target)!;
    const original = currentPortrait(w, actor(w));
    for (const id of ["a", "b"]) {
      w = applyCommand(
        w,
        {
          type: "attachPortrait",
          target,
          portraitId: id.repeat(64),
          look: {
            appearance: { face: 3, hair: 2, color: 1 },
            physique: { ...actor(w).physique!, heightCm: 179, bustCup: "D" },
            portraitFeatures: "墨绿衣衫与银簪",
          },
        },
        "redraw-" + id,
        w.revision,
      );
      assert.deepEqual(actor(w).portraitOriginal, original);
    }
    const changed = structuredClone(w);
    const command = { type: "restorePortrait", target } as const;
    w = applyCommand(w, command, "restore", w.revision);
    assert.deepEqual(currentPortrait(w, actor(w)), original);
    assert.deepEqual(actor(w).portraitOriginal, original);
    assert.equal(canRestorePortrait(w, actor(w)), false);
    assert.equal(applyCommand(w, command, "restore", changed.revision), w);
    for (const key of ["day", "rng", "relations", "events", "knowledge", "party"] as const)
      assert.deepEqual(w[key], initial[key]);
    const { portraitOriginal, ...restoredActor } = actor(w);
    assert.deepEqual(restoredActor, actor(initial));
    assert.deepEqual(w.profile, initial.profile);
    validateWorld(w);
    assert.deepEqual(migrateSave(JSON.parse(JSON.stringify(w))).world, w);
  }
});

test("old NPC redraws recover authored appearance while missing player originals and malformed snapshots are rejected", () => {
  const initial = createWorld(12345, profile, "legacy-original");
  for (const target of ["NPC_LIN_WAN", "NPC_0041"]) {
    let w = applyCommand(initial, { type: "attachPortrait", target, portraitId }, "draw", 0);
    const a = w.npcs.find((a) => a.id === target)!;
    delete a.portraitOriginal;
    a.portraitAppearance = { face: 3, hair: 3, color: 3 };
    a.physique!.heightCm = 199;
    a.portraitFeatures = "旧自定义";
    w = applyCommand(w, { type: "restorePortrait", target }, "restore", w.revision);
    assert.deepEqual(
      w.npcs.find((a) => a.id === target),
      initial.npcs.find((a) => a.id === target),
    );
  }
  const legacy = applyCommand(
    initial,
    { type: "attachPortrait", target: "PLAYER", portraitId },
    "draw",
    0,
  );
  delete legacy.player.portraitOriginal;
  const before = structuredClone(legacy);
  assert.throws(() =>
    applyCommand(legacy, { type: "restorePortrait", target: "PLAYER" }, "restore", 1),
  );
  assert.deepEqual(legacy, before);
  const baseline = currentPortrait(initial, initial.player);
  for (const bad of [
    { ...baseline, portraitId: "https://invalid" },
    { ...baseline, name: "另一人" },
    { ...baseline, appearance: undefined },
    {
      ...baseline,
      physique: { ...baseline.physique, apparentAge: baseline.physique.apparentAge + 1 },
    },
  ]) {
    const malformed = structuredClone(initial);
    malformed.player.portraitOriginal = bad;
    assert.throws(() => validateWorld(malformed));
  }
});
test("invalid redraw traits and identity fields cannot partially replace the old portrait", () => {
  const world = createWorld(12345, profile, "redraw-invalid");
  const before = structuredClone(world);
  const look: PortraitLook = {
    appearance: { face: 1, hair: 1, color: 1 },
    physique: { ...world.player.physique! },
    portraitFeatures: "",
  };
  for (const bad of [
    { ...look, physique: { ...look.physique, heightCm: 211 } },
    { ...look, appearance: { ...look.appearance, hair: 7 } },
    { ...look, physique: { ...look.physique, apparentAge: look.physique.apparentAge + 1 } },
    { ...look, sex: "male" },
    { ...look, name: "替身" },
  ])
    assert.throws(() =>
      applyCommand(
        world,
        { type: "attachPortrait", target: "PLAYER", portraitId, look: bad },
        "bad",
        world.revision,
      ),
    );
  assert.deepEqual(world, before);
  const malformed = structuredClone(world);
  malformed.npcs[0].portraitAppearance = { face: 99, hair: 0, color: 0 };
  assert.throws(() => validateWorld(malformed));
});
test("NPC redraw choices reach both art direction and the LLM composition request", async () => {
  const world = createWorld(12345, profile, "redraw-prompt");
  const subject = {
    ...npcSubject(world.npcs.find((a) => a.id === "NPC_LIN_WAN")!),
    appearance: { face: 2, hair: 3, color: 1 },
    portraitFeatures: "月白长裤与平底靴",
  };
  const direction = portraitPrompt(subject, "variant");
  assert.ok(direction.includes(subject.portraitFeatures));
  let sent: any;
  const fetcher: typeof fetch = async (_url, options) => {
    sent = JSON.parse(String(options?.body));
    return Response.json({
      choices: [
        {
          message: {
            content:
              "单人完整全身古风立绘，五官清晰，衣着完整，头顶与双脚鞋底均留边，浅色背景，无文字水印。".repeat(
                3,
              ),
          },
          finish_reason: "stop",
        },
      ],
    });
  };
  await composePortraitPrompt(
    new Request("http://localhost/api/portraits"),
    {
      baseUrl: "http://localhost/v1",
      model: "fixture",
      key: "fixture",
      timeout: 1000,
      maxTokens: 1000,
    } as any,
    fetcher,
    subject,
    "variant",
  );
  assert.equal(JSON.parse(sent.messages[1].content).character.features, subject.portraitFeatures);
});
