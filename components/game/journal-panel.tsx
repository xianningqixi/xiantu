"use client";
import { PagedContent } from "@/components/ui/paged-content";
import { SectionNav } from "@/components/ui/section-nav";
import { useCompactLayout } from "@/lib/ui/use-compact-layout";
import { MainQuestLog } from "./main-quest-log";
import { Button } from "@/components/ui/button";
import B from "@/lib/game/content/balance.json";
import { visibleEvents } from "@/lib/game/engine";
import type { World } from "@/lib/game/types";
import { useEffect, useMemo, useState } from "react";

type Seen = { day: number; ids: string[] };
const key = (world: World) => `xiantu:journal-seen:${world.saveId}`;
const labels: Record<string, string> = {
  buy: "购买",
  heal: "服丹疗伤",
  rest: "歇息",
  exchange: "兑换",
  learn: "学习功法",
  negotiation: "同行交涉",
  agreement: "订立约定",
  "agreement-ended": "约定了结",
  expedition: "秘境出征",
  "battle-win": "战斗获胜",
  "battle-retreat": "退出战斗",
  "battle-defeat": "战斗失利",
  "story-choice": "剧情选择",
  "shared-experience": "共同经历",
  "npc-meet": "结识同道",
  "npc-friendship": "结为朋友",
  "npc-depart": "辞行访宗",
  "npc-arrive": "行路抵达",
  "sect-visit": "拜访宗门",
  "sect-join": "拜入宗门",
  "sect-resident": "门人修行",
  "sect-task": "宗门委托",
  "sect-art": "研习心法",
  "sect-leave": "辞别师门",
  companionship: "相伴交流",
  intimacy: "性与亲密经历",
  advance: "境界提升",
  breakthrough: "突破成功",
  "breakthrough-failed": "突破未成",
  death: "离世",
  conflict: "冲突",
  travel: "行旅",
  "main-story": "主线线索",
  survey: "残碑勘察",
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
  const PAGE_SIZE = useCompactLayout() ? 2 : 4;
  const [view, setView] = useState("events");
  const [newOnly, setNewOnly] = useState(false);
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
  const isNew = (id: string) => {
    const learned = w.knowledge[id]?.find((row) => row[0] === 0)?.[3] ?? -1;
    return learned > seen.day || (learned === seen.day && !seen.ids.includes(id));
  };
  const filtered = useMemo(
    () =>
      events.filter(
        (e) =>
          (!person || e.actors.includes(person)) &&
          (!kind || (kind === "other" ? !labels[e.kind] : e.kind === kind)) &&
          (!newOnly || isNew(e.id)) &&
          (!year || String(Math.floor(e.day / B.world.daysPerYear) + 1) === year),
      ),
    [events, person, kind, year, newOnly, seen],
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
    <section className="panel-section screen-panel journal-panel">
      <SectionNav
        label="历程分类"
        value={view}
        onChange={setView}
        items={[
          { id: "events", label: "人物与见闻" },
          { id: "main", label: "主线线索" },
        ]}
      />
      <PagedContent label="历程" resetKey={`${view}:${page}:${kind}:${person}:${year}`}>
        <div hidden={view !== "main"}>
          <MainQuestLog world={w} />
        </div>
        <div hidden={view !== "events"}>
          <p className="journal-count">
            共 {filtered.length} 条已知经历 · {events.filter((e) => newFact(e.id)).length} 条新增
          </p>
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
                {[...new Set(events.map((e) => (labels[e.kind] ? e.kind : "other")))].map((k) => (
                  <option key={k} value={k}>
                    {labels[k] ?? "其他经历"}
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
          <div className="list-pagination">
            <label>
              <input
                type="checkbox"
                checked={newOnly}
                onChange={(e) => {
                  setNewOnly(e.target.checked);
                  setPage(0);
                }}
              />{" "}
              仅看上次查看后新增
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
                      {newFact(e.id) && <small className="new-event">新增</small>}
                      <p>{e.text}</p>
                    </div>
                  </article>
                ))}
              </section>
            ))}
          </div>
          {!filtered.length && (
            <div className="empty-copy">
              <p>没有符合筛选条件的经历。</p>
              <Button
                variant="outline"
                onClick={() => {
                  setPerson("");
                  setKind("");
                  setYear("");
                  setNewOnly(false);
                  setPage(0);
                }}
              >
                清除筛选
              </Button>
            </div>
          )}
        </div>
      </PagedContent>
      <nav hidden={view !== "events"} className="journal-pagination" aria-label="历程分页">
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
