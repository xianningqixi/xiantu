import { z } from "zod";
import { portraitSubjectSchema } from "../game/portrait-subject";
import { generateImage } from "./image-generation";
import { configuredModel } from "./model-settings";
import { modelIdentity, type ModelSettingsStore } from "./model-settings-store";
import { allowedOrigins } from "./negotiation-security";
import { boundedText, providerFetch } from "./provider-http";
import { portraitPrompt } from "./portrait-prompt";
const inputSchema = z
  .object({ subject: portraitSubjectSchema, variation: z.string().uuid() })
  .strict();
const requests = new Map<string, { started: number; count: number; busy: boolean }>();
type Options = {
  store?: ModelSettingsStore;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};
export async function handlePortrait(request: Request, options: Options = {}) {
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const reply = (status: number, body: object) => Response.json(body, { status, headers });
  const env = options.env ?? process.env;
  try {
    if (!allowedOrigins(request, env).includes(request.headers.get("origin") ?? ""))
      return reply(403, { error: "请从游戏页面生成立绘。" });
  } catch {
    return reply(503, { error: "站点来源配置无效。" });
  }
  if (!request.headers.get("content-type")?.includes("application/json"))
    return reply(415, { error: "立绘请求格式不支持。" });
  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(JSON.parse(await boundedText(request, 8192)));
  } catch {
    return reply(400, { error: "角色形貌资料无效，请检查身高和三围。" });
  }
  const identity = modelIdentity(request, true);
  if (identity.cookie) headers.set("Set-Cookie", identity.cookie);
  let config;
  try {
    config = await configuredModel(request, "image", options);
  } catch {
    return reply(503, { error: "生图配置无法读取，请在 AI 模型设置中重新检查。" });
  }
  if (!config)
    return reply(409, { error: "请先打开「AI 模型设置 → 生图模型」，填写配置、启用并保存。" });
  const now = Date.now();
  for (const [id, value] of requests)
    if (!value.busy && now - value.started > 60000) requests.delete(id);
  if (requests.size >= 2000 && !requests.has(identity.id!))
    return reply(429, { error: "绘制服务繁忙，请稍后再试。" });
  const window = requests.get(identity.id!) ?? { started: now, count: 0, busy: false };
  if (window.busy) return reply(429, { error: "当前已有一张立绘正在生成，请等待或取消后再试。" });
  if (window.count >= 6) return reply(429, { error: "生成过于频繁，请一分钟后再试。" });
  window.busy = true;
  window.count++;
  requests.set(identity.id!, window);
  try {
    const image = await generateImage(
      request,
      config,
      options.fetcher ?? providerFetch,
      portraitPrompt(input.subject, input.variation),
      "1024x1536",
    );
    if (request.signal.aborted) return reply(499, { error: "生成已取消。" });
    return reply(200, { image });
  } catch {
    return reply(request.signal.aborted ? 499 : 502, {
      error: "立绘生成未完成。请检查模型权限、余额、等待时间，以及是否支持 1024×1536 竖图。",
    });
  } finally {
    window.busy = false;
  }
}
