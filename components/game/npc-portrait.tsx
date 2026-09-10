"use client";
import type { Actor, World } from "@/lib/game/types";
import { usePortrait } from "./portrait-studio";
import { bundledPortrait } from "@/lib/game/portrait-library";
import { npcSubject } from "@/lib/game/portrait-subject";
import { extensionPortrait } from "@/lib/game/content/extensions";
import { avatarForPortrait } from "@/lib/ui/avatar-library";
import { cosmeticPortrait } from "@/lib/ui/cosmetic-art";
import { imageAsset } from "@/lib/game/images";
import { useState } from "react";

export function NpcPortrait({
  actor,
  className = "",
  full = false,
  displayName,
}: {
  world: World;
  actor: Actor;
  className?: string;
  full?: boolean;
  displayName?: string;
}) {
  const generated = usePortrait(actor.portraitId, full ? "fullbody" : "avatar");
  const owned = extensionPortrait(actor.id) ?? cosmeticPortrait(actor.id);
  const original = owned?.url || (!actor.portraitId ? bundledPortrait(npcSubject(actor))?.src : "");
  const src =
    generated ||
    (full ? (original ? imageAsset(original).src : "") : avatarForPortrait(original)?.src);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      className={`npc-portrait generated-portrait character-avatar${full ? " is-fullbody" : ""} ${className}`}
      data-person-avatar={actor.id}
      role="img"
      aria-label={`${displayName ?? actor.name}的${full ? "全身立绘" : "头像"}`}
      title={`点击放大${displayName ?? actor.name}的全身立绘`}
    >
      {src && failed !== src ? (
        <img
          src={src}
          width={full ? 1024 : 512}
          height={full ? 1536 : 512}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(src)}
        />
      ) : (
        <span className="portrait-initial" aria-hidden="true">
          {(displayName ?? actor.name).slice(0, 1)}
        </span>
      )}
    </span>
  );
}
