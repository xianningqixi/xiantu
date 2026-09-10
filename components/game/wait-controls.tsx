"use client";
import { Button } from "@/components/ui/button";
import { LOCATIONS, regionOf } from "@/lib/game/world-map";
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
  const [target, setTarget] = useState("days");
  const [days, setDays] = useState(3);
  const people = w.npcs.filter((a) => a.alive && relation(w, a.id)?.known);
  const person = people.find((a) => a.id === target);
  const command: Command = {
    type: "wait",
    days,
    ...(target === "days"
      ? {}
      : {
          stopWhen:
            target === "important"
              ? { kind: "importantEvent" as const }
              : { kind: "npcArrives" as const, target },
        }),
  };
  const reason =
    w.player.location === "ruins"
      ? "请先离开秘境。"
      : target !== "important" && target !== "days"
        ? !person
          ? "此人已无法等候，请重新选择。"
          : person.location === w.player.location && !person.npcJourney
            ? `${person.name}已在此处，无需等候。`
            : regionOf(person.location) !== regionOf(w.player.location) && !person.npcJourney
              ? `${person.name}目前在${LOCATIONS[person.location].name}；此次等待不能保证对方来访，建议主动前往。`
              : ""
        : "";
  return (
    <details id="wait-controls" className="wait-controls">
      <summary>设置停留日数</summary>
      <div className="conditional-wait">
        <label>
          最多等候
          <select
            aria-label="等候日数"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[1, 3, 7, 30].map((n) => (
              <option key={n} value={n}>
                {n} 日
              </option>
            ))}
          </select>
        </label>
        <label>
          条件等候
          <select
            aria-label="等候停止条件"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          >
            <option value="days">到选定日数结束</option>
            <option value="important">得知重要事件时暂停</option>
            {people.map((a) => (
              <option key={a.id} value={a.id}>
                等到{a.name}到达此处
                {a.location === w.player.location && !a.npcJourney
                  ? "（已在场）"
                  : a.npcJourney
                    ? `（赶路中，约${a.npcJourney.remaining}日）`
                    : `（${LOCATIONS[a.location].name}）`}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          disabled={
            blocked ||
            w.player.location === "ruins" ||
            (target !== "important" &&
              target !== "days" &&
              (!person || (person.location === w.player.location && !person.npcJourney)))
          }
          onClick={() => act(command)}
        >
          {target === "days" ? "开始停留" : "开始条件停留"}
          <TimeBadge world={w} command={command} />
        </Button>
        {reason && <p className="action-reason">{reason}</p>}
        <small>
          最多 {days} 日；仅推进时间，不会召来对方。
          {target === "important"
            ? "得知重要事件时暂停，可继续余下日数。"
            : target === "days"
              ? "选定日数完成后结束。"
              : "对方抵达此处时结束。"}
        </small>
      </div>
    </details>
  );
}
