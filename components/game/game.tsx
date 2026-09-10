"use client";
import { downloadSaveText, saveDownloadName } from "@/lib/ui/save-download";
import type { ProfileTab, ProfileTarget } from "@/lib/ui/profile-navigation";
import { PersonDetail } from "./person-detail";
import { ActorImageViewer } from "./actor-image-viewer";
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
import { CHARACTERS, PACK, PRESENTATION, visual } from "@/lib/game/content/official";
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
  Package,
  Pause,
  Play,
  RotateCcw,
  ScrollText,
  Settings2,
  Sun,
  Upload,
  Users,
  Wind,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BackupManager } from "./backups";
import { Creation } from "./creation";
import { OfflineStatus } from "./offline-status";
import { BattlePanel, GameImage, InventoryPanel, JournalPanel, PeoplePanel } from "./panels";

import { objective, presentationShows } from "@/lib/game/presentation";
import { CharacterStatus } from "./character-sidebar";
import { Dojo } from "./dojo";
import { AtlasPage } from "./atlas-dialog";
import { RealmCeremony } from "./realm-ceremony";

import { AISettingsEntry } from "./ai-settings-entry";
import { SettingsDialog } from "./settings-dialog";

import { threshold } from "@/lib/game/rules";
import {
  beginActionSummary,
  finishActionSummary,
  type ActionSummary,
} from "@/lib/ui/action-summary";
import { isRuleRefusal } from "@/lib/game/errors";
import { Toaster, toast } from "sonner";
import { RetreatSummary } from "./retreat-summary";

