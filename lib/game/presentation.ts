import presentation from "../../content-packs/official-qingshi/ui-presentation.json";
import B from "./content/balance.json";
import { PACK, contentText } from "./content/official";
import type { World } from "./types";
function at(value: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (current, key) =>
        current && typeof current === "object" && Object.hasOwn(current, key)
          ? (current as Record<string, unknown>)[key]
          : undefined,
      value,
    );
}
export function objective(world: World) {
  const context = {
    ...world,
    primaryPresent: world.npcs.some(
      (a) => a.id === PACK.roles.primary && a.alive && a.location === world.player.location,
    ),
  };
  const entry = presentation.objectives.find((entry) =>
    Object.entries(entry.when).every(([path, expected]) => {
      const value = at(context, path);
      return expected === "present"
        ? value != null
        : Array.isArray(expected)
          ? expected.includes(value as string)
          : typeof expected === "boolean"
            ? Boolean(value) === expected
            : value === expected;
    }),
  )!;
  const format = (text: string) =>
    contentText(
      text.replace(/\{\{balance\.([^{}]+)\}\}/g, (_, path: string) => String(at(B, path) ?? "")),
      world,
    );
  return { ...entry, title: format(entry.title), text: format(entry.text) };
}
