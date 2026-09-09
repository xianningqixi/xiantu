import { z } from "zod";

export const PORTRAIT_FEATURES_MAX_LENGTH = 200;
const legacyFeature = z.string().max(40);
export const portraitFeaturesSchema = z.union([
  z.string().max(PORTRAIT_FEATURES_MAX_LENGTH),
  z.tuple([legacyFeature, legacyFeature, legacyFeature]),
]);
export type PortraitFeatures = z.infer<typeof portraitFeaturesSchema>;

export function portraitFeatures(subject: {
  sex: "female" | "male";
  portraitFeatures?: PortraitFeatures;
}): string {
  const features = subject.portraitFeatures;
  // Keep legacy drafts and saves readable without rewriting them on render.
  if (Array.isArray(features)) return features.filter(Boolean).join(" · ");
  return (
    features ??
    (subject.sex === "female" ? "高开叉裙 · 丝袜美腿 · 高跟鞋" : "长袍 · 束腿长裤 · 长靴")
  );
}
