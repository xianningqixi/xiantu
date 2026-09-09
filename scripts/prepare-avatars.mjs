import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";

const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

/** Avatar derivatives are presentation data and never participate in story/save locks. */
export async function prepareAvatars(presentationImages, expectedPortraits) {
  const root = path.resolve("content-packs/npc-avatars");
  const registered = new Map(presentationImages.map((entry) => [entry.url, entry]));
  const expected = new Map(expectedPortraits.map((entry) => [entry.actorId, entry.sourceUrl]));
  const actors = new Set(),
    sources = new Set(),
    files = new Set();
  const entries = ["base", "expanded", "remaining"].flatMap((group) => {
    const catalog = JSON.parse(fs.readFileSync(path.join(root, `${group}.json`), "utf8"));
    if (catalog.version !== 1 || !Array.isArray(catalog.entries))
      throw new Error(`头像目录无效：${group}`);
    return catalog.entries;
  });
  const mapping = {};
  for (const entry of entries) {
    const source = registered.get(entry.sourceUrl);
    const crop = entry.crop;
    if (
      !source ||
      expected.get(entry.actorId) !== entry.sourceUrl ||
      actors.has(entry.actorId) ||
      sources.has(entry.sourceUrl) ||
      files.has(entry.file) ||
      !/^(base|expanded|remaining)\/[a-z0-9_.-]+-[a-f0-9]{12}\.webp$/.test(entry.file) ||
      sha(fs.readFileSync(source.source)) !== entry.sourceSha256 ||
      !crop ||
      ![crop.left, crop.top, crop.size, entry.sourceWidth, entry.sourceHeight].every(
        Number.isInteger,
      ) ||
      crop.left < 0 ||
      crop.top < 0 ||
      crop.size < 1 ||
      crop.left + crop.size > entry.sourceWidth ||
      crop.top + crop.size > entry.sourceHeight
    )
      throw new Error(`头像身份、原图或取景不匹配：${entry.actorId}`);
    const file = path.join(root, entry.file);
    const bytes = fs.readFileSync(file);
    const info = await sharp(bytes).metadata();
    if (
      sha(bytes) !== entry.sha256 ||
      info.format !== "webp" ||
      info.width !== 512 ||
      info.height !== 512 ||
      entry.width !== 512 ||
      entry.height !== 512
    )
      throw new Error(`头像文件摘要或尺寸不匹配：${entry.actorId}`);
    actors.add(entry.actorId);
    sources.add(entry.sourceUrl);
    files.add(entry.file);
    const url = `/art/avatars/${entry.file}`;
    if (registered.has(url)) throw new Error(`头像路径重复：${url}`);
    presentationImages.push({ source: file, url, lazy: true, preserve: true });
    mapping[entry.sourceUrl] = url;
  }
  if (actors.size !== expected.size) throw new Error("已有立绘的人物尚未全部制作头像。");
  console.log(`头像 ${actors.size} 张已核对人物、原立绘、取景和文件摘要。`);
  return mapping;
}
