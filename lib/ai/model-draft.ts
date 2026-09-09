import {
  MAX_REPLY_TOKENS,
  type ModelDraft,
  type ModelKind,
  type ModelSummary,
} from "./model-settings";
export function validateModelDraft(draft: ModelDraft, initial: ModelSummary, kind: ModelKind) {
  const errors: Partial<Record<keyof ModelDraft, string>> = {};
  if (draft.enabled) {
    try {
      const url = new URL(draft.baseUrl.trim());
      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.hash ||
        url.search
      )
        throw new Error();
    } catch {
      errors.baseUrl = "填写有效的 HTTP / HTTPS 接口根地址。";
    }
    if (!draft.model.trim()) errors.model = "请填写服务商提供的模型 ID。";
    const same =
      draft.baseUrl.trim().replace(/\/+$/, "") === initial.baseUrl.trim().replace(/\/+$/, "");
    if (!draft.key.trim() && !(initial.source === "personal" && initial.hasKey && same))
      errors.key = same ? "请填写自己的 API Key。" : "服务地址已变化，请重新填写 API Key。";
  }
  if (
    !Number.isInteger(draft.timeout) ||
    draft.timeout < 1000 ||
    draft.timeout > (kind === "llm" ? 30000 : 120000)
  )
    errors.timeout = `等待上限需为 1–${kind === "llm" ? 30 : 120} 秒。`;
  if (
    kind === "llm" &&
    (!Number.isInteger(draft.maxTokens) ||
      draft.maxTokens < 100 ||
      draft.maxTokens > MAX_REPLY_TOKENS)
  )
    errors.maxTokens = `回复上限需为 100–${MAX_REPLY_TOKENS} 的整数。`;
  return errors;
}
