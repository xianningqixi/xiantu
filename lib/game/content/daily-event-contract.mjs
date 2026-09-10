import { z } from "zod";
const effect = z
  .object({
    kind: z.enum(["stones", "insight", "grass", "healing", "relation", "encounter"]),
    value: z.number().int().min(-100).max(100).optional(),
    target: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.kind === "encounter" ? !["wolves", "bandits"].includes(e.target) : e.value === undefined)
      ctx.addIssue({ code: "custom", message: "效果缺少数值或有效遭遇目标" });
    if (e.kind === "relation" && e.target !== "npc")
      ctx.addIssue({ code: "custom", message: "关系效果必须引用在场人物" });
  });
const choice = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    hint: z.string(),
    reply: z.string().min(1),
    effects: z.array(effect),
    days: z.number().int().min(0).max(1),
    gift: z.boolean(),
  })
  .strict();
const node = z
  .object({
    id: z.string().regex(/^daily\.[a-z-]+$/),
    category: z.enum(["sighting", "choice", "risk"]),
    title: z.string().min(1),
    eyebrow: z.string(),
    body: z.string().min(1),
    conditions: z
      .array(z.object({ fact: z.string(), op: z.literal("eq"), value: z.literal(true) }).strict())
      .length(1),
    choices: z.array(choice),
    portrait: z.literal(false),
    visualId: z.string(),
    cooldownDays: z.number().int().min(1),
    requiresNpc: z.boolean(),
    effects: z.array(effect),
  })
  .strict();
export function validateDailyEvents(value) {
  const data = z
    .object({ version: z.literal("0.2.0"), events: z.array(node) })
    .strict()
    .parse(value);
  if (new Set(data.events.map((n) => n.id)).size !== data.events.length)
    throw new Error("日常事件 id 重复");
  for (const category of ["sighting", "choice", "risk"]) {
    const count = data.events.filter((n) => n.category === category).length;
    if (count < 8 || count > 12) throw new Error("每类日常事件须有 8–12 条");
  }
  for (const n of data.events) {
    if (
      n.conditions[0].fact !== n.id ||
      n.choices.length !== (n.category === "sighting" ? 0 : 2) ||
      new Set(n.choices.map((c) => c.id)).size !== n.choices.length
    )
      throw new Error("日常事件条件或选项不合法");
    for (const e of [...n.effects, ...n.choices.flatMap((c) => c.effects)])
      if (e.kind === "relation" && !n.requiresNpc) throw new Error("人物效果缺少在场条件");
    if (
      n.choices.some(
        (c) =>
          c.gift &&
          (!n.requiresNpc || !c.effects.some((e) => e.kind === "healing" && e.value === -1)),
      )
    )
      throw new Error("回礼需先向人物赠药");
  }
  return data;
}
