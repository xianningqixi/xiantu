import type { Actor, World } from "./types";
import { portraitOriginalSchema, type PortraitOriginal } from "./portrait-look";
import { defaultPhysique } from "./physique";
import { actorNpcTemplate } from "./npc-roster";

export function currentPortrait(w: World, a: Actor): PortraitOriginal {
  const source = a.id === "PLAYER" ? w.profile : a;
  const appearance = a.id === "PLAYER" ? w.profile.appearance : a.portraitAppearance;
  return structuredClone({
    ...(source.portraitId ? { portraitId: source.portraitId } : {}),
    ...(appearance ? { appearance } : {}),
    physique: a.physique!,
    ...(source.portraitFeatures !== undefined ? { portraitFeatures: source.portraitFeatures } : {}),
  });
}

/** Old NPC redraws can recover their authored initial look; never invent a player's old design. */
export function originalPortrait(w: World, a: Actor): PortraitOriginal | undefined {
  if (a.portraitOriginal) return a.portraitOriginal;
  if (a.id !== "PLAYER" && (a.portraitId || a.portraitAppearance))
    return {
      physique: {
        ...defaultPhysique(a.sex, a.appearanceSeed),
        ...actorNpcTemplate(a)?.physique,
        apparentAge: a.physique!.apparentAge,
      },
    };
}

export function canRestorePortrait(w: World, a: Actor) {
  const original = originalPortrait(w, a);
  return (
    !!original &&
    JSON.stringify(portraitOriginalSchema.parse(currentPortrait(w, a))) !==
      JSON.stringify(portraitOriginalSchema.parse(original))
  );
}

export function restorePortrait(w: World, a: Actor, original: PortraitOriginal) {
  a.physique = structuredClone(original.physique);
  delete a.portraitId;
  delete a.portraitAppearance;
  delete a.portraitFeatures;
  if (original.portraitId) a.portraitId = original.portraitId;
  if (a.id === "PLAYER") {
    w.profile.appearance = { ...original.appearance! };
    w.profile.physique = structuredClone(original.physique);
    delete w.profile.portraitId;
    delete w.profile.portraitFeatures;
    if (original.portraitId) w.profile.portraitId = original.portraitId;
    if (original.portraitFeatures !== undefined)
      w.profile.portraitFeatures = original.portraitFeatures;
  } else {
    if (original.appearance) a.portraitAppearance = { ...original.appearance };
    if (original.portraitFeatures !== undefined) a.portraitFeatures = original.portraitFeatures;
  }
}
