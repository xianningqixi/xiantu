"use client";
import { useEffect, useRef, useState } from "react";
import { REALMS } from "@/lib/game/content/official";
import { threshold } from "@/lib/game/rules";
import { beginActionSummary, finishActionSummary, trainingGain } from "@/lib/ui/action-summary";
import type { World } from "@/lib/game/types";
import type { OpenProfile } from "@/lib/ui/profile-navigation";
import { Meter } from "./panels";
import { PlayerPortrait } from "./player-portrait";
export function CharacterStatus({ world: w, onProfile }: { world: World; onProfile: OpenProfile }) {
  const previous = useRef(w),
    [delta, setDelta] = useState<{ id: number; xp: number; stones: number } | null>(null);
  useEffect(() => {
    const p = previous.current;
    previous.current = w;
    if (p.saveId !== w.saveId || p.revision >= w.revision) return;
    const xp =
      p.player.realm <= w.player.realm
        ? trainingGain(finishActionSummary(beginActionSummary(p, "train"), w, "completed"))
        : w.player.xp - p.player.xp;
    const stones = w.player.stones - p.player.stones;
    if (xp || stones) setDelta({ id: w.revision, xp, stones });
  }, [w]);
  useEffect(() => {
    if (!delta) return;
    const t = setTimeout(() => setDelta(null), 1200);
    return () => clearTimeout(t);
  }, [delta]);
  return (
    <div className="character-status" aria-label="角色状态">
      <button
        className="status-profile"
        aria-label={`查看${w.player.name}的人物资料`}
        onClick={() => onProfile("PLAYER")}
      >
        <PlayerPortrait world={w} className="status-avatar" />
        <span>
          {w.player.name}
          <small>{REALMS[w.player.realm]}</small>
        </span>
      </button>
      <Meter label="修为" value={w.player.xp} max={threshold(w.player)} />
      <span className="status-stones">
        灵石 <b>{w.player.stones}</b>
      </span>
      <time>第 {w.day + 1} 日</time>
      {delta && (
        <span key={delta.id} className="status-delta" aria-hidden="true">
          {delta.xp !== 0 && `修为 ${delta.xp > 0 ? "+" : ""}${delta.xp} `}
          {delta.stones !== 0 && `灵石 ${delta.stones > 0 ? "+" : ""}${delta.stones}`}
        </span>
      )}
    </div>
  );
}
