import { handleNegotiation, providerConfig } from "@/lib/server/negotiation";
export async function POST(request: Request) {
  try {
    return await handleNegotiation(request, { config: providerConfig(process.env) });
  } catch {
    return Response.json(
      { error: "自由交涉服务配置暂不可用，可继续固定选项。" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
