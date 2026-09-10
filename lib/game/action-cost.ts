import { MAIN_STORY } from "./main-story";
import B from "./content/balance.json";
import { advanceRule } from "./rules";
import type { Command, LocationId, World } from "./types";
import { travelRoute } from "./world-map";
export function travelDays(from: LocationId, to: LocationId, w?: World) {
  // The expedition remains a separate command with its own encounter and settlement.
  if (from === "gate" && to === "ruins")
    return B.travel.routes.find((r) => r.from === "LOC_GATE" && r.to === "LOC_RUINS")!.days;
  return travelRoute(from, to, w)?.days ?? 0;
}
export function commandDays(world: World, command: Command): number {
  switch (command.type) {
    case "sectTask":
      return B.sects.taskDays;
    case "spendTime":
      return B.relationships.companionship.days;
    case "intimacy":
      return command.kind === "bond"
        ? 0
        : command.kind === "dual"
          ? B.relationships.companionship.dualDays
          : B.relationships.companionship.nightDays;
    case "surveyRuins":
      return MAIN_STORY.surveyDays;
    case "train":
    case "wait":
      return command.days;
    case "work":
      return B.actions.jobs[command.job ?? "chores"].days;
    case "rest":
      return B.actions.restDays;
    case "breakthrough":
      return advanceRule(world.player).days;
    case "travel":
      return travelDays(world.player.location, command.to, world);
    case "expedition":
      return travelDays("gate", "ruins");
    case "return":
      return B.travel.expeditionReturnDays;
    case "rally":
      return B.actions.rallyDays;
    default:
      return 0;
  }
}
