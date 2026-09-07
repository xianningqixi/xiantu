"use client";
import balanceLimits from "@/lib/game/content/balance.json";
import type { World } from "@/lib/game/types";
import { useCallback, useMemo } from "react";

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CHARACTERS, LOCATIONS, PACK, PRESENTATION, visual } from "@/lib/game/content/official";
import { createContinuationGuard } from "@/lib/game/continuation";
import type { Command, Profile, SaveExpectation } from "@/lib/game/types";
import { useGame } from "@/lib/game/use-game";
import {
  ArrowDownToLine,
  Check,
  Compass,
  Feather,
  Leaf,
  LoaderCircle,
  MapPin,
  Package,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Settings2,
  Upload,
  Users,
  Wind,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BackupManager } from "./backups";
import { Creation } from "./creation";
import { OfflineStatus } from "./offline-status";
import {
  BattlePanel,
  CultivationPanel,
  GameImage,
  InventoryPanel,
  JournalPanel,
  PeoplePanel,
  PersonDetail,
} from "./panels";

import { objective } from "@/lib/game/presentation";
import { CharacterSidebar } from "./character-sidebar";
import { JourneyTab } from "./journey-tab";
import { SettingsDialog } from "./settings-dialog";

import { isRuleRefusal } from "@/lib/game/errors";
import { Toaster, toast } from "sonner";
import { RetreatSummary } from "./retreat-summary";

const NAV = [
  { id: "journey", name: "游历", icon: Compass },
  { id: "cultivation", name: "修行", icon: Wind },
  { id: "people", name: "故人", icon: Users },
  { id: "inventory", name: "行囊", icon: Package },
  { id: "journal", name: "历程", icon: ScrollText },
];
export default function Game({ preview = false }: { preview?: boolean }) {
  const game = useGame(preview);
  const previousWorld = useRef<World | null>(null);
  const [summary, setSummary] = useState<{ startDay: number; endDay: number } | null>(null);
  const { world: w, ready, busy, error, command: send } = game;
  const [tab, setTab] = useState("journey");
  useEffect(() => {
    const previous = previousWorld.current;
    if (w && previous?.saveId === w.saveId && previous.revision !== w.revision) {
      if (w.notice !== previous.notice) toast(w.notice, { id: "action-result", duration: 5000 });
      if (
        previous.longAction &&
        !w.longAction &&
        w.day > previous.day - previous.longAction.checkpoint
      )
        setSummary({ startDay: previous.day - previous.longAction.checkpoint, endDay: w.day });
    }
    previousWorld.current = w;
  }, [w]);
  useEffect(() => {
    if (game.advanceResult?.reason === "condition") setSummary(game.advanceResult);
  }, [game.advanceResult]);
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
  const pause = useCallback(() => {
    game.pauseAdvance();
    continuations.cancel();
    setRunning(false);
    setAutoRunning(false);
  }, [continuations, game.pauseAdvance]);
  const reload = () => {
    pause();
    return game.reload();
  };
  const requestConfirm = useCallback(
    (value: "new" | "import" | "breach") => {
      pause();
      confirmSnapshot.current = { ...game.expected };
      setConfirm(value);
    },
    [pause, game.expected.saveId, game.expected.revision],
  );
  const primaryName =
    w?.npcs.find((a) => a.id === PACK.roles.primary)?.name || CHARACTERS.primary.name;
  const intro = PRESENTATION.prologue;
  useEffect(() => {
    const change = () => {
      setVisible(!document.hidden);
      if (document.hidden) {
        game.pauseAdvance();
        continuations.cancel();
        setRunning(false);
        setAutoRunning(false);
      }
    };
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, [continuations, game.pauseAdvance]);
  useEffect(() => {
    if (!w || busy || !visible || settings || showCreate || confirm) return;
    if (w.longAction && running) {
      const timer = setTimeout(() => {
        void game.advance().then(() => setRunning(false));
      }, 0);
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
  }, [w, busy, visible, running, autoRunning, settings, showCreate, confirm, send, game.advance]);
  useEffect(() => {
    if (!w?.longAction) setRunning(false);
  }, [w?.longAction]);
  useEffect(() => {
    if (!w?.battle) setAutoRunning(false);
  }, [w?.battle]);
  const act = useCallback(
    (c: Command) =>
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
      ),
    [continuations, send],
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
  const goal = useMemo(() => (w ? objective(w) : null), [w]);
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
              <div
                className={isRuleRefusal(game.errorCode) ? "rule-banner" : "error-banner"}
                role={isRuleRefusal(game.errorCode) ? "status" : "alert"}
              >
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
  const place = LOCATIONS[p.location];
  const blocked = busy || !!w.longAction || !!w.battle || w.ended;
  const useTab = (value: string) => {
    if (w.battle && value !== "journey") return;
    setTab(value);
    if (value === goal?.tab && goal.anchor)
      setTimeout(() => {
        const control = document.getElementById(goal.anchor!);
        control?.scrollIntoView({ block: "center", behavior: "smooth" });
        control?.focus({ preventScroll: true });
      }, 50);
  };
  return (
    <div className="game-shell">
      <Toaster position="top-center" theme="dark" closeButton richColors />
      <RetreatSummary world={w} interval={summary} onClose={() => setSummary(null)} />
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
          <CharacterSidebar
            world={w}
            goal={goal!}
            setProfileId={setProfileId}
            useTab={useTab}
            send={send}
            act={act}
            blocked={blocked}
          />
          <main className="play-area">
            {error && (
              <div
                className={isRuleRefusal(game.errorCode) ? "rule-banner" : "error-banner"}
                role={isRuleRefusal(game.errorCode) ? "status" : "alert"}
              >
                <span>{error}</span>
                {!isRuleRefusal(game.errorCode) && (
                  <Button size="sm" variant="ghost" onClick={() => reload()}>
                    <RotateCcw size={14} /> 重新读取
                  </Button>
                )}
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
                      {game.progress?.completed ?? w.longAction.checkpoint} / {w.longAction.total}{" "}
                      日
                    </h3>
                  </div>
                  <Wind size={28} className={running ? "gentle-spin" : ""} />
                </div>
                <Progress
                  aria-label="时间推进进度"
                  value={
                    ((game.progress?.completed ?? w.longAction.checkpoint) / w.longAction.total) *
                    100
                  }
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
                      disabled={busy && !running}
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
                <JourneyTab
                  world={w}
                  send={send}
                  act={act}
                  setTab={setTab}
                  setProfileId={setProfileId}
                  requestConfirm={requestConfirm}
                  pause={pause}
                  blocked={blocked}
                  goal={goal!}
                />
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
      <SettingsDialog
        world={w}
        game={game}
        busy={busy}
        error={error}
        settings={settings}
        setSettings={setSettings}
        pause={pause}
        reload={reload}
        download={download}
        importRef={importRef}
        setShowCreate={setShowCreate}
      />
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
