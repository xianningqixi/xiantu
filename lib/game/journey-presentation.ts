import { dailyOccurrence } from "./daily-events";
import { realmIndex } from "./rules";
import {
  mainScene,
  mainChapters,
  mainEvent,
  currentMainStep,
  hasRubbing,
} from "@/lib/game/main-story";
import { extensionScenes } from "@/lib/game/content-story";
import { scene } from "@/lib/game/story";
import { PACK, REALMS } from "@/lib/game/content/official";
import { partyReadiness, departureStatus } from "@/lib/game/agreement";
import { LOCATIONS, regionOf, chapterWaitDays } from "@/lib/game/world-map";
import { CAMPAIGN_VOLUMES } from "@/lib/game/campaign-content";
import type { World, LocationId } from "@/lib/game/types";
export function journeyContext(w: World) {
  const main = mainScene(w),
    side = extensionScenes(w)[0],
    official = w.ended ? undefined : scene(w);
  const participants =
    main?.participants ??
    side?.participants ??
    (w.pendingDailyEventId
      ? [dailyOccurrence(w)?.daily?.target].filter((id): id is string => !!id)
      : official
        ? [PACK.roles.primary]
        : []);
  const actor = w.npcs.find(
    (a) =>
      participants.includes(a.id) && a.alive && !a.npcJourney && a.location === w.player.location,
  );
  return {
    main,
    side,
    official,
    participants,
    actor,
    title: main?.title ?? side?.title ?? official?.title,
    actionable: !!(main?.choices.length || side?.choices.length || official?.choices.length),
    anchor: main ? "main-story-scene" : "current-scene",
    displayName:
      actor?.id === PACK.roles.primary && !w.story.flags.met ? "青白衣衫的女修" : actor?.name,
  };
}
export function companionStatus(w: World) {
  const agreement = w.agreement;
  if (!agreement) return null;
  if (w.loot) return { title: "同行 · 分配战利品", text: "返回坊市后履行约定，完成本次同行。" };
  if (agreement.status === "active")
    return { title: "同行 · 探险途中", text: "战斗结束后带着战利品返回坊市。" };
  if (agreement.status === "accepted") {
    if (w.player.realm < realmIndex("QI_1"))
      return { title: "同行 · 约定已立", text: "先修至炼气，再与同伴会合。" };
    if (w.party.length < 3) {
      const r = partyReadiness(w);
      return { title: "同行 · 待会合", text: r.ready ? "二人已经在场，可以邀请同行。" : r.reason };
    }
    const d = departureStatus(w);
    return {
      title: "同行 · 三人已齐",
      text:
        w.player.location !== "gate"
          ? "前往山门古道，检查路费后进入秘境。"
          : d.ready
            ? "准备齐全，可以进入残碑秘境。"
            : d.reason,
    };
  }
  return {
    title: "同行 · 本次已了结",
    text:
      agreement.status === "not_triggered"
        ? "本次未取得药草，赠草义务已了结，已付路费不退。回青石坊市可再次商议。"
        : "本次约定已结束，可查看经历与再次邀约的条件。",
  };
}
export function localChapterStatus(w: World) {
  const chapters = mainChapters(w),
    chapter = chapters.find((c) => Object.values(c.sites).includes(w.player.location));
  if (!chapter || !w.campaignLock) return null;
  const done = mainEvent(w, chapter.discovery.id),
    dialogue = mainEvent(w, chapter.dialogue.id);
  const previous = chapters[chapters.indexOf(chapter) - 1];
  const volume = CAMPAIGN_VOLUMES.find((v) => v.chapter.id === chapter.id)?.entry;
  const missing: string[] = [];
  if (previous && !mainEvent(w, previous.discovery.id))
    missing.push(`先查明${previous.regionName}的线索：${previous.discovery.title}`);
  if (w.player.realm < chapter.minRealm)
    missing.push(`境界达到${REALMS[chapter.minRealm]}（当前${REALMS[w.player.realm]}）`);
  const intro = volume?.data.journey;
  if (intro && !w.contentState[intro.introId]) {
    missing.push(
      `到${LOCATIONS[chapter.sites.inn as LocationId].name}阅读${chapter.volumeTitle}卷首`,
    );
    const days = chapterWaitDays(w, volume!.data);
    if (days) missing.push(`本卷开启还需经过${days}日`);
  } else if (!done) {
    if (!hasRubbing(w)) missing.push("先在山门古道勘察残碑，取得水纹拓片");
    const step = currentMainStep(w);
    if (step?.chapter.id === chapter.id) {
      if (step.waitDays) missing.push(`线索推进还需经过${step.waitDays}日`);
      if (step.location !== w.player.location)
        missing.push(
          `到${LOCATIONS[step.location].name}${step.fallback ? "查阅留存记录" : "查访"}`,
        );
      if (
        step.guide &&
        (step.guide.location !== step.location || step.guide.attempt || step.guide.npcJourney)
      )
        missing.push(`${step.guide.name}尚未在${LOCATIONS[step.location].name}空闲下来`);
    }
  }
  return { chapter, done, dialogue, missing };
}
