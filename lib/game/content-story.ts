import { realmGateIndex } from "./rules";
import { mainScene, mainChapters, mainEvent } from "./main-story";
import { selectedExtensions } from "./content/extensions";
import { intimacyHistory } from "./intimacy";
import { intimacyKind } from "./intimacy-history";
import type { World } from "./types";
import { chapterWaitDays, expeditionCount } from "./world-map";
const person = (w: World, id: string) =>
  id === "PLAYER" ? w.player : w.npcs.find((a) => a.id === id);
/** 规则层允许同屏的最大旁支数；UI 按屏幕宽度再往下取。 */
export const SCENE_LIMIT = 4;
export function extensionScenes(w: World, limit = SCENE_LIMIT) {
  if (w.pendingDailyEventId) return [];
  if (w.ended || w.battle || w.loot || w.longAction) return [];
  const scenes = selectedExtensions(w.contentLocks)
    .flatMap(({ data, lock }) => {
      if (
        data.journey &&
        (w.player.realm < realmGateIndex(data.journey.minRealm) || chapterWaitDays(w, data) > 0)
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
        "player.grass": w.player.grass,
        "player.healing": w.player.healing,
        "player.insight": w.player.insight,
        "player.manual": w.player.manual,
        "player.realm": w.player.realm,
        "player.expeditions": expeditionCount(w),
        "player.partner": intimacyHistory(w, "PLAYER").some((e) => intimacyKind(w, e) === "bond"),
        "official.outcome": w.story.outcome,
      };
      // 本包既写也会读自己的字段；reads 是别的卷的进度，只读。
      for (const key of [...data.manifest.flags, ...(data.manifest.reads ?? [])])
        f[`flag.${key}`] = !!w.contentState[key];
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
          [`actor.${id}.favor`]: r?.favor ?? 0,
          [`actor.${id}.attraction`]: r?.attraction ?? 0,
          [`actor.${id}.realm`]: a?.realm ?? 0,
          [`actor.${id}.grievance`]: !!r?.grievance,
        });
      }
      // 同一个包里有多位女主，每人各留一条最靠前的可用节点，不能只取一条。
      const candidates = [...data.storylets]
        .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
        .filter(
          (n) =>
            !w.contentState[n.id] &&
            w.player.realm >= realmGateIndex(n.minRealm ?? 0) &&
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
      if (!candidates.length) return [];
      const owners = new Set<string>();
      const picked = candidates.filter((n) => {
        const owner = n.participants[0] ?? data.manifest.packId;
        if (owners.has(owner)) return false;
        owners.add(owner);
        return true;
      });
      const fill = (text: string) =>
        text.replace(
          /\{\{([^{}]+)\.name\}\}/g,
          (_, id: string) => person(w, id === "player" ? "PLAYER" : id)?.name ?? "故人",
        );
      return picked.map((node) => ({
        ...node,
        packId: data.manifest.packId,
        lock,
        body: fill(node.body),
        explicit: node.explicit ? fill(node.explicit) : undefined,
        quote: node.quote ? fill(node.quote) : undefined,
        choices: node.choices.map((c) => ({
          ...c,
          label: fill(c.label),
          reply: fill(c.reply),
          effects: c.effects.map((e) =>
            e.kind === "experience" ? { ...e, text: fill(e.text) } : e,
          ),
        })),
      }));
    })
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return spreadScenes(scenes, limit);
}

/** Keep the stage varied: one scene per person first, then top up with the rest. */
export function spreadScenes<
  T extends { participants: string[]; packId?: string; id: string; priority: number },
>(scenes: T[], limit: number): T[] {
  const owner = (n: T) => n.participants[0] ?? n.packId ?? n.id;
  const picked: T[] = [];
  const taken = new Set<string>();
  for (const scene of scenes) {
    if (picked.length >= limit) break;
    if (taken.has(owner(scene))) continue;
    taken.add(owner(scene));
    picked.push(scene);
  }
  for (const scene of scenes)
    picked.length < limit && !picked.includes(scene) && picked.push(scene);
  return picked.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}
