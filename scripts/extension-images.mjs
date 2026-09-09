import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Validate source assets before registering any derivatives. Call after validateExtension.
export function extensionImages(dir, assets, urls) {
  const images = {},
    entries = [];
  for (const [id, art] of Object.entries(assets)) {
    const source = path.join(dir, art.file);
    if (!fs.existsSync(source)) throw new Error(`内容包缺图：${id} → ${art.file}`);
    const bytes = fs.readFileSync(source);
    if (
      bytes.length < 33 ||
      bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      bytes.readUInt32BE(8) !== 13 ||
      bytes.toString("ascii", 12, 16) !== "IHDR"
    )
      throw new Error(`PNG 头不合法：${id}`);
    if (bytes.readUInt32BE(16) !== art.width || bytes.readUInt32BE(20) !== art.height)
      throw new Error(`图片尺寸不匹配：${id}`);
    if (urls.has(art.url)) throw new Error(`图片 URL 重复：${art.url}`);
    urls.add(art.url);
    images[id] = crypto.createHash("sha256").update(bytes).digest("hex");
    entries.push({ source, url: art.url, lazy: true });
  }
  return { images, entries };
}
