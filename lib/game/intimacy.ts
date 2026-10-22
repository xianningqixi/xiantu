import { intimacyKind } from "./intimacy-history";
import type { Actor, LiaisonPlay, LiaisonStance, World, WorldEvent } from "./types";
import { B, actorById, clamp, requireRule } from "./rules";
import { recordFact } from "./knowledge";
import { cultivate } from "./cultivation";
import { sectResident } from "./sect-content";
import { relation } from "./relationships";
import {
  explicitDiscoveryText,
  explicitIntimacyAllowed,
  explicitIntimacyText,
  explicitLiaisonText,
  explicitNtrText,
} from "./intimacy-scenes";

export { explicitIntimacyAllowed };
export type { LiaisonPlay, LiaisonStance };

export type IntimacyKind = "bond" | "night" | "dual";
type IntimateRecord = NonNullable<WorldEvent["intimacy"]>["kind"];
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
export function settleIntimacy(w: World, a: Actor, b: Actor, kind: IntimacyKind) {
  requireRule(!intimacyReason(w, a, b, kind), intimacyReason(w, a, b, kind));
  if (kind === "dual") {
    cultivate(w, a, false, true);
    cultivate(w, b, false, true);
  }
  const prior =
    kind === "bond"
      ? 0
      : w.events.filter(
          (event) =>
            event.intimacy?.kind === kind &&
            event.actors.includes(a.id) &&
            event.actors.includes(b.id),
        ).length;
  const scene = kind === "night" || kind === "dual" ? explicitIntimacyText(a, b, kind, prior) : "";
  const text =
    scene ||
    (kind === "bond"
      ? `${a.name}与${b.name}当面互诉心意，双方自愿结为道侣，约定尊重彼此的选择。`
      : kind === "night"
        ? `${a.name}与${b.name}再次确认彼此意愿，私下相伴共度良宵。这段亲密经历只记于两人的生平。`
        : `${a.name}与${b.name}双方自愿共修，调和气机、互相照应，各自按修炼规则积累修为。`);
  recordCompany(w, a, b, text, kind);
  a.activity = b.activity =
    kind === "dual" ? "与道侣共修" : kind === "night" ? "与道侣相伴" : "互许道侣之约";
  return text;
}

export function liaisonCount(w: World, left: string, right: string, kind: IntimateRecord) {
  return w.events.filter(
    (event) =>
      event.intimacy?.kind === kind && event.actors.includes(left) && event.actors.includes(right),
  ).length;
}

function livingPartner(w: World, id: string) {
  const partner = bondPartner(w, id);
  return partner?.alive ? partner : undefined;
}

/** Dao companions who are not the person in this bed. */
export function betrayedIds(w: World, a: Actor, b: Actor) {
  const ids: string[] = [];
  for (const [person, other] of [
    [a, b],
    [b, a],
  ] as const) {
    const partner = livingPartner(w, person.id);
    if (partner && partner.id !== other.id && !ids.includes(partner.id)) ids.push(partner.id);
  }
  return ids;
}

export function liaisonReason(
  w: World,
  b: Actor | undefined,
  play: LiaisonPlay,
  stance: LiaisonStance,
): string {
  const a = w.player;
  const blocked = companyReason(w, a, b);
  if (blocked || !b) return blocked || "对方目前不在这里。";
  if (!relation(w, b.id)?.known) return "尚未相识，请先上前见礼。";
  const partner = livingPartner(w, a.id);
  const people = [a, b];
  if (play === "witness") {
    if (!partner) return "需要先有在世道侣。";
    if (partner.id === b.id) return "这是你自己的道侣。去找另一个人，才能看着道侣出轨。";
    const beside = companyReason(w, a, partner);
    if (beside) return beside;
    people.push(partner);
  }
  const years = B.relationships.explicitSceneMinimumAgeYears * B.world.daysPerYear;
  if (people.some((person) => person.ageDays < years))
    return "满二十一岁才能偷情、出轨或看着道侣被人寝取。";
  if (people.some((person) => person.sectMembership?.id === "yunv"))
    return "玉女宗守贞誓约期间不结侣、不行亲密往来。";
  if (play === "tryst" || play === "affair") {
    if (partner?.id === b.id && livingPartner(w, b.id)?.id === a.id)
      return "你们已经是道侣，用良宵或共修。";
    if (edges(w, a, b).some((edge) => edge?.grievance)) return "双方仍有未解的仇怨。";
    if (play === "tryst" && stance !== "secret") return "私下亲热只能先瞒着。";
    if (play === "affair" && stance !== "secret" && stance !== "mark")
      return "偷情要选择掩饰或留痕。";
    if (play === "affair" && liaisonCount(w, a.id, b.id, "tryst") < 1)
      return "先私下亲热一次，对方才肯把衣服脱干净。";
  } else {
    if (stance !== "indulge" && stance !== "sever") return "看着的时候要选择纵容或翻脸。";
    if (
      edges(w, partner!, b).some((edge) => edge?.grievance) ||
      edges(w, a, partner!).some((edge) => edge?.grievance)
    )
      return "双方仍有未解的仇怨。";
  }
  return "";
}

