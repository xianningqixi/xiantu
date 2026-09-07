import { createHash } from "node:crypto";
import type { World } from "../../lib/game/types";
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
// Compare equivalent elapsed time with different user-selected action grouping.
// UI completion prose is different for 30x1-day vs 1x30-day training; its
// train/wait facts, corresponding knowledge and notice are not gameplay effects.
// Important facts and every reference are retained under content-based aliases.
export function simulationFingerprint(world: World): string {
  const { saveId, revision, commandReceipts, appliedCommands, notice, ...state } = world;
  const events = world.events.filter((e) => !["train", "wait"].includes(e.kind));
  const aliases = new Map(
    events.map(({ id, ...event }) => [
      id,
      createHash("sha256").update(canonicalJson(event)).digest("hex"),
    ]),
  );
  const replace = (value: unknown): unknown => {
    if (typeof value === "string") return aliases.get(value) ?? value;
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === "object")
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, replace(v)]));
    return value;
  };
  return createHash("sha256")
    .update(
      canonicalJson(
        replace({
          ...state,
          events,
          knowledge: world.knowledge.filter((k) => aliases.has(k.eventId)),
        }),
      ),
    )
    .digest("hex");
}
