import catalog from "../../content-packs/official-qingshi/art/portraits/catalog.json";
import { bundledPortrait, portraitSubjectKey } from "../../lib/game/portrait-library";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createWorld, applyCommand, validateWorld } from "../../lib/game/engine";
import { migrateSave } from "../../lib/game/migrations";
import { CAMPAIGN_LOCKS } from "../../lib/game/campaign-content";
import { BUST_CUPS, defaultPhysique } from "../../lib/game/physique";
import { portraitFeatures, PORTRAIT_FEATURES_MAX_LENGTH } from "../../lib/game/portrait-features";
import { profileSchema } from "../../lib/game/protocol";
import { npcSubject, playerSubject } from "../../lib/game/portrait-subject";
import { portraitPrompt, portraitDirection } from "../../lib/server/portrait-prompt";
import { handlePortrait } from "../../lib/server/portraits";
import { ModelSettingsStore } from "../../lib/server/model-settings-store";
import { handleModelSettings } from "../../lib/server/model-settings";
import { MODEL_PRESETS, modelDefaults } from "../../lib/ai/model-settings";
import type { Profile } from "../../lib/game/types";
import { EXTENSIONS, extensionPortrait } from "../../lib/game/content/extensions";
import { imageAsset } from "../../lib/game/images";
const profile: Profile = {
  name: "立绘验收",
  sex: "female",
  aptitude: 55,
  artifact: "focus",
  mode: "simple",
  appearance: { face: 0, hair: 0, color: 0 },
};
const portraitId = "a".repeat(64);
test("cup choices survive saves, drive portraits and preserve legacy measurements and world rules", () => {
  const baseline = createWorld(12345, profile, "cups", undefined, { contentLocks: CAMPAIGN_LOCKS });
  const legacy = structuredClone(baseline);
  assert.deepEqual(migrateSave(legacy).world, baseline);
  assert.deepEqual(legacy, baseline);
  const keys = new Set<string>();
  for (const bustCup of BUST_CUPS) {
    const physique = { ...baseline.profile.physique!, bustCup };
    const custom = { ...profile, physique };
    assert.deepEqual(profileSchema.parse(custom), custom);
    const world = createWorld(12345, custom, "cups", undefined, { contentLocks: CAMPAIGN_LOCKS });
    validateWorld(world);
    assert.deepEqual(world, {
      ...baseline,
      profile: { ...baseline.profile, physique },
      player: { ...baseline.player, physique },
    });
    assert.deepEqual(migrateSave(world).world, world);
    const subject = playerSubject(custom, 12345);
    const prompt = portraitPrompt(subject, "fixed");
    assert.ok(prompt.includes(`胸型 ${bustCup} 杯`));
    assert.doesNotMatch(prompt, /胸围 \d+ cm/);
    keys.add(portraitSubjectKey(subject));
  }
  assert.equal(keys.size, BUST_CUPS.length);
  assert.equal(
    profileSchema.safeParse({
      ...profile,
      physique: { ...baseline.profile.physique, bustCup: "F" },
    }).success,
    false,
  );
});
test("editable portrait features replace default attire, survive validation and leave world rules unchanged", () => {
  const features = "月白长裤，棉袜和平底靴，袖口绣着银色云纹";
  const custom: Profile = { ...profile, portraitFeatures: features };
  assert.deepEqual(profileSchema.parse(custom), custom);
  const subject = playerSubject(custom, 12345);
  const prompt = portraitPrompt(subject, "fixed");
  assert.ok(prompt.includes(features));
  assert.doesNotMatch(prompt, /高开叉|丝袜|高跟/);
  assert.equal(portraitFeatures(profile), "高开叉裙 · 丝袜美腿 · 高跟鞋");
  const baseline = createWorld(12345, profile, "features");
  const world = createWorld(12345, custom, "features");
  validateWorld(world);
  assert.deepEqual(world, {
    ...baseline,
    profile: { ...baseline.profile, portraitFeatures: custom.portraitFeatures },
  });
  const broken = structuredClone(world);
  broken.profile.portraitFeatures = "字".repeat(PORTRAIT_FEATURES_MAX_LENGTH + 1);
  assert.throws(() => validateWorld(broken));
  assert.equal(profileSchema.safeParse(broken.profile).success, false);
  assert.equal(profileSchema.safeParse({ ...custom, portraitFeatures: ["一项"] }).success, false);
  assert.ok(profileSchema.safeParse({ ...custom, portraitFeatures: ["", "", ""] }).success);
  const empty = { ...custom, portraitFeatures: "" };
  assert.ok(profileSchema.safeParse(empty).success);
  assert.equal(portraitFeatures(empty), "");
  assert.doesNotMatch(portraitPrompt(playerSubject(empty, 12345), "fixed"), /高开叉|丝袜|高跟/);
  const legacy: Profile = { ...profile, portraitFeatures: ["月白长裤", "棉袜", "平底靴"] };
  const legacyWorld = createWorld(12345, legacy, "legacy-features");
  validateWorld(legacyWorld);
  assert.deepEqual(profileSchema.parse(legacy), legacy);
  assert.equal(portraitFeatures(legacy), "月白长裤 · 棉袜 · 平底靴");
  assert.deepEqual(legacyWorld.profile.portraitFeatures, legacy.portraitFeatures);
  assert.ok(
    portraitPrompt(playerSubject(legacy, 12345), "fixed").includes(portraitFeatures(legacy)),
  );
  assert.equal(
    profileSchema.safeParse({ ...legacy, portraitFeatures: ["", "字".repeat(41), ""] }).success,
    false,
  );
  const npc = baseline.npcs.find((a) => a.sex === "female")!;
  assert.match(portraitPrompt(npcSubject(npc), "fixed"), /丝袜/);
});
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
    const prompt = portraitPrompt(npcSubject(a), "fixed");
    if (a.sex === "female") {
      assert.match(prompt, /按角色原有胸围或杯型保持自然胸型/);
      assert.match(prompt, /不改变保存的身形/);
      assert.match(prompt, /不透明衣料覆盖/);
    } else {
      assert.doesNotMatch(prompt, /胸前剪裁|胸围或杯型/);
    }
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
  const legacy: any = structuredClone(
    createWorld(8877, profile, "old", undefined, { contentLocks: CAMPAIGN_LOCKS }),
  );
  legacy.schemaVersion = 5;
  delete legacy.profile.physique;
  for (const a of [legacy.player, ...legacy.npcs]) delete a.physique;
  const original = structuredClone(legacy);
  const { world, migrated } = migrateSave(legacy);
  assert.ok(migrated);
  assert.equal(world.schemaVersion, 7);
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
    { ...next.player, portraitId: undefined, portraitOriginal: undefined },
    { ...w.player, portraitId: undefined, portraitOriginal: undefined },
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
const composedPrompt =
  "单人完整全身古风立绘，一位明确成年的清秀修士，身高 172 cm，身姿自然纤柔，衣服剪裁顺应身材。乌发束起，身穿月白长裤，袖口绣银色云纹，搭配棉袜和平底靴。以柔和侧光表现布料质感，姿态舒展，五官清晰，头饰顶端与双脚鞋底均留足画面边距，简洁浅色背景，精细非像素插画，无文字、水印或多余人物。";
