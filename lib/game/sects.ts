import { createActor } from "./actor-factory";
import { defaultPhysique } from "./physique";
import { hashSeed } from "./rng";
import { B, REALM_KEYS, legacyRealmIndex, requireRule } from "./rules";
import { recordFact } from "./knowledge";
import { sectAt, sectById } from "./sect-content";
import { locationEnabled } from "./world-map";
import { bondPartner, hasSexualHistory } from "./intimacy";
import type { Actor, LocationId, SectId, World } from "./types";

export function visitSect(w: World, id: SectId) {
  const sect = sectById(id)!;
  requireRule(
    w.player.location === sect.home && locationEnabled(w, sect.home as LocationId),
    "请先到宗门所在地点。",
    "ACTION_UNAVAILABLE",
  );
  requireRule(!w.loot, "请先结清战利品。");
  requireRule(!w.visitedSects?.includes(id), "已经拜访过这座宗门。");
  requireRule(
    w.npcs.length + sect.residents.length <= B.world.maximumNpcCount,
    "此世人物已达到上限，暂不能新增门人。",
  );
  const usedNames = new Set([w.player.name, ...w.npcs.map((a) => a.name)]);
  for (const resident of sect.residents) {
    requireRule(!w.npcs.some((a) => a.id === resident.id), "宗门人物身份已存在。");
    const seed = hashSeed(w.seed, resident.id);
    let name = resident.name;
    for (let suffix = 1; usedNames.has(name); suffix++) name = `${resident.name}${suffix}`;
    usedNames.add(name);
    const a = createActor(
      resident.id,
      name,
      legacyRealmIndex(resident.realm),
      resident.age,
      resident.aptitude,
      seed,
    );
    a.sex = resident.sex as Actor["sex"];
    a.physique = defaultPhysique(a.sex, seed);
    a.ageDays += w.day;
    a.alive = a.ageDays < B.world.npcLifespanDays[REALM_KEYS[a.realm]];
    a.location = sect.home as LocationId;
    a.personality = resident.personality;
    a.goal = resident.wish;
    a.sect = sect.name;
    a.sectMembership = {
      id,
      joinedDay: w.day,
      rank: "outer",
      questStep: 0,
      lastStipendDay: w.day,
      contribution: 0,
      earned: 0,
      artLearned: false,
      previousSect: "散修",
    };
    a.readyDay += w.day;
    a.lastActionDay = w.day;
    a.activity = a.alive ? "在宗门修行，接待行路人" : "寿元已尽";
    w.npcs.push(a);
  }
  w.rulesVersion = "0.2.0";
  (w.visitedSects ??= []).push(id);
  w.notice = `你拜访了${sect.name}，结识此处门人。`;
  recordFact(w, "sect-visit", w.notice);
  for (const a of w.npcs.filter((a) => sect.residents.some((r) => r.id === a.id))) {
    recordFact(
      w,
      a.alive ? "sect-resident" : "death",
      a.alive ? `${a.name}在${sect.name}继续修行。` : `${a.name}寿元已尽，宗门仍留有其小传。`,
      [a.id],
    );
  }
}
export function sectAdmissionReason(w: World, actor: Actor, id: SectId) {
  if (!actor.alive || actor.npcJourney) return "需要在世并已结束行程。";
  if (actor.sectMembership) return "已有宗门，离宗后方可另择师门。";
  if (actor.ageDays < B.relationships.intimateRelationshipMinimumAgeYears * B.world.daysPerYear)
    return "宗门只收成年人。";
  if (id === "yunv") {
    if (actor.sex !== "female") return "玉女宗只收成年女子；行路人仍可拜访、交流。";
    if (hasSexualHistory(w, actor.id) || bondPartner(w, actor.id)?.alive)
      return "已有亲密经历或道侣，不符合玉女宗入门誓约。";
  }
  return "";
}
export function joinSectReason(w: World, id: SectId) {
  if (w.player.location !== sectById(id)!.home || !w.visitedSects?.includes(id))
    return "先到当地拜访宗门。";
  return sectAdmissionReason(w, w.player, id);
}
export function joinSect(w: World, id: SectId) {
  requireRule(!w.loot, "请先结清战利品。");
  requireRule(!joinSectReason(w, id), joinSectReason(w, id));
  enrollSect(w, w.player, id);
}
export function enrollSect(w: World, p: Actor, id: SectId) {
  requireRule(!sectAdmissionReason(w, p, id), sectAdmissionReason(w, p, id));
  requireRule(
    p.location === sectById(id)!.home && locationEnabled(w, p.location),
    "请先到宗门所在地点。",
  );
  const sect = sectById(id)!;
  p.sectMembership = {
    id,
    joinedDay: w.day,
    rank: "outer",
    questStep: 0,
    lastStipendDay: w.day,
    contribution: 0,
    earned: 0,
    artLearned: false,
    previousSect: p.sect,
  };
  p.sect = sect.name;
  p.manual = true;
  const text =
    p.id === "PLAYER"
      ? `你自愿拜入${sect.name}，领得入门吐纳法。${id === "yunv" ? "你自陈此前未有性经历，并立下在宗期间守贞清修的誓约。" : "从今日起，可以通过宗门委托积累贡献，学习进阶心法。"}`
      : `${p.name}经当地门人考察，自愿拜入${sect.name}，领得入门功法，开始宗门修行。`;
  if (p.id === "PLAYER") w.notice = text;
  else w.rulesVersion = "0.2.0";
  // Enrollment announcements can be heard locally without discovering the sect's cast for the player.
  recordFact(w, "sect-join", text, [p.id], p.id !== "PLAYER");
}
export function requireSectHome(w: World, a = w.player) {
  const s = a.sectMembership,
    sect = sectById(s?.id);
  requireRule(
    s && sect && a.location === sect.home && a.alive,
    "需要在所属宗门办理。",
    "ACTION_UNAVAILABLE",
  );
  requireRule(a.id !== "PLAYER" || !w.loot, "请先结清战利品。");
  return { membership: s!, sect: sect! };
}
export function settleSectTask(w: World, a: Actor) {
  const { membership: m, sect } = requireSectHome(w, a);
  m.contribution += B.sects.taskContribution;
  m.earned += B.sects.taskContribution;
  a.stones += B.sects.taskStones;
  const text = `${a.name}完成${sect.name}委托「${sect.task}」，获得 ${B.sects.taskContribution} 贡献、${B.sects.taskStones} 灵石。`;
  const recurring =
    a.id === "PLAYER"
      ? undefined
      : w.events.find((e) => e.id === `sect-task:${a.id}:${m.joinedDay}`);
  if (recurring) {
    recurring.count = (recurring.count ?? 1) + 1;
    recurring.lastDay = w.day;
  } else {
    recordFact(
      w,
      "sect-task",
      text,
      [a.id],
      false,
      a.id === "PLAYER" ? undefined : `sect-task:${a.id}:${m.joinedDay}`,
    );
  }
  a.activity = sect.task;
  if (a.id === "PLAYER") w.notice = `${sect.taskStory} ${text}`;
}
export function learnSectArt(w: World, a = w.player) {
  const { membership: m, sect } = requireSectHome(w, a);
  requireRule(!m.artLearned, "已经学会这部宗门心法。");
  requireRule(
    m.contribution >= B.sects.artContributionCost,
    "宗门贡献不足。",
    "INSUFFICIENT_RESOURCES",
  );
  m.contribution -= B.sects.artContributionCost;
  m.artLearned = true;
  const text = `${a.name}以 ${B.sects.artContributionCost} 贡献研习《${sect.technique}》。`;
  recordFact(w, "sect-art", text, [a.id]);
  if (a.id === "PLAYER") w.notice = text;
}
export function leaveSect(w: World) {
  const { membership: m, sect } = requireSectHome(w);
  w.player.sect = m.previousSect;
  delete w.player.sectMembership;
  w.notice = `你辞别${sect.name}，归还门籍。贡献与宗门功法加成随门籍结束，昔日经历仍然保留。`;
  recordFact(w, "sect-leave", w.notice);
}
/** NPCs use the same task economy and technique purchase as the player. */
export function npcSectTask(w: World, a: Actor) {
  if (!a.sectMembership || sectAt(a.location)?.id !== a.sectMembership.id) return false;
  if (w.day % B.sects.npcTaskIntervalDays !== 0) return false;
  settleSectTask(w, a);
  if (!a.sectMembership.artLearned && a.sectMembership.contribution >= B.sects.artContributionCost)
    learnSectArt(w, a);
  return true;
}
