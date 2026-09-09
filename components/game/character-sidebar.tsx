"use client";
import { companionStatus } from "@/lib/game/journey-presentation";
import { profileTabForClick, type OpenProfile } from "@/lib/ui/profile-navigation";
import { memo } from "react";
import { TimeBadge } from "./time-badge";
import { PlayerPortrait } from "./player-portrait";
import { NpcPortrait } from "./npc-portrait";

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
  setProfileId: OpenProfile;
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
  const companion = companionStatus(w);
  const artifact = ARTIFACTS.find((a) => a.id === w.profile.artifact)!;
  const companions = w.party
    .filter((id) => id !== p.id)
    .map((id) => w.npcs.find((a) => a.id === id)!);
  const busyCompanion = companions.find((a) => a.attempt);
  return (
    <aside className="character-sidebar">
      <button
        className="player-identity"
        onClick={(event) => setProfileId("PLAYER", profileTabForClick(event))}
      >
        <PlayerPortrait world={w} className={`player-seal color-${w.profile.appearance.color}`} />
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
            <Button
              variant="outline"
              onClick={(event) => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                useTab(goal.tab);
              }}
            >
              去看看
            </Button>
          </section>
          <section>
            <h3>伴生法宝 · {artifact.name}</h3>
            <p>{artifact.description}</p>
          </section>
          <section>
            <h3>同行之人 · {companions.length} / 3</h3>
            {companions.map((a) => (
              <Button
                key={a.id}
                variant="ghost"
                onClick={(event) => setProfileId(a.id, profileTabForClick(event))}
              >
                {a.name} · {REALMS[a.realm]}
              </Button>
            ))}
            {companions.length === 0 && <p>暂时独行，可以在游历中寻找同伴。</p>}
          </section>
        </div>
      </details>
      <div className="sidebar-wealth">
        <Coins size={16} />
        <span>灵石</span>
        <strong>{p.stones}</strong>
      </div>
      <div className="sidebar-artifact">
        <img
          className="small-seal artifact-art"
          src={`/artifacts/${artifact.id}.svg`}
          alt=""
          width={36}
          height={36}
        />
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
          <small>{companions.length} / 3</small>
        </div>
        {companions.map((a) => (
          <button
            className="party-member"
            key={a.id}
            onClick={(event) => setProfileId(a.id, profileTabForClick(event))}
          >
            <NpcPortrait world={w} actor={a} className="mini-portrait" />
            <span>{a.name}</span>
            <small>{REALMS[a.realm]}</small>
          </button>
        ))}
        {companion ? (
          <p>
            <strong>{companion.title}</strong>
            <br />
            {companion.text}
          </p>
        ) : (
          companions.length === 0 && <p>山路尚长，寻一两位同道吧。</p>
        )}
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
        {companions.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={blocked || !!w.loot}
            onClick={() => send({ type: "disband" })}
          >
            暂别同伴（取消本次约定）
            <TimeBadge world={w} command={{ type: "disband" }} />
          </Button>
        )}
      </div>
    </aside>
  );
});
