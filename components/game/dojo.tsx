"use client";
import { useState, useEffect, type ReactNode } from "react";
import { PagedContent } from "@/components/ui/paged-content";
import { SectionNav } from "@/components/ui/section-nav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { objective, presentationActionVisible, presentationShows } from "@/lib/game/presentation";
import { journeyActions } from "@/lib/game/journey-actions";
import { sectAt } from "@/lib/game/sect-content";
import { practicePreview, realmPresentation } from "@/lib/ui/realm-presentation";
import { partyReadiness } from "@/lib/game/agreement";
import { B, REALM_KEYS } from "@/lib/game/rules";
import { PACK } from "@/lib/game/content/official";
import { hasRubbing } from "@/lib/game/main-story";
import type { AdvanceProgress } from "@/lib/game/types";
import type { World, Command } from "@/lib/game/types";
import type { OpenProfile } from "@/lib/ui/profile-navigation";
import type { ActionSummary } from "@/lib/ui/action-summary";
import { JourneyTab } from "./journey-tab";
import { EventFeed } from "./event-feed";
import { JournalPanel, type Send } from "./panels";
import { PracticeSettings } from "./practice-settings";
import { BreakthroughDialog } from "./breakthrough-dialog";
import { SectPanel } from "./sect-panel";
import { LootSettlement } from "./loot-settlement";
import { Negotiation } from "./negotiation";
import { TimeBadge } from "./time-badge";
import { WaitControls } from "./wait-controls";
type Props = {
  world: World;
  profileOpen: boolean;
  act: Send;
  send: Send;
  blocked: boolean;
  choiceBlocked: boolean;
  progress: AdvanceProgress | null;
  busy: boolean;
  advancing: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onProfile: OpenProfile;
  onNavigate: (tab: string) => void;
  requestConfirm: (value: "breach") => void;
  result: { id: string; kind: string; notice: string; day: number; revision: number } | null;
  summary: ActionSummary | null;
  battle: ReactNode;
  onNew: () => void;
  onExport: () => void;
};
export function Dojo({
  world: w,
  profileOpen,
  act,
  send,
  blocked,
  choiceBlocked,
  progress,
  busy,
  advancing,
  onPause,
  onResume,
  onStop,
  onProfile,
  onNavigate,
  requestConfirm,
  result,
  summary,
  battle,
  onNew,
  onExport,
}: Props) {
  const [reading, setReading] = useState("story");
  const [moreTab, setMoreTab] = useState("actions");
  const [more, setMore] = useState(false),
    [practice, setPractice] = useState(false),
    [breakthrough, setBreakthrough] = useState(false),
    [journal, setJournal] = useState(false);
  useEffect(() => {
    if (!more) setMoreTab("actions");
  }, [more]);
  useEffect(() => {
    if (profileOpen) setMore(false);
  }, [profileOpen]);
  const goal = objective(w),
    state = realmPresentation(w.player),
    preview = practicePreview(w, 7);
  const invoke = (command: Command) => {
    setMore(false);
    return act(command);
  };
  const navigate = (tab: string) => {
    setMore(false);
    if (tab === "cultivation") {
      onPause();
      state.canBreak ? setBreakthrough(true) : setPractice(true);
    } else onNavigate(tab);
  };
  const dailyChoice = !!w.pendingDailyEventId && goal.command?.type === "choose";
  const follow = () => {
    if (w.longAction && !dailyChoice) {
      advancing ? onPause() : onResume();
      return;
    }
    if (goal.command) {
      void invoke(goal.command);
      return;
    }
    if (goal.tab === "journal") {
      setJournal(true);
      return;
    }
    if (goal.anchor === "atlas-page") {
      onNavigate("travel");
      return;
    }
    if (goal.tab === "cultivation") {
      setBreakthrough(true);
      return;
    }
    setMoreTab(w.loot ? "loot" : "actions");
    setMore(true);
  };
  const actionOrder: Record<string, number> = { "advance-minor": 0, practice: 1, work: 2, shop: 3 };
  const actions = journeyActions(w)
    .sort((a, b) => (actionOrder[a.id] ?? 10) - (actionOrder[b.id] ?? 10))
    .filter((a) => !a.command || presentationActionVisible(w, a.command))
    .map((a) =>
      a.id === "practice" && w.player.manual && !state.canBreak && !state.canAdvance
        ? { ...a, title: "修炼 7 日", command: preview.command, tab: undefined }
        : a,
    )
    .filter((a) => JSON.stringify(a.command) !== JSON.stringify(goal.command) || !a.command);
  const storyChoices = goal.choices?.slice(1) ?? [];
  const maxSecondary = summary ? 2 : 3;
  const choiceActions = storyChoices.map((a, i) => ({
    id: `choice-${i}`,
    title: a.title,
    command: a.command,
    tab: undefined,
    anchor: undefined,
  }));
  const directPractice = actions.find(
    (a) => a.id === "practice" && a.command?.type === "train" && !preview.reason,
  );
  const secondary = [
    ...(directPractice ? [directPractice] : []),
    ...choiceActions,
    ...actions.filter((a) => a !== directPractice),
  ].slice(0, maxSecondary);
  const readiness = partyReadiness(w);
  const minRealm = REALM_KEYS.findIndex((key) => key === B.story.playerMinimumExplorationRealm);
  const primary = w.npcs.find((a) => a.id === PACK.roles.primary)!;
  const longFull = w.longAction?.kind === "train" && state.ready;
  return (
    <div className="dojo" aria-label="道场内容">
      <div className="dojo-reading-nav">
        <SectionNav
          label="道场阅读"
          value={reading}
          onChange={setReading}
          items={[
            { id: "story", label: "当前剧情" },
            { id: "news", label: "近日见闻" },
          ]}
        />
      </div>
      <div className="dojo-reading" data-reading={reading}>
        {w.battle ? (
          <section className="dojo-battle-scene">
            <PagedContent label="战斗近况">
              <h1 className="serif">指挥战斗 · 第 {w.battle.round} 回合</h1>
              <div className="dojo-combatants">
                {w.battle.enemies.map((a) => (
                  <p key={a.id}>
                    {a.name} · 气血 {a.hp}/{a.maxHp}
                  </p>
                ))}
              </div>
              <div className="dojo-combatants">
                {w.battle.allies.map((a) => (
                  <p key={a.id}>
                    {a.name} · 气血 {a.hp}/{a.maxHp}
                  </p>
                ))}
              </div>
              <p>{w.battle.logs.at(-1)}</p>
              <p>在“更多”中选择目标、招式或自动战斗。</p>
            </PagedContent>
          </section>
        ) : (
          <JourneyTab world={w} onProfile={onProfile} />
        )}
        <EventFeed
          world={w}
          result={result}
          progress={progress}
          summary={summary}
          onAll={() => {
            onPause();
            setJournal(true);
          }}
        />
      </div>
      <section className="dojo-action-dock" aria-label="选择当前行动">
        <Button
          className="dojo-primary"
          data-primary-action
          data-story-choice={goal.choices ? "primary" : undefined}
          disabled={
            dailyChoice
              ? choiceBlocked
              : (busy && !advancing) || (!!w.longAction && !advancing && !!longFull)
          }
          onClick={follow}
        >
          {w.longAction && !dailyChoice
            ? advancing
              ? "暂停当前行动"
              : "继续当前行动"
            : goal.title}
        </Button>
        <p className="dojo-reason">
          {w.longAction && !dailyChoice
            ? `已保存 ${w.longAction.checkpoint}/${w.longAction.total} 日${longFull ? " · 修为已满，结束当前修炼后尝试突破。" : " · 暂停后可保留进度或结束行动。"}`
            : goal.reason}
        </p>
        <div className="dojo-secondary">
          {w.longAction && !dailyChoice
            ? w.longAction.kind !== "breakthrough" && (
                <Button variant="outline" disabled={busy} onClick={onStop}>
                  结束当前行动
                </Button>
              )
            : secondary.slice(0, maxSecondary).map((a) => (
                <Button
                  key={a.id}
                  data-journey-action={a.id}
                  variant="outline"
                  disabled={
                    (dailyChoice && a.command?.type === "choose" ? choiceBlocked : blocked) ||
                    (a.command?.type === "train" && !!preview.reason)
                  }
                  onClick={() =>
                    a.command
                      ? void invoke(a.command)
                      : a.tab
                        ? navigate(a.tab)
                        : (setMoreTab("sect"), setMore(true))
                  }
                >
                  {a.title}
                </Button>
              ))}
          <Button
            variant="ghost"
            onClick={() => {
              onPause();
              setMore(true);
            }}
          >
            更多
          </Button>
        </div>
      </section>
      <Dialog open={more} onOpenChange={setMore}>
        <DialogContent className="game-modal dojo-drawer">
          <DialogHeader>
            <DialogTitle>选择更多行动</DialogTitle>
            <DialogDescription>查看与设置不消耗游戏时间。</DialogDescription>
          </DialogHeader>
          {!w.battle && (
            <SectionNav
              label="行动分类"
              value={moreTab}
              onChange={setMoreTab}
              items={[
                { id: "actions", label: "日常" },
                ...(!w.ended ? [{ id: "wait", label: "等候" }] : []),
                ...(presentationShows(w, "visitSect") && sectAt(w.player.location)
                  ? [{ id: "sect", label: "宗门" }]
                  : []),
                ...(w.story.flags.met &&
                primary.location === w.player.location &&
                !["accepted", "active"].includes(w.agreement?.status ?? "")
                  ? [{ id: "talk", label: "交涉" }]
                  : []),
                ...(w.loot ? [{ id: "loot", label: "战利品" }] : []),
              ]}
            />
          )}
          {w.battle ? (
            battle
          ) : (
            <>
              <div className="more-actions" hidden={moreTab !== "actions"}>
                {choiceActions.map((a) => (
                  <Button
                    key={a.id}
                    data-journey-action={a.id}
                    variant="outline"
                    disabled={dailyChoice ? choiceBlocked : blocked}
                    onClick={() => void invoke(a.command)}
                  >
                    {a.title}
                    <TimeBadge world={w} command={a.command} />
                  </Button>
                ))}
                {w.player.manual && !actions.some((action) => action.tab === "cultivation") && (
                  <Button variant="outline" onClick={() => navigate("cultivation")}>
                    {state.canBreak ? "准备突破" : "设置修炼方式"}
                  </Button>
                )}
                {actions.map((a) => (
                  <Button
                    variant="outline"
                    key={a.id}
                    data-journey-action={a.id}
                    disabled={
                      (dailyChoice && a.command?.type === "choose" ? choiceBlocked : blocked) ||
                      (a.command?.type === "train" && !!preview.reason)
                    }
                    onClick={() =>
                      a.command
                        ? void invoke(a.command)
                        : a.tab
                          ? navigate(a.tab)
                          : setMoreTab("sect")
                    }
                  >
                    {a.title}
                    <TimeBadge world={w} command={a.command} />
                  </Button>
                ))}
                {w.player.location === "gate" && !hasRubbing(w) && (
                  <Button
                    variant="outline"
                    disabled={blocked || w.player.realm < minRealm || w.party.length !== 1}
                    onClick={() => void invoke({ type: "surveyRuins" })}
                  >
                    勘察古道残碑
                  </Button>
                )}
                {w.agreement?.status === "accepted" && (
                  <Button
                    variant="outline"
                    disabled={
                      blocked ||
                      w.player.realm < minRealm ||
                      !presentationShows(w, "inviteCompanion")
                    }
                    title={
                      !presentationShows(w, "inviteCompanion")
                        ? "继续修炼，待同行邀请开放"
                        : undefined
                    }
                    onClick={() => void invoke({ type: readiness.ready ? "formParty" : "rally" })}
                  >
                    {readiness.ready ? "邀二人同行" : "约在此处会合"}
                  </Button>
                )}
                {(w.party.length > 1 || w.agreement?.meeting) && (
                  <Button
                    variant="outline"
                    disabled={blocked}
                    onClick={() => void invoke({ type: "disband" })}
                  >
                    暂别同行之人
                  </Button>
                )}
                {w.story.outcome === "breached" && !w.story.compensated && (
                  <Button
                    variant="outline"
                    disabled={
                      blocked ||
                      !primary.alive ||
                      primary.location !== w.player.location ||
                      w.player.grass < 1
                    }
                    onClick={() => void invoke({ type: "compensate" })}
                  >
                    交付药草，赔礼
                  </Button>
                )}
              </div>
              <div hidden={moreTab !== "loot"}>
                <LootSettlement
                  world={w}
                  send={invoke}
                  blocked={blocked}
                  requestConfirm={requestConfirm}
                />
              </div>
              {presentationShows(w, "visitSect") && (
                <div hidden={moreTab !== "sect"}>
                  <SectPanel world={w} send={send} blocked={blocked} onProfile={onProfile} />
                </div>
              )}
              {w.story.flags.met &&
                primary.location === w.player.location &&
                !["accepted", "active"].includes(w.agreement?.status ?? "") && (
                  <div hidden={moreTab !== "talk"}>
                    <Negotiation world={w} busy={blocked} send={invoke} onPause={onPause} />
                  </div>
                )}
              {!w.ended && (
                <div hidden={moreTab !== "wait"}>
                  <WaitControls world={w} act={invoke} blocked={blocked} />
                </div>
              )}
              {w.ended && (
                <div>
                  <Button variant="outline" onClick={onExport}>
                    导出这一世
                  </Button>
                  <Button variant="outline" onClick={onNew}>
                    再入人间
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <PracticeSettings
        world={w}
        open={practice}
        onOpenChange={setPractice}
        act={act}
        blocked={blocked}
      />
      <BreakthroughDialog
        world={w}
        open={breakthrough}
        onOpenChange={setBreakthrough}
        act={act}
        blocked={blocked}
      />
      <Dialog open={journal} onOpenChange={setJournal}>
        <DialogContent className="game-modal journal-dialog">
          <DialogHeader>
            <DialogTitle>查看全部历程</DialogTitle>
            <DialogDescription>回看已知见闻与这一世的经历。</DialogDescription>
          </DialogHeader>
          <JournalPanel world={w} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
