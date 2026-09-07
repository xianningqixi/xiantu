import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  extensionSchema,
  validateExtension,
  validateRegistry,
} from "../lib/game/content/extension-contract.mjs";
import { validateContent } from "../lib/game/content/contract.mjs";

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
const hashes = {};
for (const [id, art] of Object.entries(p.art.assets)) {
  const source = path.join(root, art.file);
  if (!fs.existsSync(source)) throw new Error(`内容包缺图：${id} → ${art.file}`);
  const bytes = fs.readFileSync(source);
  if (!bytes.length) throw new Error(`图片为空：${art.file}`);
  hashes[id] = sha(bytes);
  const target = path.join(project, "public", art.url);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
const digest = sha(JSON.stringify({ content: p, images: hashes }));
fs.writeFileSync(
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
  fs.copyFileSync(source, path.join(project, "public", atlas.url));
}
for (const bio of Object.values(npc.fixed))
  if (
    !urls.has(bio.portrait.src) ||
    (bio.portrait.slot !== null &&
      (!Number.isInteger(bio.portrait.slot) || bio.portrait.slot < 0 || bio.portrait.slot > 8))
  )
    throw new Error("固定 NPC 立绘引用无效");
fs.writeFileSync(
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
  const data = validateExtension(
    {
      manifest: get("manifest.json"),
      definitions: get("definitions.json"),
      storylets: get("storylets.json"),
      visuals: get("visuals.json"),
    },
    { roles: p.manifest.roles, assets: Object.keys(p.art.assets) },
  );
  for (const file of Object.values(data.manifest.entryFiles))
    if (!fs.existsSync(path.join(dir, file))) throw new Error(`${name}: 缺少 ${file}`);
  const hash = sha(JSON.stringify(data));
  extensionEntries.push({
    data,
    hash,
    lock: `${data.manifest.packId}@${data.manifest.packVersion}:${hash}`,
  });
}
validateRegistry(extensionEntries, { version: p.manifest.version, hash: digest });
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
