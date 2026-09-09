import avatars from "@/lib/game/content/avatars.json";
import { imageAsset } from "@/lib/game/images";

type AvatarAsset = { src: string };
const byPortrait = new Map<string, AvatarAsset>();
for (const [source, src] of Object.entries(avatars)) {
  const avatar = { src };
  byPortrait.set(source, avatar);
  byPortrait.set(imageAsset(source).src, avatar);
}

/** Lookup by the actual adopted artwork, never by an unrelated actor or reused face. */
export function avatarForPortrait(source?: string) {
  return source ? byPortrait.get(source) : undefined;
}
