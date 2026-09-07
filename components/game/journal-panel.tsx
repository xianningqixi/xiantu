"use client";
import { Button } from "@/components/ui/button";
import B from "@/lib/game/content/balance.json";
import { visibleEvents } from "@/lib/game/engine";
import type { World } from "@/lib/game/types";
import { useEffect, useMemo, useState } from "react";
const PAGE_SIZE = 50;
type Seen = { day: number; ids: string[] };
const key = (world: World) => `xiantu:journal-seen:${world.saveId}`;
const labels: Record<string, string> = {
  advance: "境界提升",
  breakthrough: "突破成功",
  "breakthrough-failed": "突破未成",
  death: "离世",
  conflict: "冲突",
  travel: "行旅",
  work: "劳务",
  train: "修炼",
  wait: "等候",
  promiseFulfilled: "履约",
  promiseBreached: "失约",
  promiseCompensated: "补偿",
  firstMeeting: "相识",
  sharedVictory: "并肩取胜",
  social: "日常交往",
};
export function JournalPanel({ world: w }: { world: World }) {
  const [person, setPerson] = useState("");
  const [kind, setKind] = useState("");
  const [year, setYear] = useState("");
  const [page, setPage] = useState(0);
  const [seen, setSeen] = useState<Seen>({ day: -1, ids: [] });
  const events = useMemo(() => visibleEvents(w).toReversed(), [w]);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key(w)) ?? "null");
      if (stored && Number.isSafeInteger(stored.day) && Array.isArray(stored.ids)) setSeen(stored);
      const todayIds = events
        .filter((e) => w.knowledge[e.id]?.some((row) => row[0] === 0 && row[3] === w.day))
        .map((e) => e.id);
      localStorage.setItem(key(w), JSON.stringify({ day: w.day, ids: todayIds }));
    } catch {
      /* Browser preferences are optional; world data is never touched. */
    }
  }, [w.saveId]);
  const filtered = useMemo(
    () =>
      events.filter(
        (e) =>
          (!person || e.actors.includes(person)) &&
          (!kind || e.kind === kind) &&
          (!year || String(Math.floor(e.day / B.world.daysPerYear) + 1) === year),
      ),
    [events, person, kind, year],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice(
    Math.min(page, pageCount - 1) * PAGE_SIZE,
    (Math.min(page, pageCount - 1) + 1) * PAGE_SIZE,
  );
  const groups = Map.groupBy(visible, (e) => Math.floor(e.day / B.world.daysPerYear) + 1);
  const newFact = (id: string) => {
    const learned = w.knowledge[id]?.find((row) => row[0] === 0)?.[3] ?? -1;
    return learned > seen.day || (learned === seen.day && !seen.ids.includes(id));
  };
  const change = (set: (v: string) => void, value: string) => {
    set(value);
    setPage(0);
  };
  return (
    <section className="panel-section">
      <div className="section-heading">
        <span className="eyebrow">历程 · 落笔成忆</span>
        <h2 className="serif">这一世的故事</h2>
        <p>
          共 {filtered.length} 条已知经历，{events.filter((e) => newFact(e.id)).length}{" "}
          条上次查看后新增。
        </p>
      </div>
      <div className="journal-filters">
        <label>
          人物
          <select
            aria-label="历程人物"
            value={person}
            onChange={(e) => change(setPerson, e.target.value)}
          >
            <option value="">所有人物</option>
            {[w.player, ...w.npcs]
              .filter((a) => events.some((e) => e.actors.includes(a.id)))
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          类型
          <select
            aria-label="历程类型"
            value={kind}
            onChange={(e) => change(setKind, e.target.value)}
          >
            <option value="">所有类型</option>
            {[...new Set(events.map((e) => e.kind))].map((k) => (
              <option key={k} value={k}>
                {labels[k] ?? k}
              </option>
            ))}
          </select>
        </label>
        <label>
          年份
          <select
            aria-label="历程年份"
            value={year}
            onChange={(e) => change(setYear, e.target.value)}
          >
            <option value="">所有年份</option>
            {[...new Set(events.map((e) => Math.floor(e.day / B.world.daysPerYear) + 1))].map(
              (y) => (
                <option key={y} value={y}>
                  仙历 {y} 年
                </option>
              ),
            )}
          </select>
        </label>
      </div>
      <div className="journal">
        {[...groups].map(([year, rows]) => (
          <section key={year}>
            <h3 className="journal-year">仙历 {year} 年</h3>
            {rows.map((e) => (
              <article className="journal-entry" key={e.id}>
                <time>第 {e.day + 1} 日</time>
                <div>
                  <span className="journal-mark" />
                  {newFact(e.id) && <small className="new-event">上次查看后新增</small>}
                  <p>{e.text}</p>
                </div>
              </article>
            ))}
          </section>
        ))}
      </div>
      {!filtered.length && <p>没有符合筛选条件的经历。</p>}
      <nav className="journal-pagination" aria-label="历程分页">
        <Button variant="outline" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
          上一页
        </Button>
        <span>
          {Math.min(page + 1, pageCount)} / {pageCount} 页 · 每页 {PAGE_SIZE} 条
        </span>
        <Button
          variant="outline"
          disabled={page + 1 >= pageCount}
          onClick={() => setPage((n) => n + 1)}
        >
          下一页
        </Button>
      </nav>
    </section>
  );
}
