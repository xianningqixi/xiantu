import { validateDailyEvents } from "../lib/game/content/daily-event-contract.mjs";
import { validateMainStory } from "../lib/game/content/main-story-contract.mjs";
import { extensionImages } from "./extension-images.mjs";
import { prepareImages } from "./prepare-images.mjs";
import { prepareAvatars } from "./prepare-avatars.mjs";
import { prepareCosmeticArt } from "./prepare-cosmetic-art.mjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";
import {
  extensionSchema,
  validateExtension,
  validateRegistry,
} from "../lib/game/content/extension-contract.mjs";
import { validateContent } from "../lib/game/content/contract.mjs";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
validateDailyEvents(
  JSON.parse(fs.readFileSync(path.join(project, "content-packs/daily-events/events.json"), "utf8")),
);
const root = path.join(project, "content-packs/official-qingshi");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const p = validateContent({
  manifest: read("manifest.json"),
  story: read("storylets.json"),
  locations: read("locations.json"),
  characters: read("characters.json"),
  presentation: read("presentation.json"),
  art: read("art/manifest.json"),
});
const sha = (data) => crypto.createHash("sha256").update(data).digest("hex");
function writeIfChanged(file, value) {
  if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== value)
    fs.writeFileSync(file, value);
}
const hashes = {};
const presentationImages = [];
for (const [id, art] of Object.entries(p.art.assets)) {
  const source = path.join(root, art.file);
  if (!fs.existsSync(source)) throw new Error(`内容包缺图：${id} → ${art.file}`);
  const bytes = fs.readFileSync(source);
  if (!bytes.length) throw new Error(`图片为空：${art.file}`);
  hashes[id] = sha(bytes);
  presentationImages.push({ source, url: art.url });
}
const digest = sha(JSON.stringify({ content: p, images: hashes }));
writeIfChanged(
  path.join(root, "integrity.json"),
  JSON.stringify(
    {
      contentHash: digest,
      lock: `${p.manifest.id}@${p.manifest.version}:${digest}`,
      images: hashes,
    },
    null,
    2,
  ) + "\n",
);

// Cosmetic biographies and portrait atlases are separately replaceable; they never change the gameplay lock.
const npc = read("npc-presentation.json");
if (
  !Array.isArray(npc.backgrounds) ||
  !npc.backgrounds.length ||
  !Array.isArray(npc.atlases) ||
  !npc.atlases.length
)
  throw new Error("NPC 展示包结构不完整");
for (const bio of [...npc.backgrounds, ...Object.values(npc.fixed)])
  for (const field of ["origin", "background", "interest", "wish"])
    if (typeof bio[field] !== "string" || !bio[field].trim())
      throw new Error(`NPC 资料缺少 ${field}`);
const npcHashes = {};
const urls = new Set(Object.values(p.art.assets).map((a) => a.url));
for (const atlas of npc.atlases) {
  if (
    !["male", "female"].includes(atlas.sex) ||
    atlas.columns !== 3 ||
    atlas.rows !== 3 ||
    atlas.slots.length !== 9 ||
    new Set(atlas.slots.map((s) => s.index)).size !== 9 ||
    atlas.slots.some(
      (s) =>
        !Number.isInteger(s.index) ||
        s.index < 0 ||
        s.index > 8 ||
        !Number.isInteger(s.age) ||
        s.age < 18,
    )
  )
    throw new Error(`NPC 图集格位不合法：${atlas.id}`);
  if (
    !/^art\/images\/[a-z0-9-]+\.png$/.test(atlas.file) ||
    !/^\/art\/[a-z0-9-]+\.png$/.test(atlas.url) ||
    urls.has(atlas.url)
  )
    throw new Error(`NPC 图片路径重复或不合法：${atlas.id}`);
  const source = path.join(root, atlas.file);
  const bytes = fs.readFileSync(source);
  if (
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    bytes.readUInt32BE(16) !== atlas.width ||
    bytes.readUInt32BE(20) !== atlas.height ||
    atlas.width % 3 ||
    atlas.height % 3
  )
    throw new Error(`NPC 图集尺寸不匹配：${atlas.id}`);
  npcHashes[atlas.id] = sha(bytes);
  urls.add(atlas.url);
  presentationImages.push({ source, url: atlas.url, lazy: true });
}
for (const bio of Object.values(npc.fixed))
  if (
    !urls.has(bio.portrait.src) ||
    (bio.portrait.slot !== null &&
      (!Number.isInteger(bio.portrait.slot) || bio.portrait.slot < 0 || bio.portrait.slot > 8))
  )
    throw new Error("固定 NPC 立绘引用无效");
writeIfChanged(
  path.join(root, "npc-presentation-integrity.json"),
  JSON.stringify(
    {
      version: npc.version,
      hash: sha(JSON.stringify({ npc, images: npcHashes })),
      images: npcHashes,
    },
    null,
    2,
  ) + "\n",
);

