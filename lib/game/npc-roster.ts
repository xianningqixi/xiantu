import roster from "../../content-packs/official-qingshi/expanded-npcs.json";
import { z } from "zod";
import { hashSeed } from "./rng";
import type { Actor } from "./types";

const templateSchema = z
  .object({
    id: z.string().regex(/^NPC_\d{4}$/),
    name: z.string().min(1).max(16),
    sex: z.literal("female"),
    title: z.string().min(1),
    background: z.string().min(1),
    hook: z.string().min(1),
    physique: z
      .object({
        apparentAge: z.number().int().min(22).max(29),
        heightCm: z.number().int().min(166).max(182),
        build: z.enum(["slender", "balanced", "curvy", "athletic"]),
        bustCup: z.enum(["B", "C", "D", "E"]),
      })
      .strict(),
  })
  .strict();

/** Authored identities and bodies only; rendering directions and images live separately. */
export const EXPANDED_NPCS = z.array(templateSchema).length(60).parse(roster.entries);
const templates = new Map(EXPANDED_NPCS.map((entry) => [entry.id, entry]));
if (
  templates.size !== 60 ||
  new Set(EXPANDED_NPCS.map((entry) => entry.name)).size !== 60 ||
  EXPANDED_NPCS.some((entry, i) => entry.id !== `NPC_${String(i + 41).padStart(4, "0")}`)
)
  throw new Error("百人角色模板的顺序或身份重复。");

export function expandedNpcTemplate(id: string) {
  return templates.get(id);
}

/** Fixed template appearances work across world seeds without consuming game randomness. */
export function expandedAppearanceSeed(id: string) {
  return hashSeed(100, `qingshi-women-v1:${id}`);
}

/** Legacy actors sharing a numeric ID never inherit an authored woman's identity. */
export function actorNpcTemplate(actor: Actor) {
  return actor.npcTemplateId === actor.id ? templates.get(actor.npcTemplateId) : undefined;
}
