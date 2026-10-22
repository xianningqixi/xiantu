import B from "./content/balance.json";
import { requireRule, actorById, clamp, threshold } from "./rules";
import { companyReason } from "./intimacy";
import { relation } from "./relationships";
import { recordFact } from "./knowledge";
import type { Actor, Relation, World } from "./types";

export type SocialKind = "discuss" | "gift" | "mentor";
export type GiftItem = "stones" | "healing" | "grass";

function friendReason(w: World, target: string, close: boolean): string {
  const r = relation(w, target);
  if (!r?.known) return "尚未相识。";
  const t = close ? B.relationships.closeFriendThresholds : B.relationships.friendThresholds;
  if (r.favor < t.favorabilityMin || r.trust < t.trustMin)
    return close ? "交情未到挚友。" : "交情尚浅，至少要是朋友。";
  if (
    close &&
    new Set(r.memories).size <
      B.relationships.closeFriendThresholds.distinctSharedExperienceCountMin
  )
    return "共同经历还不够，尚未到挚友。";
  return "";
}

function cooldownReason(
  w: World,
  r: Relation | undefined,
  key: "discussDay" | "giftDay" | "mentorDay",
  days: number,
) {
  const last = r?.interactions?.[key];
  if (last === undefined) return "";
  const wait = days - (w.day - last);
  return wait > 0 ? `此事还需等待 ${wait} 日。` : "";
}

export function giftItemName(item: GiftItem) {
  return item === "stones" ? "灵石" : item === "healing" ? "回春丹" : "凝元草";
}

export function socialReason(
  w: World,
  target: string,
  kind: SocialKind,
  item: GiftItem = "stones",
): string {
  const a = actorById(w, target);
  const reason = companyReason(w, w.player, a);
  if (reason) return reason;
  const r = relation(w, target);
  if (kind === "discuss") {
    const f = friendReason(w, target, false);
    if (f) return f;
    if (a!.realm < w.player.realm) return "对方境界低于你，论道无益。";
    return cooldownReason(w, r, "discussDay", B.relationships.discussCooldownDays);
  }
  if (kind === "gift") {
    const f = friendReason(w, target, false);
    if (f) return f;
    if (item === "stones" && w.player.stones < B.relationships.giftStoneCost)
      return `灵石不足，赠礼需 ${B.relationships.giftStoneCost} 枚。`;
    if (item !== "stones" && w.player[item] < 1) return `没有可赠的${giftItemName(item)}。`;
    return cooldownReason(w, r, "giftDay", B.relationships.giftCooldownDays);
  }
  const f = friendReason(w, target, true);
  if (f) return f;
  if (a!.realm - w.player.realm < B.relationships.mentorMinRealmGap)
    return `对方境界需高出你 ${B.relationships.mentorMinRealmGap} 档。`;
  return cooldownReason(w, r, "mentorDay", B.relationships.mentorCooldownDays);
}

function edge(w: World, from: string, to: string): Relation {
  let r = w.relations.find((x) => x.from === from && x.to === to);
  if (!r) {
    r = { from, to, favor: 0, trust: 0, attraction: 0, known: true, memories: [] };
    w.relations.push(r);
  }
  r.known = true;
  return r;
}

function stamp(w: World, target: string, key: "discussDay" | "giftDay" | "mentorDay", day: number) {
  for (const r of [edge(w, "PLAYER", target), edge(w, target, "PLAYER")])
    r.interactions = { ...r.interactions, [key]: day };
}

function share(w: World, kind: SocialKind, a: Actor, text: string, favor: number) {
  const id = recordFact(w, kind, text, ["PLAYER", a.id]);
  for (const [from, to] of [
    ["PLAYER", a.id],
    [a.id, "PLAYER"],
  ]) {
    const r = edge(w, from, to);
    r.memories.push(id);
    r.favor = clamp(r.favor + favor, -100, 100);
  }
  return id;
}

/** 论道：一日清谈，听境界更高者讲道，得一份感悟。 */
export function discuss(w: World, target: string) {
  const a = actorById(w, target)!;
  w.player.insight += 1;
  const text = `你与${a.name}论道一日。对方境界更高，一番问答让你对修行多了一层体悟。`;
  share(w, "discuss", a, text, 5);
  stamp(w, a.id, "discussDay", w.day);
  w.notice = text;
}

/** 赠礼：以灵石、回春丹或凝元草表达心意。 */
export function gift(w: World, target: string, item: GiftItem) {
  const a = actorById(w, target)!;
  const gain = B.relationships.giftDeltas[item];
  if (item === "stones") w.player.stones -= B.relationships.giftStoneCost;
  else w.player[item] -= 1;
  const text = `你将${giftItemName(item)}赠予${a.name}，对方收下并记住了这份心意。`;
  share(w, "gift", a, text, gain);
  stamp(w, a.id, "giftDay", w.day);
  w.notice = text;
}

/** 传功：向高境界挚友请教，得到接近当前关口的修为。 */
export function mentor(w: World, target: string) {
  const a = actorById(w, target)!;
  const gain = Math.ceil(
    (threshold(w.player) * B.relationships.mentorExperienceBp) / B.probabilityScaleBp,
  );
  w.player.xp = Math.min(threshold(w.player), w.player.xp + gain);
  const text = `${a.name}为你指点关窍，讲透一段行气要诀，你的修为向前推进了一截。`;
  share(w, "mentor", a, text, 2);
  stamp(w, a.id, "mentorDay", w.day);
  w.notice = text;
}
