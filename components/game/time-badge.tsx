import { commandDays } from "@/lib/game/action-cost";
import type { Command, World } from "@/lib/game/types";
export function TimeBadge({ world, command }: { world: World; command?: Command }) {
  if (!command) return null;
  const days = commandDays(world, command);
  return (
    <span className="time-badge" title={days ? "行动完成后保存" : "不推进游戏日；操作结果仍会保存"}>
      {days ? `${days} 日` : command?.type === "battle" ? "1 回合" : "即刻"}
    </span>
  );
}
