"use client";
import { useEffect, useRef, useState } from "react";
import { REALMS } from "@/lib/game/content/official";
import { gainPerDay } from "@/lib/game/cultivation";
import { presentationUnlocks } from "@/lib/game/presentation";
import type { World } from "@/lib/game/types";
export function RealmCeremony({ world: w }: { world: World }) {
  const previous = useRef(w),
    [card, setCard] = useState<{
      name: string;
      before: number;
      after: number;
      up: boolean;
      unlocks: string[];
    } | null>(null);
  useEffect(() => {
    const p = previous.current;
    previous.current = w;
    if (p.saveId !== w.saveId || p.revision >= w.revision || p.player.realm === w.player.realm)
      return;
    const before = presentationUnlocks(p).flatMap((u) => u.show);
    setCard({
      name: REALMS[w.player.realm],
      before: gainPerDay(p, p.player),
      after: gainPerDay(w, w.player),
      up: w.player.realm > p.player.realm,
      unlocks: presentationUnlocks(w)
        .filter((u) => u.show.some((key) => !before.includes(key)))
        .map((u) => u.toast)
        .filter(Boolean),
    });
  }, [w]);
  useEffect(() => {
    if (!card) return;
    const timer = setTimeout(() => setCard(null), 1000);
    return () => clearTimeout(timer);
  }, [card]);
  return (
    card && (
      <div className={`realm-ceremony${card.up ? "" : " realm-setback"}`} role="status">
        <span>{card.up ? "境界已进" : "境界回落"}</span>
        <h2 className="serif">{card.name}</h2>
        <p>
          每日修为 {card.before} → {card.after}
        </p>
        {card.up && card.unlocks.map((t) => <p key={t}>{t}</p>)}
      </div>
    )
  );
}
