import { intimacyKind } from "./intimacy-history";
import type { Actor, World, WorldEvent } from "./types";
import { B, actorById, clamp, requireRule } from "./rules";
import { recordFact } from "./knowledge";
import { cultivate } from "./cultivation";
import { sectResident } from "./sect-content";

export type IntimacyKind = NonNullable<WorldEvent["intimacy"]>["kind"];
export function intimacyHistory(w: World, id: string) {
  return w.events.filter((e) => intimacyKind(w, e) && e.actors.includes(id));
}
export function bondPartner(w: World, id: string) {
  const event = intimacyHistory(w, id).findLast((e) => intimacyKind(w, e) === "bond");
  return actorById(w, event?.actors.find((a) => a !== id) ?? "");
}
export const hasSexualHistory = (w: World, id: string) =>
  intimacyHistory(w, id).some((e) => intimacyKind(w, e) !== "bond");

export function companyReason(w: World, a: Actor, b?: Actor): string {
  if (!b || a.id === b.id || !a.alive || !b.alive || !a.hp || !b.hp) return "双方须在世并能行动。";
  if (a.location !== b.location) return "需要双方在同一地点。";
  if (a.npcJourney || b.npcJourney) return "有人正在赶路，请等抵达后再相见。";
  if (a.attempt || b.attempt) return "有人正在突破，请等候结束。";
  if (w.ended || ([a.id, b.id].includes("PLAYER") && (w.battle || w.longAction || w.loot)))
    return "请先完成当前行动与结算。";
  if (
    w.agreement?.status === "accepted" &&
    w.agreement.members.some((id) => id === a.id || id === b.id)
  )
    return "对方正在履行会合约定，请先完成同行。";
  return "";
}
function edges(w: World, a: Actor, b: Actor) {
  return [
    w.relations.find((r) => r.from === a.id && r.to === b.id),
    w.relations.find((r) => r.from === b.id && r.to === a.id),
  ];
}
export function intimacyBoundaryReason(w: World, a: Actor, b: Actor | undefined): string {
  const reason = companyReason(w, a, b);
  if (reason || !b) return reason;
  if (
    [a, b].some(
      (p) => p.ageDays < B.relationships.intimateRelationshipMinimumAgeYears * B.world.daysPerYear,
    )
  )
    return "亲密往来只对成年人开放。";
  if ([a, b].some((p) => p.sectMembership?.id === "yunv"))
    return "玉女宗守贞誓约期间不结侣、不行亲密往来。";
  const partners = [bondPartner(w, a.id), bondPartner(w, b.id)];
  if (partners.some((p, i) => p?.alive && p.id !== [b, a][i].id)) return "对方或你已有在世道侣。";
  if (edges(w, a, b).some((r) => r?.grievance)) return "双方仍有未解的仇怨。";
  return "";
}
export function intimacyReason(
  w: World,
  a: Actor,
  b: Actor | undefined,
  kind: IntimacyKind,
): string {
  const reason = intimacyBoundaryReason(w, a, b);
  if (reason || !b) return reason;
  const partners = [bondPartner(w, a.id), bondPartner(w, b.id)];
  if (kind === "bond") {
    if (partners[0]?.id === b.id && partners[1]?.id === a.id) return "你们已经结为道侣。";
    const reserved = sectResident(b.id)?.partner;
    if (reserved && reserved !== a.id) return `${b.name}已有心之所向，愿与你以朋友相待。`;
    const config = B.relationships.companionship;
    if (
      edges(w, a, b).some(
        (r) => !r?.known || r.favor < config.bondFavorMin || r.trust < config.bondTrustMin,
      )
    )
      return `尚未互诉心意。双方好感与信任须分别达到 ${config.bondFavorMin} / ${config.bondTrustMin}，可先相伴交流。`;
  } else {
    if (partners[0]?.id !== b.id || partners[1]?.id !== a.id) return "需要先由双方自愿结为道侣。";
    if (kind === "dual" && (!a.manual || !b.manual)) return "双方需要先掌握入门功法。";
  }
  return "";
}
/** Every shared event updates both directions; ordinary company never creates attraction. */
export function recordCompany(w: World, a: Actor, b: Actor, text: string, intimate?: IntimacyKind) {
  if (w.rulesVersion !== "0.1.6") w.rulesVersion = "0.1.5";
  const id = recordFact(w, intimate ? "intimacy" : "companionship", text, [a.id, b.id]);
  if (intimate) w.events.at(-1)!.intimacy = { kind: intimate, consent: "mutual" };
  const config = B.relationships.companionship;
  for (const [from, to] of [
    [a, b],
    [b, a],
  ]) {
    let r = w.relations.find((r) => r.from === from.id && r.to === to.id);
    if (!r) {
      r = {
        from: from.id,
        to: to.id,
        favor: 0,
        trust: 0,
        attraction: 0,
        known: true,
        memories: [],
      };
      w.relations.push(r);
    }
    r.known = true;
    r.favor = clamp(r.favor + config.favorGain, -100, 100);
    r.trust = clamp(r.trust + config.trustGain, -100, 100);
    if (intimate === "bond") r.attraction = Math.max(r.attraction, config.bondAttraction);
    r.memories.push(id);
  }
  return id;
}
export function settleIntimacy(w: World, a: Actor, b: Actor, kind: IntimacyKind) {
  requireRule(!intimacyReason(w, a, b, kind), intimacyReason(w, a, b, kind));
  if (kind === "dual") {
    cultivate(w, a, false, true);
    cultivate(w, b, false, true);
  }
  const text =
    kind === "bond"
      ? `${a.name}与${b.name}当面互诉心意，双方自愿结为道侣，约定尊重彼此的选择。`
      : kind === "night"
        ? `${a.name}与${b.name}再次确认彼此意愿，私下相伴共度良宵。这段亲密经历只记于两人的生平。`
        : `${a.name}与${b.name}双方自愿共修，调和气机、互相照应，各自按修炼规则积累修为。`;
  recordCompany(w, a, b, text, kind);
  a.activity = b.activity =
    kind === "dual" ? "与道侣共修" : kind === "night" ? "与道侣相伴" : "互许道侣之约";
  return text;
}
