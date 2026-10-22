import { intimacyKind } from "./intimacy-history";
import { sectResident } from "./sect-content";
import { actorById, B, REALM_KEYS, stats } from "./rules";
import { relation } from "./relationships";
import { regionOf } from "./world-map";
import type { Relation, World, WorldEvent } from "./types";

const INTERCOURSE = new Set(["night", "dual", "affair", "ntr"]);
const SEX_LABEL: Record<string, string> = {
  bond: "结为道侣",
  tryst: "私下亲热，没有交合",
  night: "良宵交合",
  dual: "双修交合",
  affair: "偷情交合",
  ntr: "寝取",
};

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

function peerNames(w: World, id: string, events: WorldEvent[]) {
  const names: string[] = [];
  for (const event of events)
    for (const peer of event.actors)
      if (peer !== id) {
        const name = actorById(w, peer)?.name;
        if (name && !names.includes(name)) names.push(name);
      }
  return names;
}

/** Read-only sexual and social summary. Virginity uses recorded intercourse, not unwritten pasts. */
export function lifeRecord(w: World, id: string) {
  const actor = actorById(w, id);
  if (!actor) return null;
  const intimate = w.events.filter((event) => intimacyKind(w, event) && event.actors.includes(id));
  const kinds = intimate.map((event) => ({ event, kind: intimacyKind(w, event)! }));
  const intercourse = kinds.filter((item) => INTERCOURSE.has(item.kind));
  const resident = sectResident(id);
  const authoredVirgin =
    actor.sex === "female" && typeof resident?.virgin === "boolean" ? resident.virgin : null;
  const virgin =
    actor.sex !== "female"
      ? null
      : intercourse.length > 0
        ? false
        : authoredVirgin === false
          ? false
          : true;
  const lines: string[] = [];
  if (actor.sex === "female" && actor.sectMembership?.id === "yunv" && virgin)
    lines.push("自述未有性经历，目前守贞清修。");
  const mate = resident?.partner ? sectResident(resident.partner) : undefined;
  if (authoredVirgin === false && intercourse.length === 0 && mate)
    lines.push(`小传写明已与${mate.name}有过交合。`);
  if (!kinds.length && authoredVirgin !== false) lines.push("记下的经历里还没有亲热，也没有交合。");
  const groups = new Map<string, { label: string; names: string; count: number }>();
  for (const item of kinds) {
    const names = peerNames(w, id, [item.event]).join("、");
    const key = `${item.kind}|${names}`;
    const group = groups.get(key) ?? { label: SEX_LABEL[item.kind] ?? item.kind, names, count: 0 };
    group.count += 1;
    groups.set(key, group);
  }
  for (const group of groups.values())
    lines.push(
      `${group.names ? `与${group.names}` : ""}${group.label}${group.count > 1 ? ` ${group.count} 次` : ""}。`,
    );
  const history = characterHistory(w, id);
  const company = history.filter((event) => event.kind === "companionship");
  const acquaintance = history.filter((event) =>
    ["social", "npc-friendship", "firstMeeting", "npc-meet"].includes(event.kind),
  );
  const bond = [...kinds].reverse().find((item) => item.kind === "bond");
  const bondNames = bond ? peerNames(w, id, [bond.event]) : [];
  const companyNames = peerNames(w, id, company);
  const shownCompany = companyNames.slice(0, 3).join("、");
  const social = [
    bondNames.length ? `道侣：${bondNames.join("、")}。` : "没有记下道侣。",
    company.length
      ? `相伴交流 ${company.length} 次${shownCompany ? `，与${shownCompany}${companyNames.length > 3 ? "等" : ""}` : ""}。`
      : "还没有记下相伴交流。",
    acquaintance.length ? `相识与日常往来 ${acquaintance.length} 条。` : "",
  ]
    .filter(Boolean)
    .join("");
  return {
    virgin,
    virginLabel: virgin === null ? "" : virgin ? "处女" : "已非处女",
    sex: lines.join(""),
    social,
    note:
      authoredVirgin === false
        ? "小传里的交合是人物自己的生平。其余只按本局已经记下的经历判断，未记载的过往不会推断。"
        : "只按本局已经记下的经历判断，未记载的过往不会推断。",
  };
}
