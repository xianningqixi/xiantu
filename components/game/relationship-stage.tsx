import { relationshipStage } from "@/lib/ui/relationship-stage";
import type { World } from "@/lib/game/types";
export function RelationshipStage({ world, id }: { world: World; id: string }) {
  const stage = relationshipStage(world, id);
  return (
    <span className="relationship-stage" aria-label={`关系阶段：${stage.label}`}>
      <span>{stage.attitude}</span>
      <span className="relationship-stage-track" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} className={i <= stage.step ? "reached" : ""} />
        ))}
      </span>
    </span>
  );
}
