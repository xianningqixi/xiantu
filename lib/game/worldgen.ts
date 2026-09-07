import { selectedExtensions } from "./content/extensions";
import { PACK, CHARACTERS, PRESENTATION, contentText } from "./content/official";
import type { Actor, Profile, World } from "./types";
import { B, REALM_KEYS, SAFE, threshold, requireRule } from "./rules";
import { hashSeed, nextRandom } from "./rng";
import { validateWorld } from "./validate";
import { recordFact as record } from "./knowledge";

export function createActor(
  id: string,
  name: string,
  realm: number,
  age: number,
  aptitude: number,
  seed: number,
): Actor {
  return {
    id,
    name,
    sex: seed % 2 ? "female" : "male",
    ageDays: age * B.world.daysPerYear,
    appearanceSeed: seed,
    aptitude,
    personality: ["谨慎", "爽直", "重情", "寡言", "豁达"][seed % 5],
    sect: ["散修", "青岚宗", "归云门"][seed % 3],
    goal: realm === 0 ? "寻得功法，踏入仙途" : "积蓄修为，筹备下一次突破",
    realm,
    xp: 0,
    hp: B.combat.realmStats[REALM_KEYS[realm]].maxHp,
    stones: B.creation.startingSpiritStones,
    healing: B.creation.startingHealingPills,
    pills: 0,
    grass: 0,
    manual: realm > 0,
    alive: true,
    location: "market",
    activity: "在坊市停留",
    readyDay: B.world.npcMajorAttemptPreparationDays,
    lastActionDay: -1,
    attempt: null,
  };
}

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
    schemaVersion: 5,
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
    rulesVersion: "0.1.2",
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
  for (const { data } of selectedExtensions(w.contentLocks))
    for (const c of data.definitions.characters) {
      const a = createActor(c.id, c.name, c.realm, c.age, c.aptitude, hashSeed(seed, c.id));
      Object.assign(a, {
        sex: c.sex,
        personality: c.personality,
        sect: c.sect,
        goal: c.goal,
        location: c.location,
      });
      w.npcs.push(a);
    }
  record(w, "arrival", contentText(PRESENTATION.notices.arrivalEvent, w));
  validateWorld(w);
  return w;
}
