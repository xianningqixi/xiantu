"use client";
import { imageAsset } from "@/lib/game/images";
import { npcPortrait } from "@/lib/game/npc-profile";
import type { Actor, World } from "@/lib/game/types";
import { usePortrait } from "./portrait-studio";
import { bundledPortrait } from "@/lib/game/portrait-library";
import { npcSubject } from "@/lib/game/portrait-subject";
import { useState } from "react";

export function NpcPortrait({
  world,
  actor,
  className = "",
}: {
  world: World;
  actor: Actor;
  className?: string;
}) {
  const generated = usePortrait(actor.portraitId);
  const fullbody = generated || (!actor.portraitId ? bundledPortrait(npcSubject(actor))?.src : "");
  const portrait = npcPortrait(world, actor);
  const asset = imageAsset(portrait.src);
  const [failed, setFailed] = useState<string | null>(null);
  if (fullbody && failed !== fullbody)
    return (
      <div
        className={`npc-portrait generated-portrait ${className}`}
        role="img"
        aria-label={`${actor.name}的全身立绘`}
      >
        <img
          src={fullbody}
          width={640}
          height={960}
          alt=""
          loading="lazy"
          onError={() => setFailed(fullbody)}
        />
      </div>
    );
  return (
    <div
      className={`npc-portrait ${portrait.slot === null ? "single-portrait" : ""} ${className}`}
      role="img"
      aria-label={`${actor.name}的立绘`}
    >
      {failed === portrait.src ? (
        <span className="serif">{actor.name[0]}</span>
      ) : (
        <img
          src={asset.src}
          width={asset.width}
          height={asset.height}
          decoding="async"
          alt=""
          loading="lazy"
          onError={() => setFailed(portrait.src)}
          style={
            portrait.slot === null
              ? undefined
              : {
                  width: "300%",
                  height: "300%",
                  maxWidth: "none",
                  left: `-${(portrait.slot % 3) * 100}%`,
                  top: `-${Math.floor(portrait.slot / 3) * 100}%`,
                }
          }
        />
      )}
    </div>
  );
}
