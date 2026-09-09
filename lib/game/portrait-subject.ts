import { z } from "zod";
import { portraitFeatures, portraitFeaturesSchema } from "./portrait-features";
import { physiqueSchema, profilePhysique, actorPhysique } from "./physique";
import { PACK } from "./content/official";
import type { Actor, Profile } from "./types";
import { actorNpcTemplate, expandedNpcTemplate, expandedAppearanceSeed } from "./npc-roster";
export const portraitSubjectSchema = z
  .object({
    designId: z
      .string()
      .regex(/^NPC_\d{4}$/)
      .optional(),
    portraitFeatures: portraitFeaturesSchema.optional(),
    sex: z.enum(["female", "male"]),
    physique: physiqueSchema,
    appearance: z
      .object({
        face: z.number().int().min(0).max(3),
        hair: z.number().int().min(0).max(3),
        color: z.number().int().min(0).max(3),
      })
      .strict(),
    identitySeed: z.number().int().min(0).max(4294967295),
    role: z.enum(["player", "primary", "companion", "npc"]),
  })
  .strict()
  .refine((s) => s.sex !== "female" || s.physique.apparentAge <= 29, {
    message: "女性立绘采用年轻成年外貌。",
  })
  .refine(
    (s) => {
      if (!s.designId) return true;
      const template = expandedNpcTemplate(s.designId);
      return (
        !!template &&
        s.role === "npc" &&
        s.sex === "female" &&
        s.identitySeed === expandedAppearanceSeed(template.id)
      );
    },
    {
      message: "立绘方向与新增 NPC 身份不一致。",
    },
  );
export type PortraitSubject = z.infer<typeof portraitSubjectSchema>;
export function playerSubject(profile: Profile, seed: number): PortraitSubject {
  return {
    portraitFeatures: portraitFeatures(profile),
    sex: profile.sex,
    physique: profilePhysique(profile),
    appearance: profile.appearance,
    identitySeed: seed >>> 0,
    role: "player",
  };
}
export function npcSubject(actor: Actor): PortraitSubject {
  return {
    ...(actorNpcTemplate(actor) ? { designId: actor.npcTemplateId } : {}),
    ...(actor.portraitFeatures !== undefined ? { portraitFeatures: actor.portraitFeatures } : {}),
    sex: actor.sex,
    physique: actorPhysique(actor),
    identitySeed: actor.appearanceSeed >>> 0,
    appearance: actor.portraitAppearance ?? {
      face: actor.appearanceSeed % 4,
      hair: (actor.appearanceSeed >>> 3) % 4,
      color: (actor.appearanceSeed >>> 6) % 4,
    },
    role:
      actor.id === PACK.roles.primary
        ? "primary"
        : actor.id === PACK.roles.companion
          ? "companion"
          : "npc",
  };
}