function ensureEdge(w: World, from: Actor, to: Actor) {
  let edge = w.relations.find((item) => item.from === from.id && item.to === to.id);
  if (!edge) {
    edge = {
      from: from.id,
      to: to.id,
      favor: 0,
      trust: 0,
      attraction: 0,
      known: true,
      memories: [],
    };
    w.relations.push(edge);
  }
  edge.known = true;
  return edge;
}

function recordIntimate(
  w: World,
  actors: Actor[],
  text: string,
  kind: IntimateRecord,
  betrayed: string[],
  heat?: { left: Actor; right: Actor; attraction: number },
) {
  w.rulesVersion = "0.2.0";
  const id = recordFact(
    w,
    "intimacy",
    text,
    actors.map((actor) => actor.id),
  );
  const intimacy: NonNullable<WorldEvent["intimacy"]> = { kind, consent: "mutual" };
  if (betrayed.length) intimacy.betrayed = betrayed;
  w.events.at(-1)!.intimacy = intimacy;
  if (heat) {
    const config = B.relationships.companionship;
    for (const [from, to] of [
      [heat.left, heat.right],
      [heat.right, heat.left],
    ] as const) {
      const edge = ensureEdge(w, from, to);
      edge.favor = clamp(edge.favor + config.liaisonFavor, -100, 100);
      edge.attraction = clamp(edge.attraction + heat.attraction, 0, 100);
      edge.memories.push(id);
    }
  }
  return id;
}

function strain(w: World, fromId: string, toId: string, eventId: string, breakBond: boolean) {
  const from = actorById(w, fromId);
  const to = actorById(w, toId);
  if (!from || !to) return;
  const config = B.relationships.companionship;
  const edge = ensureEdge(w, from, to);
  edge.trust = clamp(
    edge.trust - (breakBond ? config.exposeTrustLoss : config.indulgeTrustLoss),
    -100,
    100,
  );
  if (breakBond) {
    edge.favor = clamp(edge.favor - config.exposeFavorLoss, -100, 100);
    edge.grievance = true;
  }
  if (!edge.memories.includes(eventId)) edge.memories.push(eventId);
}

/** Player-confirmed affair, secret meeting, or watched infidelity. No cultivation reward. */
export function settleLiaison(w: World, b: Actor, play: LiaisonPlay, stance: LiaisonStance) {
  const a = w.player;
  requireRule(!liaisonReason(w, b, play, stance), liaisonReason(w, b, play, stance));
  const config = B.relationships.companionship;
  if (play === "witness") {
    const partner = livingPartner(w, a.id)!;
    const betrayed = betrayedIds(w, partner, b);
    const names = betrayed.map((id) => actorById(w, id)!.name);
    recordIntimate(
      w,
      [partner, b],
      explicitLiaisonText(partner, b, "affair", liaisonCount(w, partner.id, b.id, "affair"), names),
      "affair",
      betrayed,
      { left: partner, right: b, attraction: config.affairAttraction },
    );
    const text = explicitNtrText(a, partner, b, liaisonCount(w, a.id, b.id, "ntr"));
    const id = recordIntimate(w, [a, partner, b], text, "ntr", betrayed);
    const breakBond = stance === "sever";
    strain(w, a.id, partner.id, id, breakBond);
    strain(w, partner.id, a.id, id, breakBond);
    partner.activity = b.activity = "与人偷情";
    a.activity = "看着道侣出轨";
    return text;
  }
  const betrayed = play === "affair" ? betrayedIds(w, a, b) : [];
  const names = betrayed.map((id) => actorById(w, id)!.name);
  const text = explicitLiaisonText(a, b, play, liaisonCount(w, a.id, b.id, play), names);
  requireRule(text, "这一夜不能这样写。");
  recordIntimate(w, [a, b], text, play, betrayed, {
    left: a,
    right: b,
    attraction: play === "affair" ? config.affairAttraction : config.trystAttraction,
  });
  if (play === "affair" && stance === "mark" && betrayed.length) {
    const spouses = betrayed.map((id) => actorById(w, id)!);
    const discovery = explicitDiscoveryText(spouses, a, b);
    const id = recordFact(w, "scandal", discovery, [a.id, b.id, ...betrayed]);
    for (const spouse of betrayed) {
      strain(w, spouse, a.id, id, true);
      strain(w, spouse, b.id, id, true);
    }
    a.activity = b.activity = "偷情被撞破";
    return `${text}${discovery}`;
  }
  a.activity = b.activity = play === "affair" ? "与人偷情" : "私下亲热";
  return text;
}
