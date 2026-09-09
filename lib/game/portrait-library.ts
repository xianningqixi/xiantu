import catalog from "../../content-packs/official-qingshi/art/portraits/catalog.json";
import { imageAsset } from "./images";
import { portraitSubjectSchema, type PortraitSubject } from "./portrait-subject";
/** Match the entire saved appearance, never a different world's or the player's identity. */
export function portraitSubjectKey(s: PortraitSubject) {
  const b = s.physique,
    a = s.appearance;
  return JSON.stringify([
    s.role,
    s.sex,
    s.identitySeed,
    a.face,
    a.hair,
    a.color,
    b.build,
    b.heightCm,
    b.bustCm,
    b.waistCm,
    b.hipsCm,
    b.apparentAge,
    s.portraitFeatures,
    b.bustCup,
    s.designId,
  ]);
}
const portraits = new Map(
  catalog.entries.map((entry) => [
    portraitSubjectKey(portraitSubjectSchema.parse(entry.subject)),
    `/art/portraits/${entry.file}`,
  ]),
);
export function bundledPortrait(subject: PortraitSubject) {
  const source = portraits.get(portraitSubjectKey(subject));
  return source ? imageAsset(source) : null;
}
