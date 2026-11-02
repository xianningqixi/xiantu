import { applyCommand } from "../../lib/game/engine";
import { DAILY_EVENTS } from "../../lib/game/daily-events";
import type { Command, World } from "../../lib/game/types";
/** First affordable option of an interruption; sighting nodes carry none. */
export function dailyChoiceId(
  id: string | undefined,
  w?: { stones: number; grass: number; healing: number; insight: number },
): string | null {
  const n = DAILY_EVENTS.find((n) => n.id === id);
  if (!n || n.category === "sighting") return null;
  const cost = (c: (typeof n.choices)[number], kind: string) =>
    c.effects.filter((e) => e.kind === kind).reduce((total, e) => total + (e.value ?? 0), 0);
  const affordable = (c: (typeof n.choices)[number]) =>
    !w ||
    (["stones", "grass", "healing", "insight"] as const).every(
      (k) => (w[k] ?? 0) + cost(c, k) >= 0,
    );
  return (n.choices.find(affordable) ?? n.choices[0]).id;
}
/** Unrelated scenario tests still resolve new interruptions through actual commands. */
export function dailyReply(w: World): Command | null {
  if (!w.pendingDailyEventId || w.longAction?.kind === "breakthrough") return null;
  const choiceId = dailyChoiceId(w.pendingDailyEventId, w.player);
  return choiceId ? { type: "choose", nodeId: w.pendingDailyEventId, choiceId } : null;
}
export function answerDaily(w: World): World {
  const reply = dailyReply(w);
  return reply ? applyCommand(w, reply, `daily-test:${w.revision}`, w.revision) : w;
}
