"use client";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogHeader,
} from "@/components/ui/dialog";
import { profileTabForClick, type OpenProfile } from "@/lib/ui/profile-navigation";
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="game-modal image-viewer">
          <DialogHeader>
            <DialogTitle>{alt}</DialogTitle>
            <DialogDescription>完整构图 · 查看图片不改变游戏进度。</DialogDescription>
          </DialogHeader>
          <img
            src={asset.src}
            alt={alt}
            className="image-viewer-image"
            width={asset.width}
            height={asset.height}
          />
        </DialogContent>
      </Dialog>
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
export function InventoryPanel({
  world: w,
  send,
  busy,
}: {
  world: World;
  send: Send;
  busy: boolean;
}) {
  const p = w.player;
  const artifact = ARTIFACTS.find((a) => a.id === w.profile.artifact)!;
  const icons = { healing: Heart, pills: Sparkles, grass: Leaf };
  const items = (Object.keys(SHOP_ITEMS) as (keyof typeof SHOP_ITEMS)[]).map((id) => ({
    id,
    ...SHOP_ITEMS[id],
    qty: p[id],
    icon: icons[id],
  }));
  return (
    <section className="panel-section">
      <div className="section-heading">
        <span className="eyebrow">行囊 · 山长水远</span>
        <h2 className="serif">随身之物</h2>
        <p>些许身外物，陪你走过此间山河。</p>
      </div>
      <div className="wealth">
        <Coins size={24} />
        <span>灵石</span>
        <strong>{p.stones}</strong>
        <small>枚</small>
      </div>
      <h3 className="list-heading">已拥有的物品</h3>
      <div className="inventory-grid">
        <article className="inventory-item">
          <img
            className="item-icon artifact-art"
            src={`/artifacts/${artifact.id}.svg`}
            alt=""
            width={36}
            height={36}
          />
          <div>
            <small>伴生法宝</small>
            <h3>{artifact.name}</h3>
            <p>{artifact.description}</p>
          </div>
          <span className="item-count">唯一</span>
        </article>
        <article className="inventory-item">
          <BookOpen className="item-icon" />
          <div>
            <small>功法</small>
            <h3>基础吐纳诀</h3>
            <p>{p.manual ? "已学会，永远记在心中。" : "尚未习得，可前往客栈领取。"}</p>
          </div>
          <span className="item-count">{p.manual ? "已习得" : "未习得"}</span>
        </article>
        {items
          .filter((item) => item.qty > 0)
          .map((item) => (
            <article className="inventory-item" key={item.id}>
              <item.icon className="item-icon" />
              <div>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                {item.id === "healing" && p.hp >= stats(p).maxHp && (
                  <small>气血已满，无需服用。</small>
                )}
                {item.id === "healing" && item.qty > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || p.hp >= stats(p).maxHp || !!w.battle || !!w.longAction}
                    onClick={() => send({ type: "heal" })}
                  >
                    服用一枚
                    <TimeBadge world={w} command={{ type: "heal" }} />
                  </Button>
                )}
              </div>
              <span className="item-count">× {item.qty}</span>
            </article>
          ))}
      </div>
      <div className="section-heading compact">
        <h3 className="serif">坊市药铺 · 可购买</h3>
        <p>
          {locationKind(p.location) === "market"
            ? "明码标价，童叟无欺。"
            : "来到当地坊市后，可以向药师购买。"}
        </p>
      </div>
      <div className="shop-list">
        {items.map((item) => (
          <div className="shop-row" key={item.id}>
            <item.icon size={19} />
            <div>
              <strong>
                {item.name} · 已有 {item.qty}
              </strong>
              <small data-shop-item={item.id} data-price={item.price}>
                {item.price} 灵石／份
              </small>
              {locationKind(p.location) !== "market" ? (
                <small>需到坊市购买</small>
              ) : (
                p.stones < item.price && <small>还缺 {item.price - p.stones} 灵石</small>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={
                busy ||
                locationKind(p.location) !== "market" ||
                p.stones < item.price ||
                !!w.longAction ||
                !!w.battle
              }
              onClick={() => send({ type: "buy", item: item.id })}
            >
              购买{item.name}
              <TimeBadge world={w} command={{ type: "buy", item: item.id }} />
            </Button>
          </div>
        ))}
      </div>
      <p className="action-reason">
        {locationKind(p.location) !== "market"
          ? "来到坊市后可兑换突破丹。"
          : !p.grass
            ? "兑换还需一株凝元草。"
            : p.stones < B.economy.pillExchange.spiritStoneCost
              ? `兑换还缺 ${B.economy.pillExchange.spiritStoneCost - p.stones} 灵石。`
              : "凝元草可用于突破丹，也可能用于履行同行约定。"}
      </p>
      <Button
        className="exchange-button"
        variant="ghost"
        disabled={
          busy ||
          locationKind(p.location) !== "market" ||
          !p.grass ||
          p.stones < B.economy.pillExchange.spiritStoneCost ||
          !!w.longAction ||
          !!w.battle
        }
        onClick={() => send({ type: "exchange" })}
      >
        凝元草 ×{B.economy.pillExchange.inputQuantity} ＋ 灵石 ×
        {B.economy.pillExchange.spiritStoneCost} → 突破丹 ×{B.economy.pillExchange.outputQuantity}
        <TimeBadge world={w} command={{ type: "exchange" }} />
      </Button>
    </section>
  );
}
export function PeoplePanel({ world: w, onProfile }: { world: World; onProfile: OpenProfile }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PeopleFilter>("nearby");
  const [sort, setSort] = useState("present");
  const [page, setPage] = useState(0);
  const people = useMemo(() => peopleRows(w, query, filter, sort), [w, query, filter, sort]);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(people.length / 24) - 1));
  const row = (a: Actor) => (
    <button
      className="person-row"
      key={a.id}
      onClick={(event) => onProfile(a.id, profileTabForClick(event))}
    >
      <NpcPortrait world={w} actor={a} className="person-avatar" />
      <div>
        <h3>
          {a.name}
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
      <span className="relationship-tag">
        {relationshipDisplay(w, "PLAYER", a.id).label} · 资料 →
      </span>
    </button>
  );
  return (
    <section className="panel-section">
      <div className="section-heading">
        <span className="eyebrow">故人 · 一面一缘</span>
        <h2 className="serif">相逢的人</h2>
        <p>有人萍水相逢，有人会成为你这一世的牵挂。</p>
      </div>
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
      <div className="list-pagination">
        <span>
          共 {people.length} 人 · 第 {currentPage + 1} /{" "}
          {Math.max(1, Math.ceil(people.length / 24))} 页
        </span>
        <Button variant="ghost" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>
          上一页
        </Button>
        <Button
          variant="ghost"
          disabled={(currentPage + 1) * 24 >= people.length}
          onClick={() => setPage(currentPage + 1)}
        >
          下一页
        </Button>
      </div>
      <div className="people-grid">
        {people.slice(currentPage * 24, (currentPage + 1) * 24).map(row)}
      </div>
      {!people.length && (
        <div className="empty-copy">
          <p>当前筛选没有匹配人物。</p>
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
        </div>
      )}
    </section>
  );
}

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
          <Swords size={14} /> 秘境遭遇 · 第 {b.round} 回合
        </span>
        <h2 className="serif">残碑守卫</h2>
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
            onClick={(event) => onProfile(a.id, profileTabForClick(event))}
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
          {(
            [
              { id: "attack", name: "普攻", icon: Swords },
              {
                id: "skill",
                name: p.cooldown ? `剑诀 · 调息 ${p.cooldown}` : "青芒剑诀",
                icon: Wind,
              },
              { id: "guard", name: "防御", icon: Shield },
              { id: "heal", name: `回春丹 · ${w.player.healing}`, icon: Heart },
              { id: "retreat", name: "撤退", icon: Moon },
            ] as const
          ).map((a) => (
            <Button
              key={a.id}
              variant={a.id === "skill" ? "default" : "outline"}
              disabled={
                busy ||
                autoRunning ||
                (a.id === "skill" && p.cooldown > 0) ||
                (a.id === "heal" && (w.player.healing === 0 || p.hp >= p.maxHp))
              }
              onClick={() =>
                send({
                  type: "battle",
                  action: a.id,
                  ...(a.id === "attack" || a.id === "skill" ? { target: activeTarget } : {}),
                })
              }
            >
              <a.icon size={16} />
              <span className="combat-action-label">{a.name}</span>
              <TimeBadge
                world={w}
                command={{
                  type: "battle",
                  action: a.id,
                  ...(a.id === "attack" || a.id === "skill" ? { target: activeTarget } : {}),
                }}
              />
            </Button>
          ))}
        </div>
        <p className="skill-status">
          {p.cooldown ? `剑诀调息还需 ${p.cooldown} 回合。` : "青芒剑诀可以使用。"}
          {!w.player.healing ? " 当前没有回春丹。" : p.hp >= p.maxHp ? " 气血已满，无需服丹。" : ""}
        </p>
      </div>
    </section>
  );
}
