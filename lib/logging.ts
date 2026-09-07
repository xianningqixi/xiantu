/** Allowlisted operational metadata only: never serialize arbitrary errors, prompts or saves. */
export type LogEvent =
  | "SAVE_FAILED"
  | "AI_REQUEST_STARTED"
  | "AI_REQUEST_FAILED"
  | "AI_REQUEST_COMPLETED"
  | "CONTENT_REJECTED";
export function diagnosticRecord(
  event: LogEvent,
  metadata: { requestId?: string; code?: string; durationMs?: number } = {},
) {
  return {
    event,
    ...(metadata.requestId ? { requestId: metadata.requestId.slice(0, 160) } : {}),
    ...(metadata.code ? { code: metadata.code.slice(0, 80) } : {}),
    ...(Number.isFinite(metadata.durationMs)
      ? { durationMs: Math.max(0, Math.round(metadata.durationMs!)) }
      : {}),
  };
}
