"use client";
import { relationshipStage } from "@/lib/ui/relationship-stage";
import { RelationshipStage } from "./relationship-stage";
import { PagedContent } from "@/components/ui/paged-content";
import { SectionNav } from "@/components/ui/section-nav";
import { useCompactLayout } from "@/lib/ui/use-compact-layout";
import { ImageViewer } from "./image-viewer";
import { profileTargetForClick, type OpenProfile } from "@/lib/ui/profile-navigation";
import { imageAsset } from "@/lib/game/images";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import B from "@/lib/game/content/balance.json";
import { ART, ARTIFACTS, PACK, REALMS } from "@/lib/game/content/official";
import { LOCATIONS, locationKind, regionOf } from "@/lib/game/world-map";
import { SHOP_ITEMS, STONE_METHOD } from "@/lib/game/economy";
import {
  breakthroughChance,
  gainPerDay,
  relation,
  relationshipLabel,
  stats,
  threshold,
} from "@/lib/game/engine";
import type { Actor, Command, World } from "@/lib/game/types";
import {
  BookOpen,
  Coins,
  Heart,
  Leaf,
  LockKeyhole,
  Moon,
  Shield,
  Sparkles,
  Sprout,
  Sun,
  Swords,
  Wind,
} from "lucide-react";
import {
  peopleRows,
  relationshipDisplay,
  type PeopleFilter,
} from "@/lib/ui/character-presentation";
import { useMemo, useState } from "react";
import { trainingPreview } from "@/lib/game/training-preview";
import { advanceRule } from "@/lib/game/rules";
import { skillConfig, usableSkills } from "@/lib/game/skills";
import { NpcPortrait } from "./npc-portrait";
import { TimeBadge } from "./time-badge";

