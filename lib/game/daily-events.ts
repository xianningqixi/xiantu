import data from "../../content-packs/daily-events/events.json";
import { B, actorById, requireRule } from "./rules";
import { random } from "./rng";
import { inCave } from "./cultivation";
import { ensureRelation } from "./relationships";
import { recordFact } from "./knowledge";
import { locationKind } from "./world-map";
import type { Choice, StoryEffect, StoryNode, World } from "./types";
export type DailyActivity = "train" | "wait" | "work" | "travel";
export interface DailyNode extends StoryNode {
  category: "sighting" | "choice" | "risk";
  cooldownDays: number;
  requiresNpc: boolean;
  effects: StoryEffect[];
  choices: (Choice & { days: number; gift: boolean })[];
}
export const DAILY_EVENTS = data.events as DailyNode[];
export function dailyOccurrence(w: World) {
  return w.events.findLast(
    (e) =>
      e.kind === "daily-event" && e.daily?.nodeId === w.pendingDailyEventId && !e.daily.choiceId,
  );
}
export function dailyScene(w: World): StoryNode | undefined {
  if (!w.pendingDailyEventId || w.battle || w.longAction?.kind === "breakthrough") return undefined;
  const node = DAILY_EVENTS.find((n) => n.id === w.pendingDailyEventId);
  const occurrence = dailyOccurrence(w);
  if (!node || !occurrence) return undefined;
  const fill = (s: string) =>
    s.replaceAll("{{npc}}", actorById(w, occurrence.daily?.target ?? "")?.name ?? "那位行路人");
  return {
    ...node,
    body: fill(node.body),
    choices: node.choices.map((c) => ({ ...c, reply: fill(c.reply) })),
  };
}
function effects(w: World, list: StoryEffect[], target?: string) {
  // Validate the total cost before applying any effect; the Worker also rolls back failed candidates.
  for (const kind of ["stones", "grass", "healing", "insight"] as const) {
    const delta = list.filter((e) => e.kind === kind).reduce((n, e) => n + (e.value ?? 0), 0);
    requireRule(
      w.player[kind] + delta >= 0,
      "随身物资不足，请选择另一种回应。",
      "INSUFFICIENT_RESOURCES",
    );
  }
  for (const e of list) {
    if (["stones", "grass", "healing", "insight"].includes(e.kind))
      w.player[e.kind as "stones" | "grass" | "healing" | "insight"] += e.value ?? 0;
    if (e.kind === "relation" && target) {
      const r = ensureRelation(w, target);
      r.known = true;
      r.favor = Math.max(-100, Math.min(100, r.favor + (e.value ?? 0)));
    }
    if (e.kind === "encounter")
      recordFact(
        w,
        "encounter",
        `遭遇记录：${e.target === "bandits" ? "山匪拦路" : "小妖兽来犯"}。你守住退路，性命无碍。`,
      );
  }
}
export function chooseDailyEvent(w: World, nodeId: string, choiceId: string): number {
  const scene = dailyScene(w);
  requireRule(scene?.id === nodeId, "这件小事已经变化，请使用当前选项。");
  const node = DAILY_EVENTS.find((n) => n.id === nodeId)!;
  const choice = node.choices.find((c) => c.id === choiceId);
  requireRule(choice, "当前没有这个选项。");
  const occurrence = dailyOccurrence(w)!;
  effects(w, choice!.effects, occurrence.daily!.target);
  occurrence.daily!.choiceId = choiceId;
  occurrence.daily!.choiceDay = w.day;
  if (choice!.gift && occurrence.daily!.target)
    occurrence.daily!.giftDueDay = w.day + B.actions.dailyEvents.giftDelayDays;
  w.pendingDailyEventId = null;
  w.notice = scene!.choices.find((c) => c.id === choiceId)!.reply;
  recordFact(w, "daily-choice", `${node.title}：${choice!.label}。${w.notice}`);
  return choice!.days;
}
/** Resolve a promised gift from a durable choice; no re-roll on load, and never twice. */
export function settleDailyGifts(w: World) {
  if (!w.player.alive) return;
  for (const e of w.events) {
    const d = e.daily;
    if (d?.giftDueDay === undefined || d.giftSentDay !== undefined || d.giftDueDay > w.day)
      continue;
    d.giftSentDay = w.day;
    const npc = actorById(w, d.target ?? "");
    if (!npc?.alive) continue;
    w.player.stones += B.actions.dailyEvents.giftStones;
    recordFact(
      w,
      "daily-gift",
      `${npc.name}托人送来 ${B.actions.dailyEvents.giftStones} 枚灵石，答谢那日赠药之情。`,
      ["PLAYER", npc.id],
    );
  }
}
/** One trial per eligible player day, after NPC activity; one unresolved choice at a time. */
export function rollDailyEvent(w: World, activity?: DailyActivity) {
  if (!activity || w.ended || w.battle || w.pendingDailyEventId) return;
  const cfg = B.actions.dailyEvents;
  if (random(w, "simulation", B.probabilityScaleBp) >= cfg[`${activity}Bp`]) return;
  const draw = random(w, "simulation", 100);
  const category =
    draw < cfg.categoryWeights.sighting
      ? "sighting"
      : draw < cfg.categoryWeights.sighting + cfg.categoryWeights.choice
        ? "choice"
        : "risk";
  if (
    category === "risk" &&
    (w.player.realm < cfg.riskMinRealm || locationKind(w.player.location) === "inn")
  )
    return;
  if (
    category !== "risk" &&
    activity === "train" &&
    inCave(w.player) &&
    B.cultivation.cave.blocksOrdinaryDailyEvents
  )
    return;
  const people = w.npcs
    .filter((a) => a.alive && !a.npcJourney && a.location === w.player.location)
    .sort((a, b) => a.id.localeCompare(b.id));
  const previous = w.events.findLast((e) => e.kind === "daily-event")?.daily?.nodeId;
  const pool = DAILY_EVENTS.filter(
    (n) =>
      n.category === category &&
      n.id !== previous &&
      (!n.requiresNpc || people.length) &&
      (w.dailyEventCooldowns[n.id] === undefined ||
        w.day - w.dailyEventCooldowns[n.id] >= n.cooldownDays),
  );
  if (!pool.length) return;
  const node = pool[random(w, "simulation", pool.length)];
  const target = node.requiresNpc ? people[random(w, "simulation", people.length)].id : undefined;
  w.contentState[node.id] = true;
  w.dailyEventCooldowns[node.id] = w.day;
  const text = `${node.title}：${node.body.replaceAll("{{npc}}", actorById(w, target ?? "")?.name ?? "行路人")}`;
  recordFact(w, "daily-event", text, ["PLAYER", ...(target ? [target] : [])]);
  w.events[w.events.length - 1].daily = { nodeId: node.id, ...(target ? { target } : {}) };
  if (node.choices.length) w.pendingDailyEventId = node.id;
  else effects(w, node.effects, target);
  w.notice = text;
}
export function waitReceipt(w: World) {
  const event = w.events.findLast((e) => e.day === w.day && e.kind === "daily-event");
  if (event) return event.text;
  const people = w.npcs
    .filter((a) => a.alive && a.location === w.player.location && !a.npcJourney)
    .sort((a, b) => a.id.localeCompare(b.id));
  const npc = people[w.day % Math.max(1, people.length)];
  return npc
    ? `${npc.name}今日${npc.activity || "在附近走动"}。你在此停留，记下沿途近况。`
    : "你在此停留，听风过树梢，整理今日行路的见闻。";
}
export function validateDailyState(w: World) {
  const pending: string[] = [];
  const latest = new Map<string, number>();
  for (const e of w.events) {
    if (e.daily === undefined) {
      requireRule(e.kind !== "daily-event", "日常事件缺少发生记录。");
      continue;
    }
    const d = e.daily,
      node = DAILY_EVENTS.find((n) => n.id === d.nodeId);
    requireRule(
      e.kind === "daily-event" && node && e.actors.includes("PLAYER"),
      "日常事件引用不合法。",
    );
    requireRule(
      Object.keys(d).every((k) =>
        ["nodeId", "target", "choiceId", "choiceDay", "giftDueDay", "giftSentDay"].includes(k),
      ),
      "日常事件字段不合法。",
    );
    requireRule(
      node!.requiresNpc
        ? !!d.target && e.actors.includes(d.target) && !!actorById(w, d.target)
        : d.target === undefined,
      "日常事件人物不合法。",
    );
    latest.set(d.nodeId, e.day);
    requireRule(w.contentState[d.nodeId] === true, "日常事件进度缺失。");
    if (node!.choices.length && d.choiceId === undefined) pending.push(d.nodeId);
    const choice = node!.choices.find((c) => c.id === d.choiceId);
    requireRule(
      d.choiceId === undefined
        ? d.choiceDay === undefined
        : choice &&
            Number.isSafeInteger(d.choiceDay) &&
            d.choiceDay! >= e.day &&
            d.choiceDay! <= w.day,
      "日常选择记录不合法。",
    );
    requireRule(
      choice?.gift
        ? d.giftDueDay === d.choiceDay! + B.actions.dailyEvents.giftDelayDays
        : d.giftDueDay === undefined,
      "赠礼约定不合法。",
    );
    requireRule(
      d.giftSentDay === undefined ||
        (d.giftDueDay !== undefined &&
          Number.isSafeInteger(d.giftSentDay) &&
          d.giftSentDay >= d.giftDueDay &&
          d.giftSentDay <= w.day),
      "赠礼日期不合法。",
    );
  }
  requireRule(
    pending.length <= 1 && (pending[0] ?? null) === w.pendingDailyEventId,
    "待回应事件与历程不符。",
  );
  requireRule(
    Object.keys(w.dailyEventCooldowns).length === latest.size &&
      [...latest].every(([id, day]) => w.dailyEventCooldowns[id] === day),
    "日常事件冷却与历程不符。",
  );
}
