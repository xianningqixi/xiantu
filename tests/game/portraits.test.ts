import catalog from "../../content-packs/official-qingshi/art/portraits/catalog.json";
import { bundledPortrait } from "../../lib/game/portrait-library";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createWorld, applyCommand, validateWorld } from "../../lib/game/engine";
import { migrateSave } from "../../lib/game/migrations";
import { defaultPhysique } from "../../lib/game/physique";
import { npcSubject, playerSubject } from "../../lib/game/portrait-subject";
import { portraitPrompt, portraitDirection } from "../../lib/server/portrait-prompt";
import { handlePortrait } from "../../lib/server/portraits";
import { ModelSettingsStore } from "../../lib/server/model-settings-store";
import { handleModelSettings } from "../../lib/server/model-settings";
import { modelDefaults } from "../../lib/ai/model-settings";
import type { Profile } from "../../lib/game/types";
const profile: Profile = {
  name: "立绘验收",
  sex: "female",
  aptitude: 55,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 0, color: 0 },
};
const portraitId = "a".repeat(64);
test("appearance is deterministic and adult, never aging with cultivation or changing simulation draws", () => {
  const w = createWorld(12345, profile, "body");
  assert.deepEqual(w, createWorld(12345, profile, "body"));
  const before = structuredClone(w);
  const prompts = w.npcs.map((a) => portraitPrompt(npcSubject(a), "fixed"));
  assert.equal(new Set(prompts).size, w.npcs.length);
  assert.equal(
    new Set(w.npcs.map((a) => JSON.stringify(portraitDirection(npcSubject(a))))).size,
    w.npcs.length,
  );
  for (const a of w.npcs) {
    assert.ok(a.physique!.apparentAge >= 21);
    if (a.sex === "female") assert.ok(a.physique!.apparentAge <= 29);
    const aged = { ...a, ageDays: 300 * 360 };
    assert.equal(portraitPrompt(npcSubject(aged), "fixed"), portraitPrompt(npcSubject(a), "fixed"));
    assert.match(portraitPrompt(npcSubject(a), "fixed"), /双脚完整可见/);
  }
  assert.deepEqual(w, before);
  const changed = createWorld(
    12345,
    { ...profile, physique: { ...defaultPhysique("female"), heightCm: 178 } },
    "body",
  );
  assert.deepEqual(changed.npcs, w.npcs);
  assert.deepEqual(changed.rng, w.rng);
});
test("schema five migrates on a copy preserving history, ages, resources and random streams", () => {
  const legacy: any = structuredClone(createWorld(8877, profile, "old"));
  legacy.schemaVersion = 5;
  delete legacy.profile.physique;
  for (const a of [legacy.player, ...legacy.npcs]) delete a.physique;
  const original = structuredClone(legacy);
  const { world, migrated } = migrateSave(legacy);
  assert.ok(migrated);
  assert.equal(world.schemaVersion, 6);
  assert.deepEqual(legacy, original);
  const restored: any = structuredClone(world);
  restored.schemaVersion = 5;
  delete restored.profile.physique;
  for (const a of [restored.player, ...restored.npcs]) delete a.physique;
  assert.deepEqual(restored, original);
  assert.equal(migrateSave(world).migrated, false);
});
test("portrait adoption is an idempotent zero-day command and rejects malformed or inconsistent saves", () => {
  const w = createWorld(12345, profile, "adopt");
  const before = structuredClone(w);
  const cmd = { type: "attachPortrait", target: "PLAYER", portraitId } as const;
  const next = applyCommand(w, cmd, "portrait-1", 0);
  assert.equal(next.profile.portraitId, portraitId);
  assert.equal(next.player.portraitId, portraitId);
  assert.equal(next.day, w.day);
  assert.deepEqual(next.rng, w.rng);
  assert.deepEqual(next.events, w.events);
  assert.deepEqual(next.npcs, w.npcs);
  assert.deepEqual(
    { ...next.player, portraitId: undefined },
    { ...w.player, portraitId: undefined },
  );
  assert.deepEqual(w, before);
  assert.equal(applyCommand(next, cmd, "portrait-1", 0), next);
  assert.throws(() => applyCommand(w, { ...cmd, portraitId: "https://bad.example" }, "invalid", 0));
  assert.throws(() => applyCommand(w, { ...cmd, target: "missing" }, "invalid", 0));
  const broken = structuredClone(next);
  broken.player.physique!.heightCm++;
  assert.throws(() => validateWorld(broken));
});
const request = (body: object, cookie = "", origin = "http://localhost", signal?: AbortSignal) =>
  new Request("http://localhost/api/portraits", {
    method: "POST",
    headers: { Origin: origin, Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
const input = () => ({ subject: playerSubject(profile, 12345), variation: randomUUID() });
const png =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSr8AAAAASUVORK5CYII=";
async function setup(t: { after: (fn: () => Promise<void>) => void }) {
  const dir = await mkdtemp(join(tmpdir(), "xiantu-portraits-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const options = { store: new ModelSettingsStore(dir), env: {} };
  const read = await handleModelSettings(request({ action: "read" }), options);
  const cookie = read.headers.get("set-cookie")!.split(";")[0];
  await handleModelSettings(
    request(
      {
        action: "save",
        kind: "image",
        config: {
          ...modelDefaults("image"),
          enabled: true,
          baseUrl: "https://images.provider.example/v1",
          model: "portrait-model",
          key: "fake-portrait-private-key",
          revision: 0,
        },
      },
      cookie,
    ),
    options,
  );
  return { ...options, cookie };
}
test("portrait route uses the personal image model with full-body prompt and no secret response", async (t) => {
  const { cookie, ...options } = await setup(t);
  const reply = await handlePortrait(request(input(), cookie), {
    ...options,
    fetcher: async (url, init) => {
      assert.equal(url, "https://images.provider.example/v1/images/generations");
      const data = JSON.parse(init?.body as string);
      assert.equal(data.model, "portrait-model");
      assert.equal(data.size, "1024x1536");
      assert.match(data.prompt, /身高 \d+ cm/);
      assert.match(data.prompt, /妩媚/);
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer fake-portrait-private-key",
      );
      return Response.json({ data: [{ b64_json: png }] });
    },
  });
  assert.equal(reply.status, 200);
  assert.equal(reply.headers.get("cache-control"), "no-store");
  assert.ok(!(await reply.clone().text()).includes("fake-portrait-private-key"));
  assert.match((await reply.json()).image, /^data:image\/png/);
});
test("invalid portrait inputs, cross origin and absent service never invoke a provider", async (t) => {
  const { cookie, ...options } = await setup(t);
  const protectedOptions = {
    ...options,
    fetcher: (async () => {
      throw new Error("must not fetch");
    }) as typeof fetch,
  };
  assert.equal(
    (await handlePortrait(request(input(), cookie, "https://foreign.example"), protectedOptions))
      .status,
    403,
  );
  assert.equal(
    (await handlePortrait(request({ ...input(), prompt: "arbitrary" }, cookie), protectedOptions))
      .status,
    400,
  );
  const young = input();
  young.subject.physique.apparentAge = 16;
  assert.equal((await handlePortrait(request(young, cookie), protectedOptions)).status, 400);
  const old = input();
  old.subject.physique.apparentAge = 70;
  assert.equal((await handlePortrait(request(old, cookie), protectedOptions)).status, 400);
  assert.equal((await handlePortrait(request(input()), protectedOptions)).status, 409);
});
test("generation serializes each session, cancellation releases it, failures redact upstream messages", async (t) => {
  const { cookie, ...options } = await setup(t);
  const abort = new AbortController();
  let started!: () => void;
  const startedPromise = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = handlePortrait(request(input(), cookie, "http://localhost", abort.signal), {
    ...options,
    fetcher: async (_url, init) => {
      started();
      return new Promise((_resolve, reject) =>
        init!.signal!.addEventListener("abort", () =>
          reject(new Error("private-provider-message")),
        ),
      );
    },
  });
  await startedPromise;
  assert.equal((await handlePortrait(request(input(), cookie), options)).status, 429);
  abort.abort();
  assert.equal((await pending).status, 499);
  const failed = await handlePortrait(request(input(), cookie), {
    ...options,
    fetcher: async () => new Response("private-provider-message", { status: 403 }),
  });
  assert.equal(failed.status, 502);
  assert.ok(!(await failed.text()).includes("private-provider-message"));
});

test("bundled full-body artwork matches saved NPC appearance and cannot become the player portrait", () => {
  const world = createWorld(12345, profile, "library");
  const before = structuredClone(world);
  for (const entry of catalog.entries) {
    const npc = world.npcs.find((a) => a.id === entry.actorId)!;
    assert.ok(npc);
    assert.deepEqual(entry.subject, npcSubject(npc));
    const portrait = bundledPortrait(npcSubject(npc));
    assert.ok(portrait);
    assert.equal(portrait.lazy, true);
    assert.match(portrait.src, /\.webp$/);
    assert.equal(bundledPortrait({ ...npcSubject(npc), role: "player" }), null);
    assert.equal(
      bundledPortrait({
        ...npcSubject(npc),
        physique: { ...npc.physique!, heightCm: npc.physique!.heightCm + 1 },
      }),
      null,
    );
  }
  assert.equal(bundledPortrait(playerSubject(profile, 12345)), null);
  assert.deepEqual(world, before);
});
