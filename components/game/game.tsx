"use client";
import balanceLimits from "@/lib/game/content/balance.json";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  Compass,
  Feather,
  Heart,
  Leaf,
  LoaderCircle,
  MapPin,
  Moon,
  Package,
  Pause,
  Play,
  RotateCcw,
  Save,
  ScrollText,
  Settings2,
  Shield,
  Sparkles,
  Swords,
  Upload,
  Users,
  Wind,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { useGame } from "@/lib/game/use-game";
import { createContinuationGuard } from "@/lib/game/continuation";
import {
  ART,
  ARTIFACTS,
  LOCATIONS,
  PACK,
  REALMS,
  PRESENTATION,
  CHARACTERS,
  contentText,
  visual,
} from "@/lib/game/content/official";
import {
  knownNpcUpdates,
  relation,
  relationshipLabel,
  scene,
  stats,
  threshold,
  partyReadiness,
  departureStatus,
} from "@/lib/game/engine";
import type { Command, LocationId, Profile, SaveExpectation, World } from "@/lib/game/types";
import { OfflineStatus } from "./offline-status";
import { Negotiation } from "./negotiation";
import { SideStories } from "./side-stories";
import { Creation } from "./creation";
import { BackupManager } from "./backups";
import {
  BattlePanel,
  CultivationPanel,
  GameImage,
  InventoryPanel,
  JournalPanel,
  Meter,
  PeoplePanel,
  PersonDetail,
} from "./panels";

const NAV = [
  { id: "journey", name: "游历", icon: Compass },
  { id: "cultivation", name: "修行", icon: Wind },
  { id: "people", name: "故人", icon: Users },
  { id: "inventory", name: "行囊", icon: Package },
  { id: "journal", name: "历程", icon: ScrollText },
];
function objective(w: World) {
  const name = w.npcs.find((a) => a.id === PACK.roles.primary)?.name || CHARACTERS.primary.name;
  if (w.battle)
    return { title: "应对秘境遭遇", text: "指挥你的行动，或开启自动战斗。", tab: "journey" };
  if (w.player.realm === 4)
    return { title: "筑基已成", text: "再访故人，看看他们这些日子的变化。", tab: "people" };
  if (!w.player.manual)
    return { title: "寻一册入门功法", text: "向药摊旁的修士问路，或去客栈领书。", tab: "journey" };
  if (w.player.realm === 0)
    return { title: "引气入体", text: "积累 20 修为，尝试成为炼气修士。", tab: "cultivation" };
  if (w.loot)
    return {
      title: "兑现同行的约定",
      text:
        w.player.location === "ruins"
          ? "返回坊市，再清点这次的收获。"
          : "决定凝元草的归属。你的选择会被记住。",
      tab: "journey",
    };
  if (w.story.outcome === "fulfilled" || w.story.outcome === "breached")
    return {
      title: w.story.flags.reunion ? "准备下一次突破" : "再访一位故人",
      text: w.story.flags.reunion
        ? "继续修炼，备好丹药，向筑基迈进。"
        : `三日后，回坊市看看${name}。`,
      tab: w.story.flags.reunion ? "cultivation" : "journey",
    };
  if (w.agreement?.status === "accepted")
    return { title: "结伴探访残碑", text: "集齐三人，备好两枚灵石，从古道出发。", tab: "journey" };
  return { title: "找一位同行之人", text: `听听${name}的打算，商定一场秘境之行。`, tab: "journey" };
}

