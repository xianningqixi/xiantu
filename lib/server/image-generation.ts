import { boundedText, providerUrl } from "./provider-http";
import type { ProviderConfig } from "./negotiation";
function imageData(bytes: Buffer) {
  const mime = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? "image/png"
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? "image/jpeg"
      : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP"
        ? "image/webp"
        : null;
  if (!mime || bytes.length > 6 * 1024 * 1024) throw new Error("生图结果不是支持的图片。");
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
export async function generateImage(
  request: Request,
  config: ProviderConfig,
  fetcher: typeof fetch,
  prompt: string,
  size = "1024x1024",
) {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  request.signal.addEventListener("abort", cancel, { once: true });
  const timer = setTimeout(cancel, config.timeout);
  try {
    if (request.signal.aborted) throw new Error("cancelled");
    const response = await fetcher(`${config.baseUrl}/images/generations`, {
      method: "POST",
      redirect: "error",
      signal: abort.signal,
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        prompt,
        n: 1,
        size,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("生成失败，请检查服务地址、模型权限、余额及密钥。");
    }
    const data = JSON.parse(await boundedText(response, 9 * 1024 * 1024)).data?.[0];
    if (typeof data?.b64_json === "string" && /^[A-Za-z0-9+/=\r\n]+$/.test(data.b64_json))
      return imageData(Buffer.from(data.b64_json, "base64"));
    if (typeof data?.url !== "string") throw new Error("生图响应缺少图片。");
    const url = providerUrl(data.url, true);
    const image = await fetcher(url.href, { signal: abort.signal, redirect: "error" });
    if (!image.ok) {
      await image.body?.cancel();
      throw new Error("图片下载失败。");
    }
    // Read binary with a hard bound; never forward the model API key to this URL.
    const reader = image.body?.getReader();
    if (!reader) throw new Error("图片为空。");
    const chunks: Uint8Array[] = [];
    let byteCount = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        byteCount += value.length;
        if (byteCount > 6 * 1024 * 1024) throw new Error("图片过大。");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return imageData(Buffer.concat(chunks));
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener("abort", cancel);
  }
}
