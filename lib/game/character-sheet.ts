import { actorById, B, REALM_KEYS, stats } from "./rules";
import { relation } from "./relationships";
import { regionOf } from "./world-map";
import type { World, Relation } from "./types";

/** Read-only projections shared by player and NPC inspection. */
export function characterVitals(w: World, id: string) {
  const actor = actorById(w, id);
  if (!actor) return null;
  const fighter = w.battle?.allies.find((f) => f.id === id);
  const attributes = fighter ?? { hp: actor.hp, ...stats(actor) };
  const longAction = id === "PLAYER" ? w.longAction : null;
  const state = !actor.alive
    ? "已逝"
    : fighter
      ? fighter.hp
        ? "战斗中"
        : "倒地，等待战斗结算"
      : actor.npcJourney
        ? `正在赶路 · 还需 ${actor.npcJourney.remaining} 日`
        : actor.attempt
          ? `正在突破 · 还需 ${actor.attempt.remaining} 日`
          : longAction
            ? `${longAction.kind === "breakthrough" ? "正在突破" : longAction.kind === "train" ? "正在修炼" : "正在等候"} · 还需 ${longAction.remaining} 日`
            : w.longAction?.guardian === id
              ? `正在护法 · 还需 ${w.longAction.remaining} 日`
              : "在世";
  return {
    ...attributes,
    state,
    age: Math.floor(actor.ageDays / B.world.daysPerYear),
    lifespan: B.world.npcLifespanDays[REALM_KEYS[actor.realm]] / B.world.daysPerYear,
  };
}

export function characterRelations(w: World, id: string) {
  const peers = new Map<string, { outgoing?: Relation; incoming?: Relation }>();
  for (const edge of w.relations) {
    if (edge.from !== id && edge.to !== id) continue;
    const peerId = edge.from === id ? edge.to : edge.from;
    if (peerId === id) continue;
    const peer = actorById(w, peerId);
    if (!peer) continue;
    // Unvisited regions do not reveal their cast through an unrelated acquaintance.
    if (
      peerId !== "PLAYER" &&
      !relation(w, peerId)?.known &&
      regionOf(peer.location) !== regionOf(w.player.location)
    )
      continue;
    const entry = peers.get(peerId) ?? {};
    if (edge.from === id) entry.outgoing = edge;
    else entry.incoming = edge;
    peers.set(peerId, entry);
  }
  return [...peers]
    .map(([peerId, directions]) => ({
      peer: actorById(w, peerId)!,
      ...directions,
    }))
    .sort(
      (a, b) =>
        Number(b.peer.id === "PLAYER") - Number(a.peer.id === "PLAYER") ||
        a.peer.name.localeCompare(b.peer.name, "zh-CN") ||
        a.peer.id.localeCompare(b.peer.id),
    );
}

export function characterHistory(w: World, id: string) {
  // A profile is the subject's life record, independent of what the player has
  // learned in-world. This read must not grant knowledge to dialogue or AI.
  return w.events
    .filter((event) => event.actors.includes(id))
    .toReversed()
    .sort((a, b) => (b.lastDay ?? b.day) - (a.lastDay ?? a.day));
}
