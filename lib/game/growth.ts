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
    w.player.realm >= 1,
    visited,
    !!w.player.sectMembership?.artLearned || w.player.realm >= 3,
    w.player.realm >= 4,
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
