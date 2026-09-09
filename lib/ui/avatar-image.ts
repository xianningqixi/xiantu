/** Derive a head-and-shoulders image without touching the world or its image identity. */
export async function cropAvatar(bitmap: ImageBitmap): Promise<Blob> {
  const size = Math.min(bitmap.width, Math.round(bitmap.height * 0.34));
  const left = Math.max(0, Math.round((bitmap.width - size) / 2));
  const top = Math.min(bitmap.height - size, Math.round(bitmap.height * 0.025));
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("头像画布不可用。");
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, left, top, size, size, 0, 0, 512, 512);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("头像生成失败。"))),
      "image/webp",
      0.94,
    ),
  );
}
