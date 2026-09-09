import {
  matchesModelEndpoint,
  type ModelDraft,
  type ModelKind,
  type ModelSummary,
} from "./model-settings";
export function validateModelDraft(draft: ModelDraft, initial: ModelSummary, kind: ModelKind) {
  const errors: Partial<Record<keyof ModelDraft, string>> = {};
  const reusable =
    initial.source === "personal" &&
    initial.hasKey &&
    !initial.needsKey &&
    matchesModelEndpoint(kind, initial.baseUrl);
  if (!draft.key.trim() && !reusable) errors.key = "请填写自己的 API Key。";
  if (draft.key.trim().length > 2048 || /[\r\n\0]/.test(draft.key.trim()))
    errors.key = "API Key 格式无效，请粘贴完整的单行密钥。";
  return errors;
}
