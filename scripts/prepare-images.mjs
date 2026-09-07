import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
const targetDirectory = path.resolve("public/art/optimized");
const metadataFile = path.resolve("lib/game/content/images.json");
export async function prepareImages(entries) {
  fs.mkdirSync(targetDirectory, { recursive: true });
  const images = {};
  for (const { source, url, lazy = false, preserve = false } of entries) {
    const width = lazy ? 1152 : 1280;
    const hash = crypto
      .createHash("sha256")
      .update(fs.readFileSync(source))
      .update(preserve ? "webp-original-v1" : `webp-78-${width}-v1`)
      .digest("hex")
      .slice(0, 12);
    const filename = `${path.parse(source).name.replaceAll("_", "-")}-${hash}.webp`;
    const output = path.join(targetDirectory, filename);
    if (!fs.existsSync(output)) {
      if (preserve) fs.copyFileSync(source, output);
      else
        await sharp(source)
          .resize({ width, height: width, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 78, effort: 6 })
          .toFile(output);
    }
    const info = await sharp(output).metadata();
    images[url] = {
      src: `/art/optimized/${filename}`,
      width: info.width,
      height: info.height,
      bytes: fs.statSync(output).size,
      lazy,
    };
  }
  const keep = new Set(Object.values(images).map((i) => path.basename(i.src)));
  // This directory contains only generated derivatives, never author sources.
  for (const name of fs.readdirSync(targetDirectory))
    if (/^[a-z0-9-]+-[a-f0-9]{12}\.webp$/.test(name) && !keep.has(name))
      fs.unlinkSync(path.join(targetDirectory, name));
  fs.writeFileSync(metadataFile, JSON.stringify(images, null, 2) + "\n");
  console.log(
    `展示图片 ${Object.keys(images).length} 张，共 ${Object.values(images).reduce((n, image) => n + image.bytes, 0)} 字节；原始画稿与游戏内容锁保持原值。`,
  );
}
