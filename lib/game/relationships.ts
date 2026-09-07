import { PACK, LOCATIONS } from "./content/official";
import type { Relation, World } from "./types";
import { tellOwnRecentFacts } from "./knowledge";
import { B, clamp, requireRule, actorById } from "./rules";
import { recordFact as record } from "./knowledge";

export function relation(w: World, target: string): Relation | undefined {
  return w.relations.find((r) => r.from === target && r.to === "PLAYER");
}

export function ensureRelation(w: World, target: string) {
  let r = relation(w, target);
  if (!r) {
    r = {
      from: target,
      to: "PLAYER",
      favor: 0,
      trust: 0,
      attraction: 0,
      known: false,
      memories: [],
    };
    w.relations.push(r);
  }
  return r;
}

export function memory(
  w: World,
  target: string,
  kind: keyof typeof B.relationships.eventDeltas,
  text: string,
) {
  const r = ensureRelation(w, target);
  const d = B.relationships.eventDeltas[kind];
  r.favor = clamp(r.favor + d.favorability, -100, 100);
  r.trust = clamp(
    r.trust +
      d.trust +
      (kind === "promiseFulfilled" && w.profile.artifact === "bond"
        ? B.artifacts.ARTIFACT_BOND.promiseFulfilledAdditionalTrust
        : 0),
    -100,
    100,
  );
  r.memories.push(record(w, kind, text, ["PLAYER", target]));
}

export function relationshipLabel(r?: Relation) {
  if (r?.grievance) return "仇怨未解";
  if (
    r &&
    r.favor >= B.relationships.closeFriendThresholds.favorabilityMin &&
    r.trust >= B.relationships.closeFriendThresholds.trustMin &&
    new Set(r.memories).size >=
      B.relationships.closeFriendThresholds.distinctSharedExperienceCountMin
  )
    return "挚友";
  if (!r?.known) return "尚未相识";
  if (
    r.favor <= B.relationships.hostileThresholds.favorabilityAtOrBelow ||
    r.trust <= B.relationships.hostileThresholds.trustAtOrBelow
  )
    return "心存芥蒂";
  if (r.trust < 0) return "有所戒备";
  if (
    r.favor >= B.relationships.friendThresholds.favorabilityMin &&
    r.trust >= B.relationships.friendThresholds.trustMin
  )
    return "朋友";
  return "相识";
}

export function meet(w: World, target: string) {
  const a = actorById(w, target);
  requireRule(
    a?.alive && a.location === w.player.location && target !== "PLAYER",
    "对方目前不在这里。",
  );
  const r = ensureRelation(w, target);
  if (r.known) {
    const recent = tellOwnRecentFacts(w, target);
    w.notice = recent.length
      ? `${a!.name}谈起近况：${recent.map((e) => e.text).join(" ")}`
      : `${a!.name}与你聊起近况。熟悉的寒暄不会凭空增加信任。`;
    return;
  }
  r.known = true;
  if (!w.relations.some((e) => e.from === "PLAYER" && e.to === target))
    w.relations.push({
      from: "PLAYER",
      to: target,
      favor: 0,
      trust: 0,
      attraction: 0,
      known: true,
      memories: [],
    });
  memory(w, target, "firstMeeting", `你与${a!.name}在${LOCATIONS[w.player.location].name}相识。`);
  w.notice = `你记住了${a!.name}的姓名，也记住了这一面之缘。`;
  if (target === PACK.roles.primary) w.story.flags.met = true;
}
