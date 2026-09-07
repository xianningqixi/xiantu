import { validTerms, proposalSchema } from "./negotiation";
import { selectedExtensions } from "./content/extensions";
import { extensionScenes } from "./content-story";
import balance from "./content/balance.json";
import {
  PACK,
  REALMS,
  STORY,
  LOCATIONS,
  CHARACTERS,
  PRESENTATION,
  contentText,
} from "./content/official";
import type {
  Actor,
  Command,
  Fighter,
  LocationId,
  Profile,
  Relation,
  StoryNode,
  World,
} from "./types";
import { commandFingerprint, GameError, parseCommand } from "./protocol";
import { knownEvents, recordFact, recordSocialContact, tellOwnRecentFacts } from "./knowledge";

export const B = balance;
const REALM_KEYS = ["MORTAL", "QI_1", "QI_2", "QI_3", "FOUNDATION_1"] as const;
const SAFE: LocationId[] = ["market", "inn", "gate"];
export const threshold = (a: Actor) => [20, 40, 60, 100, 100][a.realm];
export const stats = (a: Actor) => B.combat.realmStats[REALM_KEYS[a.realm]];
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const requireRule = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
export function hashSeed(seed: number, stream: string) {
  let h = 2166136261;
  for (const c of `${seed}:${stream}:1`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h || 1;
}
export function nextRandom(state: number) {
  let x = state >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}
function random(w: World, stream: "simulation" | "combat", max: number) {
  const limit = Math.floor(4294967296 / max) * max;
  let x: number;
  do {
    x = nextRandom(w.rng[stream]);
    w.rng[stream] = x;
  } while (x >= limit);
  return x % max;
}
export function rollAptitude(seed: number, roll: number) {
  return 1 + (nextRandom(hashSeed(seed, `creation:${roll}`)) % 100);
}
const actorById = (w: World, id: string) =>
  id === "PLAYER" ? w.player : w.npcs.find((a) => a.id === id);
export function relation(w: World, target: string): Relation | undefined {
  return w.relations.find((r) => r.from === target && r.to === "PLAYER");
}
function ensureRelation(w: World, target: string) {
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
const record = recordFact;
function memory(
  w: World,
  target: string,
  kind: keyof typeof B.relationships.eventDeltas,
  text: string,
) {
  const r = ensureRelation(w, target);
  const d = B.relationships.eventDeltas[kind];
  r.favor = clamp(r.favor + d.favorability, -100, 100);
  r.trust = clamp(
    r.trust + d.trust + (kind === "promiseFulfilled" && w.profile.artifact === "bond" ? 3 : 0),
    -100,
    100,
  );
  r.memories.push(record(w, kind, text, ["PLAYER", target]));
}
function createActor(
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
    ageDays: age * 360,
    appearanceSeed: seed,
    aptitude,
    personality: ["谨慎", "爽直", "重情", "寡言", "豁达"][seed % 5],
    sect: ["散修", "青岚宗", "归云门"][seed % 3],
    goal: realm === 0 ? "寻得功法，踏入仙途" : "积蓄修为，筹备下一次突破",
    realm,
    xp: 0,
    hp: B.combat.realmStats[REALM_KEYS[realm]].maxHp,
    stones: 6,
    healing: 1,
    pills: 0,
    grass: 0,
    manual: realm > 0,
    alive: true,
    location: "market",
    activity: "在坊市停留",
    readyDay: 7,
    lastActionDay: -1,
    attempt: null,
  };
}
export function createWorld(
  seed: number,
  profile: Profile,
  saveId: string,
  npcCount = 40,
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
    const realm = roll < 40 ? 0 : roll < 70 ? 1 : roll < 85 ? 2 : roll < 95 ? 3 : 4;
    const npc = createActor(
      `NPC_${String(i + 1).padStart(4, "0")}`,
      surnames[draw(surnames.length)] + names[draw(names.length)],
      realm,
      18 + draw(43),
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
    18,
    profile.aptitude,
    hashSeed(seed, "appearance"),
  );
  player.sex = profile.sex;
  player.goal = "从凡人开始，寻一条自己的道";
  player.sect = "无";
  const w: World = {
    schemaVersion: 4,
    negotiations: [],
    contentLocks: options.contentLocks ?? [],
    contentState: {},
    commandReceipts: {},
    knowledge: [],
    simulationOptions: { backgroundConflicts: options.backgroundConflicts ?? false },
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
  if (r.favor <= -30 || r.trust <= -30) return "心存芥蒂";
  if (r.trust < 0) return "有所戒备";
  if (r.favor >= 20 && r.trust >= 15) return "朋友";
  return "相识";
}
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
export function facts(w: World): Record<string, string | number | boolean> {
  const primary = actorById(w, PACK.roles.primary);
  return {
    ...Object.fromEntries(PACK.declaredFlags.map((flag) => [flag, !!w.story.flags[flag]])),
    location: w.player.location,
    primaryPresent: !!primary?.alive && primary.location === w.player.location,
    met: !!w.story.flags.met,
    manual: w.player.manual,
    goal: !!w.story.flags.goal,
    reunion: !!w.story.flags.reunion,
    outcome: w.story.outcome,
    sinceSettlement: w.story.settledDay === null ? -1 : w.day - w.story.settledDay,
    hasAgreement: !!w.agreement && ["accepted", "active"].includes(w.agreement.status),
    canInvite: canInvite(w),
  };
}
export function scene(w: World): StoryNode | undefined {
  if (w.battle || w.loot || w.longAction) return undefined;
  const f = facts(w);
  const n = STORY.find((n) =>
    n.conditions.every((c) =>
      c.op === "eq"
        ? f[c.fact] === c.value
        : typeof f[c.fact] === "number" && (f[c.fact] as number) >= (c.value as number),
    ),
  );
  if (!n) return undefined;
  return {
    ...n,
    title: contentText(n.title, w),
    eyebrow: contentText(n.eyebrow, w),
    body: contentText(n.body, w),
    quote: n.quote ? contentText(n.quote, w) : undefined,
    choices: n.choices.map((c) => ({
      ...c,
      label: contentText(c.label, w),
      hint: contentText(c.hint, w),
      reply: contentText(c.reply, w),
    })),
  };
}
function meet(w: World, target: string) {
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
function learn(w: World, a: Actor) {
  requireRule(!a.manual, "已经学会这册功法，无需重复领取。");
  a.manual = true;
  if (a.id === "PLAYER") {
    w.notice = "你学会了《基础吐纳诀》，现在可以开始修炼。";
    record(w, "manual", "你读过入门经书，将吐纳法门记在心中。");
  }
}
export function gainPerDay(w: World, a: Actor, stoneMethod = false) {
  return (
    (a.realm === 0 ? 4 : 10) +
    Math.floor(a.aptitude / 25) +
    (a.id === "PLAYER" && w.profile.artifact === "focus" ? 2 : 0) +
    (stoneMethod ? 4 : 0)
  );
}
function cultivate(w: World, a: Actor, stoneMethod = false) {
  requireRule(a.alive && a.manual, "修炼需要先习得功法。");
  if (stoneMethod) {
    requireRule(a.stones >= 1, "灵石不足。");
    a.stones--;
  }
  a.xp = Math.min(threshold(a), a.xp + gainPerDay(w, a, stoneMethod));
  a.activity = "静心修炼";
  if ((a.realm === 1 || a.realm === 2) && a.xp >= threshold(a)) {
    a.realm++;
    a.xp = 0;
    a.hp = stats(a).maxHp;
    record(w, "advance", `${a.name}日积月累，修为提升至${REALMS[a.realm]}。`, [a.id]);
  }
}
export function breakthroughChance(w: World, a: Actor, pill: boolean, guardian: boolean) {
  return a.realm === 0
    ? 9500
    : Math.min(9500, 6500 + a.aptitude * 10 + (pill ? 1500 : 0) + (guardian ? 1000 : 0));
}
function breakthroughResult(w: World, a: Actor, chance: number) {
  const passed = random(w, "simulation", 10000) < chance;
  if (passed) {
    a.realm = a.realm === 0 ? 1 : 4;
    a.xp = 0;
    a.hp = stats(a).maxHp;
    a.goal = "稳固境界，继续修行";
    record(w, "breakthrough", `${a.name}突破成功，踏入${REALMS[a.realm]}。`, [a.id]);
  } else {
    const severe = a.realm > 1 && random(w, "simulation", 10000) < 1000;
    if (severe) {
      a.realm--;
      a.xp = 0;
      a.hp = Math.min(a.hp, stats(a).maxHp);
    } else a.xp -= Math.ceil(a.xp * 0.2);
    record(
      w,
      "breakthrough-failed",
      `${a.name}突破未成，${severe ? "境界跌落一层" : "损失了部分修为"}，性命无碍。`,
      [a.id],
    );
  }
  a.readyDay = w.day + 7;
  return passed;
}
export function combatDamage(attack: number, defense: number, skill = false, guarding = false) {
  const power = skill
    ? Math.floor(
        (attack * B.combat.prototypeStrikeMultiplierNumerator) /
          B.combat.prototypeStrikeMultiplierDenominator,
      )
    : attack;
  return Math.max(1, Math.floor(Math.max(1, power - defense) * (guarding ? 0.5 : 1)));
}
function die(w: World, person: Actor, cause: string) {
  if (!person.alive) return;
  person.alive = false;
  person.hp = 0;
  person.attempt = null;
  person.activity = "已逝";
  if (person.id === "PLAYER") {
    w.ended = true;
    w.longAction = null;
    w.notice = "此生已落笔。你可以导出已经发生的经历。";
  } else w.party = w.party.filter((id) => id !== person.id);
  record(w, "death", `${person.name}${cause}。其身份与已经发生的经历仍被保留。`, [person.id]);
}
function npcConflict(w: World, attacker: Actor, defender: Actor) {
  const order = [attacker, defender].sort(
    (a, b) => stats(b).speed - stats(a).speed || a.id.localeCompare(b.id),
  );
  for (const acting of order) {
    if (!acting.alive) continue;
    const target = acting.id === attacker.id ? defender : attacker;
    if (!target.alive) break;
    target.hp = Math.max(0, target.hp - combatDamage(stats(acting).attack, stats(target).defense));
    if (target.hp === 0) die(w, target, "在冲突中身亡");
  }
  for (const person of [attacker, defender]) {
    person.lastActionDay = w.day;
    if (person.alive) person.activity = "争执后休整";
  }
  const eventId = record(
    w,
    "conflict",
    `${attacker.name}与${defender.name}发生冲突，伤势与后果已经结算。`,
    [attacker.id, defender.id],
  );
  for (const [from, to] of [
    [attacker, defender],
    [defender, attacker],
  ]) {
    let r = w.relations.find((r) => r.from === from.id && r.to === to.id);
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
    r.grievance = true;
    r.memories.push(eventId);
  }
}
function advanceDay(w: World, occupied: Set<string> = new Set(["PLAYER"])) {
  if (w.ended) return;
  w.day++;
  w.player.ageDays++;
  w.player.lastActionDay = w.day;
  if (
    w.profile.mode === "complex" &&
    w.player.ageDays >= B.world.npcLifespanDays[REALM_KEYS[w.player.realm]]
  ) {
    die(w, w.player, "寿元已尽");
  }
  const ordered = [...w.npcs].sort((x, y) => x.id.localeCompare(y.id));
  // Resolve aging/death for the whole day before any actor can claim an action.
  for (const a of ordered)
    if (a.alive) {
      a.ageDays++;
      if (a.ageDays >= B.world.npcLifespanDays[REALM_KEYS[a.realm]]) die(w, a, "寿元已尽");
    }
  for (const a of ordered) {
    if (!a.alive || a.lastActionDay === w.day) continue;
    a.lastActionDay = w.day;
    if (a.attempt) {
      a.attempt.remaining--;
      a.activity = "凝神突破，暂不外出";
      if (a.attempt.remaining === 0) {
        breakthroughResult(w, a, a.attempt.chance);
        a.attempt = null;
      }
      continue;
    }
    if (occupied.has(a.id)) {
      a.activity = w.longAction?.guardian === a.id ? "为同伴护法" : "与同伴同行";
      continue;
    }
    if (
      w.agreement?.status === "accepted" &&
      w.agreement.meeting &&
      w.agreement.members.includes(a.id) &&
      !w.party.includes(a.id)
    ) {
      const target = w.agreement.meeting.location;
      a.activity = a.location === target ? "依约等候同伴" : `前往${LOCATIONS[target].name}会合`;
      a.location = target;
      continue;
    }
    if (w.simulationOptions.backgroundConflicts && !w.party.includes(a.id)) {
      const rival = w.npcs.find(
        (b) =>
          b.id !== a.id &&
          b.alive &&
          b.hp > 0 &&
          !b.attempt &&
          !occupied.has(b.id) &&
          !w.party.includes(b.id) &&
          b.lastActionDay < w.day &&
          b.location === a.location &&
          w.relations.some((r) => r.from === a.id && r.to === b.id && r.favor <= -30),
      );
      if (rival) {
        npcConflict(w, a, rival);
        continue;
      }
    }
    if (!a.manual) {
      if (a.location !== "inn") {
        a.location = "inn";
        a.activity = "前往客栈寻书";
      } else {
        a.manual = true;
        a.activity = "研读吐纳法门";
      }
      continue;
    }
    if (a.hp < stats(a).maxHp / 2) {
      a.hp = Math.min(stats(a).maxHp, a.hp + Math.ceil(stats(a).maxHp / 2));
      a.activity = "休养";
      continue;
    }
    const isParty = w.party.includes(a.id);
    const primary = a.id === PACK.roles.primary;
    const fixed = primary || a.id === PACK.roles.companion;
    if (fixed && !isParty && w.day % 3 === 0 && a.location !== "market") {
      a.location = "market";
      a.activity = "回坊市访友";
      continue;
    }
    if (primary && a.grass >= 1 && a.stones >= 10 && !a.pills) {
      a.grass--;
      a.stones -= 10;
      a.pills++;
      a.goal = "丹药齐备，等待合适的突破时机";
      a.activity = "兑换丹药";
      continue;
    }
    if ((a.realm === 0 || a.realm === 3) && a.xp >= threshold(a) && w.day >= a.readyDay) {
      if (a.realm === 3 && !a.pills) {
        if (a.stones >= 30) {
          a.stones -= 30;
          a.pills++;
          a.activity = "购置突破丹";
        } else {
          a.stones += 6;
          a.activity = "赚取修炼资粮";
        }
        continue;
      }
      const hasPill = a.realm > 0 && a.pills > 0;
      const chance = breakthroughChance(w, a, hasPill, false);
      if (hasPill) a.pills--;
      if (a.realm === 0) breakthroughResult(w, a, chance);
      else a.attempt = { remaining: 2, chance };
      a.activity = "凝神突破，暂不外出";
      continue;
    }
    const draw = random(w, "simulation", 100);
    if (draw < 55) cultivate(w, a);
    else if (draw < 75) {
      a.stones += 6;
      a.activity = "接些杂务，赚取灵石";
    } else if (draw < 85 && !isParty) {
      a.location = SAFE[random(w, "simulation", SAFE.length)];
      a.activity = "在附近走动";
    } else if (draw < 95) {
      a.activity = "与当地修士交谈";
      const others = w.npcs.filter((b) => b.id !== a.id && b.alive && b.location === a.location);
      if (others.length) {
        const b = others[random(w, "simulation", others.length)];
        let r = w.relations.find((r) => r.from === a.id && r.to === b.id);
        if (!r) {
          r = {
            from: a.id,
            to: b.id,
            favor: 0,
            trust: 0,
            attraction: 0,
            known: true,
            memories: [],
          };
          w.relations.push(r);
        }
        recordSocialContact(w, r, a, b);
      }
    } else {
      a.hp = Math.min(stats(a).maxHp, a.hp + 5);
      a.activity = "闲坐休息";
    }
  }
  updateAgreementAvailability(w);
}
function updateAgreementAvailability(w: World) {
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
function fighter(a: Actor): Fighter {
  return { id: a.id, name: a.name, hp: a.hp, ...stats(a), guard: false, cooldown: 0 };
}
function finishBattle(w: World, outcome: "win" | "retreat" | "defeat") {
  const battle = w.battle!;
  for (const f of battle.allies) {
    const a = actorById(w, f.id)!;
    if (!a.alive) continue;
    if (battle.lethal && f.hp === 0 && (a.id !== "PLAYER" || w.profile.mode === "complex"))
      die(w, a, "在致命遭遇中身亡");
    else a.hp = Math.max(1, f.hp || Math.ceil(f.maxHp * (outcome === "defeat" ? 0.3 : 0.1)));
  }
  updateAgreementAvailability(w);
  if (w.ended) {
    w.battle = null;
    w.notice = "此生已落笔。致命遭遇已经结束，可导出这一世的经历。";
    return;
  }
  if (outcome === "win") {
    w.loot = { stones: 12, grass: 1, expeditionId: battle.id };
    for (const id of w.party.filter((id) => id !== "PLAYER"))
      memory(w, id, "sharedVictory", `你与${actorById(w, id)!.name}在残碑秘境并肩取胜。`);
    w.notice = "石傀轰然倒下。你们找到一株凝元草和十二枚灵石。战利品暂存，回到坊市后再按约分配。";
  } else {
    if (w.agreement) w.agreement.status = "not_triggered";
    if (w.story.outcome === "none") {
      w.story.outcome = "not_triggered";
      w.story.settledDay = w.day;
    }
    w.player.location = "gate";
    for (const id of w.party) actorById(w, id)!.location = "gate";
    if (outcome === "defeat") {
      w.player.stones -= Math.floor(w.player.stones * (w.profile.mode === "simple" ? 0.1 : 0.15));
      advanceDay(w, new Set(w.party));
      if (w.profile.mode === "complex") advanceDay(w, new Set(w.party));
    }
    w.notice =
      outcome === "retreat"
        ? "你们撤回古道。尚未获得凝元草，这次没有构成违约。"
        : battle.lethal
          ? "你撤回古道休养。此战伤亡和灵石损失已经记入历程。"
          : "同伴将你带回古道休养。损失了部分灵石，大家都活着。";
  }
  record(w, `battle-${outcome}`, w.notice, w.party);
  w.battle = null;
}
function battleRound(
  w: World,
  action: "attack" | "skill" | "guard" | "heal" | "retreat",
  target?: string,
) {
  const battle = w.battle!;
  requireRule(battle, "眼下没有战斗。");
  const p = battle.allies.find((a) => a.id === "PLAYER")!;
  if (target !== undefined)
    requireRule(
      (action === "attack" || action === "skill") &&
        battle.enemies.some((e) => e.id === target && e.hp > 0),
      "战斗目标无效，请选择当前可攻击的敌人。",
    );
  if (p.hp > 0) {
    if (action === "skill") requireRule(p.cooldown === 0, "剑诀尚在调息。");
    if (action === "heal")
      requireRule(w.player.healing > 0 && p.hp < p.maxHp, "没有回春丹，或气血已经充足。");
  }
  const order = [...battle.allies, ...battle.enemies].sort(
    (a, b) => b.speed - a.speed || a.id.localeCompare(b.id),
  );
  const logs: string[] = [];
  for (const f of order) {
    if (f.hp <= 0) continue;
    f.guard = false;
    const skillReady = f.cooldown === 0;
    if (f.cooldown > 0) f.cooldown--;
    const ally = battle.allies.includes(f);
    const enemies = (ally ? battle.enemies : battle.allies).filter((t) => t.hp > 0);
    if (!enemies.length) break;
    let selected = f.id === "PLAYER" ? action : "attack";
    const owner = ally ? actorById(w, f.id) : undefined;
    if (ally && f.id !== "PLAYER")
      selected =
        owner!.healing > 0 && f.hp / f.maxHp <= 0.35 ? "heal" : skillReady ? "skill" : "attack";
    if (selected === "retreat") {
      if (
        random(w, "combat", 10000) <
        Math.min(9500, 8000 + (w.profile.artifact === "ward" ? 1500 : 0))
      ) {
        finishBattle(w, "retreat");
        return;
      }
      logs.push("你寻找退路，却被石傀截住。");
      continue;
    }
    if (selected === "guard") {
      f.guard = true;
      logs.push(`${f.name}凝神防御。`);
      continue;
    }
    if (selected === "heal" && owner) {
      owner.healing--;
      const gain = Math.ceil(f.maxHp * 0.35);
      f.hp = Math.min(f.maxHp, f.hp + gain);
      logs.push(`${f.name}服下回春丹，恢复气血。`);
      continue;
    }
    const t = (f.id === "PLAYER" && enemies.find((t) => t.id === target)) || enemies[0];
    const damage = combatDamage(f.attack, t.defense, selected === "skill", t.guard);
    t.hp = Math.max(0, t.hp - damage);
    if (selected === "skill") f.cooldown = 2;
    logs.push(
      `${f.name}${selected === "skill" ? "使出青芒剑诀" : "攻击"}${t.name}，造成 ${damage} 点伤害${t.hp === 0 ? "，使其倒地" : ""}。`,
    );
  }
  battle.logs = [...battle.logs, ...logs];
  battle.round++;
  for (const f of battle.allies) actorById(w, f.id)!.hp = f.hp;
  if (battle.enemies.every((a) => a.hp <= 0)) {
    finishBattle(w, "win");
    return;
  }
  if (battle.allies.every((a) => a.hp <= 0)) {
    finishBattle(w, "defeat");
    return;
  }
  if (battle.round > 30) {
    finishBattle(w, "retreat");
    return;
  }
  w.notice = logs.at(-1) || "双方仍在对峙。";
}
function acceptAgreement(w: World) {
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
function handle(w: World, c: Command) {
  requireRule(!w.ended && w.player.alive, "这一段人生已经结束，可以导出历程或开始新的一局。");
  if (w.longAction) requireRule(["step", "stop"].includes(c.type), "先完成或结束当前修行。");
  if (w.battle) requireRule(["battle", "auto"].includes(c.type), "请先完成当前战斗。");
  const p = w.player;
  switch (c.type) {
    case "adoptNegotiation": {
      requireRule(
        c.saveId === w.saveId && c.revision === w.revision,
        "交涉期间进度已经变化，请重新商议。",
      );
      requireRule(!w.negotiations.some((n) => n.proposalId === c.proposalId), "这份提议已经采用。");
      requireRule(
        c.target === PACK.roles.primary &&
          ["invite", "counter_offer", "accept"].includes(c.proposal.intent) &&
          validTerms(c.proposal),
        "条款尚未完整或超出当前可商议范围，请继续澄清。",
      );
      requireRule(w.party.length === 1 && p.stones >= 2, "需要空出的队伍与至少两枚灵石路费。");
      acceptAgreement(w);
      w.negotiations.push({
        proposalId: c.proposalId,
        sessionId: c.sessionId,
        target: c.target,
        day: w.day,
        revision: w.revision + 1,
        proposal: c.proposal,
      });
      record(
        w,
        "negotiation",
        `你确认了与${actorById(w, c.target)!.name}的同行草案：${c.proposal.reply} 条款：下一次秘境，三人同行，第一株凝元草归对方，其余战利品归你，出发支付2灵石。`,
        ["PLAYER", c.target],
      );
      w.notice = "同行条款已确认并保存。会合后即可组队出发。";
      break;
    }
    case "chooseExtension": {
      const node = extensionScenes(w).find((n) => n.id === c.nodeId);
      requireRule(node, "支线已变化，或参与者不在场。");
      const choice = node!.choices.find((x) => x.id === c.choiceId);
      requireRule(choice, "支线选项已失效。");
      for (const e of choice!.effects) {
        if (e.kind === "progress") w.contentState[e.key] = true;
        if (e.kind === "meet") meet(w, e.target);
        if (e.kind === "starterManual") learn(w, p);
        if (e.kind === "buyItem") handle(w, { type: "buy", item: e.item });
        if (e.kind === "experience") {
          const eventId = record(w, "shared-experience", e.text, ["PLAYER", e.target]);
          const r = ensureRelation(w, e.target);
          r.memories.push(eventId);
        }
        if (e.kind === "agreement") acceptAgreement(w);
      }
      w.contentState[node!.id] = true;
      record(
        w,
        "story-choice",
        `${node!.title}：${node!.body} ${node!.quote ?? ""} 你选择：${choice!.label}。${choice!.reply}`,
        ["PLAYER", ...node!.participants],
      );
      w.notice = choice!.reply;
      break;
    }
    case "choose": {
      const n = scene(w);
      requireRule(n?.id === c.nodeId, "这一幕已经变化，请使用当前选项。");
      const choice = n!.choices.find((x) => x.id === c.choiceId);
      requireRule(choice, "当前没有这个选项。");
      for (const e of choice!.effects) {
        if (e.kind === "meet") meet(w, PACK.roles[e.target as keyof typeof PACK.roles]);
        if (e.kind === "learn") learn(w, p);
        if (e.kind === "flag") {
          requireRule(PACK.declaredFlags.includes(e.key || ""), "故事进度字段不受支持。");
          w.story.flags[e.key!] = true;
          if (e.key === "reunion")
            record(w, "reunion", choice!.reply, ["PLAYER", PACK.roles.primary]);
        }
        if (e.kind === "agreement") {
          acceptAgreement(w);
        }
      }
      w.notice = choice!.reply;
      break;
    }
    case "meet":
      meet(w, c.target);
      break;
    case "learn":
      requireRule(p.location === "inn", "请到客栈领取入门经书。");
      learn(w, p);
      break;
    case "travel": {
      requireRule(!w.loot, "先带着战利品返回坊市结算。");
      requireRule(
        w.party.every((id) => !actorById(w, id)?.attempt),
        "同伴正在突破，请等候完成后再动身。",
      );
      requireRule(
        (LOCATIONS[p.location].destinations as readonly string[]).includes(c.to),
        "这里不能直接到达那个地点。",
      );
      const time = p.location === "gate" || c.to === "gate" ? 1 : 0;
      for (let d = 0; d < time; d++) advanceDay(w, new Set(w.party));
      if (w.ended) break;
      p.location = c.to;
      for (const id of w.party) actorById(w, id)!.location = c.to;
      w.notice = `你来到${LOCATIONS[c.to].name}${time ? "，一天已过" : ""}。`;
      record(w, "travel", w.notice, w.party);
      break;
    }
    case "train":
      requireRule(p.manual, "先在客栈领取并学习入门功法。");
      requireRule(p.location !== "ruins", "秘境不宜静修。");
      requireRule([1, 3, 7, 30].includes(c.days), "修炼天数不合法。");
      requireRule(!c.stoneMethod || p.stones >= c.days, "灵石不足以完成这段修炼。");
      w.longAction = {
        id: `action:${w.revision + 1}`,
        checkpoint: 0,
        paidStones: 0,
        kind: "train",
        total: c.days,
        remaining: c.days,
        stoneMethod: c.stoneMethod,
        chance: 0,
        guardian: null,
      };
      w.notice = "你收拢心神，开始吐纳。";
      break;
    case "wait":
      requireRule(p.location !== "ruins", "先离开秘境。");
      requireRule([1, 3, 7].includes(c.days), "等待天数不合法。");
      w.longAction = {
        id: `action:${w.revision + 1}`,
        checkpoint: 0,
        paidStones: 0,
        kind: "wait",
        total: c.days,
        remaining: c.days,
        stoneMethod: false,
        chance: 0,
        guardian: null,
      };
      break;
    case "step": {
      const a = w.longAction;
      requireRule(a, "没有正在进行的长行动。");
      const occupied = new Set(["PLAYER", ...(a!.guardian ? [a!.guardian] : [])]);
      advanceDay(w, occupied);
      if (w.ended) break;
      if (a!.kind === "train") cultivate(w, p, a!.stoneMethod);
      a!.remaining--;
      a!.checkpoint++;
      if (a!.kind === "train" && a!.stoneMethod) a!.paidStones++;
      if (a!.remaining === 0) {
        if (a!.kind === "breakthrough") {
          const success = breakthroughResult(w, p, a!.chance);
          w.notice = success
            ? `气机贯通，你踏入了${REALMS[p.realm]}。`
            : "气息渐散，这次突破未成。损失了修为，但性命无碍；养足修为后仍可重试。";
        } else {
          w.notice =
            a!.kind === "train"
              ? `${a!.total}日修炼结束。山中无甲子，故人也在各自前行。`
              : `${a!.total}日过去，坊市依旧人来人往。`;
          record(w, a!.kind, w.notice);
        }
        w.longAction = null;
      } else
        w.notice = `${a!.kind === "wait" ? "等候" : a!.kind === "breakthrough" ? "突破" : "修炼"}已过 ${a!.total - a!.remaining} 日，还剩 ${a!.remaining} 日。`;
      break;
    }
    case "stop":
      requireRule(w.longAction?.kind !== "breakthrough", "突破开始后需要完成，不能中断。");
      requireRule(w.longAction, "没有正在进行的长行动。");
      w.notice = "你提前结束了闭关，已经获得的修为保留。";
      record(w, "stop", w.notice);
      w.longAction = null;
      break;
    case "work":
      requireRule(p.location !== "ruins", "这里没有可接的杂务。");
      advanceDay(w);
      if (w.ended) break;
      p.stones += 6;
      w.notice = "你替人整理药材、搬运货物，忙过一日，获得 6 枚灵石。";
      record(w, "work", w.notice);
      break;
    case "rest":
      requireRule(p.location !== "ruins", "先离开秘境再休息。");
      advanceDay(w);
      if (w.ended) break;
      p.hp = Math.min(stats(p).maxHp, p.hp + Math.ceil(stats(p).maxHp * 0.5));
      w.notice = "你歇息一日，气血渐复。";
      record(w, "rest", w.notice);
      break;
    case "heal":
      requireRule(p.healing > 0 && p.hp < stats(p).maxHp, "没有丹药，或气血已经充足。");
      p.healing--;
      p.hp = Math.min(stats(p).maxHp, p.hp + Math.ceil(stats(p).maxHp * 0.35));
      w.notice = "服下回春丹，气血恢复。";
      record(w, "heal", w.notice);
      break;
    case "buy": {
      requireRule(p.location === "market", "请到坊市药铺购买。");
      const price = { healing: 8, pills: 30, grass: 40 }[c.item];
      requireRule(price && p.stones >= price, "灵石不足。");
      p.stones -= price;
      p[c.item]++;
      w.notice = `你花费 ${price} 枚灵石，购得${{ healing: "回春丹", pills: "突破丹", grass: "凝元草" }[c.item]}。`;
      record(w, "buy", w.notice);
      break;
    }
    case "exchange":
      requireRule(
        p.location === "market" && p.grass >= 1 && p.stones >= 10,
        "兑换需要在坊市交付一株凝元草和十枚灵石。",
      );
      p.grass--;
      p.stones -= 10;
      p.pills++;
      w.notice = "药师收下凝元草与十枚灵石，交给你一枚突破丹。";
      record(w, "exchange", w.notice);
      break;
    case "breakthrough": {
      requireRule(
        p.location !== "ruins" && (p.realm === 0 || p.realm === 3) && p.xp >= threshold(p),
        "尚未满足大境界突破条件。",
      );
      requireRule(
        !c.usePill || (p.realm === 3 && p.pills > 0),
        "入道无需丹药，或你尚未拥有突破丹。",
      );
      let guardian: string | null = null;
      if (c.guardian) {
        const a = actorById(w, PACK.roles.primary)!;
        const r = relation(w, a.id);
        requireRule(
          p.realm === 3 &&
            a.alive &&
            !a.attempt &&
            a.location === p.location &&
            a.realm >= p.realm &&
            (r?.trust || 0) >= 10 &&
            (r?.favor || 0) >= 0,
          "护法需要在场、空闲、境界足够且信任你的同伴。",
        );
        guardian = a.id;
      }
      const chance = breakthroughChance(w, p, c.usePill, !!guardian);
      if (c.usePill) p.pills--;
      w.longAction = {
        id: `action:${w.revision + 1}`,
        checkpoint: 0,
        paidStones: 0,
        kind: "breakthrough",
        total: p.realm === 0 ? 1 : 3,
        remaining: p.realm === 0 ? 1 : 3,
        stoneMethod: false,
        chance,
        guardian,
      };
      record(
        w,
        "attempt",
        `你开始尝试突破，成功率 ${chance / 100}%。${c.usePill ? "已服用一枚突破丹。" : ""}`,
      );
      w.notice = "灵气沿经脉汇聚，你沉下心来，等待最后一道关隘。";
      break;
    }
    case "formParty": {
      const availability = partyReadiness(w);
      requireRule(availability.ready, availability.reason);
      w.party = [...w.agreement!.members];
      for (const id of w.party.filter((id) => id !== "PLAYER"))
        if (!relation(w, id)?.known) meet(w, id);
      w.notice = contentText(PRESENTATION.notices.party, w);
      record(w, "party", w.notice, w.party);
      break;
    }
    case "rally": {
      requireRule(
        w.agreement?.status === "accepted" &&
          w.party.length === 1 &&
          p.realm >= 1 &&
          p.location !== "ruins",
        "请先约定同行，在安全地点召集同伴。",
      );
      requireRule(
        w.agreement!.members.every((id) => actorById(w, id)?.alive),
        "同伴已经离世，这份约定无法继续。",
      );
      w.agreement!.meeting = { location: p.location };
      advanceDay(w);
      if (w.ended) break;
      const status = partyReadiness(w);
      w.notice = status.ready
        ? "同伴依约抵达。现在可以邀二人同行。"
        : `${status.reason}。已经在此等候的人会留下，等候一日即可继续会合。`;
      record(
        w,
        "rally",
        `你约同伴在${LOCATIONS[p.location].name}会合，等候了一日。`,
        w.agreement!.members,
      );
      break;
    }
    case "expedition": {
      const availability = departureStatus(w);
      requireRule(availability.ready, availability.reason);
      requireRule(p.location === "gate", "先前往山门古道。");
      requireRule(
        w.agreement?.status === "accepted" && w.party.length === 3,
        "需要已接受的约定和三人队伍。",
      );
      requireRule(!w.loot && p.stones >= 2, "先结清上次战利品，并备好两枚灵石路费。");
      requireRule(w.day - w.lastExpeditionDay >= 3, "秘境气息未定，三日后再入山。");
      for (const id of w.party)
        requireRule(
          actorById(w, id)?.alive &&
            !actorById(w, id)?.attempt &&
            actorById(w, id)!.hp > 0 &&
            actorById(w, id)!.location === p.location,
          "同伴须在场、存活、空闲并能行动。",
        );
      p.stones -= 2;
      for (const id of w.party.filter((id) => id !== "PLAYER")) actorById(w, id)!.stones++;
      const id = `expedition:${w.events.length + 1}`;
      w.agreement!.status = "active";
      w.agreement!.expeditionId = id;
      advanceDay(w, new Set(w.party));
      if (w.ended) break;
      for (const id of w.party) actorById(w, id)!.location = "ruins";
      w.lastExpeditionDay = w.day;
      w.battle = {
        id,
        round: 1,
        allies: w.party.map((id) => fighter(actorById(w, id)!)),
        enemies: [0, 1].map((i) => ({
          id: `ENEMY_${i}`,
          name: `守碑石傀${i === 0 ? "·甲" : "·乙"}`,
          maxHp: 45,
          hp: 45,
          attack: 9,
          defense: 3,
          speed: 8,
          guard: false,
          cooldown: 0,
        })),
        logs: ["两具石傀从残碑旁苏醒，拦住了去路。"],
        auto: false,
        lethal: false,
      };
      w.notice = "一日山行后，你们抵达残碑。守碑石傀横在路中，战斗开始。";
      record(w, "expedition", w.notice, w.party);
      break;
    }
    case "battle":
      battleRound(w, c.action, c.target);
      break;
    case "auto":
      requireRule(w.battle, "眼下没有战斗。");
      w.battle!.auto = c.enabled;
      break;
    case "return": {
      requireRule(p.location === "ruins" && !w.battle, "先结束秘境中的战斗。");
      advanceDay(w, new Set(w.party));
      advanceDay(w, new Set(w.party));
      if (w.ended) break;
      for (const id of w.party) actorById(w, id)!.location = "market";
      w.notice = "两日山路后，坊市的灯火重新映入眼帘。该清点这次的收获了。";
      record(w, "return", w.notice, w.party);
      break;
    }
    case "settle": {
      requireRule(w.loot && p.location === "market", "回到坊市后再分配战利品。");
      requireRule(w.agreement?.status === "active", "没有可结算的有效约定。");
      requireRule(c.honor || c.confirm, "独占药草会违背约定，需要明确确认。");
      requireRule(c.honor || !w.agreement!.strict, "补偿后重新接受的严格条款要求按约交付。");
      const a = actorById(w, w.agreement!.recipient)!;
      requireRule(a.alive && a.location === p.location, "领取人需存活且在场。");
      const loot = w.loot!;
      p.stones += loot.stones;
      const outcome = c.honor ? "fulfilled" : "breached";
      if (c.honor) {
        a.grass += loot.grass;
        memory(w, a.id, "promiseFulfilled", `你将说好的凝元草交给${a.name}，履行了秘境约定。`);
      } else {
        p.grass += loot.grass;
        memory(
          w,
          a.id,
          "promiseBreached",
          `你留下了约定归${a.name}的凝元草。她亲眼见证了这次失约。`,
        );
      }
      w.agreement!.status = outcome;
      w.story.outcome = outcome;
      w.story.settledDay = w.day;
      w.story.flags.reunion = false;
      if (!c.honor) w.story.compensated = false;
      w.loot = null;
      w.party = ["PLAYER"];
      w.notice = c.honor
        ? contentText(PRESENTATION.notices.fulfilled, w)
        : contentText(PRESENTATION.notices.breached, w);
      break;
    }
    case "resolveAgreement": {
      updateAgreementAvailability(w);
      requireRule(
        w.agreement?.status === "impossible" && p.location !== "ruins",
        "请先返回安全地点，确认约定已客观无法履行。",
      );
      if (w.loot) {
        p.stones += w.loot.stones;
        p.grass += w.loot.grass;
        w.loot = null;
      }
      w.party = ["PLAYER"];
      w.story.outcome = "not_triggered";
      w.story.settledDay = w.day;
      w.story.flags.reunion = false;
      w.notice = "原约定已客观无法履行，余物已清点。没有认定违约，既有共同经历仍保留。";
      w.agreement!.reason += " 已确认例外处置，余物已清点。";
      record(w, "exception-settlement", w.notice, w.agreement!.members);
      w.agreement!.status = "cancelled";
      break;
    }
    case "compensate": {
      const a = actorById(w, PACK.roles.primary)!;
      requireRule(
        w.story.outcome === "breached" &&
          !w.story.compensated &&
          p.grass >= 1 &&
          a.alive &&
          a.location === p.location,
        "补偿需一株凝元草，并与当事人当面交付。",
      );
      p.grass--;
      a.grass++;
      w.story.compensated = true;
      memory(w, a.id, "promiseCompensated", contentText(PRESENTATION.notices.compensationEvent, w));
      w.notice = contentText(PRESENTATION.notices.compensated, w);
      break;
    }
    case "disband":
      requireRule(!w.loot && !w.battle && p.location !== "ruins", "先离开秘境并结算战利品。");
      w.party = ["PLAYER"];
      if (w.agreement?.status === "accepted") w.agreement.status = "cancelled";
      w.notice = "你们暂时各行其是，已经发生的共同经历仍然保留。";
      record(w, "disband", w.notice);
      break;
    default:
      throw new Error("未知行动。");
  }
}
export function applyCommand(
  source: World,
  command: Command,
  commandId: string,
  revision: number,
): World {
  command = parseCommand(command);
  requireRule(
    typeof commandId === "string" && commandId.length > 0 && commandId.length <= 160,
    "行动编号不合法。",
  );
  const fingerprint = commandFingerprint(command);
  if (source.appliedCommands.includes(commandId)) {
    if (source.commandReceipts[commandId]?.fingerprint !== fingerprint)
      throw new GameError(
        "COMMAND_ID_REUSE",
        "这个行动编号已被使用，不能更改内容或重放未知的旧版行动。",
      );
    return source;
  }
  requireRule(source.revision === revision, "存档已经更新，请重新读取后再行动。");
  const next = structuredClone(source);
  handle(next, command);
  next.revision++;
  next.appliedCommands.push(commandId);
  Object.defineProperty(next.commandReceipts, commandId, {
    value: { fingerprint, revision: next.revision },
    enumerable: true,
    writable: true,
    configurable: true,
  });
  validateWorld(next);
  return next;
}
export function visibleEvents(w: World) {
  return knownEvents(w);
}
export function knownNpcUpdates(w: World) {
  return knownEvents(w)
    .filter((e) => !e.actors.includes("PLAYER") && e.actors.some((id) => relation(w, id)?.known))
    .slice(-3);
}
export function validateWorld(w: World) {
  requireRule(
    w?.format === "xiantu-web-1" && w.rulesVersion === "0.1.2" && w.packLock === PACK.lock,
    "存档格式或内容版本不匹配。",
  );
  const object = (value: unknown) => !!value && typeof value === "object" && !Array.isArray(value);
  requireRule(
    w.schemaVersion === 4 && object(w.commandReceipts),
    "存档结构版本不支持，请使用迁移入口。",
  );
  requireRule(
    Array.isArray(w.negotiations) &&
      new Set(w.negotiations.map((n) => n.proposalId)).size === w.negotiations.length,
    "交涉记录重复或缺失。",
  );
  for (const n of w.negotiations)
    requireRule(
      typeof n.proposalId === "string" &&
        n.proposalId.length > 0 &&
        typeof n.sessionId === "string" &&
        n.sessionId.length > 0 &&
        n.target === PACK.roles.primary &&
        Number.isSafeInteger(n.day) &&
        n.day >= 0 &&
        n.day <= w.day &&
        Number.isSafeInteger(n.revision) &&
        n.revision > 0 &&
        n.revision <= w.revision &&
        proposalSchema.safeParse(n.proposal).success &&
        validTerms(n.proposal),
      "交涉历史无效。",
    );
  const commandIds = new Set(Array.isArray(w.appliedCommands) ? w.appliedCommands : []);
  requireRule(
    Object.entries(w.commandReceipts).every(
      ([id, r]) =>
        commandIds.has(id) &&
        object(r) &&
        typeof r.fingerprint === "string" &&
        r.fingerprint.length <= 16384 &&
        Number.isSafeInteger(r.revision) &&
        r.revision > 0 &&
        r.revision <= w.revision,
    ),
    "行动回执不完整。",
  );
  requireRule(
    typeof w.saveId === "string" &&
      w.saveId.length > 0 &&
      Number.isInteger(w.seed) &&
      w.seed >= 0 &&
      w.seed <= 4294967295,
    "存档身份或世界种子不合法。",
  );
  requireRule(object(w.profile) && object(w.profile.appearance), "角色创建资料不完整。");
  const profile = w.profile;
  requireRule(
    typeof profile.name === "string" &&
      profile.name.trim().length > 0 &&
      profile.name.length <= 16 &&
      ["female", "male"].includes(profile.sex) &&
      ["simple", "complex"].includes(profile.mode) &&
      ["focus", "ward", "bond"].includes(profile.artifact),
    "角色资料不合法。",
  );
  requireRule(
    Number.isInteger(profile.aptitude) &&
      profile.aptitude >= 1 &&
      profile.aptitude <= 100 &&
      ["face", "hair", "color"].every(
        (key) =>
          Number.isInteger(profile.appearance[key as keyof typeof profile.appearance]) &&
          profile.appearance[key as keyof typeof profile.appearance] >= 0 &&
          profile.appearance[key as keyof typeof profile.appearance] < 4,
      ),
    "资质或外貌配置不合法。",
  );
  requireRule(
    object(w.player) &&
      w.player.name === profile.name &&
      w.player.sex === profile.sex &&
      w.player.aptitude === profile.aptitude,
    "玩家身份与创建资料不一致。",
  );
  requireRule(
    object(w.story) &&
      object(w.story.flags) &&
      Object.values(w.story.flags).every((v) => typeof v === "boolean") &&
      typeof w.story.compensated === "boolean",
    "故事进度不完整。",
  );
  requireRule(
    typeof w.ended === "boolean" &&
      typeof w.notice === "string" &&
      Number.isInteger(w.lastExpeditionDay),
    "游戏状态不合法。",
  );
  requireRule(
    Number.isSafeInteger(w.day) &&
      w.day >= 0 &&
      Number.isSafeInteger(w.revision) &&
      w.revision >= 0,
    "日期或存档版本不合法。",
  );
  requireRule(
    Array.isArray(w.npcs) && w.npcs.length >= 2 && w.npcs.length <= 200,
    "人物数量不合法。",
  );
  const extensionSet = selectedExtensions(w.contentLocks);
  requireRule(
    object(w.contentState) && Object.values(w.contentState).every((v) => typeof v === "boolean"),
    "支线进度不合法。",
  );
  const allowedKeys = new Set(
    extensionSet.flatMap((e) => [...e.data.manifest.flags, ...e.data.storylets.map((n) => n.id)]),
  );
  requireRule(
    Object.keys(w.contentState).every((key) => allowedKeys.has(key)),
    "支线进度越过内容包范围。",
  );
  const actors = [w.player, ...w.npcs];
  const ids = new Set(actors.map((a) => a.id));
  requireRule(ids.size === actors.length && w.player.id === "PLAYER", "人物身份重复或缺失。");
  requireRule(ids.has(PACK.roles.primary) && ids.has(PACK.roles.companion), "必要的故事人物缺失。");
  for (const a of actors) {
    requireRule(
      typeof a.name === "string" && a.name.length >= 1 && a.name.length <= 16,
      "人物姓名不合法。",
    );
    requireRule(Number.isInteger(a.realm) && a.realm >= 0 && a.realm <= 4, "境界不合法。");
    requireRule(a.location in LOCATIONS, "人物地点不合法。");
    for (const k of [
      "ageDays",
      "xp",
      "hp",
      "stones",
      "healing",
      "pills",
      "grass",
      "readyDay",
    ] as const)
      requireRule(Number.isSafeInteger(a[k]) && a[k] >= 0, `${a.name}的状态不合法。`);
    requireRule(a.xp <= threshold(a) && a.hp <= stats(a).maxHp, "修为或气血超过当前境界上限。");
    requireRule(
      typeof a.alive === "boolean" && typeof a.manual === "boolean",
      "人物生死或功法状态不合法。",
    );
  }
  requireRule(
    Array.isArray(w.party) &&
      w.party.length >= 1 &&
      w.party.length <= 3 &&
      new Set(w.party).size === w.party.length &&
      w.party.includes("PLAYER"),
    "队伍不合法。",
  );
  for (const id of w.party) {
    const a = actorById(w, id);
    requireRule(
      a && (id === "PLAYER" || a.alive) && a.location === w.player.location,
      "同伴身份或位置不一致。",
    );
  }
  requireRule(
    Array.isArray(w.events) && new Set(w.events.map((e) => e.id)).size === w.events.length,
    "事件 ID 重复。",
  );
  const eventIds = new Set(w.events.map((e) => e.id));
  for (const e of w.events)
    requireRule(
      typeof e.text === "string" &&
        Number.isInteger(e.day) &&
        e.day <= w.day &&
        e.actors.every((id) => ids.has(id)),
      "事件引用不合法。",
    );
  requireRule(
    object(w.simulationOptions) && typeof w.simulationOptions.backgroundConflicts === "boolean",
    "世界演化设置不合法。",
  );
  requireRule(Array.isArray(w.knowledge), "知情记忆缺失。");
  const evidence = new Map(w.events.map((e) => [e.id, e]));
  const knowledgeKeys = new Set<string>();
  for (const m of w.knowledge) {
    const e = evidence.get(m.eventId);
    const key = JSON.stringify([m.eventId, m.knower]);
    requireRule(
      e &&
        ids.has(m.knower) &&
        ["participant", "witness", "told", "public", "legacy"].includes(m.source) &&
        Number.isSafeInteger(m.learnedDay) &&
        m.learnedDay >= e.day &&
        m.learnedDay <= w.day &&
        (m.sourceActor === null || ids.has(m.sourceActor)) &&
        !knowledgeKeys.has(key),
      "知情来源或引用不合法。",
    );
    if (m.source === "participant")
      requireRule(e?.actors.includes(m.knower), "当事人记忆与事实不符。");
    if (m.source === "public") requireRule(e?.public, "私密事件不能伪装为公告。");
    if (m.source === "told") requireRule(m.sourceActor !== null, "告知必须保留来源。");
    knowledgeKeys.add(key);
  }
  for (const m of w.knowledge)
    if (m.source === "told")
      requireRule(
        knowledgeKeys.has(JSON.stringify([m.eventId, m.sourceActor])),
        "告知人并不知道这件事。",
      );
  for (const a of actors)
    requireRule(
      Number.isSafeInteger(a.lastActionDay) && a.lastActionDay >= -1 && a.lastActionDay <= w.day,
      "人物行动日不合法。",
    );
  requireRule(Array.isArray(w.relations), "关系数据不合法。");
  for (const r of w.relations) {
    requireRule(ids.has(r.from) && ids.has(r.to), "关系引用了未知人物。");
    requireRule(
      Number.isInteger(r.favor) &&
        r.favor >= -100 &&
        r.favor <= 100 &&
        Number.isInteger(r.trust) &&
        r.trust >= -100 &&
        r.trust <= 100 &&
        Number.isInteger(r.attraction) &&
        r.attraction >= 0 &&
        r.attraction <= 100,
      "关系数值不合法。",
    );
    requireRule(
      Array.isArray(r.memories) &&
        r.memories.every(
          (id) => eventIds.has(id) && knowledgeKeys.has(JSON.stringify([id, r.from])),
        ),
      "记忆没有对应的已知历史事件。",
    );
    if (r.socialEventId)
      requireRule(
        r.memories.includes(r.socialEventId) && evidence.get(r.socialEventId)?.kind === "social",
        "交往摘要引用无效。",
      );
  }
  for (const k of ["simulation", "combat"] as const)
    requireRule(
      Number.isInteger(w.rng[k]) && w.rng[k] > 0 && w.rng[k] <= 4294967295,
      "随机状态不合法。",
    );
  requireRule(
    Array.isArray(w.appliedCommands) && w.appliedCommands.every((id) => typeof id === "string"),
    "行动去重记录不合法。",
  );
  requireRule(
    w.story && ["none", "fulfilled", "breached", "not_triggered"].includes(w.story.outcome),
    "故事状态不合法。",
  );
  if (w.longAction)
    requireRule(
      ["train", "wait", "breakthrough"].includes(w.longAction.kind) &&
        Number.isInteger(w.longAction.remaining) &&
        w.longAction.remaining > 0 &&
        w.longAction.remaining <= w.longAction.total &&
        w.longAction.total <= 30,
      "长行动状态不合法。",
    );
  for (const a of actors) {
    requireRule(
      ["female", "male"].includes(a.sex) &&
        Number.isInteger(a.aptitude) &&
        a.aptitude >= 1 &&
        a.aptitude <= 100 &&
        typeof a.activity === "string" &&
        typeof a.sect === "string" &&
        typeof a.personality === "string" &&
        typeof a.goal === "string",
      "人物资料不完整。",
    );
    if (a.attempt)
      requireRule(
        Number.isInteger(a.attempt.remaining) &&
          a.attempt.remaining >= 1 &&
          a.attempt.remaining <= 2 &&
          Number.isInteger(a.attempt.chance) &&
          a.attempt.chance >= 0 &&
          a.attempt.chance <= 10000,
        "突破进度不合法。",
      );
  }
  if (w.agreement) {
    const a = w.agreement;
    requireRule(
      typeof a.id === "string" &&
        [
          "accepted",
          "active",
          "fulfilled",
          "breached",
          "not_triggered",
          "cancelled",
          "impossible",
        ].includes(a.status) &&
        Array.isArray(a.members) &&
        a.members.length === 3 &&
        new Set(a.members).size === 3 &&
        a.members.every((id) => ids.has(id)) &&
        ["PLAYER", PACK.roles.primary, PACK.roles.companion].every((id) =>
          a.members.includes(id),
        ) &&
        a.recipient === PACK.roles.primary &&
        typeof a.strict === "boolean",
      "同行约定不合法。",
    );
    if (a.meeting)
      requireRule(
        a.meeting.location in LOCATIONS && a.meeting.location !== "ruins",
        "会合地点不合法。",
      );
  }
  if (w.longAction) {
    const a = w.longAction;
    requireRule(
      typeof a.id === "string" &&
        a.id.length > 0 &&
        a.checkpoint === a.total - a.remaining &&
        Number.isSafeInteger(a.paidStones) &&
        a.paidStones >= 0 &&
        a.paidStones <= a.checkpoint,
      "长行动检查点或已付款记录不合法。",
    );
    requireRule(
      Number.isInteger(a.total) &&
        Number.isInteger(a.chance) &&
        a.chance >= 0 &&
        a.chance <= 10000 &&
        typeof a.stoneMethod === "boolean" &&
        (a.guardian === null || ids.has(a.guardian)),
      "长行动资料不完整。",
    );
  }
  if (w.loot)
    requireRule(
      w.loot.stones === 12 &&
        w.loot.grass === 1 &&
        !!w.agreement &&
        w.agreement.expeditionId === w.loot.expeditionId,
      "战利品与约定不匹配。",
    );
  if (w.battle) {
    const b = w.battle;
    requireRule(
      typeof b.id === "string" &&
        Number.isInteger(b.round) &&
        b.round >= 1 &&
        typeof b.auto === "boolean" &&
        typeof b.lethal === "boolean" &&
        Array.isArray(b.logs) &&
        b.logs.every((t) => typeof t === "string") &&
        Array.isArray(b.allies) &&
        Array.isArray(b.enemies) &&
        b.enemies.length > 0,
      "战斗资料不完整。",
    );
    requireRule(
      w.player.location === "ruins" &&
        b.allies.length === w.party.length &&
        new Set(b.allies.map((a) => a.id)).size === w.party.length &&
        b.allies.every((a) => w.party.includes(a.id)),
      "战斗位置或队伍不匹配。",
    );
    for (const f of [...b.allies, ...b.enemies])
      requireRule(
        typeof f.name === "string" &&
          typeof f.guard === "boolean" &&
          ["hp", "maxHp", "attack", "defense", "speed", "cooldown"].every(
            (k) =>
              Number.isSafeInteger(f[k as keyof Fighter]) && Number(f[k as keyof Fighter]) >= 0,
          ) &&
          f.maxHp > 0 &&
          f.hp <= f.maxHp &&
          f.cooldown <= 3,
        "战斗人物状态不合法。",
      );
  }
}
