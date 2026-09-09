import { z } from "zod";
import { physiqueSchema, portraitIdSchema } from "./physique";
import { portraitFeaturesSchema } from "./portrait-features";

export const appearanceSchema = z
  .object({
    face: z.number().int().min(0).max(3),
    hair: z.number().int().min(0).max(3),
    color: z.number().int().min(0).max(3),
  })
  .strict();

/** Editable visual traits only; identity and cultivation are never part of a redraw. */
export const portraitLookSchema = z
  .object({
    appearance: appearanceSchema,
    physique: physiqueSchema,
    portraitFeatures: portraitFeaturesSchema,
  })
  .strict();
export type PortraitLook = z.infer<typeof portraitLookSchema>;

export const portraitOriginalSchema = z
  .object({
    portraitId: portraitIdSchema.optional(),
    appearance: appearanceSchema.optional(),
    physique: physiqueSchema,
    portraitFeatures: portraitFeaturesSchema.optional(),
  })
  .strict();
export type PortraitOriginal = z.infer<typeof portraitOriginalSchema>;
