import { generateImage } from "./image-generation";
import { z } from "zod";
import {
  MODEL_PRESETS,
  matchesModelEndpoint,
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
import { boundedText, providerFetch } from "./provider-http";
import { safeModelFailure } from "./model-errors";

const kindSchema = z.enum(["llm", "image"]);
const draftSchema = z
  .object({
    key: z
      .string()
      .trim()
      .max(2048)
      .refine((v) => !/[\r\n\0]/.test(v)),
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
  if (env.XIANTU_IMAGE_BASE_URL && !matchesModelEndpoint(kind, env.XIANTU_IMAGE_BASE_URL))
    throw new Error("原站点密钥不属于当前固定服务，请重新配置密钥。");
  return {
    ...modelDefaults(kind),
    enabled: true,
    revision: 0,
    key: env.XIANTU_IMAGE_KEY,
  };
}
function summary(kind: ModelKind, personal?: StoredModel, inherited?: StoredModel): ModelSummary {
  const config = personal ?? inherited;
  const needsKey = !!personal?.key && !matchesModelEndpoint(kind, personal.baseUrl);
  return {
    ...MODEL_PRESETS[kind],
    enabled: !!config?.enabled && !needsKey,
    hasKey: !!config?.key,
    source: personal ? "personal" : inherited ? "server" : "none",
    revision: personal?.revision ?? 0,
    needsKey,
  };
}
export async function configuredModel(
  request: Request,
  kind: ModelKind,
  options: Options = {},
): Promise<ProviderConfig | null> {
  const personal = await (options.store ?? defaultStore).read(modelIdentity(request).id, kind);
  if (personal)
    return personal.enabled && personal.key && matchesModelEndpoint(kind, personal.baseUrl)
      ? { ...personal, ...MODEL_PRESETS[kind], mock: false }
      : null;
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
  // Never copy a platform key or move an old provider's key to the fixed service.
  const key =
    draft.key || (current && matchesModelEndpoint(kind, current.baseUrl) ? current.key : "");
  if (!key) throw new Error("请填写当前服务的 API Key。");
  return { ...modelDefaults(kind), enabled: true, key, revision: draft.revision };
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
    return reply(400, { error: "只需提交 API Key；请检查密钥格式，或刷新游戏后重试。" });
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
        { ...modelDefaults(input.kind), key: "" },
        input.revision,
      );
      return reply(200, {
        model: summary(input.kind, saved),
        message: "已清除个人 Key 并停用此模型。",
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
      return reply(200, { model: summary(input.kind, saved), message: "Key 已保存，模型已启用。" });
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
          error: "生图未完成，请检查 Key 的权限和余额，或稍后重试。",
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
        : safeModelFailure(await result.json()),
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
