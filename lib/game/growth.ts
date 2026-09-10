import { realmIndex, threshold } from "./rules";
import story from "../../content-packs/cultivation-sects/growth.json";
import { regionOf } from "./world-map";
import type { World } from "./types";
export function cultivationJourney(w: World) {
  const visited = w.events.some(
    (e) =>
      e.kind === "travel" &&
      e.actors.includes("PLAYER") &&
      e.location &&
      regionOf(e.location) !== "qingshi",
  );
  const complete = [
    w.player.manual,
    w.player.realm >= realmIndex("QI_1"),
    w.player.realm >= realmIndex("QI_3"),
    visited,
    !!w.player.sectMembership || w.player.realm >= realmIndex("QI_5"),
    w.player.realm >= realmIndex("QI_6"),
    // Generic companion trips belong to D; the reserved split agreement is their durable signal.
    w.agreement?.terms === "split" &&
      !!w.agreement.expeditionId &&
      ["fulfilled", "breached", "not_triggered"].includes(w.agreement.status),
    w.player.realm >= realmIndex("FOUNDATION_1") ||
      (w.player.realm === realmIndex("QI_9") && w.player.xp >= threshold(w.player)),
    w.player.realm >= realmIndex("FOUNDATION_1"),
  ];
  const steps = story.steps.map((s, i) => ({ ...s, done: complete[i] }));
  return {
    ...story,
    completionText: story.complete,
    steps,
    current: steps.find((s) => !s.done),
    complete: complete.every(Boolean),
  };
}