export { JournalPanel } from "./journal-panel";
export type Send = (c: Command) => Promise<boolean>;
export function GameImage({
  src,
  alt,
  className = "",
  zoom = false,
}: {
  src: string;
  alt: string;
  className?: string;
  zoom?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const asset = imageAsset(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const picture =
    !src || failedSrc === src ? (
      <div className={`image-fallback ${className}`} role="img" aria-label={alt}>
        <Leaf />
        <span>{alt}</span>
      </div>
    ) : (
      <img
        className={className}
        src={asset.src}
        width={asset.width}
        height={asset.height}
        decoding="async"
        loading={asset.lazy ? "lazy" : undefined}
        alt={alt}
        onError={() => setFailedSrc(src)}
      />
    );
  return zoom ? (
    <>
      <button
        type="button"
        className="image-expand"
        onClick={() => setOpen(true)}
        aria-label={`放大查看：${alt}`}
      >
        {picture}
        <span>查看全图 ↗</span>
      </button>
      <ImageViewer
        open={open}
        onOpenChange={setOpen}
        src={asset.src}
        alt={alt}
        width={asset.width}
        height={asset.height}
      />
    </>
  ) : (
    picture
  );
}
export function Meter({
  label,
  value,
  max,
  kind = "",
}: {
  label: string;
  value: number;
  max: number;
  kind?: string;
}) {
  return (
    <div className={`meter ${kind}`}>
      <div className="spread">
        <span>{label}</span>
        <small>
          {value} <span>/ {max}</span>
        </small>
      </div>
      <Progress aria-label={label} value={Math.min(100, (value / max) * 100)} />
    </div>
  );
}
export { InventoryPanel } from "./inventory-panel";
export function PeoplePanel({ world: w, onProfile }: { world: World; onProfile: OpenProfile }) {
  const [all, setAll] = useState(false);
  const [group, setGroup] = useState("known");
  const pageSize = useCompactLayout() ? 3 : 6;
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PeopleFilter>("nearby");
  const [sort, setSort] = useState("present");
  const [page, setPage] = useState(0);
  const people = useMemo(() => peopleRows(w, query, filter, sort), [w, query, filter, sort]);
  const groups = [
    { id: "party", label: "同行之人", rows: w.npcs.filter((a) => w.party.includes(a.id)) },
    {
      id: "known",
      label: "已结识",
      rows: peopleRows(w, "", "known", "present")
        .filter((a) => !w.party.includes(a.id))
        .sort((a, b) => relationshipStage(w, b.id).step - relationshipStage(w, a.id).step),
    },
    {
      id: "present",
      label: "此地在场",
      rows: peopleRows(w, "", "present", "present").filter(
        (a) => !relation(w, a.id)?.known && !w.party.includes(a.id),
      ),
    },
  ];
  const listed = all ? people : groups.find((g) => g.id === group)!.rows;
  const pageCount = Math.max(1, Math.ceil(listed.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const row = (a: Actor) => (
    <button
      className="person-row"
      key={a.id}
      onClick={(event) => onProfile(a.id, profileTargetForClick(event))}
    >
      <NpcPortrait world={w} actor={a} className="person-avatar" />
      <div>
        <h3>
          {all || relation(w, a.id)?.known || w.party.includes(a.id) ? a.name : "尚未相识"}
          <small>{REALMS[a.realm]}</small>
        </h3>
        <p>
          {!a.alive
            ? "已逝"
            : a.npcJourney
              ? `赶路中 · ${a.npcJourney.remaining} 日后抵达`
              : a.location === w.player.location
                ? "就在此处"
                : relation(w, a.id)?.known
                  ? `行踪：${LOCATIONS[a.location].name}`
                  : "尚未相识"}
        </p>
      </div>
      <RelationshipStage world={w} id={a.id} />
    </button>
  );
  return (
    <section className="panel-section screen-panel people-panel">
      <header className="section-heading">
        <div>
          <h2 className="serif">查看人物</h2>
          <p>已结识 {groups[1].rows.length + groups[0].rows.length} 人</p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setAll(!all);
            setPage(0);
          }}
        >
          {all ? "返回人物概览" : "查看全部人物"}
        </Button>
      </header>
      {!all ? (
        <SectionNav
          label="人物分组"
          value={group}
          onChange={(value) => {
            setGroup(value);
            setPage(0);
          }}
          items={groups}
        />
      ) : (
        <div className="people-controls">
          <label>
            搜索姓名
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="搜索可见人物"
            />
          </label>
          <label>
            人物范围
            <select
              aria-label="人物范围"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value as PeopleFilter);
                setPage(0);
              }}
            >
              <option value="nearby">已结识与此地可结识</option>
              <option value="known">已结识</option>
              <option value="present">在场</option>
              <option value="region">同城</option>
              <option value="agreement">有约定</option>
            </select>
          </label>
          <label>
            排序
            <select
              aria-label="排序"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(0);
              }}
            >
              <option value="present">在场优先</option>
              <option value="recent">最近共同经历</option>
              <option value="name">姓名</option>
            </select>
          </label>
        </div>
      )}
      <PagedContent label="人物列表" resetKey={`${all}:${group}:${query}:${filter}:${currentPage}`}>
        <div className="people-grid">
          {listed.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(row)}
        </div>
        {!listed.length && (
          <div className="empty-copy">
            <p>{all ? "当前筛选没有匹配人物。" : "暂无记录，可在游历中结识同道。"}</p>
            {all && (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setFilter("nearby");
                  setPage(0);
                }}
              >
                清除筛选
              </Button>
            )}
          </div>
        )}
      </PagedContent>
      <nav className="list-pagination" aria-label="人物列表分页">
        <span>
          共 {listed.length} 人 · {currentPage + 1} / {pageCount} 页
        </span>
        <Button variant="ghost" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>
          上一页
        </Button>
        <Button
          variant="ghost"
          disabled={currentPage + 1 >= pageCount}
          onClick={() => setPage(currentPage + 1)}
        >
          下一页
        </Button>
      </nav>
    </section>
  );
}

const FIELD_TITLES = {
  story: { eyebrow: "秘境遭遇", title: "残碑守卫" },
  expedition: { eyebrow: "秘境遭遇", title: "残碑守卫" },
  road: { eyebrow: "途中遭遇", title: "拦路之敌" },
  explore: { eyebrow: "郊野遭遇", title: "荒野突袭" },
};

