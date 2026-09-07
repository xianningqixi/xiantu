/** Only deployments that block direct origin access may trust Cloudflare's IP header. */
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
export function allowedOrigins(request: Request, env: Record<string, string | undefined>) {
  if (env.XIANTU_ALLOWED_ORIGINS)
    return env.XIANTU_ALLOWED_ORIGINS.split(",").map((value) => {
      const url = new URL(value.trim());
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error("游戏来源白名单配置无效。");
      return url.origin;
    });
  const url = new URL(request.url);
  return localHosts.has(url.hostname) ? [url.origin] : [];
}
const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
// A per-process signed anonymous session. No personal identifier or upstream key is stored.
const sessionKey = crypto.subtle.importKey(
  "raw",
  crypto.getRandomValues(new Uint8Array(32)),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"],
);
async function signature(value: string) {
  return hex(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", await sessionKey, new TextEncoder().encode(value)),
    ),
  );
}
export async function clientRateIdentity(
  request: Request,
  env: Record<string, string | undefined>,
) {
  const ip = request.headers.get("cf-connecting-ip");
  if (env.XIANTU_TRUST_CF_IP === "1" && ip && /^[0-9a-f:.]{3,45}$/i.test(ip))
    return { rateKey: `cf:${ip}`, cookie: null };
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith("xiantu_session="))
    ?.slice("xiantu_session=".length);
  if (cookie && /^[0-9a-f-]{36}\.[0-9a-f]{64}$/.test(cookie)) {
    const [id, mac] = cookie.split(".");
    const bytes = Uint8Array.from(mac.match(/../g)!, (b) => parseInt(b, 16));
    if (await crypto.subtle.verify("HMAC", await sessionKey, bytes, new TextEncoder().encode(id)))
      return { rateKey: `session:${id}`, cookie: null };
  }
  const id = crypto.randomUUID();
  const secure = request.headers.get("origin")?.startsWith("https://") ? "; Secure" : "";
  return {
    rateKey: `session:${id}`,
    cookie: `xiantu_session=${id}.${await signature(id)}; Path=/api/negotiation; HttpOnly; SameSite=Strict; Max-Age=86400${secure}`,
  };
}
