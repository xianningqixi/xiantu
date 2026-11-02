import B from "./content/balance.json";
import { requireRule, actorById, clamp, threshold, stats } from "./rules";
import { companyReason } from "./intimacy";
import { relation } from "./relationships";
import { locationKind } from "./world-map";
import { recordFact } from "./knowledge";
import { random } from "./rng";
import type { Actor, Relation, World } from "./types";

export type SocialKind = "discuss" | "gift" | "mentor" | "chat" | "spar" | "stroll";
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

type CooldownKey = "discussDay" | "giftDay" | "mentorDay" | "chatDay" | "sparDay" | "strollDay";

function cooldownReason(w: World, r: Relation | undefined, key: CooldownKey, days: number) {
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
    return cooldownReason(w, r, "discussDay", B.relationships.discussCooldown);
  }
  if (kind === "gift") {
    const f = friendReason(w, target, false);
    if (f) return f;
    if (item === "stones" && w.player.stones < B.relationships.giftStoneCost)
      return `灵石不足，赠礼需 ${B.relationships.giftStoneCost} 枚。`;
    if (item !== "stones" && w.player[item] < 1) return `没有可赠的${giftItemName(item)}。`;
    return cooldownReason(w, r, "giftDay", B.relationships.giftCooldown);
  }
  if (kind === "chat") {
    const known = relation(w, target);
    if (!known?.known) return "尚未相识。";
    return cooldownReason(w, known, "chatDay", B.relationships.chatCooldown);
  }
  if (kind === "spar") {
    const f = friendReason(w, target, false);
    if (f) return f;
    if (Math.abs(a!.realm - w.player.realm) > B.relationships.sparMinRealmGap)
      return `切磋对象需与你境界相差不超过 ${B.relationships.sparMinRealmGap} 档。`;
    if (a!.hp <= 0 || w.player.hp <= 0) return "双方须无伤在身。";
    return cooldownReason(w, r, "sparDay", B.relationships.sparCooldown);
  }
  if (kind === "stroll") {
    const f = friendReason(w, target, false);
    if (f) return f;
    if (locationKind(w.player.location) === "inn") return "客栈里无景可游，请到坊市或城外。";
    return cooldownReason(w, r, "strollDay", B.relationships.strollCooldown);
  }
  const f = friendReason(w, target, true);
  if (f) return f;
  if (a!.realm - w.player.realm < B.relationships.mentorMinRealmGap)
    return `对方境界需高出你 ${B.relationships.mentorMinRealmGap} 档。`;
  return cooldownReason(w, r, "mentorDay", B.relationships.mentorCooldown);
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

function stamp(w: World, target: string, key: CooldownKey, day: number) {
  for (const r of [edge(w, "PLAYER", target), edge(w, target, "PLAYER")])
    r.interactions = { ...r.interactions, [key]: day };
}

function share(
  w: World,
  kind: SocialKind,
  a: Actor,
  text: string,
  favor: number,
  extra?: { trust?: number; attraction?: number },
) {
  const id = recordFact(w, kind, text, ["PLAYER", a.id]);
  for (const [from, to] of [
    ["PLAYER", a.id],
    [a.id, "PLAYER"],
  ]) {
    const r = edge(w, from, to);
    r.memories.push(id);
    r.favor = clamp(r.favor + favor, -100, 100);
    r.trust = clamp(r.trust + (extra?.trust ?? 0), -100, 100);
    r.attraction = clamp(r.attraction + (extra?.attraction ?? 0), 0, 100);
  }
  return id;
}

function pick<T>(w: World, list: T[]): T {
  return list[random(w, "simulation", list.length)];
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

const CHAT_LINES = [
  "你们说些不相干的闲话，谁也没提修行。",
  "对方随口讲了件旧事，你听着，忽然觉得这人比先前近了。",
  "你把路上见着的琐碎光景说了一遍，对方笑了一声。",
];

const STROLL_SCENES: Record<string, string[]> = {
  wild: [
    "你们沿着野径走了一段，风把草木压得低低的。",
    "城外荒草里有一处旧亭，你们在亭下站了很久。",
  ],
  market: [
    "你们在市集里闲逛，看摊上那些真假难辨的货色。",
    "街角有人唱曲，你们站着听完，谁也没说话。",
  ],
  gate: ["你们绕着山门外的石阶走，脚下石板被前人磨得发亮。"],
  ruins: ["你们在断碑间穿行，指尖划过看不清的字。"],
};

/** 闲谈：只要相识就能开口，不打断手上的事。 */
export function chat(w: World, target: string) {
  const a = actorById(w, target)!;
  const text = `${a.name}——${pick(w, CHAT_LINES)}`;
  share(w, "chat", a, text, B.relationships.chatFavorGain, {
    trust: B.relationships.chatTrustGain,
  });
  stamp(w, a.id, "chatDay", w.day);
  w.notice = text;
}

/** 切磋：耗一日，点到为止，赢者多得一分手悟。 */
export function spar(w: World, target: string) {
  const a = actorById(w, target)!;
  const scale = B.probabilityScaleBp;
  const mine = stats(w.player).attack + random(w, "combat", 8);
  const theirs = stats(a).attack + random(w, "combat", 8);
  const won = mine >= theirs;
  const cost = Math.max(1, Math.floor((stats(w.player).maxHp * B.relationships.sparHpBp) / scale));
  w.player.hp = Math.max(1, w.player.hp - cost);
  const gain = won ? B.relationships.sparWinInsight : B.relationships.sparLoseInsight;
  w.player.insight += gain;
  const text = won
    ? `你与${a.name}交手数十合，末了你抢住对方腕子。切磋点到为止，各自喘息。`
    : `你与${a.name}交手数十合，被对方寻着空隙按住。切磋点到为止，你记下了那一手。`;
  share(w, "spar", a, text, B.relationships.sparFavorGain, {
    trust: B.relationships.sparTrustGain,
    attraction: 1,
  });
  stamp(w, a.id, "sparDay", w.day);
  w.notice = text;
}

/** 同游：耗一日，同行一段路，看些不相干的景。 */
export function stroll(w: World, target: string) {
  const a = actorById(w, target)!;
  const scenes = STROLL_SCENES[locationKind(w.player.location)] ?? STROLL_SCENES.wild;
  const text = pick(w, scenes);
  w.player.insight += B.relationships.strollInsight;
  share(w, "stroll", a, text, B.relationships.strollFavorGain, {
    trust: B.relationships.strollTrustGain,
    attraction: 1,
  });
  stamp(w, a.id, "strollDay", w.day);
  w.notice = text;
}
