import { knownEvents } from "./knowledge";
import { threshold, actorById } from "./rules";
import { requireRule } from "./errors";
import type { StopCondition, World } from "./types";
export const IMPORTANT_EVENT_KINDS = new Set([
  "advance",
  "breakthrough",
  "breakthrough-failed",
  "death",
  "conflict",
  "agreement-ended",
  "npc-friendship",
  "sect-join",
  "sect-art",
]);
export function validateStopCondition(world: World, condition?: StopCondition) {
  if (condition?.kind === "npcArrives")
    requireRule(
      actorById(world, condition.target)?.alive && condition.target !== "PLAYER",
      "请选择仍在世的故人。",
      "ACTION_UNAVAILABLE",
    );
}
/** Only player-known facts can interrupt or summarize an action. */
export function advanceStopReason(
  world: World,
  condition?: StopCondition,
  afterDay = world.day,
): string | null {
  if (world.ended) return "此生已落笔。";
  if (
    condition?.kind === "cultivationReady" &&
    world.player.xp >= threshold(world.player) &&
    [0, 3, 4].includes(world.player.realm)
  )
    return "修为已圆满。";
  if (condition?.kind === "npcArrives") {
    const person = actorById(world, condition.target);
    if (!person?.alive) return "等候的人已经离世，停止等候。";
    if (!person.npcJourney && person.location === world.player.location)
      return `${person.name}已到达此处。`;
  }
  if (
    condition?.kind === "importantEvent" &&
    knownEvents(world).some((e) => e.day > afterDay && IMPORTANT_EVENT_KINDS.has(e.kind))
  )
    return "你得知了重要近况，暂缓行动。";
  return null;
}
