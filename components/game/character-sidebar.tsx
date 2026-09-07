"use client";
import { memo } from "react";
import { TimeBadge } from "./time-badge";
import { usePortrait } from "./portrait-studio";

import { Button } from "@/components/ui/button";
import { ARTIFACTS, REALMS } from "@/lib/game/content/official";
import { stats, threshold } from "@/lib/game/engine";
import { objective } from "@/lib/game/presentation";
import type { World } from "@/lib/game/types";
import { ArrowRight, ChevronRight, Coins, Feather } from "lucide-react";
import type { Send } from "./panels";
import { Meter } from "./panels";

type SidebarProps = {
  world: World;
  goal: ReturnType<typeof objective>;
  setProfileId: (id: string) => void;
  useTab: (tab: string) => void;
  send: Send;
  act: Send;
  blocked: boolean;
};

export const CharacterSidebar = memo(function CharacterSidebar({
  world: w,
  goal,
  setProfileId,
  useTab,
  send,
  act,
  blocked,
}: SidebarProps) {
  const p = w.player;
  const portrait = usePortrait(p.portraitId);
  const artifact = ARTIFACTS.find((a) => a.id === w.profile.artifact)!;
  const busyCompanion = w.party
    .map((id) => w.npcs.find((a) => a.id === id))
    .find((a) => a?.attempt);
  return (
    <aside className="character-sidebar">
      <button className="player-identity" onClick={() => setProfileId("PLAYER")}>
        <span className={`player-seal color-${w.profile.appearance.color} serif`}>
          {portrait ? (
            <img src={portrait} width={640} height={960} alt={`${p.name}的全身立绘`} />
          ) : (
            p.name[0]
          )}
        </span>
        <div>
          <small>你的角色</small>
          <h2 className="serif">{p.name}</h2>
          <span>
            {REALMS[p.realm]} · {Math.floor(p.ageDays / 360)} 岁
          </span>
        </div>
        <ChevronRight size={15} />
      </button>
      <div className="player-meters">
        <Meter label="气血" value={p.hp} max={stats(p).maxHp} kind="health" />
        <Meter label="修为" value={p.xp} max={threshold(p)} />
      </div>
      <details className="mobile-status">
        <summary>
          <span>
            <Coins size={15} /> {p.stones} 灵石
          </span>
          <strong>{goal.title}</strong>
          <span>展开状态</span>
        </summary>
        <div className="mobile-status-body">
          <section>
            <h3>眼下之事 · {goal.title}</h3>
            <p>{goal.text}</p>
            <Button variant="outline" onClick={() => useTab(goal.tab)}>
              去看看
            </Button>
          </section>
          <section>
            <h3>伴生法宝 · {artifact.name}</h3>
            <p>{artifact.description}</p>
          </section>
          <section>
            <h3>同行之人 · {w.party.length} / 3</h3>
            {w.party.map((id) => {
              const a = id === "PLAYER" ? p : w.npcs.find((a) => a.id === id)!;
              return (
                <Button key={id} variant="ghost" onClick={() => setProfileId(id)}>
                  {a.name} · {REALMS[a.realm]}
                </Button>
              );
            })}
            {w.party.length === 1 && <p>暂时独行，可以在游历中寻找同伴。</p>}
          </section>
        </div>
      </details>
      <div className="sidebar-wealth">
        <Coins size={16} />
        <span>灵石</span>
        <strong>{p.stones}</strong>
      </div>
      <div className="sidebar-artifact">
        <span className="small-seal serif">{artifact.glyph}</span>
        <div>
          <small>伴生法宝</small>
          <strong>{artifact.name}</strong>
        </div>
      </div>
      <div className="objective">
        <span className="eyebrow">
          <Feather size={13} /> 眼下之事
        </span>
        <h3>{goal.title}</h3>
        <p>{goal.text}</p>
        <button onClick={() => useTab(goal.tab)}>
          去看看 <ArrowRight size={14} />
        </button>
      </div>
      <div className="party-panel">
        <div className="spread">
          <h3>同行之人</h3>
          <small>{w.party.length} / 3</small>
        </div>
        {w.party.map((id) => {
          const a = id === "PLAYER" ? p : w.npcs.find((n) => n.id === id)!;
          return (
            <button className="party-member" key={id} onClick={() => setProfileId(id)}>
              <span className="mini-initial serif">{a.name[0]}</span>
              <span>{a.name}</span>
              <small>{id === "PLAYER" ? "你" : REALMS[a.realm]}</small>
            </button>
          );
        })}
        {w.party.length === 1 && <p>山路尚长，寻一两位同道吧。</p>}
        {busyCompanion && (
          <p>
            {busyCompanion.name}正在突破，还需 {busyCompanion.attempt!.remaining} 日。
            <Button
              size="sm"
              variant="outline"
              disabled={blocked}
              onClick={() => act({ type: "wait", days: 1 })}
            >
              等候一日
              <TimeBadge world={w} command={{ type: "wait", days: 1 }} />
            </Button>
          </p>
        )}
        {w.party.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={blocked || !!w.loot}
            onClick={() => send({ type: "disband" })}
          >
            暂别同伴
            <TimeBadge world={w} command={{ type: "disband" }} />
          </Button>
        )}
      </div>
      <p className="sidebar-note">
        翻阅与交谈不消耗时间。
        <br />
        每一次行动，才让世界向前。
      </p>
    </aside>
  );
});
