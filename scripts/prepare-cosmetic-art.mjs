import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { z } from "zod";

const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const schema = z
  .object({
    version: z.literal(1),
    assets: z.array(
      z
        .object({
          id: z.string().regex(/^[a-z0-9_.-]+$/),
          file: z.string().regex(/^art\/images\/[a-z0-9_.-]+\.webp$/),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          width: z.number().int().positive(),
          height: z.number().int().positive(),
          kind: z.enum(["portrait", "scene"]),
          alt: z.string().trim().min(1),
          sourceUrl: z.string().startsWith("/art/").optional(),
          actorId: z.string().optional(),
          locationId: z.string().optional(),
          avatarCrop: z
            .object({
              left: z.number().int().nonnegative(),
              top: z.number().int().nonnegative(),
              size: z.number().int().positive(),
            })
            .strict()
            .optional(),
        })
        .strict(),
    ),
  })
  .strict();

/** Replace rendering sources only, after the original content and avatar locks were checked. */
export async function prepareCosmeticArt({
  project = process.cwd(),
  presentationImages,
  avatarUrls,
  portraitSources,
  additionalActorIds,
  locationIds,
}) {
  const root = path.join(project, "content-packs/art-refresh-20260909");
  const catalog = schema.parse(
    JSON.parse(fs.readFileSync(path.join(root, "catalog.json"), "utf8")),
  );
  const expectedPortraits = new Map(portraitSources.map((p) => [p.actorId, p.sourceUrl]));
  const knownActors = new Set(additionalActorIds);
  const knownLocations = new Set(locationIds);
  const seen = { ids: new Set(), urls: new Set(), actors: new Set(), locations: new Set() };
  const display = { portraits: {}, locations: {} };
  for (const asset of catalog.assets) {
    const source = path.join(root, asset.file);
    const bytes = fs.readFileSync(source);
    const info = await sharp(bytes).metadata();
    const portrait = asset.kind === "portrait";
    if (
      sha(bytes) !== asset.sha256 ||
      info.format !== "webp" ||
      info.width !== asset.width ||
      info.height !== asset.height ||
      asset.width !== (portrait ? 1024 : 1672) ||
      asset.height !== (portrait ? 1536 : 941)
    )
      throw new Error(`新版美术摘要或尺寸不匹配：${asset.id}`);
    const url = asset.sourceUrl ?? `/art/refresh-20260909/${asset.id}.webp`;
    if (seen.ids.has(asset.id) || seen.urls.has(url)) throw new Error(`新版美术重复：${asset.id}`);
    seen.ids.add(asset.id);
    seen.urls.add(url);
    const index = presentationImages.findIndex((entry) => entry.url === url);
    if (asset.sourceUrl && index < 0) throw new Error(`新版美术原图未登记：${asset.id}`);
    if (!asset.sourceUrl && index >= 0) throw new Error(`新版美术 URL 冲突：${asset.id}`);
    // Reviewed WebPs already have the final composition and compression settings.
    const entry = { source, url, lazy: true, preserve: true };
    if (index >= 0) presentationImages[index] = entry;
    else presentationImages.push(entry);
    const art = { url, alt: asset.alt, kind: asset.kind };
    if (portrait) {
      if (
        !asset.actorId ||
        seen.actors.has(asset.actorId) ||
        !asset.avatarCrop ||
        (asset.sourceUrl
          ? expectedPortraits.get(asset.actorId) !== asset.sourceUrl
          : !knownActors.has(asset.actorId) || expectedPortraits.has(asset.actorId))
      )
        throw new Error(`新版立绘身份或头像不匹配：${asset.id}`);
      seen.actors.add(asset.actorId);
      if (!asset.sourceUrl) display.portraits[asset.actorId] = art;
      const { left, top, size } = asset.avatarCrop;
      if (left + size > info.width || top + size > info.height)
        throw new Error(`新版头像取景越界：${asset.id}`);
      const avatar = await sharp(bytes)
        .extract({ left, top, width: size, height: size })
        .resize(512, 512)
        .webp({ quality: 90, effort: 6 })
        .toBuffer();
      const avatarDirectory = path.join(project, ".game-test-build/cosmetic-avatars");
      fs.mkdirSync(avatarDirectory, { recursive: true });
      const avatarFile = path.join(
        avatarDirectory,
        `${asset.id.replace(/[_.]/g, "-")}-${sha(avatar).slice(0, 12)}.webp`,
      );
      fs.writeFileSync(avatarFile, avatar);
      const avatarUrl = `/art/refresh-20260909/avatars/${asset.id}.webp`;
      presentationImages.push({ source: avatarFile, url: avatarUrl, lazy: true, preserve: true });
      avatarUrls[url] = avatarUrl;
    } else if (asset.actorId || asset.avatarCrop) {
      throw new Error(`场景不能登记人物身份：${asset.id}`);
    }
    if (asset.locationId) {
      if (portrait || !knownLocations.has(asset.locationId) || seen.locations.has(asset.locationId))
        throw new Error(`新版地点美术不匹配：${asset.id}`);
      seen.locations.add(asset.locationId);
      display.locations[asset.locationId] = art;
    }
  }
  // Old authored avatars stay on disk for validation, but unused derivatives need not ship.
  const activeAvatars = new Set(Object.values(avatarUrls));
  for (let i = presentationImages.length - 1; i >= 0; i--) {
    const { url } = presentationImages[i];
    if (url.startsWith("/art/avatars/") && !activeAvatars.has(url)) presentationImages.splice(i, 1);
  }
  fs.writeFileSync(
    path.join(project, "lib/game/content/cosmetic-display.json"),
    JSON.stringify(display, null, 2) + "\n",
  );
  console.log(
    `新版美术 ${catalog.assets.length} 张：${seen.actors.size} 张立绘、${seen.locations.size} 个地点；存档内容锁不变。`,
  );
  return display;
}
