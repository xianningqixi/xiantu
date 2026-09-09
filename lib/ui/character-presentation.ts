import { intimacyKind } from "@/lib/game/intimacy-history";
import B from "@/lib/game/content/balance.json";
import { relationshipLabel } from "@/lib/game/relationships";
import { regionOf } from "@/lib/game/world-map";
import type { World } from "@/lib/game/types";
export function relationshipProgress(edge: World["relations"][number]) {
  if (!edge.known) return "先相识，再通过共同经历增进关系。";
  if (edge.grievance) return "尚有未解的怨怼，数值提升不会自动解除。";
  const friend = B.relationships.friendThresholds;
  const close = B.relationships.closeFriendThresholds;
  const isFriend = edge.favor >= friend.favorabilityMin && edge.trust >= friend.trustMin;
  const target = isFriend ? close : friend;
  const missing = [
    Math.max(0, target.favorabilityMin - edge.favor) &&
      `好感 ${Math.max(0, target.favorabilityMin - edge.favor)}`,
    Math.max(0, target.trustMin - edge.trust) &&
      `信任 ${Math.max(0, target.trustMin - edge.trust)}`,
    isFriend &&
      Math.max(0, close.distinctSharedExperienceCountMin - new Set(edge.memories).size) &&
      `${Math.max(0, close.distinctSharedExperienceCountMin - new Set(edge.memories).size)} 段共同经历`,
  ].filter(Boolean);
  return missing.length
    ? `距${isFriend ? "挚友" : "朋友"}尚需：${missing.join("、")}。`
    : "已达到挚友阶段；亲密往来另需双方自愿与相应条件。";
}
const indexes = new WeakMap<
  World,
  {
    count: number;
    relationCount: number;
    partners: Map<string, string>;
    edges: Map<string, World["relations"][number]>;
  }
>();
export function relationshipIndex(w: World) {
  let index = indexes.get(w);
  if (!index || index.count !== w.events.length || index.relationCount !== w.relations.length) {
    const partners = new Map<string, string>();
    for (const e of w.events)
      if (intimacyKind(w, e) === "bond" && e.actors.length === 2) {
        partners.set(e.actors[0], e.actors[1]);
        partners.set(e.actors[1], e.actors[0]);
      }
    index = {
      count: w.events.length,
      relationCount: w.relations.length,
      partners,
      edges: new Map(w.relations.map((r) => [`${r.from}:${r.to}`, r])),
    };
    indexes.set(w, index);
  }
  return index;
}
export function relationshipDisplay(w: World, from: string, to: string) {
  const index = relationshipIndex(w),
    edge = index.edges.get(`${from}:${to}`),
    attitude = relationshipLabel(edge);
  const bonded = index.partners.get(from) === to && index.partners.get(to) === from;
  const actor = to === "PLAYER" ? w.player : w.npcs.find((a) => a.id === to);
  return {
    bonded,
    attitude,
    label: bonded ? `道侣${actor?.alive ? "" : "（已逝）"} · ${attitude}` : attitude,
  };
}
export type PeopleFilter = "nearby" | "known" | "present" | "region" | "agreement";
export function peopleRows(w: World, query: string, filter: PeopleFilter, sort: string) {
  const index = relationshipIndex(w),
    known = (id: string) => !!index.edges.get(`${id}:PLAYER`)?.known;
  const recent = new Map<string, number>();
  for (const e of w.events)
    if (e.actors.includes("PLAYER"))
      for (const id of e.actors) recent.set(id, Math.max(recent.get(id) ?? 0, e.lastDay ?? e.day));
  return w.npcs
    .filter((a) => known(a.id) || regionOf(a.location) === regionOf(w.player.location))
    .filter(
      (a) =>
        a.name.includes(query.trim()) &&
        (filter === "known"
          ? known(a.id)
          : filter === "present"
            ? a.alive && !a.npcJourney && a.location === w.player.location
            : filter === "region"
              ? regionOf(a.location) === regionOf(w.player.location)
              : filter === "agreement"
                ? ["accepted", "active"].includes(w.agreement?.status ?? "") &&
                  w.agreement?.members.includes(a.id)
                : known(a.id) || (a.alive && !a.npcJourney && a.location === w.player.location)),
    )
    .sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name, "zh-CN")
        : sort === "recent"
          ? (recent.get(b.id) ?? -1) - (recent.get(a.id) ?? -1)
          : Number(b.alive && b.location === w.player.location) -
              Number(a.alive && a.location === w.player.location) ||
            Number(known(b.id)) - Number(known(a.id)) ||
            a.id.localeCompare(b.id),
    );
}