// Generated full-body images are presentation assets, independent of the official gameplay lock.
const portraits = read("art/portraits/catalog.json");
if (
  portraits.version !== 1 ||
  !Array.isArray(portraits.entries) ||
  new Set(portraits.entries.map((entry) => entry.actorId)).size !== portraits.entries.length
)
  throw new Error("全身立绘目录格式或身份重复。");
for (const entry of portraits.entries) {
  if (
    !/^[a-z0-9_-]+-[a-f0-9]{12}\.webp$/.test(entry.file) ||
    !Number.isInteger(entry.width) ||
    !Number.isInteger(entry.height) ||
    entry.width < 1 ||
    entry.width > 640 ||
    entry.height < 1 ||
    entry.height > 960
  )
    throw new Error("全身立绘文件或尺寸不合法。");
  const source = path.join(root, "art/portraits", entry.file);
  if (sha(fs.readFileSync(source)) !== entry.sha256) throw new Error("全身立绘摘要不匹配。");
  const url = `/art/portraits/${entry.file}`;
  if (urls.has(url)) throw new Error(`图片 URL 重复：${url}`);
  urls.add(url);
  presentationImages.push({
    source,
    url,
    lazy: true,
    preserve: true,
  });
}

// A small, deterministic ZIP writer (STORE method); no system zip utility or extra dependency.
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function files(dir, prefix = "") {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, "en"))
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(dir, entry.name), prefix + entry.name + "/")
        : [prefix + entry.name],
    );
}
const local = [],
  central = [];
let offset = 0;
const names = files(root);
for (const name of names) {
  const filename = Buffer.from("official-qingshi/" + name);
  const bytes = fs.readFileSync(path.join(root, name));
  const crc = crc32(bytes);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x800, 6);
  header.writeUInt16LE(33, 12);
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(bytes.length, 18);
  header.writeUInt32LE(bytes.length, 22);
  header.writeUInt16LE(filename.length, 26);
  local.push(header, filename, bytes);
  const index = Buffer.alloc(46);
  index.writeUInt32LE(0x02014b50);
  index.writeUInt16LE(20, 4);
  index.writeUInt16LE(20, 6);
  index.writeUInt16LE(0x800, 8);
  index.writeUInt16LE(33, 14);
  index.writeUInt32LE(crc, 16);
  index.writeUInt32LE(bytes.length, 20);
  index.writeUInt32LE(bytes.length, 24);
  index.writeUInt16LE(filename.length, 28);
  index.writeUInt32LE(offset, 42);
  central.push(index, filename);
  offset += header.length + filename.length + bytes.length;
}
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(names.length, 8);
end.writeUInt16LE(names.length, 10);
end.writeUInt32LE(
  central.reduce((n, b) => n + b.length, 0),
  12,
);
end.writeUInt32LE(offset, 16);
const output = path.join(project, "public/templates/qingshi-content-pack.zip");
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.concat([...local, ...central, end]));
console.log(
  `内容包校验完成：${p.story.length} 个故事节点，${Object.keys(hashes).length} 张故事图片、${npc.atlases.length} 张 NPC 图集。下载模板已同步。`,
);

// Build-time, data-only registration. Existing official locks remain unchanged.
const extensionEntries = [];
for (const name of fs.readdirSync(path.join(project, "content-packs")).sort()) {
  const dir = path.join(project, "content-packs", name);
  if (
    name === "official-qingshi" ||
    !fs.statSync(dir).isDirectory() ||
    !fs.existsSync(path.join(dir, "manifest.json"))
  )
    continue;
  const get = (file) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  const manifest = get("manifest.json");
  const data = validateExtension(
    {
      manifest,
      ...(manifest.entryFiles.art ? { art: get("art/manifest.json") } : {}),
      ...(manifest.entryFiles.journey ? { journey: get("journey.json") } : {}),
      definitions: get("definitions.json"),
      storylets: get("storylets.json"),
      visuals: get("visuals.json"),
    },
    { roles: p.manifest.roles, assets: Object.keys(p.art.assets) },
  );
  for (const file of Object.values(data.manifest.entryFiles))
    if (!fs.existsSync(path.join(dir, file))) throw new Error(`${name}: 缺少 ${file}`);
  const owned = extensionImages(dir, data.art?.assets ?? {}, urls);
  presentationImages.push(...owned.entries);
  const hash = sha(JSON.stringify({ content: data, images: owned.images }));
  const lock = `${data.manifest.packId}@${data.manifest.packVersion}:${hash}`;
  if (data.art)
    writeIfChanged(
      path.join(dir, "integrity.json"),
      JSON.stringify({ contentHash: hash, lock, images: owned.images }, null, 2) + "\n",
    );
  extensionEntries.push({ data, hash, lock, images: owned.images });
}
validateRegistry(extensionEntries, { version: p.manifest.version, hash: digest });

