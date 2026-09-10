"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { knownEvents } from "@/lib/game/knowledge";
import { knownNpcUpdates } from "@/lib/game/engine";
import {
  beginActionSummary,
  finishActionSummary,
  trainingGain,
  type ActionSummary,
} from "@/lib/ui/action-summary";
import { presentationUnlocks } from "@/lib/game/presentation";
import type { World, AdvanceProgress } from "@/lib/game/types";
import { RetreatSummary } from "./retreat-summary";
type Entry = { id: string; day: number; text: string; important?: boolean };
type Result = { id: string; kind: string; notice: string; day: number; revision: number } | null;
export function EventFeed({
  world: w,
  result,
  progress,
  summary,
  onAll,
}: {
  world: World;
  result: Result;
  progress: AdvanceProgress | null;
  summary: ActionSummary | null;
  onAll: () => void;
}) {
  const previous = useRef(w),
    seenResult = useRef<string | null>(null),
    pending = useRef<Entry[]>([]);
  const [rows, setRows] = useState<Entry[]>(() =>
      knownEvents(w)
        .slice(-5)
        .map((e) => ({ id: e.id, day: e.day, text: e.text })),
    ),
    [queued, setQueued] = useState(0);
  useEffect(() => {
    const p = previous.current;
    previous.current = w;
    if (
      p.saveId !== w.saveId ||
      w.revision < p.revision ||
      (result &&
        ["import", "restore", "create"].includes(result.kind) &&
        seenResult.current !== result.id)
    ) {
      pending.current = [];
      setQueued(0);
      setRows(
        knownEvents(w)
          .slice(-5)
          .map((e) => ({ id: e.id, day: e.day, text: e.text })),
      );
    }
    const entries: Entry[] = [];
    if (p.saveId === w.saveId && p.revision < w.revision && p.longAction && w.day > p.day) {
      const gain = trainingGain(
        finishActionSummary(beginActionSummary(p, p.longAction.kind), w, "completed"),
      );
      const stones = w.player.stones - p.player.stones;
      const oldIds = new Set(knownEvents(p).map((e) => e.id));
      const ids =
        progress?.day === w.day && progress.actionId === p.longAction.id
          ? new Set(progress.newEventIds)
          : null;
      const known = knownEvents(w).filter((e) => !oldIds.has(e.id) && (!ids || ids.has(e.id)));
      const npcIds = new Set(knownNpcUpdates(w).map((e) => e.id));
      const news = known.filter(
        (e) =>
          npcIds.has(e.id) ||
          e.kind === "daily-event" ||
          e.kind === "daily-gift" ||
          e.kind === "breakthrough" ||
          e.kind === "breakthrough-failed",
      );
      entries.push({
        id: `day:${w.saveId}:${w.revision}`,
        day: w.day,
        text: [
          p.longAction.kind === "train" ? `修炼 · 修为 ${gain >= 0 ? "+" : ""}${gain}` : w.notice,
          stones ? `灵石 ${stones > 0 ? "+" : ""}${stones}` : "",
          ...news.map((e) => e.text),
        ]
          .filter(Boolean)
          .join(" · "),
        important: news.length > 0,
      });
    } else if (result && seenResult.current !== result.id)
      entries.push({ id: result.id, day: result.day, text: result.notice });
    if (p.saveId === w.saveId && p.revision < w.revision) {
      const before = new Set(presentationUnlocks(p).flatMap((u) => u.show));
      for (const u of presentationUnlocks(w))
        if (u.toast && u.show.some((key) => !before.has(key)))
          entries.push({
            id: `unlock:${w.revision}:${u.show[0]}`,
            day: w.day,
            text: u.toast,
            important: true,
          });
    }
    if (result) seenResult.current = result.id;
    if (!entries.length) return;
    pending.current.push(...entries);
    setQueued(pending.current.length);
  }, [w, result, progress]);
  useEffect(() => {
    if (!queued) return;
    const timer = setTimeout(() => {
      const next = pending.current.shift();
      if (next) setRows((rows) => [...rows, next].slice(-60));
      setQueued(pending.current.length);
    }, 400);
    return () => clearTimeout(timer);
  }, [queued, rows]);
  const speed = () => {
    const ready = pending.current;
    pending.current = [];
    setRows((rows) => [...rows, ...ready].slice(-60));
    setQueued(0);
  };
  return (
    <section className="event-feed" aria-label="查看近日见闻">
      <header>
        <h2 className="serif">近日见闻</h2>
        <Button variant="ghost" size="sm" onClick={queued ? speed : onAll}>
          {queued ? `加速显示 · ${queued} 条` : "查看全部"}
        </Button>
      </header>
      <div className="event-feed-lines" role="log" aria-live="polite" aria-relevant="additions">
        {rows
          .slice(-6)
          .reverse()
          .map((row) => (
            <article key={row.id} className={row.important ? "event-important" : ""}>
              <time>第 {row.day + 1} 日</time>
              <p>{row.text}</p>
            </article>
          ))}
        {!rows.length && <p>此刻起，记录这一世的行止。</p>}
      </div>
      <RetreatSummary interval={summary} />
    </section>
  );
}
