import { dailyScene } from "./daily-events";
import { PACK, STORY, contentText } from "./content/official";
import type { StoryNode, World } from "./types";
import { knownEvents } from "./knowledge";
import { actorById, B } from "./rules";
import { relation } from "./relationships";
import { canInvite } from "./agreement";

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
  if (w.pendingDailyEventId) return dailyScene(w);
  if (w.battle || w.loot || w.longAction) return undefined;
  const f = facts(w);
  const n = STORY.find(
    (n) =>
      // A terminal agreement is still evidence that the first invitation happened.
      // Repeat expeditions start through an explicit renewal, including in old saves.
      (n.id !== "agreement" || !w.agreement) &&
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

export function visibleEvents(w: World) {
  return knownEvents(w);
}

export function knownNpcUpdates(w: World) {
  const events = knownEvents(w).filter(
    (e) =>
      e.day >= w.day - B.world.npcLife.newsDays &&
      !e.actors.includes("PLAYER") &&
      e.actors.some((id) => relation(w, id)?.known),
  );
  const milestones = events
    .filter((e) => ["npc-friendship", "sect-join", "sect-art"].includes(e.kind))
    .slice(-3);
  return [
    ...events
      .filter((e) => !milestones.includes(e))
      .slice(-(B.world.npcLife.newsLimit - milestones.length)),
    ...milestones,
  ].sort((a, b) => a.day - b.day);
}
