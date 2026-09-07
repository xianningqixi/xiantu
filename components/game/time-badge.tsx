import { commandDays } from "@/lib/game/action-cost";
import type { Command, World } from "@/lib/game/types";
export function TimeBadge({ world, command }: { world: World; command: Command }) {
  const days = commandDays(world, command);
  return (
    <span className="time-badge">
      {days ? `${days} 日` : command.type === "battle" ? "1 回合" : "即刻"}
    </span>
  );
}
