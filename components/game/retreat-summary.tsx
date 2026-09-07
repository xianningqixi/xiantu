"use client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IMPORTANT_EVENT_KINDS } from "@/lib/game/advance";
import { knownEvents } from "@/lib/game/knowledge";
import type { World } from "@/lib/game/types";
import { useMemo } from "react";
export function RetreatSummary({
  world,
  interval,
  onClose,
}: {
  world: World;
  interval: { startDay: number; endDay: number } | null;
  onClose: () => void;
}) {
  const groups = useMemo(() => {
    if (!interval) return [];
    const events = knownEvents(world).filter(
      (e) =>
        e.day > interval.startDay && e.day <= interval.endDay && IMPORTANT_EVENT_KINDS.has(e.kind),
    );
    return world.npcs
      .map((person) => ({ person, events: events.filter((e) => e.actors.includes(person.id)) }))
      .filter((group) => group.events.length);
  }, [world, interval]);
  return (
    <Dialog open={!!interval} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="game-modal retreat-summary">
        <DialogHeader>
          <DialogTitle>闭关期间</DialogTitle>
          <DialogDescription>
            第 {(interval?.startDay ?? 0) + 1} 日至第 {(interval?.endDay ?? 0) + 1}{" "}
            日，你得知的故人近况。
          </DialogDescription>
        </DialogHeader>
        {groups.length ? (
          groups.map(({ person, events }) => (
            <section key={person.id}>
              <h3>{person.name}</h3>
              {events.map((e) => (
                <p key={e.id}>
                  <small>第 {e.day + 1} 日</small> {e.text}
                </p>
              ))}
            </section>
          ))
        ) : (
          <p>这些天没有得知故人的重大变化。未曾听闻的事情仍待日后相逢。</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
