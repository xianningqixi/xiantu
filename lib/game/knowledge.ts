import { intimacyKind, isIntimacyStoryEvent } from "./intimacy-history";
import { regionOf } from "./world-map";
import { GameError } from "./errors";
import type { Actor, Knowledge, KnowledgeEntry, Relation, World, WorldEvent } from "./types";

const observable = new Set([
  "advance",
  "breakthrough",
  "breakthrough-failed",
  "death",
  "battle-win",
  "battle-defeat",
  "battle-retreat",
  "conflict",
  "npc-meet",
  "npc-friendship",
  "npc-depart",
  "npc-arrive",
  "sect-join",
  "sect-art",
]);
export const KNOWLEDGE_SOURCES = ["participant", "witness", "told", "public", "legacy"] as const;
const actorIndexes = new WeakMap<World, Map<string, number>>();
function indexes(world: World) {
  let map = actorIndexes.get(world);
  if (!map || map.size !== world.npcs.length + 1) {
    map = new Map([world.player, ...world.npcs].map((a, i) => [a.id, i]));
    actorIndexes.set(world, map);
  }
  return map;
}
export function compactKnowledge(world: World, entries: Knowledge[]): World["knowledge"] {
  const index = indexes(world);
  const result: World["knowledge"] = {};
  for (const m of entries) {
    const row: KnowledgeEntry = [
      index.get(m.knower) ?? -1,
      KNOWLEDGE_SOURCES.indexOf(m.source),
      m.sourceActor === null ? -1 : (index.get(m.sourceActor) ?? -2),
      m.learnedDay,
    ];
    if (!Object.hasOwn(result, m.eventId))
      Object.defineProperty(result, m.eventId, {
        value: [],
        enumerable: true,
        writable: true,
        configurable: true,
      });
    result[m.eventId].push(row);
  }
  return result;
}
/** Decode on demand at presentation/validation boundaries, never store expanded duplicates. */
export function* knowledgeEntries(world: World): Generator<Knowledge> {
  const people = [world.player, ...world.npcs];
  for (const [eventId, rows] of Object.entries(world.knowledge)) {
    if (!Array.isArray(rows)) throw new GameError("INVALID_SAVE", "知情记录分组不合法。");
    for (const row of rows) {
      if (
        !Array.isArray(row) ||
        row.length !== 4 ||
        !row.every(Number.isSafeInteger) ||
        row[2] < -1
      )
        throw new GameError("INVALID_SAVE", "知情记录编码不合法。");
      const [knower, source, from, learnedDay] = row;
      if (!people[knower] || !KNOWLEDGE_SOURCES[source] || (from !== -1 && !people[from]))
        throw new GameError("INVALID_SAVE", "知情记录引用不合法。");
      yield {
        eventId,
        knower: people[knower].id,
        source: KNOWLEDGE_SOURCES[source],
        sourceActor: from === -1 ? null : people[from].id,
        learnedDay,
      };
    }
  }
}
const actor = (world: World, id: string) =>
  id === "PLAYER" ? world.player : world.npcs.find((npc) => npc.id === id);

export function rememberFact(
  world: World,
  event: WorldEvent,
  knower: string,
  source: Knowledge["source"],
  sourceActor: string | null = null,
) {
  const index = indexes(world);
  const who = index.get(knower);
  if (who === undefined) throw new GameError("INVALID_SAVE", "记忆知情人不存在。");
  if (!Object.hasOwn(world.knowledge, event.id))
    Object.defineProperty(world.knowledge, event.id, {
      value: [],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  const rows = world.knowledge[event.id];
  if (rows.some((row) => row[0] === who)) return;
  rows.push([
    who,
    KNOWLEDGE_SOURCES.indexOf(source),
    sourceActor === null ? -1 : (index.get(sourceActor) ?? -2),
    world.day,
  ]);
}

export function recordFact(
  world: World,
  kind: string,
  text: string,
  actors: string[] = ["PLAYER"],
  isPublic = false,
  stableId?: string,
) {
  const participants = [...new Set(actors)];
  const location = actor(world, participants[0])?.location ?? world.player.location;
  const event: WorldEvent = {
    id: stableId ?? `event:${world.events.length + 1}`,
    day: world.day,
    kind,
    text,
    actors: participants,
    public: isPublic,
    location,
  };
  world.events.push(event);
  for (const id of participants) rememberFact(world, event, id, "participant");
  if (isPublic || observable.has(kind)) {
    for (const person of [world.player, ...world.npcs]) {
      if (
        person.alive &&
        !person.npcJourney &&
        (isPublic ? regionOf(person.location) === regionOf(location) : person.location === location)
      )
        rememberFact(world, event, person.id, isPublic ? "public" : "witness");
    }
  }
  return event.id;
}

export function knownEvents(world: World, knower = "PLAYER") {
  const who = indexes(world).get(knower);
  if (who === undefined) return [];
  return world.events.filter((event) => world.knowledge[event.id]?.some((row) => row[0] === who));
}

export function tellOwnRecentFacts(world: World, speakerId: string, listenerId = "PLAYER") {
  const speaker = actor(world, speakerId),
    listener = actor(world, listenerId);
  if (
    !speaker?.alive ||
    !listener?.alive ||
    speaker.npcJourney ||
    listener.npcJourney ||
    speaker.location !== listener.location
  )
    throw new Error("需要与知情人在场交谈。");
  const available = knownEvents(world, speakerId)
    .filter(
      (event) =>
        !intimacyKind(world, event) &&
        !isIntimacyStoryEvent(event) &&
        event.actors.includes(speakerId) &&
        !event.actors.includes(listenerId),
    )
    .slice(-3);
  for (const event of available) rememberFact(world, event, listenerId, "told", speakerId);
  return available;
}

/** Repeated ordinary contact is a bounded factual summary per directed pair.
 * Important story, promise, death and breakthrough events are never summarized away.
 */
export function recordSocialContact(
  world: World,
  relation: Relation,
  from: Actor,
  to: Actor,
  favor = 1,
  trust = 0,
) {
  relation.favor = Math.min(100, relation.favor + favor);
  relation.trust = Math.min(100, relation.trust + trust);
  let event = relation.socialEventId
    ? world.events.find((entry) => entry.id === relation.socialEventId)
    : undefined;
  if (!event) {
    const id = recordFact(
      world,
      "social",
      `${from.name}与${to.name}在日常交往中渐渐熟悉。`,
      [from.id, to.id],
      false,
      `social:${from.id}:${to.id}`,
    );
    relation.socialEventId = id;
    relation.memories.push(id);
    event = world.events[world.events.length - 1];
    event.count = 0;
  }
  event.count = (event.count ?? 0) + 1;
  event.lastDay = world.day;
}

/** Legacy evidence keeps its provenance label. Missing historical witnesses are never invented. */
export function migrateKnowledge(world: World): Knowledge[] {
  const entries: Knowledge[] = [];
  const seen = new Set<string>();
  const add = (event: WorldEvent, knower: string, source: Knowledge["source"]) => {
    const key = `${event.id}/${knower}`;
    if (!seen.has(key)) {
      seen.add(key);
      entries.push({ eventId: event.id, knower, source, sourceActor: null, learnedDay: event.day });
    }
  };
  for (const event of world.events) {
    for (const id of event.actors) add(event, id, "participant");
    if (event.public)
      for (const person of [world.player, ...world.npcs]) add(event, person.id, "public");
  }
  for (const relation of world.relations)
    for (const id of relation.memories) {
      const event = world.events.find((entry) => entry.id === id);
      if (event) add(event, relation.from, "legacy");
    }
  return entries;
}
