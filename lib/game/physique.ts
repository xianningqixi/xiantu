import { z } from "zod";
import { hashSeed } from "./rng";
import type { Actor, Profile } from "./types";
export const BODY_BUILDS = {
  slender: "纤柔",
  balanced: "匀称",
  curvy: "丰盈",
  athletic: "健美",
} as const;
export const BUST_CUPS = ["A", "B", "C", "D", "E"] as const;
export const physiqueSchema = z
  .object({
    build: z.enum(["slender", "balanced", "curvy", "athletic"]),
    heightCm: z.number().int().min(145).max(210),
    bustCm: z.number().int().min(65).max(135),
    // Legacy measurements remain intact; a selected cup takes precedence for presentation.
    bustCup: z.enum(BUST_CUPS).optional(),
    waistCm: z.number().int().min(48).max(115),
    hipsCm: z.number().int().min(70).max(140),
    apparentAge: z.number().int().min(18).max(75),
  })
  .strict();
export type Physique = z.infer<typeof physiqueSchema>;
export const portraitIdSchema = z.string().regex(/^[a-f0-9]{64}$/);
/** Separate deterministic presentation stream: never consumes cultivation/combat RNG. */
export function defaultPhysique(sex: Profile["sex"], seed = 0): Physique {
  const value = (tag: string, count: number) => hashSeed(seed, `physique:${sex}:${tag}`) % count;
  const builds = Object.keys(BODY_BUILDS) as Physique["build"][];
  const build = builds[value("build", 4)];
  const female = sex === "female";
  const shape = build === "curvy" ? 8 : build === "slender" ? -4 : build === "athletic" ? 3 : 0;
  return {
    build,
    heightCm: (female ? 160 : 173) + value("height", 17),
    bustCm: (female ? 86 : 96) + shape + value("bust", 7),
    waistCm: (female ? 61 : 75) + Math.max(0, Math.round(shape / 2)) + value("waist", 7),
    hipsCm: (female ? 89 : 94) + shape + value("hips", 7),
    apparentAge: 21 + value("face-age", female ? 9 : 30),
  };
}
export function profilePhysique(profile: Profile) {
  return profile.physique ?? defaultPhysique(profile.sex);
}
export function actorPhysique(actor: Actor) {
  return actor.physique ?? defaultPhysique(actor.sex, actor.appearanceSeed);
}
export function physiqueText(body: Physique) {
  if (body.bustCup)
    return `${BODY_BUILDS[body.build]} · ${body.heightCm} cm · 胸围 ${body.bustCup}`;
  return `${BODY_BUILDS[body.build]} · ${body.heightCm} cm · ${body.bustCm}/${body.waistCm}/${body.hipsCm} cm`;
}
