import { applyCommand } from "../../lib/game/engine";
import { DAILY_EVENTS } from "../../lib/game/daily-events";
import type { Command, World } from "../../lib/game/types";
/** Unrelated scenario tests still resolve new interruptions through actual commands. */
export function dailyReply(w: World): Command | null {
  if (!w.pendingDailyEventId || w.longAction?.kind === "breakthrough") return null;
  const n = DAILY_EVENTS.find((n) => n.id === w.pendingDailyEventId)!;
  return { type: "choose", nodeId: n.id, choiceId: n.category === "risk" ? "face" : "decline" };
}
export function answerDaily(w: World): World {
  const reply = dailyReply(w);
  return reply ? applyCommand(w, reply, `daily-test:${w.revision}`, w.revision) : w;
}
