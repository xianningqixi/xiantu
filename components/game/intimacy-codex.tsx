"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PagedContent } from "@/components/ui/paged-content";
import {
  codexKinds,
  codexSummary,
  filterCodex,
  intimacyCodex,
  type CodexKind,
} from "@/lib/game/intimacy-codex";
import { LOCATIONS } from "@/lib/game/world-map";
import type { World } from "@/lib/game/types";
import type { OpenProfile } from "@/lib/ui/profile-navigation";

export function IntimacyCodex({ world: w, onProfile }: { world: World; onProfile?: OpenProfile }) {
  const [kind, setKind] = useState<CodexKind | "">("");
  const [person, setPerson] = useState("");
  const summary = codexSummary(w);
  const all = filterCodex(
    person ? intimacyCodex(w).filter((p) => p.id === person) : intimacyCodex(w),
    kind,
  );
  if (!summary.total)
    return (
      <div className="empty-copy">
        <p>尚无可回看的亲密经历。结为道侣、共度良宵或双修后会记入这里。</p>
      </div>
    );
  return (
    <section className="intimacy-codex" aria-label="亲密图鉴">
      <p className="journal-count">
        共 {summary.people} 人 · {summary.total} 条（结侣 {summary.bond} · 良宵 {summary.night} ·
        双修 {summary.dual}）
      </p>
      <div className="dual-methods" role="radiogroup" aria-label="图鉴筛选">
        <Button
          variant={kind === "" ? "secondary" : "outline"}
          aria-checked={kind === ""}
          role="radio"
          onClick={() => setKind("")}
        >
          全部
        </Button>
        {(Object.keys(codexKinds) as CodexKind[]).map((key) => (
          <Button
            key={key}
            variant={kind === key ? "secondary" : "outline"}
            aria-checked={kind === key}
            role="radio"
            onClick={() => setKind(key)}
          >
            {codexKinds[key]}
          </Button>
        ))}
        <label className="codex-person">
          人物
          <select aria-label="图鉴人物" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">所有人物</option>
            {intimacyCodex(w).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <PagedContent label="亲密图鉴" resetKey={`${kind}:${person}`}>
        <div className="memory-list">
          {all.map((p) => (
            <section key={p.id} className="codex-person-block">
              <h3 className="list-heading">
                {onProfile ? (
                  <button className="character-link" onClick={() => onProfile(p.id)}>
                    {p.name}
                  </button>
                ) : (
                  p.name
                )}
                {!p.alive && "（已逝）"} · {p.entries.length} 条
              </h3>
              {p.entries.map((e) => (
                <article key={e.id} className="sheet-memory" data-event-id={e.id}>
                  <small>
                    第 {e.day + 1} 日 ·{" "}
                    <span className={`intimacy-kind intimacy-${e.kind}`}>{codexKinds[e.kind]}</span>
                    {w.events.find((x) => x.id === e.id)?.location &&
                      ` · ${LOCATIONS[w.events.find((x) => x.id === e.id)!.location!].name}`}
                  </small>
                  <p>{e.text}</p>
                </article>
              ))}
            </section>
          ))}
        </div>
        {!all.length && <p className="empty-copy">没有符合筛选的记录。</p>}
      </PagedContent>
    </section>
  );
}
