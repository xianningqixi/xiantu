import { deduplicateNpcNames } from "./npc-names";
import { MAIN_STORY_LOCK } from "./main-story";
import { defaultPhysique, profilePhysique } from "./physique";
import { selectedExtensions } from "./content/extensions";
import { PACK, CHARACTERS, PRESENTATION, contentText } from "./content/official";
import type { Actor, Profile, World } from "./types";
import { B, REALM_KEYS, SAFE, threshold, requireRule } from "./rules";
import { hashSeed, nextRandom } from "./rng";
import { validateWorld } from "./validate";
import { recordFact as record } from "./knowledge";
import { actorNpcTemplate, expandedNpcTemplate, expandedAppearanceSeed } from "./npc-roster";

export { createActor } from "./actor-factory";
import { createActor } from "./actor-factory";

export function createWorld(
  seed: number,
  profile: Profile,
  saveId: string,
  npcCount = B.world.initialNpcCount,
  options: { backgroundConflicts?: boolean; contentLocks?: string[] } = {},
): World {
  requireRule(
    Number.isInteger(seed) && seed >= 0 && seed <= 4294967295,
    "机缘种子须为 0 至 4294967295 的整数。",
  );
  requireRule(
    profile.name.trim().length >= 1 && profile.name.trim().length <= 16,
    "姓名需为 1 至 16 个字。",
  );
  requireRule(
    Number.isInteger(profile.aptitude) && profile.aptitude >= 1 && profile.aptitude <= 100,
    "资质不合法。",
  );
  requireRule(
    ["female", "male"].includes(profile.sex) &&
      ["simple", "complex"].includes(profile.mode) &&
      ["focus", "ward", "bond"].includes(profile.artifact),
    "角色选项不合法。",
  );
  requireRule(
    Object.values(profile.appearance).length === 3 &&
      Object.values(profile.appearance).every((n) => Number.isInteger(n) && n >= 0 && n < 4),
    "外貌配置不合法。",
  );
  let generator = hashSeed(seed, "worldgen");
  const draw = (max: number) => {
    generator = nextRandom(generator);
    return generator % max;
  };
  const surnames = [
    "沈",
    "顾",
    "陆",
    "苏",
    "谢",
    "许",
    "江",
    "温",
    "程",
    "叶",
    "宋",
    "裴",
    "柳",
    "贺",
    "闻",
    "杜",
  ];
  const names = [
    "清禾",
    "知远",
    "怀霜",
    "砚舟",
    "听澜",
    "照雪",
    "云生",
    "青岚",
    "望舒",
    "明川",
    "疏桐",
    "栖月",
    "言溪",
    "长宁",
    "孤鸿",
    "晚棠",
  ];
  const npcs: Actor[] = [];
  for (const role of ["primary", "companion"] as const) {
    const c = CHARACTERS[role];
    const npc = createActor(c.id, c.name, c.realm, c.age, c.aptitude, draw(4294967295));
    Object.assign(npc, {
      sex: c.sex,
      personality: c.personality,
      sect: c.sect,
      goal: c.goal,
      xp: c.xp,
      stones: c.stones,
    });
    npcs.push(npc);
  }
  for (let i = 2; i < npcCount; i++) {
    const roll = draw(100);
    let cumulative = 0;
    const realm = REALM_KEYS.findIndex((key) => {
      cumulative += B.world.initialRealmWeights[key];
      return roll < cumulative;
    });
    const npc = createActor(
      `NPC_${String(i + 1).padStart(4, "0")}`,
      surnames[draw(surnames.length)] + names[draw(names.length)],
      realm,
      B.world.minimumGeneratedAgeYears +
        draw(B.world.maximumGeneratedAgeYears - B.world.minimumGeneratedAgeYears + 1),
      1 + draw(100),
      draw(4294967295),
    );
    npc.location = SAFE[draw(3)];
    npc.xp = draw(threshold(npc));
    const template = expandedNpcTemplate(npc.id);
    if (template) {
      npc.npcTemplateId = template.id;
      npc.name = template.name;
      npc.sex = template.sex;
      npc.goal = template.hook;
      npc.appearanceSeed = expandedAppearanceSeed(template.id);
      npc.ageDays = Math.max(npc.ageDays, template.physique.apparentAge * B.world.daysPerYear);
    }
    npcs.push(npc);
  }
  const player = createActor(
    "PLAYER",
    profile.name.trim(),
    0,
    B.world.startAgeYears,
    profile.aptitude,
    hashSeed(seed, "appearance"),
  );
  player.sex = profile.sex;
  player.goal = "从凡人开始，寻一条自己的道";
  player.sect = "无";
  const w: World = {
    campaignLock: MAIN_STORY_LOCK,
    schemaVersion: 6,
    negotiations: [],
    contentLocks: options.contentLocks ?? [],
    contentState: {},
    commandReceipts: {},
    knowledge: {},
    receiptHistory: { count: 0, hash: "0".repeat(64) },
    simulationOptions: {
      backgroundConflicts:
        options.backgroundConflicts ?? B.world.ordinaryNpcOffscreenConflictEnabled,
    },
    format: "xiantu-web-1",
    rulesVersion: "0.1.4",
    packLock: PACK.lock,
    saveId,
    revision: 0,
    seed,
    day: 0,
    profile: { ...profile, name: profile.name.trim() },
    player,
    npcs,
    rng: { simulation: hashSeed(seed, "simulation"), combat: hashSeed(seed, "combat") },
    relations: [],
    events: [],
    story: { flags: {}, outcome: "none", settledDay: null, compensated: false },
    agreement: null,
    party: ["PLAYER"],
    battle: null,
    loot: null,
    longAction: null,
    lastExpeditionDay: -100,
    ended: false,
    notice: PRESENTATION.notices.arrival,
    appliedCommands: [],
  };
  for (const npc of npcs) {
    const other = npcs[draw(npcs.length)];
    if (other.id !== npc.id)
      w.relations.push({
        from: npc.id,
        to: other.id,
        favor: draw(31),
        trust: draw(21),
        attraction: 0,
        known: true,
        memories: [],
      });
  }
  w.npcs.push(...createContentActors(seed, w.contentLocks));
  w.profile.physique = profilePhysique(profile);
  w.player.physique = { ...w.profile.physique };
  if (profile.portraitId) w.player.portraitId = profile.portraitId;
  for (const npc of w.npcs)
    npc.physique = {
      ...defaultPhysique(npc.sex, npc.appearanceSeed),
      ...actorNpcTemplate(npc)?.physique,
    };
  deduplicateNpcNames(w);
  record(w, "arrival", contentText(PRESENTATION.notices.arrivalEvent, w));
  validateWorld(w);
  return w;
}

/** Also used when introducing previously absent campaign residents into a saved world.
 * Identity seeds are independent of the live simulation and combat random streams.
 */
export function createContentActors(seed: number, locks: string[], day = 0): Actor[] {
  return selectedExtensions(locks).flatMap(({ data }) =>
    data.definitions.characters.map((c) => {
      const a = createActor(c.id, c.name, c.realm, c.age, c.aptitude, hashSeed(seed, c.id));
      Object.assign(a, {
        sex: c.sex,
        personality: c.personality,
        sect: c.sect,
        goal: c.goal,
        location: c.location,
        activity: "在当地停留",
        ageDays: a.ageDays + day,
        readyDay: a.readyDay + day,
        lastActionDay: day - 1,
      });
      a.physique = {
        ...defaultPhysique(a.sex, a.appearanceSeed),
        ...actorNpcTemplate(a)?.physique,
      };
      return a;
    }),
  );
}
