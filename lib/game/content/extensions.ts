import entries from "./extensions.json";
import supplementalPortraits from "../../../content-packs/shichai-portraits/catalog.json";
import { PACK, visual, VISUAL_IDS } from "./official";
import { validateExtension, validateRegistry } from "./extension-contract.mjs";
export type Extension = ReturnType<typeof validateExtension>;
export const EXTENSIONS = validateRegistry(
  entries.map((e) => ({
    ...e,
    data: validateExtension(e.data, { roles: PACK.roles, assets: VISUAL_IDS }),
  })),
  { version: PACK.version, hash: PACK.lock.split(":")[1] },
) as { data: Extension; hash: string; lock: string; images: Record<string, string> }[];
export function selectedExtensions(locks: string[]) {
  if (!Array.isArray(locks) || new Set(locks).size !== locks.length)
    throw new Error("内容集合锁不合法。");
  const selected = locks.map((lock) => {
    const entry = EXTENSIONS.find((e) => e.lock === lock);
    if (!entry) throw new Error("存档依赖的支线版本尚未安装，原档已保留。");
    return entry;
  });
  for (const { data } of selected)
    for (const dependency of data.manifest.dependencies)
      if (
        dependency.packId !== "official.qingshi" &&
        !selected.some((e) => e.data.manifest.packId === dependency.packId)
      )
        throw new Error("支线缺少依赖包。");
  return selected;
}
export function extensionVisual(id: string) {
  for (const e of EXTENSIONS) {
    const slot = e.data.visuals[id];
    if (slot) {
      if (slot.status === "owned") {
        const asset = e.data.art!.assets[slot.assetId];
        return { url: asset.url, alt: slot.alt, kind: asset.kind };
      }
      return slot.status === "planned"
        ? { url: "", alt: slot.alt, kind: "scene" }
        : { ...visual(slot.assetId), alt: slot.alt };
    }
  }
  return visual(id);
}
export function extensionPortrait(actorId: string) {
  for (const { data } of EXTENSIONS) {
    const actor = data.definitions.characters.find((a) => a.id === actorId);
    if (actor?.portraitId) return extensionVisual(actor.portraitId);
    // Presentation-only additions also work with existing exact-locked saves.
    if (actor) {
      const portrait = Object.entries(supplementalPortraits.assets).find(
        ([id]) => id === actorId,
      )?.[1];
      if (portrait) return { url: portrait.url, alt: portrait.alt, kind: "portrait" };
    }
  }
  return null;
}