export default function Game({ preview = false }: { preview?: boolean }) {
  const game = useGame(preview);
  const { world: w, ready, busy, error, command: send } = game;
  const [tab, setTab] = useState("journey");
  const [profileId, setProfileId] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const confirmSnapshot = useRef<SaveExpectation | null>(null);
  const [continuations] = useState(createContinuationGuard);
  const [showCreate, setShowCreate] = useState(false);
  const [running, setRunning] = useState(false);
  const [visible, setVisible] = useState(true);
  const [confirm, setConfirm] = useState<"new" | "import" | "breach" | null>(null);
  const [draft, setDraft] = useState<{
    profile: Profile;
    seed: number;
    contentLocks: string[];
  } | null>(null);
  const [importText, setImportText] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  const pause = () => {
    continuations.cancel();
    setRunning(false);
    setAutoRunning(false);
  };
  const reload = () => {
    pause();
    return game.reload();
  };
  const requestConfirm = (value: "new" | "import" | "breach") => {
    pause();
    confirmSnapshot.current = { ...game.expected };
    setConfirm(value);
  };
  const primaryName =
    w?.npcs.find((a) => a.id === PACK.roles.primary)?.name || CHARACTERS.primary.name;
  const intro = PRESENTATION.prologue;
  useEffect(() => {
    const change = () => {
      setVisible(!document.hidden);
      if (document.hidden) {
        continuations.cancel();
        setRunning(false);
        setAutoRunning(false);
      }
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, [continuations]);
  useEffect(() => {
    if (!w || busy || !visible || settings || showCreate || confirm) return;
    if (w.longAction && running) {
      const timer = setTimeout(() => {
        void send({ type: "step" }).then((ok) => {
          if (!ok) setRunning(false);
        });
      }, 250);
      return () => clearTimeout(timer);
    }
    if (w.battle && autoRunning) {
      const timer = setTimeout(() => {
        const p = w.battle!.allies.find((a) => a.id === "PLAYER")!;
        const action =
          p.hp / p.maxHp <= 0.35 && w.player.healing > 0
            ? "heal"
            : p.cooldown === 0
              ? "skill"
              : "attack";
        void send({ type: "battle", action }).then((ok) => {
          if (!ok) setAutoRunning(false);
        });
      }, 700);
      return () => clearTimeout(timer);
    }
  }, [w, busy, visible, running, autoRunning, settings, showCreate, confirm, send]);
  useEffect(() => {
    if (!w?.longAction) setRunning(false);
  }, [w?.longAction]);
  useEffect(() => {
    if (!w?.battle) setAutoRunning(false);
  }, [w?.battle]);
  const act = (c: Command) =>
    continuations.run(
      () => send(c),
      () => {
        if (
          !document.hidden &&
          (c.type === "train" || c.type === "wait" || c.type === "breakthrough")
        ) {
          setRunning(true);
          setTab("journey");
        }
      },
    );
  const download = async () => {
    const text = await game.exportSave();
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.hidden = true;
    document.body.appendChild(a);
    a.download = `仙途_${w?.profile.name || "存档"}_第${(w?.day || 0) + 1}日.json`;
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  const create = async (profile: Profile, seed: number, contentLocks: string[]) => {
    if (game.hasSavedRun) {
      setDraft({ profile, seed, contentLocks });
      requestConfirm("new");
      return;
    }
    if (await game.create(profile, seed, false, game.expected, contentLocks)) {
      setShowCreate(false);
      setTab("journey");
    }
  };
  const confirmAction = async () => {
    const type = confirm;
    setConfirm(null);
    if (type === "breach") await send({ type: "settle", honor: false, confirm: true });
    if (type === "new" && draft) {
      if (
        await game.create(
          draft.profile,
          draft.seed,
          true,
          confirmSnapshot.current || game.expected,
          draft.contentLocks,
        )
      ) {
        setShowCreate(false);
        setSettings(false);
        setTab("journey");
      }
    }
    if (type === "import") {
      if (
        await game.importSave(
          importText,
          game.hasSavedRun,
          confirmSnapshot.current || game.expected,
        )
      ) {
        setShowCreate(false);
        setSettings(false);
        setTab("journey");
        setRunning(false);
      }
    }
  };
  const importInput = (
    <input
      ref={importRef}
      className="sr-only"
      type="file"
      accept=".json,application/json"
      aria-label="选择存档文件"
      onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        if (f.size > balanceLimits.limits.maxImportBytes) {
          game.setError("存档超过 16 MiB。");
          return;
        }
        try {
          const text = await f.text();
          setImportText(text);
          requestConfirm("import");
        } catch {
          game.setError("未能读取这个文件，请重试。");
        }
      }}
    />
  );
  const confirmations = (
    <AlertDialog open={!!confirm} onOpenChange={(open) => !open && setConfirm(null)}>
      <AlertDialogContent className="game-modal">
        <AlertDialogHeader>
          <AlertDialogTitle className="serif">
            {confirm === "breach"
              ? "把凝元草留给自己？"
              : confirm === "new"
                ? "开始新的一世？"
                : "导入这段人生？"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {confirm === "breach"
              ? `你已答应将第一株凝元草交给${primaryName}。独占它会失去对方的信任，这次失约会被记住。`
              : confirm === "new"
                ? "当前角色将被新角色替换。建议先导出存档，以便日后继续这段人生。"
                : "这会替换当前浏览器里的游戏进度，已发生的故事以导入文件为准。"}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>再想一想</AlertDialogCancel>
          <AlertDialogAction onClick={() => void confirmAction()}>
            {confirm === "breach" ? "确认独占，承担后果" : "确认继续"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  if (!ready)
    return (
      <main className="loading-world">
        <Leaf size={30} />
        <h1 className="serif">仙途</h1>
        <p>正在展开这一卷人生…</p>
      </main>
    );
  if (!w || showCreate)
    return (
      <main className="prologue">
        <GameImage
          src={visual(intro.visualId).url}
          alt={visual(intro.visualId).alt}
          className="prologue-art"
        />
        <div className="prologue-shade" />
        <header className="prologue-header">
          <a className="wordmark serif" href="#">
            仙途<span>青石人间</span>
          </a>
          <div className="flex gap-2">
            <BackupManager game={game} onPause={pause} />
            <Button variant="ghost" onClick={() => importRef.current?.click()}>
              <Upload size={16} /> 导入存档
            </Button>
          </div>
        </header>
        <div className="prologue-layout">
          <section className="prologue-story">
            <span className="chapter-kicker">{intro.eyebrow}</span>
            <h1 className="serif">
              {intro.title.map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </h1>
            <p>
              {intro.body.map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </p>
            <span className="prologue-note">
              <Feather size={15} /> {intro.note}
            </span>
            <a className="template-link" href="/templates/qingshi-content-pack.zip" download>
              <ArrowDownToLine size={14} /> 下载故事与配图模板
            </a>
          </section>
          <div className="creation-wrap">
            {error && (
              <div className="error-banner" role="alert">
                {error}
                <Button size="sm" variant="ghost" onClick={() => reload()}>
                  重新读取
                </Button>
              </div>
            )}
            <Creation
              key={game.draft?.revision ?? "new"}
              initialDraft={game.draft}
              onSaveDraft={game.saveCreationDraft}
              onCreate={create}
              busy={busy}
              onCancel={w ? () => setShowCreate(false) : undefined}
            />
          </div>
        </div>
        <OfflineStatus safe={!busy && !confirm} />
        {importInput}
        {confirmations}
      </main>
    );
  const p = w.player;
  const current = scene(w);
  const place = LOCATIONS[p.location];
  const primary = w.npcs.find((a) => a.id === PACK.roles.primary)!;
  const primaryHere = primary.alive && primary.location === p.location;
  const transition = w.loot
    ? p.location === "ruins"
      ? PRESENTATION.lootReturn
      : PRESENTATION.lootSettle
    : null;
  const sceneArt = visual(transition?.visualId || current?.visualId || place.visualId);
  const portraitArt = visual(current?.portraitId || CHARACTERS.primary.portraitId || "");
  const readiness = partyReadiness(w);
  const departure = departureStatus(w);
  const busyCompanion = w.party
    .map((id) => w.npcs.find((a) => a.id === id))
    .find((a) => a?.attempt);
  const goal = objective(w);
  const artifact = ARTIFACTS.find((a) => a.id === w.profile.artifact)!;
  const nearby = w.npcs.filter((a) => a.alive && a.location === p.location);
  const blocked = busy || !!w.longAction || !!w.battle || w.ended;
  const useTab = (value: string) => {
    if (w.battle && value !== "journey") return;
    setTab(value);
  };
  return (
    <div className="game-shell">
      <header className="game-header">
        <button className="wordmark serif" onClick={() => setTab("journey")}>
          仙途<span>青石人间</span>
        </button>
        <div className="game-date">
          <SunIcon />
          <span>
            仙历 {Math.floor(w.day / 360) + 1} 年 <b>第 {w.day + 1} 日</b>
          </span>
          <small>
            {
              ["初春", "暮春", "初夏", "盛夏", "初秋", "深秋", "初冬", "岁末"][
                Math.floor((w.day % 360) / 45)
              ]
            }
          </small>
        </div>
        <div className="header-tools">
          <span className="saved-state">
            {busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
            <span>{busy ? "落笔中" : "本机已存"}</span>
          </span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="存档与设置"
            onClick={() => {
              pause();
              setSettings(true);
            }}
          >
            <Settings2 size={19} />
          </Button>
        </div>
      </header>
      <Tabs value={tab} onValueChange={useTab} className="game-tabs">
        <div className="nav-bar">
          <TabsList className="game-nav" variant="line" aria-label="游戏页面">
            {NAV.map((n) => (
              <TabsTrigger key={n.id} value={n.id} disabled={!!w.battle && n.id !== "journey"}>
                <n.icon size={17} />
                {n.name}
              </TabsTrigger>
            ))}
          </TabsList>
          <span className="nav-location">
            <MapPin size={14} />
            {place.name}
          </span>
        </div>
        <div className="game-layout">
          <aside className="character-sidebar">
            <button className="player-identity" onClick={() => setProfileId("PLAYER")}>
              <span className={`player-seal color-${w.profile.appearance.color} serif`}>
                {p.name[0]}
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
                </Button>
              )}
            </div>
            <p className="sidebar-note">
              翻阅与交谈不消耗时间。
              <br />
              每一次行动，才让世界向前。
            </p>
          </aside>
          <main className="play-area">
            {error && (
              <div className="error-banner" role="alert">
                <span>{error}</span>
                <Button size="sm" variant="ghost" onClick={() => reload()}>
                  <RotateCcw size={14} /> 重新读取
                </Button>
              </div>
            )}
            {w.ended && (
              <div className="end-of-life">
                <h2 className="serif">此生已落笔</h2>
                <p>你的经历仍被保存。可以导出这一世，再开启下一段人生。</p>
                <Button onClick={() => void download()}>导出存档</Button>
                <Button variant="outline" onClick={() => setShowCreate(true)}>
                  再入人间
                </Button>
              </div>
            )}
            {w.longAction && (
              <section className="long-action-panel" aria-live="polite">
                <div className="spread">
                  <div>
                    <span className="eyebrow">
                      {w.longAction.kind === "breakthrough"
                        ? "气机汇聚"
                        : w.longAction.kind === "wait"
                          ? "日月流转"
                          : "闭关修行"}
                    </span>
                    <h3 className="serif">
                      {w.longAction.total - w.longAction.remaining} / {w.longAction.total} 日
                    </h3>
                  </div>
                  <Wind size={28} className={running ? "gentle-spin" : ""} />
                </div>
                <Progress
                  aria-label="时间推进进度"
                  value={((w.longAction.total - w.longAction.remaining) / w.longAction.total) * 100}
                />
                <div className="spread">
                  <p>
                    {running
                      ? "你在修行，世界也在继续。"
                      : "计算已暂停，已完成的日数和进度均已保存。"}
                  </p>
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => (running ? pause() : setRunning(true))}
                    >
                      {running ? <Pause size={14} /> : <Play size={14} />}{" "}
                      {running ? "暂停" : "继续"}
                    </Button>
                    {w.longAction.kind !== "breakthrough" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => {
                          pause();
                          void send({ type: "stop" });
                        }}
                      >
                        结束修行
                      </Button>
                    )}
                  </div>
                </div>
              </section>
            )}
            <TabsContent value="journey" className="journey-content">
              {w.battle ? (
                <BattlePanel
                  world={w}
                  send={send}
                  busy={busy}
                  autoRunning={autoRunning}
                  onAuto={async (enabled) => {
                    pause();
                    await continuations.run(
                      () => send({ type: "auto", enabled }),
                      () => {
                        if (!document.hidden) setAutoRunning(enabled);
                      },
                    );
                  }}
                />
              ) : (
                <>
                  <div className="place-heading">
                    <div>
                      <span className="eyebrow">云岚境 · 人间烟火</span>
                      <h1 className="serif">{place.name}</h1>
                    </div>
                    <span className="weather">
                      <Wind size={15} />{" "}
                      {p.location === "ruins" || p.location === "gate" ? "山风微凉" : "暮色晴和"}
                    </span>
                  </div>
                  <div className="travel-grid">
                    <div className="scene-column">
                      <figure className="scene-figure">
                        <GameImage src={sceneArt.url} alt={sceneArt.alt} />
                        <figcaption>
                          <span>{place.subtitle}</span>
                          <small>
                            第 {w.day + 1} 日 · {p.location === "ruins" ? "月下" : "此刻"}
                          </small>
                        </figcaption>
                      </figure>
                      <section className="story-copy">
                        <div className="story-eyebrow">
                          <span>
                            {transition?.eyebrow || current?.eyebrow || "游历 · 此间见闻"}
                          </span>
                          <span className="ornament">◆</span>
                        </div>
                        <h2 className="serif">
                          {transition?.title || current?.title || place.subtitle}
                        </h2>
                        <p>{contentText(transition?.body || current?.body || place.body, w)}</p>
                        {current?.quote && !w.loot && (
                          <blockquote>
                            <span className="quote-mark">“</span>
                            {current.quote.replace(/^“|”$/g, "")}
                            <cite>— {primary.name}</cite>
                          </blockquote>
                        )}
                        <div className="story-choices">
                          {!w.loot &&
                            current?.choices.map((choice, i) => (
                              <button
                                key={choice.id}
                                className="story-choice"
                                disabled={blocked}
                                onClick={() =>
                                  send({ type: "choose", nodeId: current.id, choiceId: choice.id })
                                }
                              >
                                <span className="choice-number">
                                  {String(i + 1).padStart(2, "0")}
                                </span>
                                <span>
                                  <strong>{choice.label}</strong>
                                  <small>{choice.hint}</small>
                                </span>
                                <ArrowRight size={17} />
                              </button>
                            ))}
                          {w.loot && p.location === "ruins" && (
                            <button
                              className="story-choice"
                              disabled={blocked}
                              onClick={() => send({ type: "return" })}
                            >
                              <span className="choice-number">
                                <ArrowLeft size={17} />
                              </span>
                              <span>
                                <strong>收好战利品，返回坊市</strong>
                                <small>同行返回 · 2 日</small>
                              </span>
                              <ArrowRight size={17} />
                            </button>
                          )}
                          {w.loot &&
                            p.location === "market" &&
                            w.agreement?.status === "impossible" && (
                              <button
                                className="story-choice"
                                disabled={blocked}
                                onClick={() => send({ type: "resolveAgreement" })}
                              >
                                <span className="choice-number">01</span>
                                <span>
                                  <strong>按例外清点战利品</strong>
                                  <small>{w.agreement.reason} 不作为违约。</small>
                                </span>
                                <ArrowRight size={17} />
                              </button>
                            )}
                          {w.loot &&
                            p.location === "market" &&
                            w.agreement?.status !== "impossible" && (
                              <>
                                <button
                                  className="story-choice"
                                  disabled={blocked}
                                  onClick={() =>
                                    send({ type: "settle", honor: true, confirm: true })
                                  }
                                >
                                  <span className="choice-number">01</span>
                                  <span>
                                    <strong>按约将凝元草交给{primary.name}</strong>
                                    <small>履行约定 · 你获得 12 灵石</small>
                                  </span>
                                  <ArrowRight size={17} />
                                </button>
                                <button
                                  className="story-choice alternative"
                                  disabled={blocked || w.agreement?.strict}
                                  onClick={() => requestConfirm("breach")}
                                >
                                  <span className="choice-number">02</span>
                                  <span>
                                    <strong>把凝元草也收入自己囊中</strong>
                                    <small>
                                      {w.agreement?.strict
                                        ? "严格条款不允许违约分配"
                                        : "违背约定 · 她会记住你的选择"}
                                    </small>
                                  </span>
                                  <ArrowRight size={17} />
                                </button>
                              </>
                            )}
                          {p.location === "gate" &&
                            !departure.ready &&
                            (departure.remaining > 0 || busyCompanion) && (
                              <button
                                className="story-choice"
                                disabled={blocked}
                                onClick={() => act({ type: "wait", days: 1 })}
                              >
                                <span className="choice-number">
                                  <Clock3 size={17} />
                                </span>
                                <span>
                                  <strong>在古道等候一日</strong>
                                  <small>{departure.reason}</small>
                                </span>
                              </button>
                            )}
                          {p.location === "inn" && !p.manual && (
                            <button
                              className="story-choice"
                              disabled={blocked}
                              onClick={() => send({ type: "learn" })}
                            >
                              <span className="choice-number">
                                <BookOpen size={17} />
                              </span>
                              <span>
                                <strong>向店家领取《基础吐纳诀》</strong>
                                <small>免费学习 · 不需要认识任何人</small>
                              </span>
                              <ArrowRight size={17} />
                            </button>
                          )}
                          {p.location === "gate" && !w.loot && (
                            <button
                              className="story-choice"
                              disabled={blocked || !departure.ready}
                              onClick={() => send({ type: "expedition" })}
                            >
                              <span className="choice-number">
                                <Swords size={17} />
                              </span>
                              <span>
                                <strong>三人同行，进入残碑秘境</strong>
                                <small>
                                  {departure.reason || "山行 1 日 · 路费 2 灵石 · 将遭遇战斗"}
                                </small>
                              </span>
                              <ArrowRight size={17} />
                            </button>
                          )}
                        </div>
                      </section>
                    </div>
                    <aside className="encounter-column">
                      {primaryHere && p.location === "market" ? (
                        <article className="encounter-person">
                          <div className="portrait-frame">
                            <GameImage src={portraitArt.url} alt={portraitArt.alt} />
                            <span className="portrait-label">此处人物</span>
                          </div>
                          <div className="encounter-person-info">
                            <div className="spread">
                              <h2 className="serif">{primary.name}</h2>
                              <span>{relationshipLabel(relation(w, primary.id))}</span>
                            </div>
                            <p>
                              {REALMS[primary.realm]} · {primary.sect}
                            </p>
                            <Button
                              variant="outline"
                              className="wide-button"
                              onClick={() => setProfileId(primary.id)}
                            >
                              人物与共同经历 <ChevronRight size={15} />
                            </Button>
                          </div>
                        </article>
                      ) : (
                        <article className="local-note">
                          <span className="eyebrow">
                            <MapPin size={14} /> 此处人物
                          </span>
                          <h3 className="serif">{nearby.length} 位修士</h3>
                          <p>
                            {primary.alive
                              ? `${primary.name}${primaryHere ? "也在此处" : `此刻在${LOCATIONS[primary.location].name}`}。`
                              : "旧人已去，坊市仍有新的相逢。"}
                          </p>
                          <Button variant="outline" onClick={() => setTab("people")}>
                            看看附近的人
                          </Button>
                        </article>
                      )}
                      {w.agreement && ["accepted", "active"].includes(w.agreement.status) && (
                        <div className="promise-note">
                          <span className="eyebrow">
                            <ScrollText size={14} /> 同行约定
                          </span>
                          <p>第一株凝元草归{primary.name}，其余战利品归你。</p>
                          <small>
                            {w.agreement.status === "accepted"
                              ? "出发时支付两枚灵石。"
                              : "路费已付，等待探险结算。"}
                          </small>
                          <div className="meeting-members">
                            {readiness.members.map((a) => (
                              <button key={a.id} onClick={() => setProfileId(a.id)}>
                                <strong>{a.name}</strong>
                                <span>
                                  {!a.alive
                                    ? "已逝"
                                    : `${LOCATIONS[a.location].name}${a.attempt ? ` · 突破还需 ${a.attempt.remaining} 日` : a.location === p.location ? " · 已在此处" : ""}`}
                                </span>
                              </button>
                            ))}
                          </div>
                          {w.party.length === 1 && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={
                                  blocked || p.realm < 1 || readiness.members.some((a) => !a.alive)
                                }
                                onClick={() =>
                                  send({ type: readiness.ready ? "formParty" : "rally" })
                                }
                              >
                                {p.realm < 1
                                  ? "成为炼气修士后组队"
                                  : readiness.ready
                                    ? "邀二人同行"
                                    : w.agreement?.meeting?.location === p.location
                                      ? "等候同伴 · 1 日"
                                      : "约在此处会合 · 1 日"}
                              </Button>
                              {w.agreement.meeting && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={blocked}
                                  onClick={() => send({ type: "disband" })}
                                >
                                  取消会合
                                </Button>
                              )}
                              {!readiness.ready && p.realm >= 1 && (
                                <small>在场的人会留下等候，正在突破的人会结束后赶来。</small>
                              )}
                            </>
                          )}
                        </div>
                      )}
                      {w.story.outcome === "breached" && !w.story.compensated && (
                        <div className="promise-note">
                          <span className="eyebrow">尚有挽回的余地</span>
                          <p>当面交付一株凝元草，可以补偿{primary.name}。</p>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={blocked || !primaryHere || p.grass < 1}
                            onClick={() => send({ type: "compensate" })}
                          >
                            交付药草，赔礼
                          </Button>
                        </div>
                      )}
                      <Negotiation world={w} busy={blocked} send={send} onPause={pause} />
                      <div className="nearby-people">
                        <h3>此地相逢</h3>
                        {nearby
                          .filter((a) => a.id !== PACK.roles.primary)
                          .slice(0, 3)
                          .map((a) => (
                            <button key={a.id} onClick={() => setProfileId(a.id)}>
                              <span className="mini-initial serif">{a.name[0]}</span>
                              <span>
                                {a.name}
                                <small>{REALMS[a.realm]}</small>
                              </span>
                              <ChevronRight size={14} />
                            </button>
                          ))}
                        <button className="all-people" onClick={() => setTab("people")}>
                          查看在场修士 <ArrowRight size={14} />
                        </button>
                      </div>
                    </aside>
                  </div>
                  <SideStories world={w} busy={blocked} send={send} />
                  <section className="result-strip" aria-live="polite">
                    <Feather size={17} />
                    <p>{w.notice}</p>
                  </section>
                  <section className="daily-actions">
                    <div className="spread">
                      <h3>此刻，你还可以</h3>
                      <small>阅读不计时 · 行动有代价</small>
                    </div>
                    <div className="daily-action-grid">
                      <button
                        disabled={blocked || p.location === "ruins"}
                        onClick={() => {
                          if (p.manual) setTab("cultivation");
                          else
                            void send({
                              type: "travel",
                              to: p.location === "gate" ? "market" : "inn",
                            });
                        }}
                      >
                        <Wind />
                        <span>
                          <strong>{p.manual ? "静心修炼" : "寻找入门功法"}</strong>
                          <small>{p.manual ? "选择修行方式与时长" : "前往客栈 · 免费学艺"}</small>
                        </span>
                      </button>
                      <button
                        disabled={blocked || p.location === "ruins"}
                        onClick={() => send({ type: "work" })}
                      >
                        <Coins />
                        <span>
                          <strong>接些坊市杂务</strong>
                          <small>1 日 · 获得 6 灵石</small>
                        </span>
                      </button>
                      <button
                        disabled={blocked || p.location === "ruins"}
                        onClick={() => send({ type: "rest" })}
                      >
                        <Moon />
                        <span>
                          <strong>歇息片刻</strong>
                          <small>1 日 · 恢复气血</small>
                        </span>
                      </button>
                      <button
                        disabled={blocked || p.location === "ruins"}
                        onClick={() => act({ type: "wait", days: 3 })}
                      >
                        <Clock3 />
                        <span>
                          <strong>等候故人</strong>
                          <small>3 日 · 世界继续前行</small>
                        </span>
                      </button>
                    </div>
                  </section>
                  <section className="travel-options">
                    <span>
                      <Compass size={15} /> 前往
                    </span>
                    {(place.destinations as readonly LocationId[]).map((to) => (
                      <button
                        key={to}
                        disabled={blocked || !!w.loot}
                        onClick={() => send({ type: "travel", to })}
                      >
                        {LOCATIONS[to].name}
                        <small>
                          {p.location === "gate" || to === "gate" ? "1 日" : "同在坊市"}
                        </small>
                        <ArrowRight size={14} />
                      </button>
                    ))}
                    {!place.destinations.length && (
                      <span className="subtle">结束遭遇后可返回坊市。</span>
                    )}
                  </section>
                  {knownNpcUpdates(w).length > 0 && (
                    <div className="world-whispers">
                      <h3>
                        <Leaf size={15} /> 故人近况
                      </h3>
                      {knownNpcUpdates(w).map((e) => (
                        <p key={e.id}>{e.text}</p>
                      ))}
                    </div>
                  )}
                </>
              )}
            </TabsContent>
            <TabsContent value="cultivation">
              <CultivationPanel world={w} send={act} busy={blocked} onStart={() => {}} />
            </TabsContent>
            <TabsContent value="people">
              <PeoplePanel world={w} onProfile={setProfileId} />
            </TabsContent>
            <TabsContent value="inventory">
              <InventoryPanel world={w} send={send} busy={blocked} />
            </TabsContent>
            <TabsContent value="journal">
              <JournalPanel world={w} />
            </TabsContent>
          </main>
        </div>
      </Tabs>
      <OfflineStatus safe={!busy && !w.longAction && !w.battle && !confirm} />
      <footer className="game-footer">
        <span>仙途 · 青石人间</span>
        <span>此间人事，皆有回响。</span>
      </footer>
      <Dialog open={!!profileId} onOpenChange={(open) => !open && setProfileId(null)}>
        <DialogContent className="game-modal profile-modal">
          <DialogHeader>
            <DialogTitle className="serif">
              {profileId === "PLAYER"
                ? `${p.name} · 你的角色`
                : w.npcs.find((a) => a.id === profileId)?.name}
            </DialogTitle>
            <DialogDescription>
              {profileId === "PLAYER" ? "这一世，由你来写。" : "一面之缘，或许也是一生之缘。"}
            </DialogDescription>
          </DialogHeader>
          {profileId && <PersonDetail world={w} id={profileId} send={send} busy={blocked} />}
        </DialogContent>
      </Dialog>
      <Dialog
        open={settings}
        onOpenChange={(open) => {
          pause();
          setSettings(open);
        }}
      >
        <DialogContent className="game-modal">
          <DialogHeader>
            <DialogTitle className="serif">收好这一卷人生</DialogTitle>
            <DialogDescription>
              进度自动保存在当前浏览器。换设备或清理浏览器前，请导出备份。
            </DialogDescription>
          </DialogHeader>
          {error && (
            <div className="error-banner" role="alert">
              {error}
              <Button size="sm" variant="outline" onClick={() => void reload()}>
                重新读取
              </Button>
            </div>
          )}
          <div className="save-info">
            <Save />
            <div>
              <strong>
                {p.name} · {REALMS[p.realm]}
              </strong>
              <p>
                第 {w.day + 1} 日 · {LOCATIONS[p.location].name}
              </p>
              <small>
                机缘种子 {w.seed} · {w.profile.mode === "simple" ? "简单模式" : "复杂模式"}
              </small>
            </div>
          </div>
          <Button disabled={busy} onClick={() => void download()}>
            <ArrowDownToLine size={16} /> 导出当前存档
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => importRef.current?.click()}>
            <Upload size={16} /> 导入存档
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              pause();
              await game.refreshDraft();
              setSettings(false);
              setShowCreate(true);
            }}
          >
            <RotateCcw size={16} /> 创建新角色
          </Button>
          <BackupManager game={game} onPause={pause} />
          <div className="template-card">
            <div>
              <span className="eyebrow">内容创作模板</span>
              <h3 className="serif">青石人间 · 一诺之重</h3>
              <p>下载这章的大纲、剧情、NPC 资料与全部配图，交给创作者继续改写。</p>
            </div>
            <a className="template-link" href="/templates/qingshi-content-pack.zip" download>
              <ArrowDownToLine size={16} /> 下载故事与配图模板
            </a>
            <small>按包内说明修改后，由开发者更新网页。当前不支持在游戏内上传内容包。</small>
          </div>
          <p className="subtle">
            青石篇可游玩至筑基。自由交涉需要服务端配置，可随时使用固定选项继续。
          </p>
        </DialogContent>
      </Dialog>
      {importInput}
      {confirmations}
    </div>
  );
}
function SunIcon() {
  return (
    <span className="sun-glyph" aria-hidden="true">
      ☼
    </span>
  );
}
