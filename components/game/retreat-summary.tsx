"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { REALMS } from "@/lib/game/content/official";
import { trainingGain, type ActionSummary } from "@/lib/ui/action-summary";
export function RetreatSummary({ interval }: { interval: ActionSummary | null }) {
  const [open, setOpen] = useState(false);
  if (!interval) return null;
  const title = `${interval.kind === "wait" ? "停留" : interval.kind === "breakthrough" ? "突破" : "闭关"} ${interval.endDay - interval.startDay} 日汇总`;
  return (
    <>
      <Button className="retreat-summary" variant="outline" size="sm" onClick={() => setOpen(true)}>
        {title}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="game-modal retreat-modal">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>回看这些天的收获与故人近况。</DialogDescription>
          </DialogHeader>
          <div>
            <h3>
              {interval.kind === "wait"
                ? "停留"
                : interval.kind === "breakthrough"
                  ? "突破"
                  : "闭关"}{" "}
              {interval.endDay - interval.startDay} 日汇总
            </h3>
            <p>
              {REALMS[interval.startRealm]} → {REALMS[interval.endRealm]} · 修为{" "}
              {interval.kind === "train"
                ? `+${trainingGain(interval)}`
                : `${interval.startXp} → ${interval.endXp}`}{" "}
              · 灵石 {interval.endStones - interval.startStones}
            </p>
            {interval.partial && <p>收益自第 {interval.observedFromDay + 1} 日读取进度起记录。</p>}
            {interval.status === "condition-paused" && <p>因重要变化暂停，剩余行动可以继续。</p>}
            {interval.events.map((e) => (
              <p key={e.id}>
                第 {e.day + 1} 日 · {e.text}
              </p>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
