import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";

export function publicAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    const lower = address.toLowerCase();
    const first = parseInt(lower.split(":")[0], 16);
    // Only global unicast; reject transition mechanisms and documentation ranges.
    return (
      first >= 0x2000 &&
      first <= 0x3fff &&
      !lower.startsWith("2002:") &&
      !lower.startsWith("2001:db8:") &&
      !(first === 0x2001 && parseInt(lower.split(":")[1] || "0", 16) < 0x200)
    );
  }
  return false;
}
export function providerUrl(value: string, asset = false) {
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    (!asset && url.search) ||
    url.href.length > (asset ? 4096 : 512) ||
    host.endsWith(".") ||
    /(?:^|\.)(?:localhost|local|internal|home|lan)$/.test(host) ||
    (isIP(host) ? !publicAddress(host) : !host.includes("."))
  ) {
    throw new Error("请填写公开 HTTPS 服务地址，不含账号、查询参数或片段。");
  }
  return url;
}
/** Resolve once, reject private answers, and pin the verified addresses to the TLS request.
 * Never follow redirects or forward an API key to an image download host.
 */
export const providerFetch: typeof fetch = async (input, init) => {
  const url = providerUrl(String(input), true);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  init?.signal?.throwIfAborted();
  const addresses = isIP(host)
    ? [{ address: host, family: isIP(host) }]
    : await lookup(host, { all: true, verbatim: true });
  init?.signal?.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !publicAddress(address)))
    throw new Error("服务地址不能指向本机或内部网络。");
  return new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: init?.method || "GET",
        headers: Object.fromEntries(new Headers(init?.headers)),
        signal: init?.signal ?? undefined,
        lookup: (_host, options, callback) => {
          if (typeof options === "object" && options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        },
      },
      (incoming) => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(incoming.headers))
          if (value !== undefined)
            headers.set(key, Array.isArray(value) ? value.join(", ") : value);
        const status = incoming.statusCode ?? 502;
        resolve(
          new Response(
            [204, 205, 304].includes(status)
              ? null
              : (Readable.toWeb(incoming) as ReadableStream<Uint8Array>),
            { status, headers },
          ),
        );
      },
    );
    req.on("error", reject);
    req.end(init?.body as string | undefined);
  });
};
export async function boundedText(message: Request | Response, limit: number) {
  if (Number(message.headers.get("content-length")) > limit) {
    await message.body?.cancel();
    throw new Error("响应过大。");
  }
  if (!message.body) return "";
  const reader = message.body.getReader();
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes > limit) throw new Error("响应过大。");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8");
}
