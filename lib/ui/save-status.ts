export const persistenceErrors = new Set([
  "SAVE_WRITE_FAILED",
  "SAVE_QUOTA_EXCEEDED",
  "SAVE_UNCONFIRMED",
  "STALE_REVISION",
  "SAVE_MIGRATION_BLOCKED",
  "WORKER_UNAVAILABLE",
  "SAVE_VERSION_UNSUPPORTED",
]);
export const retryableSaveError = (code: string) =>
  ["SAVE_WRITE_FAILED", "SAVE_QUOTA_EXCEEDED"].includes(code);
