import type { Actor, Relation, World } from "./types";
import { B } from "./rules";
import { hashSeed, random } from "./rng";
import { recordFact, recordSocialContact } from "./knowledge";
import { relationshipLabel } from "./relationships";
import { SECTS, sectAt, sectHome } from "./sect-content";
import { enrollSect, sectAdmissionReason } from "./sects";
import { LOCATIONS, locationEnabled, travelRoute } from "./world-map";

const config = B.world.npcLife;
const ordinary = (a: Actor) => /^NPC_\d+$/.test(a.id);

export function npcUnavailable(w: World, a: Actor, occupied: Set<string>) {
  return (
    !a.alive ||
    !a.hp ||
    !!a.attempt ||
    !!a.npcJourney ||
    occupied.has(a.id) ||
    w.party.includes(a.id) ||
    (w.agreement?.status === "accepted" &&
      !!w.agreement.meeting &&
      w.agreement.members.includes(a.id))
  );
}

/** Both participants spend today's action; attraction and unrelated directed edges stay intact. */
export function npcSocialize(w: World, a: Actor, occupied: Set<string>) {
  if (npcUnavailable(w, a, occupied)) return false;
  const edges = new Map(w.relations.filter((r) => r.from === a.id).map((r) => [r.to, r]));
  const contactCounts = new Map<string, number>();
  for (const r of w.relations)
    if (r.known && r.to !== "PLAYER")
      contactCounts.set(r.from, (contactCounts.get(r.from) ?? 0) + 1);
  const candidates = w.npcs.filter((b) => {
    const r = edges.get(b.id);
    const reverse = w.relations.find((edge) => edge.from === b.id && edge.to === a.id);
    return (
      b.id !== a.id &&
      b.location === a.location &&
      b.lastActionDay < w.day &&
      !npcUnavailable(w, b, occupied) &&
      !r?.grievance &&
      !reverse?.grievance &&
      (r?.favor ?? 0) > -30 &&
      (reverse?.favor ?? 0) > -30 &&
      (reverse?.known || (contactCounts.get(b.id) ?? 0) < config.newContactLimit)
    );
  });
  const familiar = candidates.filter((b) => edges.get(b.id)?.known);
  const contacts = [...edges.values()].filter((r) => r.known && r.to !== "PLAYER").length;
  const pool =
    familiar.length &&
    (contacts >= config.newContactLimit ||
      random(w, "simulation", 100) < config.familiarContactChance)
      ? familiar
      : candidates.filter((b) => edges.get(b.id)?.known || contacts < config.newContactLimit);
  if (!pool.length) return false;
  const b = pool[random(w, "simulation", pool.length)];
  const meeting = !edges.get(b.id)?.known;
  const changed: Relation[] = [];
  for (const [from, to] of [
    [a, b],
    [b, a],
  ]) {
    let r = w.relations.find((edge) => edge.from === from.id && edge.to === to.id);
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
    recordSocialContact(w, r, from, to, config.socialFavorGain, config.socialTrustGain);
    changed.push(r);
  }
  const pair = [a.id, b.id].sort().join(":");
  const friends = changed.every((r) => ["朋友", "挚友"].includes(relationshipLabel(r)));
  const friendshipId = `friendship:${pair}`;
  if (friends && !w.knowledge[friendshipId]) {
    recordFact(
      w,
      "npc-friendship",
      `${a.name}与${b.name}经过数次来往，彼此信任，结为朋友。`,
      [a.id, b.id],
      false,
      friendshipId,
    );
    for (const r of changed) r.memories.push(friendshipId);
  } else if (meeting) {
    recordFact(
      w,
      "npc-meet",
      `${a.name}与${b.name}在${LOCATIONS[a.location].name}结识，谈起各自的见闻。`,
      [a.id, b.id],
    );
  }
  a.activity = `与${b.name}交流近况`;
  b.activity = `与${a.name}交流近况`;
  b.lastActionDay = w.day;
  return true;
}

/** Travel consumes the route's real days. Enrolment can only happen on a later day at the sect. */
export function continueNpcJourney(w: World, a: Actor) {
  const journey = a.npcJourney;
  if (!journey) return false;
  journey.remaining--;
  if (journey.remaining === 0) {
    a.location = journey.to;
    delete a.npcJourney;
    a.activity = `抵达${LOCATIONS[a.location].name}，稍作休整`;
    recordFact(
      w,
      "npc-arrive",
      `${a.name}经过 ${journey.total} 日行路，抵达${LOCATIONS[a.location].name}。`,
      [a.id],
    );
  } else a.activity = `赶路前往${LOCATIONS[journey.to].name}，还需 ${journey.remaining} 日`;
  return true;
}

function startJourney(w: World, a: Actor, to: Actor["location"]) {
  const route = travelRoute(a.location, to, w);
  if (!route) return false;
  const total = Math.max(1, route.days);
  recordFact(
    w,
    "npc-depart",
    `${a.name}辞别${LOCATIONS[a.location].name}，前往${LOCATIONS[to].name}访求师门，路程 ${total} 日。`,
    [a.id],
  );
  a.npcJourney = { to, startedDay: w.day, total, remaining: total };
  continueNpcJourney(w, a);
  return true;
}

export function npcSeekSect(w: World, a: Actor, occupied: Set<string>) {
  if (!ordinary(a) || npcUnavailable(w, a, occupied)) return false;
  const home = sectHome(a);
  if (home) return a.location !== home && startJourney(w, a, home);
  if (a.sect !== "散修" || a.realm < config.sectMinimumRealm) return false;
  const affinity = hashSeed(a.appearanceSeed, "sect-path");
  if (affinity % 100 >= config.sectInterestPercent) return false;
  const eligible = SECTS.filter(
    (sect) => locationEnabled(w, sect.home) && !sectAdmissionReason(w, a, sect.id),
  );
  const local = sectAt(a.location);
  if (local && eligible.includes(local)) {
    enrollSect(w, a, local.id);
    a.activity = `在${local.name}登记门籍，学习门规`;
    return true;
  }
  if (!eligible.length || (w.day + affinity) % config.sectConsiderIntervalDays !== 0) return false;
  const preferred = /重情/.test(a.personality)
    ? "hehuan"
    : /谨慎|寡言/.test(a.personality) && a.sex === "female"
      ? "yunv"
      : "quanzhen";
  const target = eligible.find((s) => s.id === preferred) ?? eligible[affinity % eligible.length];
  return startJourney(w, a, target.home);
}
