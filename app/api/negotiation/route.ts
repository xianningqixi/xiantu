import { allowedOrigins, clientRateIdentity } from "@/lib/server/negotiation-security";
import { handleNegotiation, providerConfig } from "@/lib/server/negotiation";
export async function POST(request: Request) {
  try {
    const origins = allowedOrigins(request, process.env);
    if (!origins.includes(request.headers.get("origin") ?? ""))
      return Response.json(
        { error: "请从游戏页面发起交涉。" },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    const identity = await clientRateIdentity(request, process.env);
    const response = await handleNegotiation(request, {
      config: providerConfig(process.env),
      rateKey: identity.rateKey,
      allowedOrigins: origins,
    });
    if (identity.cookie) response.headers.append("Set-Cookie", identity.cookie);
    return response;
  } catch {
    return Response.json(
      { error: "自由交涉服务配置暂不可用，可继续固定选项。" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
