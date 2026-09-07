import { PACK, LOCATIONS, PRESENTATION, contentText } from "./content/official";
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
  const remaining = Math.max(0, 3 - (w.day - w.lastExpeditionDay));
  const unavailable = w.party
    .map((id) => actorById(w, id))
    .find((a) => !a?.alive || a.attempt || !a.hp || a.location !== w.player.location);
  const reason =
    w.player.location !== "gate"
      ? "请先前往山门古道。"
      : w.agreement?.status !== "accepted" || w.party.length !== 3
        ? "先约定同行，并集齐三人。"
        : w.loot
          ? "请先结清上次战利品。"
          : w.player.stones < 2
            ? "还需备好 2 枚灵石路费。"
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
