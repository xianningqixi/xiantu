import { pruneReceipts } from "./receipts";
import type { Command, World } from "./types";
import { commandFingerprint, GameError, parseCommand } from "./protocol";
import { requireRule } from "./rules";
import { handle } from "./commands";
import { validateWorld } from "./validate";
export { B, threshold, stats, combatDamage } from "./rules";
export { hashSeed, nextRandom, rollAptitude } from "./rng";
export { relation, relationshipLabel } from "./relationships";
export { createWorld } from "./worldgen";
export { canInvite, partyReadiness, departureStatus } from "./agreement";
export { facts, scene, visibleEvents, knownNpcUpdates } from "./story";
export { gainPerDay, breakthroughChance } from "./cultivation";
export { validateWorld } from "./validate";

export function applyCommand(
  source: World,
  command: Command,
  commandId: string,
  revision: number,
): World {
  command = parseCommand(command);
  requireRule(
    typeof commandId === "string" && commandId.length > 0 && commandId.length <= 160,
    "行动编号不合法。",
  );
  const fingerprint = commandFingerprint(command);
  if (source.appliedCommands.includes(commandId)) {
    if (source.commandReceipts[commandId]?.fingerprint !== fingerprint)
      throw new GameError(
        "COMMAND_ID_REUSE",
        "这个行动编号已被使用，不能更改内容或重放未知的旧版行动。",
      );
    return source;
  }
  requireRule(
    source.revision === revision,
    "存档已经更新，请重新读取后再行动。",
    "REVISION_CONFLICT",
  );
  const next = structuredClone(source);
  handle(next, command);
  next.revision++;
  next.appliedCommands.push(commandId);
  Object.defineProperty(next.commandReceipts, commandId, {
    value: { fingerprint, revision: next.revision },
    enumerable: true,
    writable: true,
    configurable: true,
  });
  pruneReceipts(next);
  validateWorld(next);
  return next;
}
