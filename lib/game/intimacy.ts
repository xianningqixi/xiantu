import { intimacyKind } from "./intimacy-history";
import type { Actor, World, WorldEvent } from "./types";
import { B, actorById, clamp, requireRule } from "./rules";
import { knowsEvent, recordFact, rememberFact } from "./knowledge";
import { cultivate } from "./cultivation";
import { sectResident } from "./sect-content";
import { aftermathLines, aftermathNote } from "./intimacy-aftermath";
import { random } from "./rng";
import { locationKind } from "./world-map";

export type DualMethod = "steal" | "balance";

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
  // 约定只约束「约好同行却还没跟上的人」；队里的人本来就同路，圈外人也不受影响。
  if (
    w.agreement?.status === "accepted" &&
    [a.id, b.id].some(
      (id) => id !== "PLAYER" && w.agreement!.members.includes(id) && !w.party.includes(id),
    )
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
  w.rulesVersion = "0.2.0";
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
/** Relationship edges exist before intimacy, but keep this defensive for NPC-only pairs. */
function ensureEdge(w: World, a: Actor, b: Actor) {
  for (const [from, to] of [
    [a.id, b.id],
    [b.id, a.id],
  ])
    if (!w.relations.some((r) => r.from === from && r.to === to))
      w.relations.push({
        from,
        to,
        favor: 0,
        trust: 0,
        attraction: 0,
        known: true,
        memories: [],
      });
  return w.relations.find((r) => r.from === b.id && r.to === a.id)!;
}
/** 采补的代价落在被采的一方：连采超过 strainAfter 次即「采干」，双方收益衰减，歇够 strainDays 日后重新计数。 */
type StealConfig = (typeof B.relationships.companionship.dualMethods)["steal"];
function noteStrain(w: World, a: Actor, b: Actor, config: StealConfig) {
  const edge = ensureEdge(w, a, b);
  const last = edge.interactions?.stoleDay;
  const streak =
    last !== undefined && w.day - last <= config.strainDays
      ? (edge.interactions!.stealStreak ?? 0) + 1
      : 1;
  const mirror = w.relations.find((r) => r.from === a.id && r.to === b.id)!;
  for (const r of [edge, mirror])
    r.interactions = { ...r.interactions, stoleDay: w.day, stealStreak: streak };
  return streak;
}
/** 面板预告：连采到第几次会被采干。 */
export function strainReason(w: World, a: Actor, b?: Actor) {
  if (!b) return "";
  const config = B.relationships.companionship.dualMethods.steal;
  const edge = w.relations.find((r) => r.from === b.id && r.to === a.id);
  const last = edge?.interactions?.stoleDay;
  const streak =
    last !== undefined && w.day - last <= config.strainDays
      ? (edge?.interactions?.stealStreak ?? 0)
      : 0;
  if (!streak) return "";
  return streak > config.strainAfter
    ? `${b.name}已被连采 ${streak} 次，根基发虚，这一夜双方所得都会减。`
    : `${b.name}已被连采 ${streak} 次，再采 ${config.strainAfter - streak + 1} 次便会被采干。`;
}
/** 地点不是布景：野地要吃苦头，屋里隔墙有耳。两者都只影响气氛与情报，不改既有的境界与修为规则。 */
function applyPlace(w: World, a: Actor, b: Actor, place: string, eventId: string): string {
  const config = B.relationships.companionship;
  if (place === "wild") {
    for (const who of [a, b]) who.hp = Math.max(1, who.hp - config.wildHpCost);
    const edge = w.relations.find((r) => r.from === b.id && r.to === a.id);
    if (edge) {
      edge.favor = clamp(edge.favor + config.wildFavorGain, -100, 100);
      w.relations.find((r) => r.from === a.id && r.to === b.id)!.favor = clamp(
        edge.favor,
        -100,
        100,
      );
    }
  }
  if (place !== "wild" && random(w, "simulation", 10000) < config.overheardBp) {
    const event = w.events.find((e) => e.id === eventId)!;
    const near = [w.player, ...w.npcs].find(
      (p) =>
        p.id !== a.id &&
        p.id !== b.id &&
        p.alive &&
        !p.npcJourney &&
        p.location === a.location &&
        !knowsEvent(w, eventId, p.id),
    );
    if (near) {
      rememberFact(w, event, near.id, "witness");
      return near.name;
    }
  }
  return "";
}
export function settleIntimacy(
  w: World,
  a: Actor,
  b: Actor,
  kind: IntimacyKind,
  method: DualMethod = "balance",
) {
  requireRule(!intimacyReason(w, a, b, kind), intimacyReason(w, a, b, kind));
  let dualLine = "";
  if (kind === "dual") {
    const config = B.relationships.companionship.dualMethods[method] as StealConfig;
    ensureEdge(w, a, b);
    const streak = method === "steal" ? noteStrain(w, a, b, config) : 0;
    const drained = streak > config.strainAfter;
    cultivate(w, a, false, true, drained ? config.strainSelfBp : config.selfBp);
    cultivate(w, b, false, true, drained ? config.strainPartnerBp : config.partnerBp);
    let strained = "";
    if (method === "steal") {
      dualLine =
        streak === 1
          ? `${a.name}采得${b.name}一缕真气为己用，${b.name}所得稍少。`
          : `${a.name}又采得${b.name}一缕真气，已连采 ${streak} 次。`;
      if (drained)
        strained = `${b.name}根基被榨得发虚，这一次连${a.name}所得也减了，须歇上几日才回得过来。`;
    } else {
      dualLine = `${a.name}与${b.name}气机往来如环，各有所得。`;
    }
    if (strained) dualLine = `${dualLine.slice(0, -1)}；${strained}`;
  }
  const afterward = aftermathLines(kind, a, b);
  const aftermath = afterward[random(w, "simulation", afterward.length)];
  const kindOfPlace = locationKind(a.location);
  const scenes = B.relationships.companionship.sceneLines as Record<string, string[]>;
  const pool = scenes[kindOfPlace] ?? B.relationships.companionship.sceneFallback;
  const scene = pool[random(w, "simulation", pool.length)];
  const text =
    kind === "bond"
      ? `${a.name}与${b.name}当面互诉心意，双方自愿结为道侣，约定尊重彼此的选择。${scene}${aftermath}`
      : kind === "night"
        ? `${a.name}与${b.name}再次确认彼此意愿，私下相伴共度良宵。这段亲密经历只记于两人的生平。${scene}${aftermath}`
        : `${a.name}与${b.name}双方自愿共修，调和气机、互相照应，各自按修炼规则积累修为。${dualLine}${scene}${aftermath}`;
  const eventId = recordCompany(w, a, b, text, kind);
  const overheard = applyPlace(w, a, b, kindOfPlace, eventId);
  const note =
    aftermathNote(kind, aftermath, a, b, dualLine) +
    (overheard ? `${overheard}隔着墙听见了。` : "");
  if (a.id === "PLAYER" || b.id === "PLAYER") w.notice = note;
  a.activity = b.activity =
    kind === "dual" ? "与道侣共修" : kind === "night" ? "与道侣相伴" : "互许道侣之约";
  return note;
}
