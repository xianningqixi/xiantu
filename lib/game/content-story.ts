import { legacyRealmIndex } from "./rules";
import { mainScene, mainChapters, mainEvent } from "./main-story";
import { selectedExtensions } from "./content/extensions";
import type { World } from "./types";
import { chapterWaitDays, expeditionCount } from "./world-map";
const person = (w: World, id: string) =>
  id === "PLAYER" ? w.player : w.npcs.find((a) => a.id === id);
export function extensionScenes(w: World) {
  if (w.ended || w.battle || w.loot || w.longAction || mainScene(w)) return [];
  return selectedExtensions(w.contentLocks)
    .flatMap(({ data, lock }) => {
      if (
        data.journey &&
        (w.player.realm < legacyRealmIndex(data.journey.minRealm) || chapterWaitDays(w, data) > 0)
      )
        return [];
      // Roads are open, but the story still needs the evidence that used to gate entry.
      if (data.journey && w.campaignLock) {
        const chapters = mainChapters(w);
        const index = chapters.findIndex((c) => c.volumePackId === data.manifest.packId);
        if (index > 0 && !mainEvent(w, chapters[index - 1].discovery.id)) return [];
      }
      const f: Record<string, string | number | boolean> = {
        location: w.player.location,
        "player.stones": w.player.stones,
        "player.manual": w.player.manual,
        "player.realm": w.player.realm,
        "player.expeditions": expeditionCount(w),
        "official.outcome": w.story.outcome,
      };
      for (const key of data.manifest.flags) f[`flag.${key}`] = !!w.contentState[key];
      for (const id of [
        ...data.manifest.references,
        ...data.definitions.characters.map((a) => a.id),
      ]) {
        const a = person(w, id);
        const r = w.relations.find((r) => r.from === id && r.to === "PLAYER");
        Object.assign(f, {
          [`actor.${id}.present`]: !!a?.alive && a.location === w.player.location,
          [`actor.${id}.alive`]: !!a?.alive,
          [`actor.${id}.known`]: !!r?.known,
          [`actor.${id}.trust`]: r?.trust ?? 0,
        });
      }
      const node = [...data.storylets]
        .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
        .find(
          (n) =>
            !w.contentState[n.id] &&
            w.player.realm >= legacyRealmIndex(n.minRealm ?? 0) &&
            (!data.journey ||
              n.id === data.journey.introId ||
              w.contentState[data.journey.introId]) &&
            n.participants.every((id) => f[`actor.${id}.present`]) &&
            n.conditions.every((c) =>
              c.op === "eq"
                ? f[c.fact] === c.value
                : typeof f[c.fact] === "number" && Number(f[c.fact]) >= Number(c.value),
            ),
        );
      if (!node) return [];
      const fill = (text: string) =>
        text.replace(
          /\{\{([^{}]+)\.name\}\}/g,
          (_, id: string) => person(w, id === "player" ? "PLAYER" : id)?.name ?? "故人",
        );
      return [
        {
          ...node,
          packId: data.manifest.packId,
          lock,
          body: fill(node.body),
          quote: node.quote ? fill(node.quote) : undefined,
          choices: node.choices.map((c) => ({
            ...c,
            label: fill(c.label),
            reply: fill(c.reply),
            effects: c.effects.map((e) =>
              e.kind === "experience" ? { ...e, text: fill(e.text) } : e,
            ),
          })),
        },
      ];
    })
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
    .slice(0, 1);
}
