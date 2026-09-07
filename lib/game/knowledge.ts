import type { Actor, Knowledge, Relation, World, WorldEvent } from './types';

const observable = new Set(['advance', 'breakthrough', 'breakthrough-failed', 'death', 'battle-win', 'battle-defeat', 'battle-retreat', 'conflict']);
const cachedKnowledge = new WeakMap<World, Set<string>>();
const actor = (world: World, id: string) => id === 'PLAYER' ? world.player : world.npcs.find(npc => npc.id === id);

export function rememberFact(world: World, event: WorldEvent, knower: string, source: Knowledge['source'], sourceActor: string | null = null) {
  if (!actor(world, knower)) throw new Error('记忆知情人不存在。');
  let keys=cachedKnowledge.get(world);
  if(!keys){keys=new Set(world.knowledge.map(m=>JSON.stringify([m.eventId,m.knower])));cachedKnowledge.set(world,keys);}
  const key=JSON.stringify([event.id,knower]);if(keys.has(key))return;keys.add(key);
  world.knowledge.push({ eventId: event.id, knower, source, sourceActor, learnedDay: world.day });
}

export function recordFact(world: World, kind: string, text: string, actors: string[] = ['PLAYER'], isPublic = false, stableId?: string) {
  const participants = [...new Set(actors)];
  const location = actor(world, participants[0])?.location ?? world.player.location;
  const event: WorldEvent = { id: stableId ?? `event:${world.events.length + 1}`, day: world.day, kind, text, actors: participants, public: isPublic, location };
  world.events.push(event);
  for (const id of participants) rememberFact(world, event, id, 'participant');
  if (isPublic || observable.has(kind)) {
    for (const person of [world.player, ...world.npcs]) {
      if (person.alive && (isPublic || person.location === location)) rememberFact(world, event, person.id, isPublic ? 'public' : 'witness');
    }
  }
  return event.id;
}

export function knownEvents(world: World, knower = 'PLAYER') {
  const ids = new Set(world.knowledge.filter(memory => memory.knower === knower).map(memory => memory.eventId));
  return world.events.filter(event => ids.has(event.id));
}

export function tellOwnRecentFacts(world: World, speakerId: string, listenerId = 'PLAYER') {
  const speaker = actor(world, speakerId), listener = actor(world, listenerId);
  if (!speaker?.alive || !listener?.alive || speaker.location !== listener.location) throw new Error('需要与知情人在场交谈。');
  const available = knownEvents(world, speakerId).filter(event => event.actors.includes(speakerId) && !event.actors.includes(listenerId)).slice(-3);
  for (const event of available) rememberFact(world, event, listenerId, 'told', speakerId);
  return available;
}

/** Repeated ordinary contact is a bounded factual summary per directed pair.
 * Important story, promise, death and breakthrough events are never summarized away.
 */
export function recordSocialContact(world: World, relation: Relation, from: Actor, to: Actor) {
  if (relation.favor >= 100) return;
  relation.favor++;
  let event = relation.socialEventId ? world.events.find(entry => entry.id === relation.socialEventId) : undefined;
  if (!event) {
    const id = recordFact(world, 'social', `${from.name}与${to.name}在日常交往中渐渐熟悉。`, [from.id, to.id], false, `social:${from.id}:${to.id}`);
    relation.socialEventId = id; relation.memories.push(id);
    event = world.events[world.events.length - 1]; event.count = 0;
  }
  event.count = (event.count ?? 0) + 1; event.lastDay = world.day;
}

/** Legacy evidence keeps its provenance label. Missing historical witnesses are never invented. */
export function migrateKnowledge(world: World): Knowledge[] {
  const entries: Knowledge[] = [];
  const seen = new Set<string>();
  const add = (event: WorldEvent, knower: string, source: Knowledge['source']) => {
    const key = `${event.id}/${knower}`;
    if (!seen.has(key)) { seen.add(key); entries.push({ eventId: event.id, knower, source, sourceActor: null, learnedDay: event.day }); }
  };
  for (const event of world.events) {
    for (const id of event.actors) add(event, id, 'participant');
    if (event.public) for (const person of [world.player, ...world.npcs]) add(event, person.id, 'public');
  }
  for (const relation of world.relations) for (const id of relation.memories) {
    const event = world.events.find(entry => entry.id === id);
    if (event) add(event, relation.from, 'legacy');
  }
  return entries;
}
