"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { LOCATIONS, localSite, travelRoute } from "@/lib/game/world-map";
import { relation } from "@/lib/game/relationships";
import { B } from "@/lib/game/rules";
import type { World } from "@/lib/game/types";
import { AtlasMap } from "./atlas-map";
import type { Send } from "./panels";
/** The former atlas dialog is now the travel page, including local town destinations. */
export function AtlasPage({
  world,
  send,
  blocked,
  onArrive,
}: {
  world: World;
  send: Send;
  blocked: boolean;
  onArrive: () => void;
}) {
  const [error, setError] = useState("");
  const travel: Send = async (command) => {
    setError("");
    const saved = await send(command);
    if (saved) onArrive();
    else setError("启程未完成，请检查当前行动状态后重试。");
    return saved;
  };
  return (
    <section className="atlas-page" id="atlas-page">
      <header className="section-heading">
        <h1 className="serif">选择去处</h1>
        <p>
          当前在{LOCATIONS[world.player.location].name} · 第 {world.day + 1} 日
        </p>
      </header>
      <div className="local-destinations" aria-label="同城往来">
        {(["market", "inn", "gate"] as const).map((kind) => {
          const to = localSite(world.player.location, kind),
            route = travelRoute(world.player.location, to, world);
          const count = world.npcs.filter(
            (a) => a.alive && !a.npcJourney && a.location === to && relation(world, a.id)?.known,
          ).length;
          return (
            <div key={kind}>
              <Button
                data-travel-to={to}
                variant="outline"
                disabled={blocked || world.player.location === to || !route}
                onClick={() => void travel({ type: "travel", to })}
              >
                {world.player.location === to ? "驻足" : "前往"}
                {LOCATIONS[to].name}
                {world.player.location !== to && ` · ${route?.days ?? 0} 日`}
              </Button>
              <small>已结识 {count} 人在此</small>
            </div>
          );
        })}
      </div>
      <AtlasMap key={world.player.location} world={world} send={travel} blocked={blocked} />
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
