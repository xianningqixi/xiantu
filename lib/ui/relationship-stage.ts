import { B } from "@/lib/game/rules";
import { relation } from "@/lib/game/relationships";
import { relationshipDisplay } from "./character-presentation";
import type { World } from "@/lib/game/types";
export function relationshipStage(w: World, id: string) {
  const edge = relation(w, id),
    display = relationshipDisplay(w, "PLAYER", id),
    friend = B.relationships.friendThresholds,
    close = B.relationships.closeFriendThresholds;
  const step = display.bonded
    ? 4
    : !edge?.known
      ? 0
      : edge.favor >= close.favorabilityMin &&
          edge.trust >= close.trustMin &&
          new Set(edge.memories).size >= close.distinctSharedExperienceCountMin
        ? 3
        : edge.favor >= friend.favorabilityMin && edge.trust >= friend.trustMin
          ? 2
          : 1;
  return { step, label: ["陌生", "相识", "朋友", "挚友", "道侣"][step], attitude: display.label };
}
