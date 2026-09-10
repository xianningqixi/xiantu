"use client";
import { REALMS } from "@/lib/game/content/official";
import { trainingGain, type ActionSummary } from "@/lib/ui/action-summary";
export function RetreatSummary({ interval }: { interval: ActionSummary | null }) {
  if (!interval) return null;
  return (
    <details className="retreat-summary">
      <summary>
        {interval.kind === "wait" ? "停留" : interval.kind === "breakthrough" ? "突破" : "闭关"}{" "}
        {interval.endDay - interval.startDay} 日汇总
      </summary>
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
    </details>
  );
}