const mainStory = validateMainStory(
  JSON.parse(fs.readFileSync(path.join(project, "content-packs/main-quest/story.json"), "utf8")),
  {
    actors: [
      ...Object.values(p.characters).map((c) => c.id),
      ...extensionEntries.flatMap((e) => e.data.definitions.characters.map((c) => c.id)),
    ],
    locations: [
      ...Object.keys(p.locations),
      ...extensionEntries.flatMap((e) => Object.keys(e.data.definitions.locations ?? {})),
    ],
    packs: extensionEntries.map((e) => e.data.manifest.packId),
  },
);
const mainHash = sha(JSON.stringify(mainStory));
writeIfChanged(
  path.join(project, "lib/game/content/main-story.json"),
  JSON.stringify(
    { data: mainStory, lock: `main.quest@${mainStory.version}:${mainHash}` },
    null,
    2,
  ) + "\n",
);

// Supplemental NPC art is cosmetic: never re-lock an installed story or rewrite a save.
const supplementalDir = path.join(project, "content-packs/shichai-portraits");
const supplemental = z
  .object({
    version: z.literal(1),
    assets: z.record(
      z
        .object({
          file: z.string().regex(/^art\/images\/[a-z0-9-]+\.png$/),
          url: z.string().regex(/^\/art\/portraits\/shichai\/[a-z0-9-]+\.png$/),
          alt: z.string().trim().min(1),
          width: z.literal(1024),
          height: z.literal(1536),
          kind: z.literal("portrait"),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
  })
  .strict()
  .parse(JSON.parse(fs.readFileSync(path.join(supplementalDir, "catalog.json"), "utf8")));
for (const [actorId, art] of Object.entries(supplemental.assets)) {
  const actor = extensionEntries
    .flatMap((e) => e.data.definitions.characters)
    .find((a) => a.id === actorId);
  if (!actor || actor.portraitId) throw new Error(`补充立绘角色未知或已有专属图：${actorId}`);
  if (sha(fs.readFileSync(path.join(supplementalDir, art.file))) !== art.sha256)
    throw new Error(`补充立绘摘要不匹配：${actorId}`);
}
presentationImages.push(...extensionImages(supplementalDir, supplemental.assets, urls).entries);
const avatarPortraits = portraits.entries.map((entry) => ({
  actorId: entry.actorId,
  sourceUrl: `/art/portraits/${entry.file}`,
}));
for (const { data } of extensionEntries)
  for (const actor of data.definitions.characters) {
    const slot = actor.portraitId ? data.visuals[actor.portraitId] : null;
    const sourceUrl =
      slot?.status === "owned"
        ? data.art.assets[slot.assetId].url
        : supplemental.assets[actor.id]?.url;
    if (sourceUrl) avatarPortraits.push({ actorId: actor.id, sourceUrl });
  }
const avatarUrls = await prepareAvatars(presentationImages, avatarPortraits);
const sectArtIdentities = JSON.parse(
  fs.readFileSync(path.join(project, "content-packs/cultivation-sects/sects.json"), "utf8"),
).sects.flatMap((sect) => sect.residents.map((actor) => actor.id));
const atlasArtLocations = JSON.parse(
  fs.readFileSync(path.join(project, "content-packs/world-atlas/map.json"), "utf8"),
)
  .places.filter((place) => place.kind !== "town")
  .map((place) => place.to);
await prepareCosmeticArt({
  project,
  presentationImages,
  avatarUrls,
  portraitSources: avatarPortraits,
  additionalActorIds: sectArtIdentities,
  locationIds: [
    ...Object.keys(p.locations),
    ...extensionEntries.flatMap((entry) => Object.keys(entry.data.definitions.locations ?? {})),
    ...atlasArtLocations,
  ],
});
await prepareImages(presentationImages);
const imageMetadata = JSON.parse(
  fs.readFileSync(path.join(project, "lib/game/content/images.json"), "utf8"),
);
writeIfChanged(
  path.join(project, "lib/game/content/avatars.json"),
  JSON.stringify(
    Object.fromEntries(
      Object.entries(avatarUrls).map(([source, url]) => {
        // Dimensions and cache policy stay in images.json; avatar consumers only need the URL.
        return [source, imageMetadata[url].src];
      }),
    ),
    null,
    2,
  ) + "\n",
);
fs.writeFileSync(
  path.join(project, "lib/game/content/extensions.json"),
  JSON.stringify(extensionEntries, null, 2) + "\n",
);
console.log(`已登记 ${extensionEntries.length} 个精确锁定的支线包。`);

fs.mkdirSync(path.join(project, "content-packs/schema"), { recursive: true });
fs.writeFileSync(
  path.join(project, "content-packs/schema/extension.schema.json"),
  JSON.stringify(zodToJsonSchema(extensionSchema, "XiantuExtension"), null, 2) + "\n",
);
