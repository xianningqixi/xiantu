import { CHARACTERS } from "./content/official";
import { EXTENSIONS } from "./content/extensions";
import { EXPANDED_NPCS } from "./npc-roster";
import { hashSeed } from "./rng";
import type { Actor, World } from "./types";

const authoredNames = new Map([
  ...Object.values(CHARACTERS).map((actor) => [actor.id, actor.name] as const),
  ...EXPANDED_NPCS.map((actor) => [actor.id, actor.name] as const),
  ...EXTENSIONS.flatMap(({ data }) =>
    data.definitions.characters.map((actor) => [actor.id, actor.name] as const),
  ),
]);
const surnames = "沈顾陆苏谢许江温程叶宋裴柳贺闻杜陈韩秦白林周方唐蓝洛虞燕孟卫夏池";
const compoundSurnames = ["南宫", "司空", "公孙", "百里", "上官", "东方", "独孤", "闻人"];
const givenNames = {
  female: ["绮映婉凝芷锦舒瑶语绾依沐兰若筠静含晴素月", "宁嫣棠菱雪瑾音薇岚瑶梨霏柔蘅羽蕊烟霜露溪"],
  male: ["景承云怀修知砚明庭远清言望彦昭行逸绍予书", "衡川舟尘渊珩安岳峥礼叙庭墨松澄玄钧旻翊晏"],
};
export interface NpcNameChange {
  actorId: string;
  before: string;
  after: string;
}

function replacementName(actor: Actor, occupied: Set<string>) {
  const seed = hashSeed(actor.appearanceSeed, `npc-name:${actor.id}:${actor.name}`);
  const family =
    compoundSurnames.find((name) => actor.name.startsWith(name)) ??
    (surnames.includes(actor.name[0]) ? actor.name[0] : surnames[seed % surnames.length]);
  const [first, second] = givenNames[actor.sex];
  // At most 200 NPCs exist. The 400-name pool is searched independently of world RNG.
  const size = first.length * second.length;
  for (let offset = 0; offset < size; offset++) {
    const index = (seed + offset) % size;
    const candidate =
      family + first[Math.floor(index / second.length)] + second[index % second.length];
    if (!occupied.has(candidate)) return candidate;
  }
  throw new Error("没有可用的人物姓名。");
}

/** Called only during creation or a validated Worker save migration. Never relabels history. */
export function deduplicateNpcNames(world: Pick<World, "npcs" | "battle">): NpcNameChange[] {
  const occupied = new Set(world.npcs.map((actor) => actor.name));
  const used = new Set<string>();
  const authored = (actor: Actor) => authoredNames.get(actor.id) === actor.name;
  const actors = [...world.npcs].sort((a, b) => {
    const priority = Number(authored(b)) - Number(authored(a));
    return priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  const changes: NpcNameChange[] = [];
  for (const actor of actors) {
    if (!used.has(actor.name)) {
      used.add(actor.name);
      continue;
    }
    const before = actor.name;
    actor.name = replacementName(actor, occupied);
    occupied.add(actor.name);
    used.add(actor.name);
    changes.push({ actorId: actor.id, before, after: actor.name });
    for (const ally of world.battle?.allies ?? []) if (ally.id === actor.id) ally.name = actor.name;
  }
  return changes;
}
