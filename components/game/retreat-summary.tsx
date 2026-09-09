"use client";
import { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { REALMS } from "@/lib/game/content/official";
import { threshold } from "@/lib/game/rules";
import { trainingGain, type ActionSummary } from "@/lib/ui/action-summary";
import type { World } from "@/lib/game/types";

export function RetreatSummary({
  world,
  interval,
  onClose,
  onNavigate,
  onProfile,
}: {
  world: World;
  interval: ActionSummary | null;
  onClose: () => void;
  onNavigate: (tab: string, anchor?: string) => void;
  onProfile: (id: string) => void;
}) {
  const events = interval?.events ?? [];
  const destination = useRef<{ tab: string; anchor?: string } | null>(null);
  const title =
    interval?.kind === "wait"
      ? "等候见闻"
      : interval?.kind === "breakthrough"
        ? "突破结果"
        : "闭关期间";
  const canBreak =
    !world.ended &&
    [0, 3].includes(world.player.realm) &&
    world.player.xp >= threshold(world.player);
  const navigate = (tab: string) => {
    destination.current = {
      tab,
      ...(tab === "cultivation" && canBreak ? { anchor: "breakthrough-preparation" } : {}),
    };
    onClose();
  };
  const renderEvent = (event: (typeof events)[number]) => (
    <article key={event.id} className="summary-event">
      <p>
        <small>第 {event.day + 1} 日</small> {event.text}
      </p>
      <div>
        {event.actors
          .filter((id) => id !== "PLAYER")
          .map((id) => {
            const actor = world.npcs.find((a) => a.id === id);
            return actor ? (
              <Button
                key={id}
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClose();
                  onProfile(id);
                }}
              >
                查看{actor.name}
              </Button>
            ) : null;
          })}
      </div>
    </article>
  );
  return (
    <Dialog open={!!interval} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="game-modal retreat-summary"
        onCloseAutoFocus={(event) => {
          if (destination.current) {
            event.preventDefault();
            const next = destination.current;
            destination.current = null;
            onNavigate(next.tab, next.anchor);
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            第 {(interval?.startDay ?? 0) + 1} 日至第 {(interval?.endDay ?? 0) + 1}{" "}
            日，主角结果与已知近况。
          </DialogDescription>
        </DialogHeader>
        {interval && (
          <div className="summary-player-result">
            {interval.partial && (
              <p>收益仅记录本次读取后（第 {interval.observedFromDay + 1} 日起）的变化。</p>
            )}
            {interval.status === "condition-paused" && <p>因重要变化暂停，剩余行动可以继续。</p>}
            {interval.status === "stopped" && <p>已提前结束，已完成的进度与消耗保留。</p>}
            <strong>
              {REALMS[interval.startRealm]} → {REALMS[interval.endRealm]}
            </strong>
            <span>
              修为{" "}
              {interval.kind === "train"
                ? `+${trainingGain(interval)}`
                : `${interval.startXp} → ${interval.endXp}`}
            </span>
            <span>
              灵石 {interval.endStones - interval.startStones >= 0 ? "+" : ""}
              {interval.endStones - interval.startStones}
            </span>
            {canBreak && <p>修为已圆满，可以尝试突破。</p>}
          </div>
        )}
        <div className="summary-reading">
          <h3>重要变化 · {events.length} 件</h3>
          {events.length ? (
            events.slice(0, 5).map(renderEvent)
          ) : (
            <p>这些天没有得知故人的重大变化。</p>
          )}
          {events.length > 5 && (
            <details>
              <summary>其余 {events.length - 5} 件见闻</summary>
              {events.slice(5).map(renderEvent)}
            </details>
          )}
        </div>
        <div className="modal-actions">
          <Button
            onClick={() =>
              navigate(
                canBreak ? "cultivation" : interval?.kind === "wait" ? "journey" : "cultivation",
              )
            }
          >
            {canBreak ? "去尝试突破" : interval?.kind === "wait" ? "回到游历" : "返回修行"}
          </Button>
          <Button variant="outline" onClick={() => navigate("journal")}>
            查看完整历程
          </Button>
          <Button variant="ghost" onClick={onClose}>
            继续当前页面
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
