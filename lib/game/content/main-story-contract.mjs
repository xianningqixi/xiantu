import { z } from "zod";
const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.-]{0,119}$/);
const text = z.string().min(1).max(4000);
const choice = z.object({ id, label: text, reply: text }).strict();
export const mainStorySchema = z
  .object({
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    title: text,
    intervalDays: z.number().int().min(1).max(30),
    surveyDays: z.number().int().min(1).max(30),
    chapters: z
      .array(
        z
          .object({
            id,
            regionName: text,
            packId: id.nullable(),
            volumePackId: id,
            volumeTitle: text,
            volumeLead: text,
            sites: z.object({ market: id, inn: id, gate: id }).strict(),
            minRealm: z.number().int().min(0).max(4),
            guide: id,
            guideSite: z.enum(["market", "inn", "gate"]),
            guidePlace: text,
            arrivalDelay: z.number().int().min(0).max(30),
            dialogue: z
              .object({
                id,
                title: text,
                body: text,
                fallbackBody: text,
                choice: text,
                reply: text,
              })
              .strict(),
            discovery: z
              .object({
                id,
                site: z.enum(["market", "inn", "gate"]),
                place: text,
                title: text,
                body: text,
                choices: z.array(choice).min(1).max(3),
              })
              .strict(),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict();
export function validateMainStory(input, context) {
  const data = mainStorySchema.parse(input);
  const nodes = data.chapters.flatMap((c) => [c.dialogue.id, c.discovery.id]);
  if (new Set(nodes).size !== nodes.length || nodes.some((id) => !id.startsWith("main.")))
    throw new Error("主线节点重复或命名空间不合法");
  if (new Set(data.chapters.map((c) => c.id)).size !== data.chapters.length)
    throw new Error("主线章节重复");
  for (const c of data.chapters) {
    if (!context.actors.includes(c.guide)) throw new Error(`主线人物未知：${c.guide}`);
    if (Object.values(c.sites).some((id) => !context.locations.includes(id)))
      throw new Error(`主线地点未知：${c.id}`);
    if (c.packId && !context.packs.includes(c.packId))
      throw new Error(`主线地域内容缺失：${c.packId}`);
    if (!context.packs.includes(c.volumePackId))
      throw new Error(`主线篇章内容缺失：${c.volumePackId}`);
    if (new Set(c.discovery.choices.map((x) => x.id)).size !== c.discovery.choices.length)
      throw new Error("主线选项重复");
    for (const value of [
      c.dialogue.body,
      c.dialogue.fallbackBody,
      c.dialogue.reply,
      c.discovery.body,
      ...c.discovery.choices.map((x) => x.reply),
    ])
      for (const token of value.matchAll(/\{\{([^{}]+)\}\}/g))
        if (!["guide", "nextRegion"].includes(token[1]))
          throw new Error(`主线未知占位符：${token[1]}`);
  }
  return data;
}
