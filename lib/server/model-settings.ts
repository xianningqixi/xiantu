import { generateImage } from "./image-generation";
import { z } from "zod";
import {
  modelDefaults,
  type ModelKind,
  type ModelSummaries,
  type ModelSummary,
} from "../ai/model-settings";
import { providerConfig, handleNegotiation, type ProviderConfig } from "./negotiation";
import { allowedOrigins } from "./negotiation-security";
import { canonicalTerms } from "../game/negotiation";
import { PACK } from "../game/content/official";
import {
  ModelSettingsStore,
  modelIdentity,
  SettingsConflict,
  type StoredModel,
} from "./model-settings-store";
import { boundedText, providerFetch, providerUrl } from "./provider-http";

const kindSchema = z.enum(["llm", "image"]);
const draftSchema = z
  .object({
    enabled: z.boolean(),
    baseUrl: z.string().trim().max(512),
    model: z.string().trim().max(100),
    key: z
      .string()
      .trim()
      .max(2048)
      .refine((v) => !/[\r\n\0]/.test(v)),
    timeout: z.number().int().min(1000).max(120000),
    maxTokens: z.number().int().min(100).max(1500),
    revision: z.number().int().nonnegative(),
  })
  .strict();
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("read") }).strict(),
  z.object({ action: z.literal("save"), kind: kindSchema, config: draftSchema }).strict(),
  z.object({ action: z.literal("test"), kind: kindSchema, config: draftSchema }).strict(),
  z
    .object({
      action: z.literal("clear"),
      kind: kindSchema,
      revision: z.number().int().nonnegative(),
    })
    .strict(),
]);
const defaultStore = new ModelSettingsStore();
type Options = {
  store?: ModelSettingsStore;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};
