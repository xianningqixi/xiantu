import { z } from "zod";
import { physiqueSchema, profilePhysique, actorPhysique } from "./physique";
import { PACK } from "./content/official";
import type { Actor, Profile } from "./types";
export const portraitSubjectSchema = z
  .object({
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
  });
export type PortraitSubject = z.infer<typeof portraitSubjectSchema>;
export function playerSubject(profile: Profile, seed: number): PortraitSubject {
  return {
    sex: profile.sex,
    physique: profilePhysique(profile),
    appearance: profile.appearance,
    identitySeed: seed >>> 0,
    role: "player",
  };
}
export function npcSubject(actor: Actor): PortraitSubject {
  return {
    sex: actor.sex,
    physique: actorPhysique(actor),
    identitySeed: actor.appearanceSeed >>> 0,
    appearance: {
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