export function BattlePanel({
  world: w,
  send,
  busy,
  autoRunning,
  onAuto,
  onProfile,
}: {
  world: World;
  send: Send;
  busy: boolean;
  autoRunning: boolean;
  onAuto: (enabled: boolean) => Promise<void>;
  onProfile: OpenProfile;
}) {
  const b = w.battle!;
  const p = b.allies.find((a) => a.id === "PLAYER")!;
  const [target, setTarget] = useState(b.enemies.find((e) => e.hp > 0)?.id || "ENEMY_0");
  const activeTarget = b.enemies.some((e) => e.id === target && e.hp > 0)
    ? target
    : b.enemies.find((e) => e.hp > 0)?.id;
  return (
    <section className="battle-panel">
      <div className="section-heading">
        <span className="eyebrow">
          <Swords size={14} /> {FIELD_TITLES[b.kind ?? "story"].eyebrow} · 第 {b.round} 回合
        </span>
        <h2 className="serif">{FIELD_TITLES[b.kind ?? "story"].title}</h2>
        <p>
          主角由你指挥，同伴会自行行动。
          {b.lethal ? "本次遭遇可能造成真实死亡，请谨慎应对。" : "本次遭遇不会致命。"}
        </p>
      </div>
      <div className="battle-scene">
        <GameImage src={ART.ruins} alt="月下残碑秘境" />
        <div className="enemy-row">
          {b.enemies.map((e) => (
            <button
              key={e.id}
              className={`fighter enemy ${activeTarget === e.id ? "targeted" : ""}`}
              disabled={e.hp === 0}
              onClick={() => setTarget(e.id)}
              aria-pressed={activeTarget === e.id}
            >
              <Shield size={30} />
              <h3>{e.name}</h3>
              {e.guard && <small className="fighter-state">守势</small>}
              <Meter label={e.hp ? "气血" : "已击败"} value={e.hp} max={e.maxHp} />
            </button>
          ))}
        </div>
      </div>
      <div className="ally-row">
        {b.allies.map((a) => (
          <button
            className="fighter ally"
            key={a.id}
            onClick={(event) => onProfile(a.id, profileTargetForClick(event))}
            aria-label={`查看${a.name}的人物资料`}
          >
            <strong>
              {a.name}
              <small>{a.id === "PLAYER" ? "主角" : "同伴"}</small>
            </strong>
            <Meter label={a.hp ? "气血" : "倒地"} value={a.hp} max={a.maxHp} />
          </button>
        ))}
      </div>
      <div className="battle-controls" id="battle-controls" tabIndex={-1}>
        <div className="spread">
          <h3>你的行动</h3>
          <label className="inline-switch">
            自动战斗
            <Switch
              checked={autoRunning}
              onCheckedChange={(enabled) => void onAuto(enabled)}
              disabled={busy}
            />
          </label>
        </div>
        <div className="battle-log" aria-live="polite" aria-label="最近战报">
          {b.logs
            .slice(-6)
            .reverse()
            .map((line, i) => (
              <p
                className={line.includes(w.player.name) ? "player-turn" : ""}
                key={`${b.logs.length}-${i}`}
              >
                {line}
              </p>
            ))}
        </div>
        <div className="combat-actions">
          {(() => {
            const skills = usableSkills(w.player).map((skill) => ({
              id: `skill-${skill}`,
              skill,
              name:
                p.cooldown > 0
                  ? `${skillConfig(skill).name} · 调息 ${p.cooldown}`
                  : skillConfig(skill).name,
              icon: Wind,
            }));
            const actions = [
              { id: "attack", name: "普攻", icon: Swords, skill: undefined },
              ...skills,
              { id: "guard", name: "防御", icon: Shield, skill: undefined },
              { id: "heal", name: `回春丹 · ${w.player.healing}`, icon: Heart, skill: undefined },
              { id: "retreat", name: "撤退", icon: Moon, skill: undefined },
            ];
            return actions.map((a) => {
              const isSkill = !!a.skill;
              const battleAction = isSkill ? "skill" : a.id;
              const command = {
                type: "battle" as const,
                action: battleAction as "attack" | "skill" | "guard" | "heal" | "retreat",
                ...(a.skill ? { skill: a.skill } : {}),
                ...(a.id === "attack" || isSkill ? { target: activeTarget } : {}),
              };
              return (
                <Button
                  key={a.id}
                  variant={isSkill ? "default" : "outline"}
                  disabled={
                    busy ||
                    autoRunning ||
                    (isSkill && p.cooldown > 0) ||
                    (a.id === "heal" && (w.player.healing === 0 || p.hp >= p.maxHp))
                  }
                  onClick={() => send(command)}
                >
                  <a.icon size={16} />
                  <span className="combat-action-label">{a.name}</span>
                  <TimeBadge world={w} command={command} />
                </Button>
              );
            });
          })()}
        </div>
        <p className="skill-status">
          {p.cooldown
            ? `招式调息还需 ${p.cooldown} 回合。`
            : `可用招式：${usableSkills(w.player)
                .map((skill) => skillConfig(skill).name)
                .join("、")}。`}
          {!w.player.healing ? " 当前没有回春丹。" : p.hp >= p.maxHp ? " 气血已满，无需服丹。" : ""}
        </p>
      </div>
    </section>
  );
}
