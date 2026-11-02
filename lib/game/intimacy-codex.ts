/** 亲密图鉴：跨人物回看此生记录，只读、不推进时间、不重抽随机。 */
import { intimacyKind } from "./intimacy-history";
import type { Actor, World } from "./types";

export type CodexKind = "bond" | "night" | "dual";
export type CodexEntry = {
  id: string;
  day: number;
  kind: CodexKind;
  text: string;
  partnerId: string;
  partnerName: string;
  alive: boolean;
};
export type CodexPerson = {
  id: string;
  name: string;
  alive: boolean;
  entries: CodexEntry[];
  kinds: Record<CodexKind, number>;
};

/** 只有当事人是玩家的记录才进图鉴——NPC 之间的私事玩家无从得知。 */
export function intimacyCodex(w: World): CodexPerson[] {
  const people = new Map<string, CodexPerson>();
  for (const event of w.events) {
    if (!event.actors.includes("PLAYER")) continue;
    const kind = intimacyKind(w, event);
    if (!kind) continue;
    const other = event.actors.find((id) => id !== "PLAYER");
    if (!other) continue;
    const actor: Actor | undefined = w.npcs.find((a) => a.id === other);
    if (!actor) continue;
    let person = people.get(other);
    if (!person) {
      person = {
        id: other,
        name: actor.name,
        alive: actor.alive,
        entries: [],
        kinds: { bond: 0, night: 0, dual: 0 },
      };
      people.set(other, person);
    }
    person.entries.push({
      id: event.id,
      day: event.day,
      kind,
      text: event.text,
      partnerId: other,
      partnerName: actor.name,
      alive: actor.alive,
    });
    person.kinds[kind] += 1;
  }
  return [...people.values()]
    .map((p) => ({ ...p, entries: p.entries.toReversed() }))
    .sort(
      (a, b) => (b.entries[0]?.day ?? 0) - (a.entries[0]?.day ?? 0) || a.name.localeCompare(b.name),
    );
}
export const codexKinds: Record<CodexKind, string> = {
  bond: "结为道侣",
  night: "共度良宵",
  dual: "道侣共修",
};
export function codexSummary(w: World) {
  const people = intimacyCodex(w);
  const counts = people.reduce(
    (acc, p) => ({
      bond: acc.bond + p.kinds.bond,
      night: acc.night + p.kinds.night,
      dual: acc.dual + p.kinds.dual,
    }),
    { bond: 0, night: 0, dual: 0 },
  );
  return { people: people.length, ...counts, total: counts.bond + counts.night + counts.dual };
}
/** 图鉴按人物筛kind；空 kind 表示不限。 */
export function filterCodex(people: CodexPerson[], kind: CodexKind | "") {
  if (!kind) return people;
  return people
    .map((p) => ({ ...p, entries: p.entries.filter((e) => e.kind === kind) }))
    .filter((p) => p.entries.length > 0);
}