const compositionReply = (content = composedPrompt, finishReason = "stop") =>
  Response.json({ choices: [{ message: { content }, finish_reason: finishReason }] });
async function setup(t: { after: (fn: () => Promise<void>) => void }, withLlm = true) {
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
          key: "fake-portrait-private-key",
          revision: 0,
        },
      },
      cookie,
    ),
    options,
  );
  if (withLlm)
    await handleModelSettings(
      request(
        {
          action: "save",
          kind: "llm",
          config: {
            key: "fake-text-private-key",
            revision: 0,
          },
        },
        cookie,
      ),
      options,
    );
  return { ...options, cookie };
}
test("portrait route composes all current form fields with the LLM, then sends its exact prompt to the image model", async (t) => {
  const { cookie, ...options } = await setup(t);
  const subject = playerSubject(
    {
      ...profile,
      physique: { ...defaultPhysique("female"), heightCm: 172, bustCup: "E" },
      portraitFeatures: "月白长裤，棉袜和平底靴，袖口绣着银色云纹",
    },
    12345,
  );
  const calls: string[] = [];
  const reply = await handlePortrait(request({ ...input(), subject }, cookie), {
    ...options,
    fetcher: async (url, init) => {
      calls.push(String(url));
      const data = JSON.parse(init?.body as string);
      if (calls.length === 1) {
        assert.equal(url, `${MODEL_PRESETS.llm.baseUrl}/chat/completions`);
        assert.equal(data.model, MODEL_PRESETS.llm.model);
        assert.equal(data.max_completion_tokens, modelDefaults("llm").maxTokens);
        assert.equal(
          new Headers(init?.headers).get("authorization"),
          "Bearer fake-text-private-key",
        );
        const brief = JSON.parse(data.messages[1].content);
        assert.deepEqual(brief.character, {
          role: "player",
          sex: "成年女性",
          apparentAge: subject.physique.apparentAge,
          face: "清秀",
          hair: "束发",
          clothing: "青衫",
          body: "纤柔",
          heightCm: 172,
          bustCup: "E",
          features: subject.portraitFeatures,
        });
        assert.doesNotMatch(brief.artReference, /腰围|臀围|胸围 \d/);
        assert.match(brief.artReference, /胸型 E 杯/);
        return compositionReply();
      }
      assert.equal(url, `${MODEL_PRESETS.image.baseUrl}/images/generations`);
      assert.equal(data.model, MODEL_PRESETS.image.model);
      assert.equal(data.size, "1024x1536");
      assert.equal(data.prompt, composedPrompt);
      assert.equal(
        new Headers(init?.headers).get("authorization"),
        "Bearer fake-portrait-private-key",
      );
      return Response.json({ data: [{ b64_json: png }] });
    },
  });
  assert.equal(reply.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(reply.headers.get("cache-control"), "no-store");
  assert.ok(!(await reply.clone().text()).includes("fake-portrait-private-key"));
  assert.ok(!(await reply.clone().text()).includes("fake-text-private-key"));
  assert.match((await reply.json()).image, /^data:image\/png/);
});
test("male portrait composition omits cup and legacy measurements even in an older profile", async (t) => {
  const { cookie, ...options } = await setup(t);
  const subject = playerSubject(
    { ...profile, sex: "male", physique: { ...defaultPhysique("male"), bustCup: "C" } },
    12345,
  );
  let calls = 0;
  const reply = await handlePortrait(request({ ...input(), subject }, cookie), {
    ...options,
    fetcher: async (_url, init) => {
      if (++calls === 1) {
        const brief = JSON.parse(JSON.parse(init?.body as string).messages[1].content);
        assert.equal(brief.character.sex, "成年男性");
        for (const key of ["bustCup", "bustCm", "waistCm", "hipsCm"])
          assert.equal(key in brief.character, false);
        assert.doesNotMatch(brief.artReference, /胸型|胸围|腰围|臀围/);
        return compositionReply();
      }
      return Response.json({ data: [{ b64_json: png }] });
    },
  });
  assert.equal(reply.status, 200);
  assert.equal(calls, 2);
});
test("missing or mock LLM prevents both provider calls", async (t) => {
  const { cookie, ...options } = await setup(t, false);
  for (const env of [{}, { XIANTU_AI_MOCK: "1" }]) {
    let calls = 0;
    const reply = await handlePortrait(request(input(), cookie), {
      ...options,
      env,
      fetcher: async () => {
        calls++;
        throw new Error("must not fetch");
      },
    });
    assert.equal(reply.status, 409);
    assert.match((await reply.json()).error, /LLM 文字模型/);
    assert.equal(calls, 0);
  }
});
test("failed, truncated and refused prompt composition never starts image generation", async (t) => {
  const { cookie, ...options } = await setup(t);
  for (const response of [
    () => new Response("private-text-provider-message", { status: 500 }),
    () => compositionReply(""),
    () => compositionReply(composedPrompt, "length"),
    () =>
      Response.json({ choices: [{ message: { content: composedPrompt, refusal: "refused" } }] }),
    () => compositionReply("字".repeat(6001)),
  ]) {
    let calls = 0;
    const reply = await handlePortrait(request(input(), cookie), {
      ...options,
      fetcher: async (url) => {
        calls++;
        assert.match(String(url), /chat\/completions$/);
        return response();
      },
    });
    assert.equal(reply.status, 502);
    assert.equal(calls, 1);
    const text = await reply.text();
    assert.match(text, /文字模型/);
    assert.doesNotMatch(text, /private-text-provider-message/);
  }
});
test("cancellation at the handoff never calls the image provider", async (t) => {
  const { cookie, ...options } = await setup(t);
  const controller = new AbortController();
  let calls = 0;
  const reply = await handlePortrait(
    request(input(), cookie, "http://localhost", controller.signal),
    {
      ...options,
      fetcher: async () => {
        calls++;
        controller.abort();
        return compositionReply();
      },
    },
  );
  assert.equal(reply.status, 499);
  assert.equal(calls, 1);
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
test("image-stage cancellation and failure release the two-stage request for retry", async (t) => {
  const { cookie, ...options } = await setup(t);
  const controller = new AbortController();
  let imageStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    imageStarted = resolve;
  });
  const pending = handlePortrait(request(input(), cookie, "http://localhost", controller.signal), {
    ...options,
    fetcher: async (url, init) => {
      if (String(url).endsWith("chat/completions")) return compositionReply();
      imageStarted();
      return new Promise((_resolve, reject) =>
        init!.signal!.addEventListener("abort", () => reject(new Error("cancelled"))),
      );
    },
  });
  await started;
  controller.abort();
  assert.equal((await pending).status, 499);
  const failed = await handlePortrait(request(input(), cookie), {
    ...options,
    fetcher: async (url) =>
      String(url).endsWith("chat/completions")
        ? compositionReply()
        : new Response("private-image-provider-message", { status: 500 }),
  });
  assert.equal(failed.status, 502);
  const message = await failed.text();
  assert.match(message, /提示词已生成/);
  assert.doesNotMatch(message, /private-image-provider-message/);
  const retried = await handlePortrait(request(input(), cookie), {
    ...options,
    fetcher: async (url) =>
      String(url).endsWith("chat/completions")
        ? compositionReply()
        : Response.json({ data: [{ b64_json: png }] }),
  });
  assert.equal(retried.status, 200);
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

test("default forty NPCs and every installed story character have distinct full-body art without save writes", () => {
  const world = createWorld(12345, profile, "complete-portraits", 40, {
    contentLocks: EXTENSIONS.map((entry) => entry.lock),
  });
  const before = structuredClone(world);
  const sources = world.npcs.map((npc) => {
    const owned = extensionPortrait(npc.id);
    const art = owned?.url ? imageAsset(owned.url) : bundledPortrait(npcSubject(npc));
    assert.ok(art, `${npc.name} lacks full-body art`);
    assert.ok(art.lazy, `${npc.name} should load on demand`);
    assert.match(art.src, /\.webp$/);
    return art.src;
  });
  assert.equal(new Set(sources).size, world.npcs.length);
  assert.equal(extensionPortrait("PLAYER"), null);
  assert.equal(extensionPortrait("shichai.unknown.actor"), null);
  assert.deepEqual(world, before);
});

test("legacy base NPCs keep their identities and portraits when campaign residents join on load", () => {
  for (const count of [40, 100]) {
    const legacy = createWorld(12345, profile, `legacy-${count}`, count);
    legacy.rulesVersion = "0.1.2";
    // Use valid old-rule actors so realm migration does not obscure identity preservation.
    // The complete legacy realm conversion is covered in redesign-b.test.ts.
    for (const actor of [legacy.player, ...legacy.npcs]) {
      actor.realm = 0;
      actor.xp = 0;
      actor.hp = 1;
    }
    for (const npc of legacy.npcs.slice(40)) {
      delete npc.npcTemplateId;
      npc.name = "旧局修士";
      npc.sex = "male";
      npc.physique = defaultPhysique("male", npc.appearanceSeed);
    }
    const before = structuredClone(legacy);
    const result = migrateSave(legacy);
    assert.equal(result.migrated, true);
    assert.deepEqual(
      {
        ...result.world,
        rulesVersion: before.rulesVersion,
        contentLocks: before.contentLocks,
        // The user requested duplicate-name repair; all other legacy identity fields stay exact.
        npcs: result.world.npcs
          .slice(0, count)
          .map((npc, i) => ({ ...npc, name: before.npcs[i].name })),
      },
      before,
    );
    assert.equal(new Set(result.world.npcs.map((npc) => npc.name)).size, result.world.npcs.length);
    assert.deepEqual(legacy, before);
    for (const npc of result.world.npcs.slice(40, count)) {
      assert.equal(npcSubject(npc).designId, undefined);
      assert.equal(bundledPortrait(npcSubject(npc)), null);
    }
  }
});

test("all sixty authored women have independent bundled art across seeds without changing the saved world", () => {
  for (const seed of [0, 12345, 4294967295]) {
    const world = createWorld(seed, profile, "expanded-art");
    const before = structuredClone(world);
    const sources = world.npcs.slice(40).map((npc) => {
      const subject = npcSubject(npc);
      const portrait = bundledPortrait(subject);
      assert.ok(portrait, `${npc.id} ${npc.name} lacks full-body art`);
      assert.ok(portrait.lazy);
      assert.match(portrait.src, /\.webp$/);
      assert.notEqual(portraitDirection(subject).id, `identity-${subject.identitySeed}`);
      return portrait.src;
    });
    assert.equal(new Set(sources).size, 60);
    assert.deepEqual(world, before);
  }
});
