import B from "./content/balance.json";
import { advanceRule } from "./rules";
import type { Command, LocationId, World } from "./types";
export function travelDays(from: LocationId, to: LocationId) {
  const ids = { market: "LOC_MARKET", inn: "LOC_INN", gate: "LOC_GATE", ruins: "LOC_RUINS" };
  return (
    B.travel.routes.find(
      (r) =>
        (r.from === ids[from] && r.to === ids[to]) ||
        (r.bidirectional && r.from === ids[to] && r.to === ids[from]),
    )?.days ?? 0
  );
}
export function commandDays(world: World, command: Command): number {
  switch (command.type) {
    case "train":
    case "wait":
      return command.days;
    case "work":
      return B.actions.workDays;
    case "rest":
      return B.actions.restDays;
    case "breakthrough":
      return advanceRule(world.player).days;
    case "travel":
      return travelDays(world.player.location, command.to);
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
