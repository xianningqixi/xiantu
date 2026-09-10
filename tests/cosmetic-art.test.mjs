import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { prepareCosmeticArt } from "../scripts/prepare-cosmetic-art.mjs";

async function fixture(t, overrides = {}) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "xiantu-cosmetic-test-"));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const root = path.join(project, "content-packs/art-refresh-20260910");
  fs.mkdirSync(path.join(root, "art/images"), { recursive: true });
  fs.mkdirSync(path.join(project, "lib/game/content"), { recursive: true });
  const bytes = await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: "#eee8db" },
  })
    .webp()
    .toBuffer();
  fs.writeFileSync(path.join(root, "art/images/person.webp"), bytes);
  const original = path.join(project, "original.webp");
  fs.writeFileSync(original, "original locked source bytes");
  const asset = {
    id: "story-person",
    file: "art/images/person.webp",
    width: 1024,
    height: 1536,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    kind: "portrait",
    alt: "剧情人物",
    actorId: "STORY_PERSON",
    sourceUrl: "/art/original.png",
    avatarCrop: { left: 260, top: 30, size: 450 },
    ...overrides,
  };
  fs.writeFileSync(
    path.join(root, "catalog.json"),
    JSON.stringify({ version: 1, assets: [asset] }),
  );
  const context = {
    project,
    presentationImages: [{ source: original, url: "/art/original.png" }],
    avatarUrls: { "/art/original.png": "/art/old-avatar.webp" },
    portraitSources: [{ actorId: "STORY_PERSON", sourceUrl: "/art/original.png" }],
    additionalActorIds: ["SECT_PERSON"],
    locationIds: ["market"],
  };
  return { context, original };
}

test("cosmetic replacement keeps the locked original and old URL while deriving the new face", async (t) => {
  const { context, original } = await fixture(t);
  const result = await prepareCosmeticArt(context);
  assert.equal(fs.readFileSync(original, "utf8"), "original locked source bytes");
  assert.equal(context.presentationImages[0].url, "/art/original.png");
  assert.notEqual(context.presentationImages[0].source, original);
  assert.notEqual(context.avatarUrls["/art/original.png"], "/art/old-avatar.webp");
  const avatar = await sharp(context.presentationImages[1].source).metadata();
  assert.deepEqual([avatar.width, avatar.height], [512, 512]);
  // Existing appearance-keyed portraits must not become an unconditional actor-ID fallback.
  assert.deepEqual(result.portraits, {});
});

test("cosmetic portraits reject a different character's source and out-of-bounds avatar crops", async (t) => {
  const wrong = await fixture(t, { actorId: "OTHER_PERSON" });
  await assert.rejects(prepareCosmeticArt(wrong.context), /身份/);
  const crop = await fixture(t, { avatarCrop: { left: 1000, top: 20, size: 300 } });
  await assert.rejects(prepareCosmeticArt(crop.context), /越界/);
});

test("only known missing sect identities can add an actor-ID portrait", async (t) => {
  const valid = await fixture(t, { sourceUrl: undefined, actorId: "SECT_PERSON" });
  const display = await prepareCosmeticArt(valid.context);
  assert.equal(display.portraits.SECT_PERSON.url, "/art/refresh-20260910/story-person.webp");
  const invalid = await fixture(t, { sourceUrl: undefined, actorId: "PLAYER" });
  await assert.rejects(prepareCosmeticArt(invalid.context), /身份/);
});
