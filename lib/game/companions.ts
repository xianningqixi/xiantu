import B from "./content/balance.json";
import { requireRule, actorById } from "./rules";
import { relation } from "./relationships";
import type { World } from "./types";

export const PARTY_MAX = B.combat.partyMaxSize;

function isFriend(w: World, target: string) {
  const r = relation(w, target);
  return (
    !!r &&
    r.favor >= B.relationships.friendThresholds.favorabilityMin &&
    r.trust >= B.relationships.friendThresholds.trustMin
  );
}

/** Why a nearby friend can or cannot join the player's party right now. */
export function inviteReason(w: World, target: string) {
  const target_actor = actorById(w, target);
  if (!target_actor?.alive) return "对方不在人世。";
  if (target_actor.location !== w.player.location) return "对方不在此处。";
  if (target_actor.attempt) return "对方正在突破，暂不能同行。";
  if (target_actor.hp <= 0) return "对方伤势未愈。";
  if (w.party.includes(target)) return "对方已在队伍中。";
  if (w.agreement?.status === "accepted" && w.agreement.terms === "story")
    return "故事约定优先，先完成这次同行。";
  if (w.party.length >= PARTY_MAX) return `同行最多 ${PARTY_MAX} 人。`;
  if (!isFriend(w, target)) return "交情尚浅，至少要是朋友。";
  return "";
}

/** Inviting is instant; the first invitation opens a split-loot agreement. */
export function inviteCompanion(w: World, target: string) {
  const reason = inviteReason(w, target);
  requireRule(!reason, reason, "ACTION_UNAVAILABLE");
  const a = actorById(w, target)!;
  w.party.push(target);
  if (w.agreement?.status === "accepted" && w.agreement.terms === "split") {
    w.agreement.members = [...w.party];
    w.notice = `${a.name}点头跟上。队伍 ${w.party.length}/${PARTY_MAX} 人，战利品照旧平分。`;
    return;
  }
  w.agreement = {
    terms: "split",
    id: `agreement:${w.events.length + 1}`,
    status: "accepted",
    members: [...w.party],
    recipient: target,
    expeditionId: null,
    strict: false,
  };
  w.notice = `你邀${a.name}同行，${a.name}应下。战利品默认平分，秘境入口在山门古道。`;
}
