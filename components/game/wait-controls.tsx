"use client";
import { Button } from "@/components/ui/button";
import { relation } from "@/lib/game/engine";
import type { Command, World } from "@/lib/game/types";
import { useState } from "react";
import type { Send } from "./panels";
import { TimeBadge } from "./time-badge";
export function WaitControls({
  world: w,
  act,
  blocked,
}: {
  world: World;
  act: Send;
  blocked: boolean;
}) {
  const [target, setTarget] = useState("important");
  const people = w.npcs.filter((a) => a.alive && relation(w, a.id)?.known);
  const person = people.find((a) => a.id === target);
  const command: Command = {
    type: "wait",
    days: 30,
    stopWhen: target === "important" ? { kind: "importantEvent" } : { kind: "npcArrives", target },
  };
  return (
    <div className="conditional-wait">
      <label>
        条件等候
        <select
          aria-label="等候停止条件"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        >
          <option value="important">得知重要事件时暂停</option>
          {people.map((a) => (
            <option key={a.id} value={a.id}>
              等到{a.name}到达此处
            </option>
          ))}
        </select>
      </label>
      <Button
        variant="outline"
        disabled={
          blocked ||
          w.player.location === "ruins" ||
          (target !== "important" && (!person || person.location === w.player.location))
        }
        onClick={() => act(command)}
      >
        开始条件等候
        <TimeBadge world={w} command={command} />
      </Button>
      <small>最多 30 日；暂停后可继续，抵达后自动结束。</small>
    </div>
  );
}
