import { validateWorld } from "./engine";
import { migrateKnowledge } from "./knowledge";
import { GameError } from "./protocol";
import type { World } from "./types";

/** Registered additive migration for the released xiantu-web-1 snapshot only.
 * Content/rules locks remain subject to validateWorld; this never blesses an unknown pack.
 */
export function migrateSave(value: unknown): { world: World; migrated: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new GameError("SAVE_VERSION_UNSUPPORTED", "存档格式无法识别，原进度未改变。");
  }
  const copy = structuredClone(value) as World;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  if (version !== undefined && version !== 1 && version !== 2 && version !== 3 && version !== 4) {
    throw new GameError(
      "SAVE_VERSION_UNSUPPORTED",
      "这是尚不支持的存档版本，请保留文件并使用对应版本打开。",
    );
  }
  const oldRules = (value as { rulesVersion?: unknown }).rulesVersion;
  const migrated = version !== 4 || oldRules === "0.1.1";
  if (version !== 4) {
    copy.schemaVersion = 4;
    copy.negotiations = [];
    if (version !== 3) {
      copy.contentLocks = [];
      copy.contentState = {};
    } else {
      copy.contentLocks ??= [];
      copy.contentState ??= {};
    }
  }
  if (version !== 3 && version !== 4) {
    // Old command IDs remain in appliedCommands and stay non-replayable when their
    // original payload is unknown. Do not invent receipts or delete old history.
    if (version !== 2) copy.commandReceipts = {};
    copy.knowledge = migrateKnowledge(copy);
    copy.simulationOptions = { backgroundConflicts: false };
    for (const actor of [copy.player, ...copy.npcs]) actor.lastActionDay = copy.day - 1;
    if (copy.battle) copy.battle.lethal = false;
    if (copy.longAction) {
      const a = copy.longAction;
      a.id = `legacy-action:${copy.day - a.total + a.remaining}`;
      a.checkpoint = a.total - a.remaining;
      a.paidStones = a.kind === "train" && a.stoneMethod ? a.checkpoint : 0;
    }
  }
  if (oldRules === "0.1.1") copy.rulesVersion = "0.1.2";
  validateWorld(copy);
  return { world: copy, migrated };
}