const NAV = [
  { id: "journey", name: "道场", icon: Leaf },
  { id: "travel", name: "游历", icon: Compass },
  { id: "people", name: "人物", icon: Users },
  { id: "inventory", name: "行囊", icon: Package },
];
export default function Game({ preview = false }: { preview?: boolean }) {
  const game = useGame(preview);
  const previousWorld = useRef<World | null>(null);

  const [lastSummary, setLastSummary] = useState<ActionSummary | null>(null);
  const actionStart = useRef<ActionSummary | null>(null);
  const { world: w, ready, busy, error, command: send } = game;
  const [offlineContainer, setOfflineContainer] = useState<HTMLElement | null>(null);
  const [tab, setTab] = useState("journey");
  useEffect(() => {
    const previous = previousWorld.current;
    if (w && previous?.saveId === w.saveId && previous.revision < w.revision) {
      if (w.longAction && !previous.longAction)
        actionStart.current = beginActionSummary(previous, w.longAction.kind);
      if (previous.longAction && !w.longAction) {
        const start =
          actionStart.current ??
          beginActionSummary(previous, previous.longAction.kind, previous.longAction.checkpoint);
        const interval = finishActionSummary(
          start,
          w,
          w.day === previous.day ? "stopped" : "completed",
        );
        setLastSummary(interval);
        actionStart.current = null;
      }
    } else if (
      previous?.saveId !== w?.saveId ||
      (w && previous && w.revision < previous.revision)
    ) {
      actionStart.current = w?.longAction
        ? beginActionSummary(w, w.longAction.kind, w.longAction.checkpoint)
        : null;
      setLastSummary(null);
    }
    previousWorld.current = w;
  }, [w]);
  useEffect(() => {
    if (game.advanceResult?.reason === "condition" && w?.longAction && actionStart.current) {
      const interval = finishActionSummary(actionStart.current, w, "condition-paused");
      setLastSummary(interval);
      setRunning(false);
    }
  }, [game.advanceResult]);
  useEffect(() => {
    if (error && !isRuleRefusal(game.errorCode)) toast.error(error);
  }, [error]);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [portraitView, setPortraitView] = useState<{
    id: string;
    displayName?: string;
    open: boolean;
  } | null>(null);
  const [profileTab, setProfileTab] = useState<ProfileTab>("attributes");
  const [profileStack, setProfileStack] = useState<
    { id: string; tab: ProfileTab; scroll: number }[]
  >([]);
  const activeProfileTab = useRef<ProfileTab>("attributes");
  const profileRestoreScroll = useRef<number | null>(null);
  const openProfile = useCallback(
    (id: string, tab: ProfileTarget = "attributes", displayName?: string) => {
      game.pauseAdvance();
      continuations.cancel();
      setRunning(false);
      setAutoRunning(false);
      if (tab === "image") {
        setPortraitView({ id, displayName, open: true });
        return;
      }
      if (profileId && profileId !== id)
        setProfileStack((stack) => [
          ...stack,
          {
            id: profileId,
            tab: activeProfileTab.current,
            scroll:
              document.querySelector<HTMLElement>(
                '.profile-modal [role="tabpanel"][data-state="active"]',
              )?.scrollTop ?? 0,
          },
        ]);
      activeProfileTab.current = tab;
      setProfileTab(tab);
      setProfileId(id);
    },
    [profileId],
  );
  useEffect(() => {
    if (profileRestoreScroll.current !== null) {
      const top = profileRestoreScroll.current;
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>('.profile-modal [role="tabpanel"][data-state="active"]')
          ?.scrollTo({ top });
      });
      profileRestoreScroll.current = null;
    }
  }, [profileId, profileTab]);
  useEffect(() => {
    setProfileStack([]);
  }, [w?.saveId]);
  const [settings, setSettings] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [stopConfirm, setStopConfirm] = useState(false);
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
  const [importSummary, setImportSummary] = useState("");
  const importRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (w && game.lastResult && ["create", "import", "restore"].includes(game.lastResult.kind)) {
      setShowCreate(false);
      setSettings(false);
      setConfirm(null);
      setProfileId(null);
      setPortraitView(null);
      setTab("journey");
      setLastSummary(null);
      actionStart.current = w.longAction
        ? beginActionSummary(w, w.longAction.kind, w.longAction.checkpoint)
        : null;
      previousWorld.current = w;
    }
  }, [game.lastResult]);
  useEffect(() => {
    // A reload can reveal a replacement whose acknowledgement was lost.
    setShowCreate(false);
    setSettings(false);
    setConfirm(null);
    setProfileId(null);
    setPortraitView(null);
    setProfileStack([]);
  }, [w?.saveId]);

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
    if (!w || busy || !visible || settings || showCreate || confirm || profileId || error) return;
    if (w.longAction && running && !w.pendingDailyEventId) {
      const timer = setTimeout(() => {
        void game.advance(1).then((ok) => {
          if (!ok) setRunning(false);
        });
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
  }, [
    w,
    busy,
    visible,
    running,
    autoRunning,
    settings,
    showCreate,
    confirm,
    profileId,
    error,
    send,
    game.advance,
    game.advanceResult,
  ]);
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
            (c.type === "train" ||
              c.type === "wait" ||
              c.type === "breakthrough" ||
              (c.type === "choose" && c.nodeId === w?.pendingDailyEventId && !!w.longAction))
          ) {
            setRunning(true);
          }
        },
      ),
    [continuations, send, w?.pendingDailyEventId, w?.longAction],
  );
  const download = async () => {
    const text = await game.exportSave();
    if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.hidden = true;
    document.body.appendChild(a);
    a.download = saveDownloadName({
      name: w?.profile.name,
      day: w?.day,
      preview,
      kind: game.recovery ? "原始进度" : "存档",
    });
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
      tabIndex={-1}
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
          const value = JSON.parse(text);
          if (
            !value ||
            typeof value !== "object" ||
            typeof value.profile?.name !== "string" ||
            !Number.isSafeInteger(value.day)
          )
            throw new Error();
          setImportSummary(
            `${f.name.slice(0, 80)}：${value.profile.name.slice(0, 32)} · 第 ${value.day + 1} 日 · ${value.profile.mode === "complex" ? "复杂" : "简单"}模式`,
          );
          setImportText(text);
          requestConfirm("import");
        } catch {
          game.setError("文件无法识别为人生存档，请检查 JSON 与角色信息。原进度保留。");
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
                ? `用「${draft?.profile.name} · 第 1 日 · ${draft?.profile.mode === "complex" ? "复杂" : "简单"}模式」替换「${w?.player.name ?? "待读取角色"} · 第 ${(w?.day ?? 0) + 1} 日」。当前完整进度会自动保留备份。`
                : `导入「${importSummary}」，替换「${w?.player.name ?? "待读取角色"} · 第 ${(w?.day ?? 0) + 1} 日」。最终由游戏进程验证，当前进度会先保留备份。`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {confirm !== "breach" && game.hasSavedRun && (
            <Button variant="outline" disabled={busy} onClick={() => void download()}>
              先导出当前存档
            </Button>
          )}
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
  if (!w && game.recovery && !showCreate)
    return (
      <main className="recovery-screen">
        <h1 className="serif">这段人生暂时无法读取</h1>
        <p>原始数据仍保留。先导出原始进度，或从本机备份找回。</p>
        <p className="error-banner" role="alert">
          {error}
        </p>
        <div className="settings-actions">
          <Button onClick={() => void download()}>导出原始进度</Button>
          <BackupManager game={game} onPause={pause} />
          <Button variant="outline" onClick={() => setShowCreate(true)}>
            准备新角色
          </Button>
          <Button variant="ghost" onClick={() => void reload()}>
            重新读取
          </Button>
        </div>
        {confirmations}
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
        </header>
        <div className="prologue-layout">
          <div className="creation-wrap">
            {error && !settings && (
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
              utilities={
                <>
                  <AISettingsEntry onPause={pause} />
                  <BackupManager game={game} onPause={pause} />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => importRef.current?.click()}
                  >
                    <Upload size={16} /> 导入存档
                  </Button>
                </>
              }
              key={game.draft?.revision ?? "new"}
              initialDraft={game.draft}
              onSaveDraft={game.saveCreationDraft}
              onCreate={create}
              busy={busy}
              onCancel={w || game.recovery ? () => setShowCreate(false) : undefined}
            />
          </div>
        </div>
        <OfflineStatus safe={!busy && !confirm} />
        {importInput}
        {confirmations}
      </main>
    );
  const p = w.player;
  const portraitActor =
    portraitView?.id === "PLAYER" ? p : w.npcs.find((npc) => npc.id === portraitView?.id);
  const saveBlocked = !!game.saveIssue;
  const saveUnconfirmed = ["SAVE_UNCONFIRMED", "WORKER_UNAVAILABLE"].includes(game.saveIssue);
  const advancing = running || game.isAdvancing;
  const blocked =
    busy || saveBlocked || !!w.longAction || !!w.pendingDailyEventId || !!w.battle || w.ended;
  const useTab = (value: string) => {
    pause();
    setTab(value === "cultivation" || value === "journal" ? "journey" : value);
  };
  return (
    <div className="game-shell dojo-shell">
      <Toaster
        position="bottom-right"
        theme="dark"
        closeButton
        richColors
        toastOptions={{ className: "game-toast" }}
      />
      <RealmCeremony key={w.saveId} world={w} />
      <AlertDialog open={stopConfirm} onOpenChange={setStopConfirm}>
        <AlertDialogContent className="game-modal">
          <AlertDialogHeader>
            <AlertDialogTitle>
              结束当前{w.longAction?.kind === "wait" ? "等候" : "修炼"}？
            </AlertDialogTitle>
            <AlertDialogDescription>
              已完成的日数、修为与消耗保留；剩余日数不再推进。结束后可重新选择行动。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>继续保留</AlertDialogCancel>
            <AlertDialogAction onClick={() => void send({ type: "stop" })}>
              确认结束
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Tabs value={tab} onValueChange={useTab} className="game-tabs">
        <header className="game-header">
          <CharacterStatus world={w} onProfile={openProfile} />
          <div className="nav-bar">
            <TabsList className="game-nav" variant="line" aria-label="游戏页面">
              {NAV.map((n) => (
                <TabsTrigger
                  key={n.id}
                  value={n.id}
                  disabled={
                    (n.id === "people" && !presentationShows(w, "tab.people")) ||
                    (n.id === "travel" && !presentationShows(w, "travel.local"))
                  }
                  title={
                    (n.id === "people" || n.id === "travel") && !presentationShows(w, "tab.people")
                      ? "引气入体后开放"
                      : undefined
                  }
                >
                  <n.icon size={17} />
                  {n.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="header-tools">
            <OfflineStatus
              container={offlineContainer}
              safe={!busy && !saveBlocked && !w.longAction && !w.battle && !confirm}
            />
            <span
              aria-label={busy ? "正在保存" : saveBlocked ? "保存待确认" : "本机已存"}
              className={`saved-state${saveBlocked ? " is-unsaved" : ""}`}
              role="status"
              title="进度只保存在此浏览器、此地址；换浏览器前请导出存档。"
            >
              {busy ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}
              <span>
                {busy
                  ? "正在保存"
                  : saveBlocked
                    ? saveUnconfirmed
                      ? "保存待确认"
                      : game.saveIssue === "STALE_REVISION"
                        ? "进度已变化"
                        : "本次未保存"
                    : `已存 · 第 ${w.day + 1} 日`}
              </span>
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
        <div className="game-layout">
          <main className="play-area">
            {error && !settings && (
              <div
                className={isRuleRefusal(game.errorCode) ? "rule-banner" : "error-banner"}
                role={isRuleRefusal(game.errorCode) ? "status" : "alert"}
              >
                <span>{error}</span>
                {!saveBlocked && (
                  <Button variant="ghost" size="sm" onClick={() => game.setError("")}>
                    关闭提示
                  </Button>
                )}
                {!isRuleRefusal(game.errorCode) && (
                  <div className="error-actions">
                    {game.canRetry && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => void game.retry()}
                      >
                        重试此行动
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void download()}
                    >
                      导出已存进度
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => reload()}>
                      <RotateCcw size={14} /> 重新读取
                    </Button>
                  </div>
                )}
              </div>
            )}
            <TabsContent
              value="journey"
              forceMount
              hidden={tab !== "journey"}
              className="journey-content"
            >
              <Dojo
                profileOpen={!!profileId}
                key={w.saveId}
                world={w}
                act={act}
                send={send}
                blocked={blocked}
                busy={busy || saveBlocked}
                advancing={advancing}
                onPause={pause}
                onResume={() => setRunning(true)}
                onStop={() => {
                  pause();
                  setStopConfirm(true);
                }}
                onProfile={openProfile}
                onNavigate={useTab}
                requestConfirm={requestConfirm}
                result={game.lastResult}
                progress={game.progress}
                choiceBlocked={busy || saveBlocked || w.ended || !!w.battle}
                summary={lastSummary}
                battle={
                  w.battle ? (
                    <BattlePanel
                      world={w}
                      send={send}
                      busy={busy || saveBlocked}
                      autoRunning={autoRunning}
                      onProfile={openProfile}
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
                  ) : null
                }
                onNew={() => setShowCreate(true)}
                onExport={() => void download()}
              />
            </TabsContent>
            <TabsContent value="travel">
              <AtlasPage
                world={w}
                send={send}
                blocked={blocked}
                onArrive={() => setTab("journey")}
              />
            </TabsContent>
            <TabsContent value="people">
              <PeoplePanel world={w} onProfile={openProfile} />
            </TabsContent>
            <TabsContent value="inventory">
              <InventoryPanel world={w} send={send} busy={blocked} />
            </TabsContent>
          </main>
        </div>
      </Tabs>
      <Dialog
        open={!!profileId}
        onOpenChange={(open) => {
          if (!open) {
            setProfileId(null);
            setProfileStack([]);
          }
        }}
      >
        <DialogContent
          className="game-modal profile-modal"
          onEscapeKeyDown={(event) => {
            // A newly focused viewer can receive Escape before Radix updates its layer listeners.
            if (event.target instanceof Element && event.target.closest(".image-viewer"))
              event.preventDefault();
          }}
        >
          {!!profileStack.length && (
            <Button
              variant="ghost"
              size="sm"
              className="profile-back"
              onClick={() => {
                const prior = profileStack.at(-1)!;
                setProfileStack((stack) => stack.slice(0, -1));
                profileRestoreScroll.current = prior.scroll;
                activeProfileTab.current = prior.tab;
                setProfileTab(prior.tab);
                setProfileId(prior.id);
              }}
            >
              返回
              {profileStack.at(-1)!.id === "PLAYER"
                ? p.name
                : w.npcs.find((a) => a.id === profileStack.at(-1)!.id)?.name}
              的资料
            </Button>
          )}
          <DialogHeader>
            <DialogTitle className="serif">
              {profileId === "PLAYER"
                ? `${p.name} · 你的角色`
                : w.npcs.find((a) => a.id === profileId)?.name}
            </DialogTitle>
            <DialogDescription className="sr-only">
              {profileId === "PLAYER" ? "这一世，由你来写。" : "一面之缘，或许也是一生之缘。"}
            </DialogDescription>
          </DialogHeader>
          {profileId && (
            <PersonDetail
              key={`${w.saveId}:${profileId}:${profileTab}`}
              world={w}
              id={profileId}
              initialTab={profileTab}
              onTabChange={(value) => {
                activeProfileTab.current = value;
              }}
              send={send}
              busy={blocked}
              onProfile={openProfile}
              result={game.lastResult}
              error={error}
            />
          )}
        </DialogContent>
      </Dialog>
      {portraitView && portraitActor && (
        <ActorImageViewer
          key={`${w.saveId}:${portraitActor.id}`}
          world={w}
          actor={portraitActor}
          displayName={portraitView.displayName}
          open={portraitView.open}
          onOpenChange={(open) =>
            setPortraitView((current) => (current ? { ...current, open } : null))
          }
        />
      )}
      <SettingsDialog
        offlineRef={setOfflineContainer}
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
  return <Sun className="sun-glyph" aria-hidden="true" />;
}
