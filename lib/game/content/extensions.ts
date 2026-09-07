import entries from "./extensions.json";
import { PACK, visual, VISUAL_IDS } from "./official";
import { validateExtension, validateRegistry } from "./extension-contract.mjs";
export type Extension = ReturnType<typeof validateExtension>;
export const EXTENSIONS = validateRegistry(
  (entries as { data: Extension; hash: string; lock: string }[]).map((e) => ({
    ...e,
    data: validateExtension(e.data, { roles: PACK.roles, assets: VISUAL_IDS }),
  })),
  { version: PACK.version, hash: PACK.lock.split(":")[1] },
) as { data: Extension; hash: string; lock: string }[];
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
    if (slot)
      return slot.status === "planned"
        ? { url: "", alt: slot.alt, kind: "scene" }
        : { ...visual(slot.assetId), alt: slot.alt };
  }
  return visual(id);
}
