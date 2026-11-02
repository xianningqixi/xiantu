"use client";
import { useState } from "react";
import { PagedContent } from "@/components/ui/paged-content";
import {
  ACHIEVEMENT_CATEGORIES,
  achievementRows,
  achievementSummary,
  type AchievementCategory,
} from "@/lib/game/achievements";
import type { World } from "@/lib/game/types";

export function AchievementBoard({ world: w }: { world: World }) {
  const [category, setCategory] = useState<AchievementCategory | "">("");
  const summary = achievementSummary(w);
  const rows = achievementRows(w).filter((r) => !category || r.category === category);
  return (
    <section className="achievement-board" aria-label="成就">
      <p className="journal-count">
        已达成 {summary.done} / {summary.total} 项 · 达成时会自动在历程里记一笔
      </p>
      <div className="dual-methods" role="radiogroup" aria-label="成就类别">
        <button
          className={`achievement-chip${category === "" ? " active" : ""}`}
          role="radio"
          aria-checked={category === ""}
          onClick={() => setCategory("")}
        >
          全部
        </button>
        {(Object.keys(ACHIEVEMENT_CATEGORIES) as AchievementCategory[]).map((c) => (
          <button
            key={c}
            className={`achievement-chip${category === c ? " active" : ""}`}
            role="radio"
            aria-checked={category === c}
            onClick={() => setCategory(c)}
          >
            {ACHIEVEMENT_CATEGORIES[c]} {summary.byCategory[c].done}/{summary.byCategory[c].total}
          </button>
        ))}
      </div>
      <PagedContent label="成就" resetKey={category}>
        <ul className="achievement-list">
          {rows.map((r) => (
            <li
              key={r.id}
              className={`achievement-row${r.done ? " done" : ""}`}
              data-achievement-id={r.id}
            >
              <div className="achievement-head">
                <strong>{r.done || !r.hidden ? r.title : "？？？"}</strong>
                <small>{ACHIEVEMENT_CATEGORIES[r.category]}</small>
              </div>
              <p>{r.done || !r.hidden ? r.description : "尚未揭晓。"}</p>
              {r.target > 1 && (
                <div className="achievement-bar" aria-label={`进度 ${r.current}/${r.target}`}>
                  <span style={{ width: `${Math.round((r.current / r.target) * 100)}%` }} />
                </div>
              )}
              <small className="achievement-state">
                {r.done ? `第 ${(r.day ?? 0) + 1} 日达成` : `${r.current} / ${r.target}`}
              </small>
            </li>
          ))}
        </ul>
      </PagedContent>
    </section>
  );
}
