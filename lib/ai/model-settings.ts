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
};
export type ModelDraft = ModelFields & { key: string; revision: number };
export type ModelSummaries = Record<ModelKind, ModelSummary>;
export const MAX_REPLY_TOKENS = 8192;
export const modelDefaults = (kind: ModelKind): ModelFields => ({
  enabled: false,
  baseUrl: "https://api.openai.com/v1",
  model: "",
  timeout: kind === "llm" ? 10000 : 90000,
  maxTokens: 800,
});
