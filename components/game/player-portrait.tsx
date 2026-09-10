"use client";
import { useState } from "react";
import { UserRound } from "lucide-react";
import { bundledPortrait } from "@/lib/game/portrait-library";
import { playerSubject } from "@/lib/game/portrait-subject";
import type { World } from "@/lib/game/types";
import { usePortrait } from "./portrait-studio";
import { avatarForPortrait } from "@/lib/ui/avatar-library";

/** A display-only portrait shared by the player's compact profile entrances. */
export function PlayerPortrait({ world, className = "" }: { world: World; className?: string }) {
  const cached = usePortrait(world.player.portraitId, "avatar");
  const original = !world.player.portraitId
    ? bundledPortrait(playerSubject(world.profile, world.seed))?.src
    : undefined;
  const src = cached || avatarForPortrait(original)?.src;
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span
      className={`player-portrait character-avatar ${className}`}
      data-person-avatar="PLAYER"
      role="img"
      aria-label={`${world.player.name}的头像`}
      title={`点击放大${world.player.name}的全身立绘`}
    >
      {src && failed !== src ? (
        <img
          src={src}
          alt=""
          width={512}
          height={512}
          decoding="async"
          loading="lazy"
          onError={() => setFailed(src)}
        />
      ) : (
        <UserRound aria-hidden="true" />
      )}
    </span>
  );
}
