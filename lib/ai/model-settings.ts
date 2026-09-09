/** Public configuration metadata only. API keys are never part of game state. */
export type ModelKind = "llm" | "image";
export type ModelFields = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  timeout: number;
  maxTokens: number;
};
export type ModelSummary = ModelFields & {
  hasKey: boolean;
  source: "personal" | "server" | "none";
  revision: number;
  needsKey?: boolean;
};
export type ModelDraft = { key: string; revision: number };
export type ModelSummaries = Record<ModelKind, ModelSummary>;
export const MAX_REPLY_TOKENS = 8192;
/** Public provider presets. Credentials must never be added to this module. */
export const MODEL_PRESETS = {
  llm: {
    baseUrl: "http://172.86.116.166:3000/v1",
    model: "gpt-5.6-sol",
    timeout: 30000,
    maxTokens: MAX_REPLY_TOKENS,
  },
  image: {
    baseUrl: "http://172.86.116.166:3000/v1",
    model: "gpt-image-2",
    timeout: 90000,
    maxTokens: 800,
  },
} as const;
export const modelDefaults = (kind: ModelKind): ModelFields => ({
  ...MODEL_PRESETS[kind],
  enabled: false,
});

export function matchesModelEndpoint(kind: ModelKind, baseUrl: string) {
  try {
    return new URL(baseUrl.trim()).href.replace(/\/+$/, "") === MODEL_PRESETS[kind].baseUrl;
  } catch {
    return false;
  }
}
