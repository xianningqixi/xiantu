/** Stable categories are independent of player-facing translations. */
export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "GameError";
  }
}
export function requireRule(ok: unknown, message: string, code = "RULE_REFUSED") {
  if (!ok) throw new GameError(code, message);
}
export function requireSave(ok: unknown, message: string) {
  requireRule(ok, message, "INVALID_SAVE");
}
export function isRuleRefusal(code: string) {
  return ["RULE_REFUSED", "INSUFFICIENT_RESOURCES", "ACTION_UNAVAILABLE"].includes(code);
}
