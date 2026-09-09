import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { extensionImages } from "../scripts/extension-images.mjs";

test("extension build validates PNG sources, dimensions and global URL uniqueness", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "xiantu-owned-art-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "art/images"), { recursive: true });
  const asset = {
    file: "art/images/test.png",
    url: "/art/test.pack/test.png",
    width: 8,
    height: 12,
  };
  const assets = { "test.pack.art.test": asset };
  const run = (urls = new Set()) => extensionImages(dir, assets, urls);
  assert.throws(run, /缺图/);
  const file = path.join(dir, asset.file);
  fs.writeFileSync(file, Buffer.from("PNG"));
  assert.throws(run, /PNG 头/);
  await sharp({ create: { width: 8, height: 12, channels: 3, background: "white" } })
    .png()
    .toFile(file);
  asset.width = 9;
  assert.throws(run, /尺寸/);
  asset.width = 8;
  assert.throws(() => run(new Set([asset.url])), /URL 重复/);
  const duplicate = { ...assets, "test.pack.art.copy": { ...asset } };
  assert.throws(() => extensionImages(dir, duplicate, new Set()), /URL 重复/);
  const result = run();
  assert.match(result.images["test.pack.art.test"], /^[a-f0-9]{64}$/);
  assert.deepEqual(result.entries, [{ source: file, url: asset.url, lazy: true }]);
  const oldHash = result.images["test.pack.art.test"];
  await sharp({ create: { width: 8, height: 12, channels: 3, background: "black" } })
    .png()
    .toFile(file);
  assert.notEqual(run().images["test.pack.art.test"], oldHash);
});
