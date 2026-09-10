import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createWorld, applyCommand } from "../lib/game/engine";
import { advanceRule, realmIndex, threshold } from "../lib/game/rules";
import { dailyReply } from "../tests/game/daily-test-helpers";
import type { Command, World } from "../lib/game/types";
const seed = 42;
export function metricsWorld(aptitude: number) {
  return createWorld(
    seed,
    {
      name: `资质${aptitude}`,
      sex: "female",
      aptitude,
      artifact: "ward",
      mode: "simple",
      appearance: { face: 0, hair: 0, color: 0 },
    },
    `metric:${aptitude}`,
    40,
  );
}
export function nextGrowthCommand(w: World): Command {
  const reply = dailyReply(w);
  if (reply) return reply;
  if (w.longAction) return { type: "step" };
  if (!w.player.manual)
    return w.player.location === "inn" ? { type: "learn" } : { type: "travel", to: "inn" };
  if (w.player.xp >= threshold(w.player))
    return advanceRule(w.player).kind === "minor"
      ? { type: "advanceMinor" }
      : { type: "breakthrough", usePill: false, guardian: false };
  return { type: "train", days: 7, stoneMethod: false, stopWhen: { kind: "cultivationReady" } };
}
export function grow(aptitude: number) {
  let w = metricsWorld(aptitude),
    commands = 0;
  const trace = [];
  while (w.player.realm < realmIndex("QI_3")) {
    assert.ok(commands < 100);
    const c = nextGrowthCommand(w);
    w = applyCommand(w, c, `metric:${++commands}`, w.revision);
    trace.push({ command: c, day: w.day, realm: w.player.realm, xp: w.player.xp });
  }
  return { world: w, aptitude, commands, days: w.day, trace };
}
export function dailySample() {
  let w = metricsWorld(90),
    commands = 0;
  while (w.day < 100 || dailyReply(w)) {
    const c: Command =
      dailyReply(w) ?? (w.longAction ? { type: "step" } : { type: "wait", days: 1 });
    w = applyCommand(w, c, `events:${++commands}`, w.revision);
  }
  const events = w.events.filter((e) => e.kind === "daily-event");
  return {
    seed,
    days: w.day,
    count: events.length,
    consecutiveRepeats: events.filter(
      (e, i) => i > 0 && e.daily!.nodeId === events[i - 1].daily!.nodeId,
    ).length,
    events: events.map((e) => ({ day: e.day, id: e.daily!.nodeId })),
  };
}
const low = grow(20),
  high = grow(90),
  daily = dailySample();
const difference = (low.days - high.days) / high.days;
const highReduction = (low.days - high.days) / low.days;
const report = {
  seed,
  artifact: "ward",
  method:
    "free 7-day cultivation stopped at readiness; decline optional daily choices; command count includes Worker step and event replies",
  low: { aptitude: 20, days: low.days, commands: low.commands, trace: low.trace },
  high: { aptitude: 90, days: high.days, commands: high.commands, trace: high.trace },
  lowAptitudeExtraDaysRatio: difference,
  highAptitudeDayReduction: highReduction,
  daily,
};
writeFileSync(
  process.argv[2] ?? "docs/reports/redesign-b-metrics.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    lowDays: low.days,
    highDays: high.days,
    highCommands: high.commands,
    lowAptitudeExtraDaysRatio: difference,
    highAptitudeDayReduction: highReduction,
    dailyCount: daily.count,
    consecutiveRepeats: daily.consecutiveRepeats,
  }),
);
assert.ok(high.commands <= 40);
assert.ok(difference >= 0.4);
assert.ok(daily.count >= 15);
assert.equal(daily.consecutiveRepeats, 0);
