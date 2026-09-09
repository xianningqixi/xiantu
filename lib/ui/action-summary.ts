import { knownEvents } from "@/lib/game/knowledge";
import { IMPORTANT_EVENT_KINDS } from "@/lib/game/advance";
import { relation } from "@/lib/game/relationships";
import { threshold } from "@/lib/game/rules";
import type { World, WorldEvent } from "@/lib/game/types";
export type ActionSummary = {
  kind: "train" | "wait" | "breakthrough";
  startDay: number;
  observedFromDay: number;
  endDay: number;
  partial: boolean;
  startXp: number;
  startRealm: number;
  startStones: number;
  endXp: number;
  endRealm: number;
  endStones: number;
  status: "completed" | "stopped" | "condition-paused";
  events: WorldEvent[];
};
export function actionSummaryEvents(
  world: World,
  interval: Pick<ActionSummary, "startDay" | "endDay">,
) {
  const seen = new Set<string>();
  return knownEvents(world)
    .filter((e) => {
      if (
        e.day <= interval.startDay ||
        e.day > interval.endDay ||
        !world.knowledge[e.id]?.some((row) => row[0] === 0 && row[3] <= interval.endDay) ||
        !(
          IMPORTANT_EVENT_KINDS.has(e.kind) ||
          ["npc-meet", "npc-depart", "npc-arrive"].includes(e.kind)
        )
      )
        return false;
      const key = ["npc-meet", "npc-friendship"].includes(e.kind)
        ? `${e.kind}:${e.day}:${[...e.actors].sort().join(":")}`
        : e.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const score = (event: typeof a) =>
        (event.actors.includes("PLAYER") ? 10 : 0) +
        (event.actors.some((id) => world.party.includes(id)) ? 5 : 0) +
        (event.actors.some((id) => relation(world, id)?.known) ? 2 : 0) +
        (["death", "breakthrough", "sect-join", "npc-friendship", "conflict"].includes(event.kind)
          ? 2
          : 0);
      return score(b) - score(a) || b.day - a.day;
    })
    .map((event) => structuredClone(event));
}
export function beginActionSummary(
  world: World,
  kind: ActionSummary["kind"],
  checkpoint = 0,
): ActionSummary {
  return {
    kind,
    startDay: world.day - checkpoint,
    observedFromDay: world.day,
    endDay: world.day,
    partial: checkpoint > 0,
    startXp: world.player.xp,
    startRealm: world.player.realm,
    startStones: world.player.stones,
    endXp: world.player.xp,
    endRealm: world.player.realm,
    endStones: world.player.stones,
    status: "completed",
    events: [],
  };
}
export function finishActionSummary(
  start: ActionSummary,
  world: World,
  status: ActionSummary["status"],
): ActionSummary {
  const result = {
    ...start,
    endDay: world.day,
    endXp: world.player.xp,
    endRealm: world.player.realm,
    endStones: world.player.stones,
    status,
  };
  return { ...result, events: actionSummaryEvents(world, result) };
}
export function trainingGain(interval: ActionSummary) {
  let gain = interval.endXp - interval.startXp;
  if (interval.kind === "train")
    for (let realm = interval.startRealm; realm < interval.endRealm; realm++)
      gain += threshold({ realm: realm as World["player"]["realm"] } as World["player"]);
  return gain;
}
