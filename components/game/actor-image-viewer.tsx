"use client";
import type { Actor, World } from "@/lib/game/types";
import { extensionPortrait } from "@/lib/game/content/extensions";
import { bundledPortrait } from "@/lib/game/portrait-library";
import { npcSubject, playerSubject } from "@/lib/game/portrait-subject";
import { imageAsset } from "@/lib/game/images";
import { cosmeticPortrait } from "@/lib/ui/cosmetic-art";
import { usePortrait } from "./portrait-studio";
import { ImageViewer } from "./image-viewer";

/** Resolve full-body art only for the selected actor, never an avatar crop or another identity. */
export function ActorImageViewer({
  world,
  actor,
  displayName,
  open,
  onOpenChange,
}: {
  world: World;
  actor: Actor;
  displayName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const generated = usePortrait(actor.portraitId);
  const self = actor.id === "PLAYER";
  const owned = self ? null : (extensionPortrait(actor.id) ?? cosmeticPortrait(actor.id));
  const original =
    owned?.url ||
    (!actor.portraitId
      ? bundledPortrait(self ? playerSubject(world.profile, world.seed) : npcSubject(actor))?.src
      : "");
  const src = generated || (original ? imageAsset(original).src : "");
  return (
    <ImageViewer
      open={open}
      onOpenChange={onOpenChange}
      src={src}
      alt={`${displayName ?? actor.name}的全身立绘`}
      portrait
    />
  );
}
