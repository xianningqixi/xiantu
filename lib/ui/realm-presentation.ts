import { advanceRule, B, REALM_KEYS, threshold } from "@/lib/game/rules";
import { REALMS } from "@/lib/game/content/official";
import { gainPerDay } from "@/lib/game/cultivation";
import { STONE_METHOD } from "@/lib/game/economy";
import type { Actor, Command, World } from "@/lib/game/types";

/** Display rules follow the configured advancement kind, never numeric realm indices. */
export function realmPresentation(actor: Actor) {
  const rule = advanceRule(actor);
  const kind = rule.kind;
  const target = rule.targetRealm
    ? REALMS[REALM_KEYS.findIndex((key) => key === rule.targetRealm)]
    : undefined;
  return {
    rule,
    kind,
    target,
    capped: kind === "cap",
    ready: actor.xp >= threshold(actor),
    preparation: kind === "major",
    canAdvance: kind === "minor" && actor.xp >= threshold(actor),
    canBreak: actor.xp >= threshold(actor) && rule.days > 0 && !!rule.targetRealm,
  };
}
export function practicePreview(w: World, days = 1, stone = false, important = false) {
  const state = realmPresentation(w.player);
  const command: Command = {
    type: "train",
    days,
    stoneMethod: stone,
    stopWhen: { kind: important ? "importantEvent" : "cultivationReady" },
  };
  const budget = stone ? days * STONE_METHOD.costSpiritStonesPerDay : 0;
  const reason = w.ended
    ? "此生已结束，可回看经历。"
    : w.battle
      ? "请先结束当前战斗。"
      : w.longAction
        ? "请先结束当前行动。"
        : w.player.location === "ruins"
          ? "请先离开秘境再静修。"
          : !w.player.manual
            ? "先领取并学习入门功法。"
            : state.capped
              ? "本版境界已至终点，可继续远行与访友。"
              : state.ready && !state.capped
                ? "修为已圆满，请先尝试突破。"
                : w.player.stones < budget
                  ? `最多 ${days} 日需备足 ${budget} 灵石。`
                  : "";
  return {
    command,
    reason,
    budget,
    gain: gainPerDay(w, w.player, stone),
    readyAfter: Math.ceil(
      Math.max(0, threshold(w.player) - w.player.xp) / gainPerDay(w, w.player, stone),
    ),
  };
}