function fromEnvironment(
  kind: ModelKind,
  env: Record<string, string | undefined>,
): StoredModel | undefined {
  if (kind === "llm") {
    const config = providerConfig(env);
    return config ? { ...modelDefaults(kind), ...config, enabled: true, revision: 0 } : undefined;
  }
  if (!env.XIANTU_IMAGE_KEY) return undefined;
  return {
    ...modelDefaults(kind),
    enabled: true,
    revision: 0,
    baseUrl: providerUrl(env.XIANTU_IMAGE_BASE_URL || "https://api.openai.com/v1").href.replace(
      /\/$/,
      "",
    ),
    model: z.string().trim().min(1).max(100).parse(env.XIANTU_IMAGE_MODEL),
    key: env.XIANTU_IMAGE_KEY,
  };
}
function summary(kind: ModelKind, personal?: StoredModel, inherited?: StoredModel): ModelSummary {
  const config = personal ?? inherited;
  const { enabled, baseUrl, model, timeout, maxTokens } = config ?? modelDefaults(kind);
  return {
    enabled,
    baseUrl,
    model,
    timeout,
    maxTokens,
    hasKey: !!config?.key,
    source: personal ? "personal" : inherited ? "server" : "none",
    revision: personal?.revision ?? 0,
  };
}
export async function configuredModel(
  request: Request,
  kind: ModelKind,
  options: Options = {},
): Promise<ProviderConfig | null> {
  const personal = await (options.store ?? defaultStore).read(modelIdentity(request).id, kind);
  if (personal) return personal.enabled && personal.key ? { ...personal, mock: false } : null;
  const env = options.env ?? process.env;
  if (kind === "llm") return providerConfig(env);
  const image = fromEnvironment(kind, env);
  return image ? { ...image, mock: false } : null;
}
function candidate(
  kind: ModelKind,
  draft: z.infer<typeof draftSchema>,
  current?: StoredModel,
): StoredModel {
  if (kind === "llm" && draft.timeout > 30000) throw new Error("LLM 等待时间最多 30 秒。");
  const baseUrl = draft.baseUrl ? providerUrl(draft.baseUrl).href.replace(/\/$/, "") : "";
  // Never reuse a platform key, or send a retained personal key to a changed address.
  if (!draft.key && current?.key && baseUrl !== current.baseUrl)
    throw new Error("服务地址已更改，请重新填写密钥。");
  const key = draft.key || current?.key || "";
  if (draft.enabled && (!baseUrl || !draft.model || !key))
    throw new Error("启用模型前，请填写服务地址、模型 ID 和自己的 API Key。");
  return { ...draft, baseUrl, key };
}
const windows = new Map<string, { time: number; count: number }>();
function testAllowed(id: string) {
  const now = Date.now();
  for (const [key, value] of windows) if (now - value.time > 60000) windows.delete(key);
  if (windows.size >= 2000 && !windows.has(id)) return false;
  const window = windows.get(id) ?? { time: now, count: 0 };
  windows.set(id, window);
  return ++window.count <= 6;
}
export async function handleModelSettings(request: Request, options: Options = {}) {
  const env = options.env ?? process.env;
  const store = options.store ?? defaultStore;
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  const reply = (status: number, body: object) => Response.json(body, { status, headers });
  let origins: string[];
  try {
    origins = allowedOrigins(request, env);
  } catch {
    return reply(503, { error: "模型配置服务暂不可用。" });
  }
  if (!origins.includes(request.headers.get("origin") ?? ""))
    return reply(403, { error: "请从游戏设置页面操作。" });
  const origin = new URL(request.headers.get("origin")!);
  if (
    origin.protocol !== "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
  )
    return reply(403, { error: "请使用 HTTPS 或本机地址配置模型。" });
  if (!request.headers.get("content-type")?.includes("application/json"))
    return reply(415, { error: "配置请求格式不支持。" });
  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(JSON.parse(await boundedText(request, 16384)));
  } catch {
    return reply(400, { error: "请检查配置字段及长度。" });
  }
  const identity = modelIdentity(request, true);
  if (identity.cookie) headers.set("Set-Cookie", identity.cookie);
  try {
    if (input.action === "read") {
      const warnings: string[] = [];
      const pairs = await Promise.all(
        (["llm", "image"] as const).map(async (kind) => {
          const personal = await store.read(identity.id, kind);
          let inherited: StoredModel | undefined;
          if (!personal) {
            try {
              inherited = fromEnvironment(kind, env);
            } catch {
              warnings.push(
                `站点默认${kind === "llm" ? " LLM " : "生图"}配置无效，可填写个人配置。`,
              );
            }
          }
          return [kind, summary(kind, personal, inherited)];
        }),
      );
      return reply(200, {
        models: Object.fromEntries(pairs) as ModelSummaries,
        warning: warnings.join(" "),
      });
    }
    const current = await store.read(identity.id, input.kind);
    if (
      (current?.revision ?? 0) !==
      (input.action === "clear" ? input.revision : input.config.revision)
    )
      return reply(409, { error: "另一页面已修改配置，请重新读取后再保存。" });
    if (input.action === "clear") {
      const saved = await store.save(
        identity.id!,
        input.kind,
        { ...modelDefaults(input.kind), baseUrl: "", key: "" },
        input.revision,
      );
      return reply(200, {
        model: summary(input.kind, saved),
        message: "已清除个人配置并关闭此模型。",
      });
    }
    let config: StoredModel;
    try {
      config = candidate(input.kind, input.config, current);
    } catch (error) {
      return reply(400, { error: error instanceof Error ? error.message : "配置无效。" });
    }
    if (input.action === "save") {
      const saved = await store.save(identity.id!, input.kind, config, input.config.revision);
      return reply(200, { model: summary(input.kind, saved), message: "配置已保存，立即生效。" });
    }
    if (!testAllowed(identity.id!)) return reply(429, { error: "测试过于频繁，请一分钟后再试。" });
    if (!config.enabled) return reply(400, { error: "请先启用此模型，再进行测试。" });
    const fetcher = options.fetcher ?? providerFetch;
    if (input.kind === "image") {
      try {
        return reply(200, {
          message: "生图成功，仅作预览。",
          image: await generateImage(
            request,
            { ...config, mock: false },
            fetcher,
            "中国古风山水，一座青石小镇，远山与薄雾，无文字。",
          ),
        });
      } catch {
        return reply(request.signal.aborted ? 499 : 502, {
          error: "生图未完成，请检查模型权限、余额、地址和密钥，或增加等待时间。",
        });
      }
    }
    const smoke = new Request(request.url, {
      method: "POST",
      signal: request.signal,
      headers: { Origin: request.headers.get("origin")!, "Content-Type": "application/json" },
      body: JSON.stringify({
        saveId: "config-test",
        sessionId: "config-test",
        revision: 0,
        text: "你好，我还没有决定同行条款，请先向我问好。",
        context: {
          target: { id: PACK.roles.primary, name: "林晚" },
          location: "market",
          terms: canonicalTerms(),
          facts: [],
        },
      }),
    });
    const result = await handleNegotiation(smoke, {
      config: { ...config, mock: false },
      fetcher,
      rateKey: `settings:${identity.id}`,
      allowedOrigins: origins,
    });
    return reply(
      result.status,
      result.ok
        ? { message: "连接成功，模型已返回符合交涉格式的回应。" }
        : { error: "LLM 测试未通过，请检查地址、密钥、模型权限，以及严格 JSON Schema 支持。" },
    );
  } catch (error) {
    return reply(error instanceof SettingsConflict ? 409 : 503, {
      error:
        error instanceof SettingsConflict
          ? "另一页面已修改配置，请重新读取。"
          : "配置未能读取或保存，请稍后重试。",
    });
  }
}
