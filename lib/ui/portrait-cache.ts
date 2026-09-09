/** Cosmetic image cache. No world entities, credentials, simulation time or RNG live here. */
import { cropAvatar } from "./avatar-image";
const DATABASE = "xiantu-portrait-assets";
const MAX_BYTES = 48 * 1024 * 1024;
type Asset = { id: string; blob: Blob; avatar?: Blob; signature: string; savedAt: number };
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open(DATABASE, 1);
    open.onupgradeneeded = () => open.result.createObjectStore("images", { keyPath: "id" });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(new Error("立绘缓存无法打开。"));
    open.onblocked = () => reject(new Error("请关闭其他页面后再保存立绘。"));
  });
}
export async function portraitAsset(id?: string): Promise<Asset | undefined> {
  if (!id) return undefined;
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("images");
      const request = tx.objectStore("images").get(id);
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(new Error("立绘尚未读取。"));
    });
  } finally {
    db.close();
  }
}
export async function cachePortrait(
  dataUrl: string,
  signature: string,
  protectedIds: string[] = [],
) {
  if (!/^data:image\/(png|jpeg|webp);base64,/.test(dataUrl) || dataUrl.length > 9 * 1024 * 1024)
    throw new Error("生图返回了不支持的图片。");
  const source = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(source);
  let blob: Blob, avatar: Blob;
  try {
    if (bitmap.width * bitmap.height > 20_000_000) throw new Error("立绘尺寸过大。");
    // Crop before full-body compression so hair, jewelry and facial details keep source pixels.
    avatar = await cropAvatar(bitmap);
    const ratio = Math.min(1, 640 / bitmap.width, 960 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("立绘压缩失败。"))),
        "image/webp",
        0.88,
      ),
    );
  } finally {
    bitmap.close();
  }
  const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const id = [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, "0")).join("");
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("images", "readwrite");
      const store = tx.objectStore("images");
      const all = store.getAll();
      all.onsuccess = () => {
        const previous = all.result as Asset[];
        let total = previous
          .filter((a) => a.id !== id)
          .reduce((sum, a) => sum + a.blob.size + (a.avatar?.size ?? 0), blob.size + avatar.size);
        for (const entry of previous.sort((a, b) => a.savedAt - b.savedAt)) {
          if (total <= MAX_BYTES) break;
          if (entry.id !== id && !protectedIds.includes(entry.id)) {
            store.delete(entry.id);
            total -= entry.blob.size + (entry.avatar?.size ?? 0);
          }
        }
        if (total > MAX_BYTES) {
          tx.abort();
          return;
        }
        store.put({ id, blob, avatar, signature, savedAt: Date.now() });
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(new Error("立绘保存失败，请检查浏览器存储空间。"));
      tx.onerror = () => {};
    });
  } finally {
    db.close();
  }
  window.dispatchEvent(new CustomEvent("xiantu:portrait", { detail: id }));
  return id;
}
