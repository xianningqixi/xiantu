import { B } from "./rules";
import { DEPARTURE_FEE } from "./economy";
import { PACK, PRESENTATION, contentText } from "./content/official";
import { LOCATIONS } from "./world-map";
import type { World } from "./types";
import { requireRule, actorById } from "./rules";
import { relation } from "./relationships";
import { recordFact as record } from "./knowledge";

export function canInvite(w: World) {
  const r = relation(w, PACK.roles.primary);
  return (
    !!r?.known &&
    ((r.trust >= -10 && r.favor >= -10 && w.story.outcome !== "breached") ||
      (w.story.compensated && r.trust >= -30))
  );
}

export function renewalReason(w: World): string {
  if (!w.agreement) return "请先完成初次同行邀约。";
  if (w.ended || !w.player.alive) return "这一段人生已经结束。";
  if (w.battle || w.longAction) return "请先结束当前行动。";
  if (w.loot || ["accepted", "active", "impossible"].includes(w.agreement.status))
    return "请先处理现有约定和战利品。";
  if (w.player.location !== "market") return "请回到青石坊市商议再次同行。";
  if (!canInvite(w)) return "对方不愿接受目前的条件。";
  const unavailable = [PACK.roles.primary, PACK.roles.companion]
    .map((id) => actorById(w, id))
    .find((a) => !a?.alive || a.location !== w.player.location || a.attempt);
  if (unavailable)
    return !unavailable.alive
      ? `${unavailable.name}已经离世。`
      : unavailable.attempt
        ? `${unavailable.name}正在突破，请等候结束。`
        : `${unavailable.name}在${LOCATIONS[unavailable.location].name}，请等同伴到齐。`;
  return "";
}

export function partyReadiness(w: World) {
  const members = [PACK.roles.primary, PACK.roles.companion].map((id) => actorById(w, id)!);
  const missing = members.filter((a) => !a.alive || a.location !== w.player.location || a.attempt);
  const reason =
    w.agreement?.status !== "accepted"
      ? "先与同伴商定同行。"
      : w.player.realm < 1
        ? "成为炼气修士后再组队。"
        : missing
            .map((a) =>
              !a.alive
                ? `${a.name}已经离世`
                : a.attempt
                  ? `${a.name}正在突破，还需 ${a.attempt.remaining} 日`
                  : `${a.name}在${LOCATIONS[a.location].name}`,
            )
            .join("；");
  return { members, ready: !reason, reason };
}

export function departureStatus(w: World) {
  const remaining = Math.max(0, B.economy.expeditionCooldownDays - (w.day - w.lastExpeditionDay));
  const unavailable = w.party
    .map((id) => actorById(w, id))
    .find((a) => !a?.alive || a.attempt || !a.hp || a.location !== w.player.location);
  const reason =
    w.player.location !== "gate"
      ? "请先前往山门古道。"
      : w.agreement?.status !== "accepted"
        ? "本次尚无有效约定，请回青石坊市重新商议同行。"
        : w.party.length !== 3
          ? `已有约定，当前队伍 ${w.party.length}/3 人，请先邀齐两位同伴。`
          : w.loot
            ? "请先结清上次战利品。"
            : w.player.stones < DEPARTURE_FEE
              ? `路费需要 ${DEPARTURE_FEE} 灵石，当前 ${w.player.stones}，还缺 ${DEPARTURE_FEE - w.player.stones}。`
              : unavailable
                ? `${unavailable.name}尚未准备好${unavailable.attempt ? `，突破还需 ${unavailable.attempt.remaining} 日` : ""}。`
                : remaining
                  ? `秘境尚未平静，还需等候 ${remaining} 日。`
                  : "";
  return { ready: !reason, reason, remaining };
}

export function updateAgreementAvailability(w: World) {
  const agreement = w.agreement;
  if (!agreement || !["accepted", "active"].includes(agreement.status)) return;
  const dead = agreement.members.find((id) => !actorById(w, id)?.alive);
  if (!dead) return;
  // An active promise to a living recipient remains payable even if another companion died.
  if (agreement.status === "active" && actorById(w, agreement.recipient)?.alive) return;
  agreement.status = "impossible";
  agreement.reason = `${actorById(w, dead)?.name || "同伴"}已经离世，原来的条款客观上无法继续履行。`;
  record(w, "agreement-ended", agreement.reason, agreement.members);
}

export function acceptAgreement(w: World) {
  requireRule(canInvite(w), "对方不愿接受目前的条件。");
  requireRule(
    !w.loot && !["accepted", "active"].includes(w.agreement?.status ?? ""),
    "先处理现有约定和战利品。",
  );
  requireRule(
    [PACK.roles.primary, PACK.roles.companion].every((id) => {
      const a = actorById(w, id);
      return a?.alive && a.location === w.player.location && !a.attempt;
    }),
    "同伴需要存活、在场且空闲。",
  );
  w.agreement = {
    id: `agreement:${w.events.length + 1}`,
    status: "accepted",
    members: ["PLAYER", PACK.roles.primary, PACK.roles.companion],
    recipient: PACK.roles.primary,
    expeditionId: null,
    strict: w.story.compensated,
  };
  record(w, "agreement", contentText(PRESENTATION.notices.agreement, w), w.agreement.members);
}

/** UI preflight for the exact standard terms accepted by adoptNegotiation. */
export function negotiationAvailability(w: World): string {
  if (w.ended || !w.player.alive) return "这一世已结束。";
  if (w.battle || w.longAction || w.loot) return "请先结束当前行动与结算。";
  if (!relation(w, PACK.roles.primary)?.known) return "请先上前见礼，再商议同行。";
  if (w.agreement && ["accepted", "active", "impossible"].includes(w.agreement.status))
    return "已有同行约定，请先完成或处理这份约定。";
  if (!canInvite(w)) return "目前的信任不足以接受同行条件。";
  if (w.party.length !== 1) return "请先结束当前队伍，再商议新约定。";
  for (const id of [PACK.roles.primary, PACK.roles.companion]) {
    const actor = actorById(w, id);
    if (!actor?.alive) return `${actor?.name ?? "同伴"}已离世，无法同行。`;
    if (actor.location !== w.player.location || actor.attempt || actor.npcJourney)
      return `${actor.name}须在同一地点且空闲。`;
  }
  if (w.player.stones < DEPARTURE_FEE)
    return `交涉需备足 ${DEPARTURE_FEE} 灵石路费，当前还缺 ${DEPARTURE_FEE - w.player.stones}。`;
  return "";
}
