import { EXTENSIONS } from "./content/extensions";
import type { World, WorldEvent } from "./types";
type Kind = "bond" | "night" | "dual";
const stages: Record<string, Kind> = { vow: "bond", night: "night", dual: "dual" };
const nodes = new Map(
  EXTENSIONS.flatMap(({ data }) =>
    data.storylets.flatMap((n) => {
      const stage = stages[n.id.split(".").at(-1)!];
      if (!n.id.startsWith("shichai.") || !stage) return [];
      const choices = n.choices.filter((c) => c.effects.some((e) => e.kind === "experience"));
      return [
        [
          n.id,
          {
            kind: stage,
            choices: new Set(choices.map((c) => c.id)),
            targets: new Set(
              choices.flatMap((c) =>
                c.effects.flatMap((e) => (e.kind === "experience" ? [e.target] : [])),
              ),
            ),
          },
        ] as const,
      ];
    }),
  ),
);
export const storyIntimacyKind = (nodeId: string, choiceId: string) => {
  const entry = nodes.get(nodeId);
  return entry?.choices.has(choiceId) ? entry.kind : undefined;
};
const indexes = new WeakMap<World, { count: number; kinds: Map<string, Kind> }>();
/** Existing authored experiences are classified for viewing, without rewriting old consent or facts.
 * A story view or a declined choice is not evidence; only the persisted experience followed by
 * its matching authored choice event qualifies. */
export function intimacyKind(w: World, e: WorldEvent): Kind | undefined {
  if (e.intimacy) return e.intimacy.kind;
  let index = indexes.get(w);
  if (!index || index.count !== w.events.length) {
    const kinds = new Map<string, Kind>();
    w.events.forEach((event, i) => {
      if (event.kind !== "shared-experience" || event.actors.length !== 2) return;
      const story = w.events[i + 1],
        entry = nodes.get(story?.storyNodeId ?? "");
      if (
        entry &&
        story.kind === "story-choice" &&
        story.day === event.day &&
        event.actors.includes("PLAYER") &&
        event.actors.some((id) => entry.targets.has(id))
      )
        kinds.set(event.id, entry.kind);
    });
    index = { count: w.events.length, kinds };
    indexes.set(w, index);
  }
  return index.kinds.get(e.id);
}

export const isIntimacyStoryEvent = (e: WorldEvent) => !!e.storyNodeId && nodes.has(e.storyNodeId);
