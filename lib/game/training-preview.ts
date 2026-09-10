import { gainPerDay } from "./cultivation";
import { advanceRule, threshold } from "./rules";
import { STONE_METHOD } from "./economy";
import type { Command, World } from "./types";

/** Read-only preview; the command remains the only authority for world changes. */
export function trainingPreview(
  world: World,
  input: { days: number; mode: string; stone: boolean },
) {
  const player = world.player;
  const maxDays = input.mode === "ready" ? 30 : input.days;
  const full = player.xp >= threshold(player);
  const command: Command = {
    type: "train",
    days: maxDays,
    stoneMethod: input.stone,
    stopWhen: { kind: input.mode === "important" ? "importantEvent" : "cultivationReady" },
  };
  const stoneBudget = input.stone ? maxDays * STONE_METHOD.costSpiritStonesPerDay : 0;
  const projected = { ...player };
  let readyAfter = 0;
  while (
    readyAfter < 365 &&
    advanceRule(projected).kind !== "cap" &&
    projected.xp < threshold(projected)
  ) {
    projected.xp = Math.min(
      threshold(projected),
      projected.xp + gainPerDay(world, projected, input.stone),
    );
    readyAfter++;
  }
  const reason =
    advanceRule(player).kind === "cap"
      ? "本版修行已至筑基后期，可继续远行、访友或研习宗门心法。"
      : full
        ? "修为已圆满，请先尝试突破；若只想度过时间，可选择等候。"
        : !player.manual
          ? "先到客栈领取并学习入门功法。"
          : player.location === "ruins"
            ? "请先离开秘境再静修。"
            : world.longAction
              ? "请先暂停并结束当前行动。"
              : world.battle
                ? "请先结束当前战斗。"
                : world.ended
                  ? "此生已结束，可回看经历。"
                  : player.stones < stoneBudget
                    ? `最多 ${maxDays} 日需备足 ${stoneBudget} 灵石，当前 ${player.stones}；实际按已修炼日数扣除。`
                    : "";
  return {
    command,
    maxDays,
    stoneBudget,
    readyAfter,
    full,
    reason,
    stopLabel: input.mode === "important" ? "得知重要事件或修为圆满即停" : "修为圆满即停",
  };
}
