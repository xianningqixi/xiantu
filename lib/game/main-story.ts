import { REALMS } from "./content/official";
import registry from "./content/main-story.json";
import { selectedExtensions } from "./content/extensions";
import { CAMPAIGN_VOLUMES } from "./campaign-content";
import type { LocationId, World, WorldEvent } from "./types";
export const MAIN_STORY = registry.data;
export const MAIN_STORY_LOCK = registry.lock;
export type MainChapter = (typeof MAIN_STORY.chapters)[number];
export function mainChapters(w: World) {
  const packs = new Set(selectedExtensions(w.contentLocks).map((e) => e.data.manifest.packId));
  return MAIN_STORY.chapters.filter((c) => !c.packId || packs.has(c.packId));
}
export function mainEvent(w: World, id: string) {
  return w.events.find((e) => e.mainStory?.nodeId === id);
}
export function hasRubbing(w: World) {
  return (
    w.events.some((e) => e.kind === "survey" && e.actors.includes("PLAYER")) ||
    (w.story.settledDay !== null &&
      w.events.some((e) => e.kind === "expedition" && e.actors.includes("PLAYER")))
  );
}
export function mainProgress(w: World) {
  const chapters = mainChapters(w);
  return chapters.map((chapter) => ({ chapter, done: !!mainEvent(w, chapter.discovery.id) }));
}
export function currentMainStep(w: World) {
  const chapters = mainChapters(w);
  const chapter = chapters.find((c) => !mainEvent(w, c.discovery.id));
  if (!chapter) return null;
  const volume = CAMPAIGN_VOLUMES.find((v) => v.chapter.id === chapter.id)?.entry;
  const introPending =
    !!volume &&
    w.contentLocks.includes(volume.lock) &&
    !w.contentState[volume.data.journey!.introId];
  const dialogue = mainEvent(w, chapter.dialogue.id);
  const guide = w.npcs.find((a) => a.id === chapter.guide);
  const fallback = !guide?.alive;
  const site = dialogue ? chapter.discovery.site : fallback ? "inn" : chapter.guideSite;
  const location = chapter.sites[site as keyof typeof chapter.sites] as LocationId;
  const next = chapters[chapters.indexOf(chapter) + 1];
  const lastArrival = w.events.find(
    (e) =>
      e.kind === "travel" &&
      e.actors.includes("PLAYER") &&
      Object.values(chapter.sites).includes(e.location ?? ""),
  );
  const firstEvidence = w.events.find((e) => e.kind === "survey" && e.actors.includes("PLAYER"));
  const earliest = dialogue
    ? dialogue.day + MAIN_STORY.intervalDays
    : chapter.id === "qingshi"
      ? (firstEvidence?.day ?? w.story.settledDay ?? w.day) + 1
      : (lastArrival?.day ?? 0) + chapter.arrivalDelay;
  const waitDays = Math.max(0, earliest - w.day);
  const sameRegion = Object.values(chapter.sites).includes(w.player.location);
  const ready =
    !!w.campaignLock &&
    !introPending &&
    hasRubbing(w) &&
    w.player.realm >= chapter.minRealm &&
    !waitDays &&
    w.player.location === location &&
    (dialogue || fallback || (guide?.location === location && !guide.attempt)) &&
    !w.ended &&
    !w.longAction &&
    !w.battle &&
    !w.loot;
  const fill = (text: string) =>
    text
      .replaceAll("{{guide}}", guide?.name ?? "旧日行路人")
      .replaceAll("{{nextRegion}}", next?.regionName ?? "更远的山河");
  const title = dialogue ? chapter.discovery.title : chapter.dialogue.title;
  const body = fill(
    dialogue
      ? chapter.discovery.body
      : fallback
        ? chapter.dialogue.fallbackBody
        : chapter.dialogue.body,
  );
  const choices = dialogue
    ? chapter.discovery.choices
    : [{ id: "listen", label: chapter.dialogue.choice, reply: chapter.dialogue.reply }];
  return {
    chapter,
    volume,
    introPending,
    title,
    location,
    sameRegion,
    guide: !dialogue && !fallback ? guide : null,
    fallback,
    waitDays,
    ready: !!ready,
    id: dialogue ? chapter.discovery.id : chapter.dialogue.id,
    body,
    choices: choices.map((c) => ({ ...c, reply: fill(c.reply) })),
    participants: !dialogue && !fallback ? [chapter.guide] : [],
    place: dialogue ? chapter.discovery.place : fallback ? "当地客舍" : chapter.guidePlace,
  };
}
export function mainScene(w: World) {
  const step = currentMainStep(w);
  return step?.ready ? step : null;
}
export function mainObjective(w: World) {
  if (
    !w.campaignLock ||
    w.battle ||
    w.loot ||
    w.longAction ||
    !w.player.manual ||
    w.player.realm < 1
  )
    return null;
  const step = currentMainStep(w);
  if (step?.introPending && step.sameRegion && w.player.realm >= step.chapter.minRealm)
    return {
      title: `主线 · ${step.chapter.volumeTitle}`,
      text: step.chapter.volumeLead,
      tab: "journey",
      anchor: w.player.location === step.chapter.sites.inn ? "current-scene" : "world-map",
      location: step.chapter.sites.inn as LocationId,
    };
  if (!hasRubbing(w))
    return {
      title: "主线 · 寻访残碑",
      text: "到山门古道勘察残碑，取得水纹拓片；也可以与林晚、周安结伴进入秘境，归来后再调查。",
      tab: "journey",
      anchor: "world-map",
      location: "gate" as LocationId,
    };
  if (!step)
    return {
      title: "残碑寻源 · 此行已了",
      text: "查证经过与最后的选择已记入历程。你可以继续修行、回访故人，探索当地尚未发生的故事。",
      tab: "journey",
      anchor: "world-map",
    };
  if (w.player.realm < step.chapter.minRealm)
    return {
      title: `${step.chapter.regionName}的旧事尚待机缘`,
      text: `各地都可自由前往；这段人物剧情需达到${REALMS[step.chapter.minRealm]}后触发。主线线索会为你保留。`,
      tab: "cultivation",
      anchor: "practice-start",
    };
  if (!step.sameRegion)
    return {
      title: `主线 · 前往${step.chapter.regionName}`,
      text: "在大地图选择目的地即可启程。抵达后，满足条件的人物故事才会展开。",
      tab: "journey",
      anchor: "world-map",
    };
  const wait = step.waitDays ? `还需经过 ${step.waitDays} 日。` : "";
  const person = step.guide
    ? `寻找${step.guide.name}，当面谈谈线索。${step.guide.location !== step.location ? "对方尚未到常驻处，可先修炼或等候。" : ""}`
    : "核对留下的记录。";
  return {
    title: `主线 · ${step.title}`,
    text: step.ready ? `线索已就绪，就在此处继续查证。` : `前往${step.place}。${wait}${person}`,
    tab: "journey",
    anchor: step.ready ? "main-story-scene" : "world-map",
    location: step.location,
  };
}
export function validateMainHistory(w: World, check: (ok: unknown, reason: string) => void) {
  check(w.campaignLock === MAIN_STORY_LOCK, "主线内容版本不匹配，原档已保留。");
  const records = w.events.filter((e) => e.mainStory !== undefined);
  for (const e of records)
    check(
      e.mainStory &&
        typeof e.mainStory === "object" &&
        typeof e.mainStory.nodeId === "string" &&
        typeof e.mainStory.choiceId === "string",
      "主线记录格式不合法。",
    );
  check(
    w.events.every((e) => e.kind !== "main-story" || e.mainStory !== undefined),
    "主线事件缺少节点记录。",
  );
  check(
    new Set(records.map((e) => e.mainStory!.nodeId)).size === records.length,
    "主线节点重复领取。",
  );
  const chapters = mainChapters(w);
  const legacy = w.campaignHistory;
  if (legacy !== undefined) {
    check(
      legacy &&
        typeof legacy === "object" &&
        Number.isSafeInteger(legacy.eventCount) &&
        legacy.eventCount >= 0 &&
        legacy.eventCount <= w.events.length &&
        Array.isArray(legacy.chapters) &&
        legacy.chapters[0] === "qingshi" &&
        new Set(legacy.chapters).size === legacy.chapters.length &&
        legacy.chapters.every(
          (id, i) =>
            chapters.some((c) => c.id === id) &&
            (i === 0 ||
              chapters.findIndex((c) => c.id === id) >
                chapters.findIndex((c) => c.id === legacy.chapters[i - 1])),
        ),
      "旧主线接续记录不合法。",
    );
    check(
      w.events
        .slice(0, legacy.eventCount)
        .every(
          (e) =>
            !e.mainStory ||
            chapters.some(
              (c) =>
                legacy.chapters.includes(c.id) &&
                [c.dialogue.id, c.discovery.id].includes(e.mainStory!.nodeId),
            ),
        ),
      "旧主线记录超出原章节范围。",
    );
  }
  for (const chapter of chapters) {
    const dialogue = mainEvent(w, chapter.dialogue.id),
      discovery = mainEvent(w, chapter.discovery.id);
    for (const event of [dialogue, discovery])
      if (event) {
        check(
          event.kind === "main-story" && event.actors.includes("PLAYER"),
          "主线事件类型或参与者不合法。",
        );
        check(
          event.mainStory!.nodeId === chapter.dialogue.id
            ? event.mainStory!.choiceId === "listen"
            : chapter.discovery.choices.some((c) => c.id === event.mainStory!.choiceId),
          "主线选项不存在。",
        );
        const isDialogue = event.mainStory!.nodeId === chapter.dialogue.id;
        check(
          isDialogue
            ? (event.actors.length === 2 &&
                event.actors.includes(chapter.guide) &&
                event.location ===
                  chapter.sites[chapter.guideSite as keyof typeof chapter.sites]) ||
                (event.actors.length === 1 && event.location === chapter.sites.inn)
            : event.actors.length === 1 &&
                event.location ===
                  chapter.sites[chapter.discovery.site as keyof typeof chapter.sites],
          "主线地点或人物身份不合法。",
        );
      }
    const graph =
      dialogue && legacy && w.events.indexOf(dialogue) < legacy.eventCount
        ? chapters.filter((c) => legacy.chapters.includes(c.id))
        : chapters;
    const previousChapter = graph[graph.indexOf(chapter) - 1];
    const previous: WorldEvent | undefined =
      previousChapter && mainEvent(w, previousChapter.discovery.id);
    if (dialogue)
      check(hasRubbing(w) && (!previous || dialogue.day >= previous.day), "主线缺少前置证据。");
    if (discovery)
      check(
        dialogue && discovery.day >= dialogue.day + MAIN_STORY.intervalDays,
        "主线时间次序不合法。",
      );
    if (dialogue && graph.indexOf(chapter) > 0) check(previous, "主线章节不能跳过。");
  }
  const validIds = new Set(chapters.flatMap((c) => [c.dialogue.id, c.discovery.id]));
  check(
    records.every((e) => validIds.has(e.mainStory!.nodeId)),
    "主线引用了本局不存在的章节。",
  );
}
