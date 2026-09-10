"use client";
import {
  journeyContext,
  companionStatus,
  localChapterStatus,
} from "@/lib/game/journey-presentation";
import { profileTabForClick, type OpenProfile } from "@/lib/ui/profile-navigation";
import { locationArt } from "@/lib/ui/cosmetic-art";
import { memo, useLayoutEffect, useRef } from "react";
import { sectAt } from "@/lib/game/sect-content";
import { SectPanel } from "./sect-panel";
import { WorldMap } from "./world-map";
import { AtlasDialog } from "./atlas-dialog";
import { MainStoryScene } from "./main-story";
import { mainScene, hasRubbing } from "@/lib/game/main-story";
import { TimeBadge } from "./time-badge";
import { WaitControls } from "./wait-controls";

import { Button } from "@/components/ui/button";
import {
  ARTIFACTS,
  CHARACTERS,
  contentText,
  PACK,
  PRESENTATION,
  REALMS,
  visual,
} from "@/lib/game/content/official";
import { LOCATIONS, locationKind, regionOf, regionName } from "@/lib/game/world-map";
import { extensionScenes } from "@/lib/game/content-story";
import { extensionVisual } from "@/lib/game/content/extensions";
import {
  departureStatus,
  knownNpcUpdates,
  partyReadiness,
  relation,
  relationshipLabel,
  scene,
} from "@/lib/game/engine";
import type { LocationId, World } from "@/lib/game/types";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Coins,
  Compass,
  Diamond,
  Feather,
  Leaf,
  MapPin,
  Moon,
  ScrollText,
  Swords,
  Wind,
} from "lucide-react";
import { Negotiation } from "./negotiation";
import { NpcPortrait } from "./npc-portrait";
import { GameImage } from "./panels";
import { SideStories } from "./side-stories";

import { DEPARTURE_FEE } from "@/lib/game/economy";
import { objective } from "@/lib/game/presentation";
import { journeyActions } from "@/lib/game/journey-actions";
import { LootSettlement } from "./loot-settlement";
import type { Send } from "./panels";
type JourneyProps = {
  world: World;
  detailOpen: boolean;
  peopleOpen: boolean;
  onPeopleChange: (open: boolean) => void;
  onDetailChange: (open: boolean) => void;
  send: Send;
  act: Send;
  setTab: (tab: string) => void;
  setProfileId: OpenProfile;
  requestConfirm: (value: "breach") => void;
  pause: () => void;
  blocked: boolean;
  goal: ReturnType<typeof objective>;
};

const actionIcons = {
  practice: Wind,
  coins: Coins,
  rest: Moon,
  wait: Clock3,
  road: ArrowRight,
  sect: BookOpen,
};

export const JourneyTab = memo(function JourneyTab({
  world: w,
  detailOpen,
  peopleOpen,
  onPeopleChange,
  onDetailChange,
  send,
  act,
  setTab,
  setProfileId,
  requestConfirm,
  pause,
  blocked,
  goal,
}: JourneyProps) {
  const p = w.player;
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const wasDetailOpen = useRef(false);
  useLayoutEffect(() => {
    onPeopleChange(false);
    if (detailOpen) {
      detailHeading.current?.focus({ preventScroll: true });
      document.querySelector(".location-reading")?.scrollTo({ top: 0 });
    } else if (wasDetailOpen.current) {
      document
        .querySelector<HTMLButtonElement>(".map-place.is-current .map-travel")
        ?.focus({ preventScroll: true });
    }
    wasDetailOpen.current = detailOpen;
  }, [detailOpen, p.location, onPeopleChange]);
  const enterLocation = async (to: LocationId) => {
    if (to === p.location || (await send({ type: "travel", to }))) onDetailChange(true);
  };
  const context = journeyContext(w);
  const { main, side: sideScene, official: current } = context;
  const focus = context.actor;
  const companion = companionStatus(w);
  const chapterStatus = localChapterStatus(w);
  const place = LOCATIONS[p.location];
  const primary = w.npcs.find((a) => a.id === PACK.roles.primary)!;
  const primaryHere = primary.alive && primary.location === p.location;
  const transition = w.loot
    ? p.location === "ruins"
      ? PRESENTATION.lootReturn
      : PRESENTATION.lootSettle
    : null;
  const sceneArt = transition
    ? extensionVisual(transition.visualId)
    : (locationArt(p.location) ?? extensionVisual(current?.visualId || place.visualId));
  const portraitArt = visual(current?.portraitId || CHARACTERS.primary.portraitId || "");
  const readiness = partyReadiness(w);
  const departure = departureStatus(w);
  const remoteCompanions = readiness.members.some(
    (a) => regionOf(a.location) !== regionOf(p.location),
  );
  const busyCompanion = w.party
    .map((id) => w.npcs.find((a) => a.id === id))
    .find((a) => a?.attempt);

  const artifact = ARTIFACTS.find((a) => a.id === w.profile.artifact)!;
  const localSect = sectAt(p.location);
  const nearby = w.npcs
    .filter((a) => a.alive && !a.npcJourney && a.location === p.location)
    .sort(
      (a, b) =>
        Number(b.sectMembership?.id === localSect?.id && !!localSect) -
          Number(a.sectMembership?.id === localSect?.id && !!localSect) ||
        Number(!!relation(w, b.id)?.known) - Number(!!relation(w, a.id)?.known),
    );
  const nearbyPreview = nearby.filter((a) => a.id !== focus?.id).slice(0, 3);
  const visiblePeople = peopleOpen ? nearby : nearbyPreview;

  if (!detailOpen)
    return (
      <WorldMap
        world={w}
        send={send}
        onEnter={enterLocation}
        onProfile={setProfileId}
        blocked={blocked}
        goal={goal}
        storyTitle={main?.title || sideScene?.title || current?.title}
      />
    );

  const actions = journeyActions(w)
    .filter((action) => action.icon !== "sect")
    .map((action) =>
      action.command?.type === "wait"
        ? {
            ...action,
            title: "等候",
            hint: "选择日数与停止条件",
            command: undefined,
            anchor: "wait-controls",
          }
        : action,
    );
  return (
    <section id="location-detail" aria-label={`${place.name}详情`}>
      <header className="location-navigation">
        <Button
          variant="ghost"
          className="location-back"
          aria-label="返回地点选择"
          onClick={() => onDetailChange(false)}
        >
          <ArrowLeft size={16} />
          <span>地点</span>
        </Button>
        <div className="place-heading">
          <h1 className="serif" ref={detailHeading} tabIndex={-1}>
            {place.name}
          </h1>
          <span className="weather">
            {regionName(p.location) !== place.name && `${regionName(p.location)} · `}
            {p.location === "ruins" || p.location === "gate" ? "山风微凉" : "暮色晴和"}
          </span>
        </div>
        <Button
          variant="ghost"
          className="location-people-toggle"
          aria-pressed={peopleOpen}
          onClick={() => onPeopleChange(!peopleOpen)}
        >
          {peopleOpen ? "回到剧情" : `此处人物 · ${nearby.length}`}
        </Button>
        <AtlasDialog world={w} send={send} blocked={blocked} />
      </header>
      <div className={`location-workspace${peopleOpen ? " is-people-open" : ""}`}>
        <div className="location-reading" tabIndex={0} aria-label="地点见闻">
          <SectPanel
            key={p.location}
            world={w}
            send={send}
            blocked={blocked}
            onProfile={setProfileId}
          />
          {!context.actionable && chapterStatus && (
            <section className="chapter-status">
              <span className="eyebrow">主线 · 残碑寻源 · {chapterStatus.chapter.volumeTitle}</span>
              <h3>{chapterStatus.done ? "此地线索已查明" : "此地旧事尚待查访"}</h3>
              {chapterStatus.missing.length > 0 ? (
                <ul>
                  {chapterStatus.missing.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  {chapterStatus.done
                    ? `第 ${chapterStatus.done.day + 1} 日 · ${chapterStatus.done.text}`
                    : "条件已齐备，可以继续查访。"}
                </p>
              )}
            </section>
          )}
          <div className="scene-column" id="current-scene" tabIndex={-1}>
            {main ? (
              <MainStoryScene
                world={w}
                scene={main}
                send={send}
                blocked={blocked}
                onProfile={setProfileId}
              />
            ) : sideScene ? (
              <SideStories world={w} busy={blocked} send={send} onProfile={setProfileId} />
            ) : (
              <>
                <figure className="scene-figure">
                  <GameImage src={sceneArt.url} alt={sceneArt.alt} zoom />
                  <figcaption>
                    <span>{place.subtitle}</span>
                    <small>
                      第 {w.day + 1} 日 · {p.location === "ruins" ? "月下" : "此刻"}
                    </small>
                  </figcaption>
                </figure>
                <section className="story-copy">
                  <div className="story-eyebrow">
                    <span>{transition?.eyebrow || current?.eyebrow || "游历 · 此间见闻"}</span>
                    <Diamond className="ornament" aria-hidden="true" />
                  </div>
                  <h2 className="serif">{transition?.title || current?.title || place.subtitle}</h2>
                  <p>
                    {current?.id === "accepted" && w.party.length === 3
                      ? "同伴已齐，可以前往山门古道；出发前查看路费与队伍状态。"
                      : contentText(transition?.body || current?.body || place.body, w)}
                  </p>
                  {current?.quote && !w.loot && (
                    <blockquote>
                      <span className="quote-mark">“</span>
                      {current.quote.replace(/^“|”$/g, "")}
                      <cite>— {w.story.flags.met ? primary.name : "青白衣衫的女修"}</cite>
                    </blockquote>
                  )}
                  {!w.loot && !!current?.choices.length && (
                    <div className="story-choices">
                      {current.choices.map((choice, i) => (
                        <button
                          key={choice.id}
                          id={`story-choice-${choice.id}`}
                          className={`story-choice ${goal.anchor === `story-choice-${choice.id}` ? "guide-target" : ""}`}
                          disabled={blocked}
                          onClick={() =>
                            send({ type: "choose", nodeId: current.id, choiceId: choice.id })
                          }
                        >
                          <span className="choice-number">{String(i + 1).padStart(2, "0")}</span>
                          <span>
                            <strong>{choice.label}</strong>
                            <small>{choice.hint}</small>
                          </span>
                          <ArrowRight size={17} />
                          <TimeBadge
                            world={w}
                            command={{ type: "choose", nodeId: current.id, choiceId: choice.id }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              </>
            )}
            {!w.ended &&
              (w.loot ||
                p.location === "gate" ||
                (locationKind(p.location) === "inn" && !p.manual)) && (
                <div className="story-choices location-actions">
                  {p.location === "gate" && !hasRubbing(w) && !w.loot && (
                    <button
                      className="story-choice"
                      id="main-survey"
                      disabled={blocked || p.realm < 1 || w.party.length !== 1}
                      onClick={() => send({ type: "surveyRuins" })}
                    >
                      <span className="choice-number">
                        <Compass size={17} />
                      </span>
                      <span>
                        <strong>勘察古道残碑</strong>
                        <small>
                          {p.realm < 1
                            ? "炼气入门后可独自勘察"
                            : w.party.length !== 1
                              ? "先暂别同伴，再独自调查"
                              : "寻找水纹拓片 · 主线线索"}
                        </small>
                      </span>
                      <TimeBadge world={w} command={{ type: "surveyRuins" }} />
                    </button>
                  )}
                  <LootSettlement
                    world={w}
                    send={send}
                    requestConfirm={requestConfirm}
                    blocked={blocked}
                  />
                  {p.location === "gate" &&
                    !departure.ready &&
                    w.agreement?.status === "accepted" &&
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
                        <TimeBadge world={w} command={{ type: "wait", days: 1 }} />
                      </button>
                    )}
                  {locationKind(p.location) === "inn" && !p.manual && (
                    <button
                      className="story-choice"
                      disabled={blocked}
                      id="learn-manual"
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
                      <TimeBadge world={w} command={{ type: "learn" }} />
                    </button>
                  )}
                  {p.location === "gate" && !w.loot && (
                    <button
                      className="story-choice"
                      disabled={blocked || !departure.ready}
                      id="party-departure"
                      onClick={() => send({ type: "expedition" })}
                    >
                      <span className="choice-number">
                        <Swords size={17} />
                      </span>
                      <span>
                        <strong>三人同行，进入残碑秘境</strong>
                        <small>
                          {departure.reason ||
                            `山行 1 日 · 路费 ${DEPARTURE_FEE} 灵石 · 将遭遇战斗`}
                        </small>
                      </span>
                      <ArrowRight size={17} />
                      <TimeBadge world={w} command={{ type: "expedition" }} />
                    </button>
                  )}
                </div>
              )}
          </div>

          {!w.ended && <WaitControls world={w} act={act} blocked={blocked} />}
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
        </div>
        <aside
          className={`encounter-column${companion ? " has-companion-status" : ""}`}
          aria-label="此处人物"
        >
          {companion && (
            <section className="companion-status" id="companion-status" tabIndex={-1}>
              <h3>{companion.title}</h3>
              <p>{companion.text}</p>
              {w.agreement?.status === "accepted" && w.party.length === 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    blocked ||
                    p.realm < 1 ||
                    remoteCompanions ||
                    readiness.members.some((a) => !a.alive)
                  }
                  onClick={() => send({ type: readiness.ready ? "formParty" : "rally" })}
                >
                  {remoteCompanions
                    ? "回到同伴所在城镇会合"
                    : p.realm < 1
                      ? "成为炼气修士后组队"
                      : readiness.ready
                        ? "邀二人同行"
                        : w.agreement?.meeting?.location === p.location
                          ? "等候同伴会合"
                          : "约在此处会合"}
                  <TimeBadge
                    world={w}
                    command={{ type: readiness.ready ? "formParty" : "rally" }}
                  />
                </Button>
              )}
              {w.agreement?.status === "not_triggered" &&
                p.location !== "market" &&
                !actions.some((a) => a.command?.type === "travel" && a.command.to === "market") && (
                  <Button
                    variant="outline"
                    disabled={blocked}
                    onClick={() => send({ type: "travel", to: "market" })}
                  >
                    返回青石坊市
                    <TimeBadge world={w} command={{ type: "travel", to: "market" }} />
                  </Button>
                )}
            </section>
          )}
          {focus ? (
            <article className="encounter-person">
              <button
                className="portrait-frame character-link"
                onClick={() => setProfileId(focus.id, "portrait")}
                aria-label={`查看${context.displayName}的全身立绘`}
              >
                <NpcPortrait world={w} actor={focus} full displayName={context.displayName} />
                <span className="portrait-label">当前故事人物 · 查看全身立绘</span>
              </button>
              <div className="encounter-person-info">
                <div className="spread">
                  <h2 className="serif">
                    <button className="character-link" onClick={() => setProfileId(focus.id)}>
                      {context.displayName}
                    </button>
                  </h2>
                  <span>{relationshipLabel(relation(w, focus.id))}</span>
                </div>
                <p>
                  {REALMS[focus.realm]} · {focus.sect === "无" ? "散修" : focus.sect}
                </p>
                <Button
                  variant="outline"
                  className="encounter-action"
                  onClick={() => setProfileId(focus.id)}
                >
                  人物资料与经历 <ChevronRight size={15} />
                </Button>
                {focus.id === primary.id &&
                  w.story.flags.met &&
                  !["accepted", "active"].includes(w.agreement?.status ?? "") && (
                    <Negotiation world={w} busy={blocked} send={send} onPause={pause} />
                  )}
              </div>
            </article>
          ) : (
            <article className="local-note">
              <h3 className="serif">此处人物 · {nearby.length}</h3>
              <p>{nearby.length ? "结识在场修士，听听此地的往事。" : "此处暂无在场修士。"}</p>
            </article>
          )}
          <div className="nearby-people">
            <div className="nearby-heading">
              <h3>
                此地相逢 <span>{nearby.length} 人在场</span>
              </h3>
              {nearby.length > nearbyPreview.length && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="nearby-toggle"
                  aria-label={peopleOpen ? "收起在场修士列表" : "查看全部在场修士"}
                  aria-expanded={peopleOpen}
                  aria-controls="local-people-list"
                  onClick={() => onPeopleChange(!peopleOpen)}
                >
                  {peopleOpen ? "收起" : "展开"}
                  {peopleOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </Button>
              )}
            </div>
            <div className="local-people-list" id="local-people-list">
              {visiblePeople.map((a) => (
                <button
                  type="button"
                  className="nearby-person"
                  key={a.id}
                  onClick={(event) => setProfileId(a.id, profileTabForClick(event))}
                >
                  <NpcPortrait world={w} actor={a} className="mini-portrait" />
                  <span className="nearby-person-info">
                    <strong>{a.name}</strong>
                    <small>{REALMS[a.realm]}</small>
                  </span>
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              ))}
              {visiblePeople.length === 0 && (
                <p className="nearby-empty">
                  {nearby.length ? "暂无其他在场修士。" : "此处暂无在场修士。"}
                </p>
              )}
            </div>
          </div>
          {w.agreement && ["accepted", "active"].includes(w.agreement.status) && (
            <details className="promise-note">
              <summary className="eyebrow">
                <ScrollText size={14} /> 同行约定
                {remoteCompanions ? " · 同伴在异城" : " · 条款与会合"}
              </summary>
              <p>第一株凝元草归{primary.name}，其余战利品归你。</p>
              <small>
                {w.agreement.status === "accepted"
                  ? `出发时支付 ${DEPARTURE_FEE} 枚灵石。`
                  : "路费已付，等待探险结算。"}
              </small>
              <div className="meeting-members">
                {readiness.members.map((a) => (
                  <button
                    key={a.id}
                    onClick={(event) => setProfileId(a.id, profileTabForClick(event))}
                  >
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
                  {w.agreement.meeting && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={blocked}
                      onClick={() => send({ type: "disband" })}
                    >
                      取消本次同行约定
                      <TimeBadge world={w} command={{ type: "disband" }} />
                    </Button>
                  )}
                  {!readiness.ready && p.realm >= 1 && (
                    <small>
                      {remoteCompanions
                        ? "远处的同伴不会跨城赶来；回到同一城镇后再约会合。"
                        : "在场的人会留下等候，正在突破的人会结束后赶来。"}
                    </small>
                  )}
                </>
              )}
            </details>
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
                <TimeBadge world={w} command={{ type: "compensate" }} />
              </Button>
            </div>
          )}
        </aside>
      </div>
      {!w.ended && actions.length > 0 && (
        <section className="daily-actions" id="practice-link" aria-label="当前地点行动">
          <div className="daily-action-grid">
            {actions.map((action) => {
              const Icon = actionIcons[action.icon];
              return (
                <button
                  key={action.id}
                  data-journey-action={action.id}
                  disabled={blocked}
                  onClick={() => {
                    if (action.command) {
                      void (action.command.type === "wait" ? act : send)(action.command);
                    } else if (action.tab) setTab(action.tab);
                    else {
                      const panel = document.getElementById(action.anchor);
                      if (panel instanceof HTMLDetailsElement) panel.open = true;
                      panel?.scrollIntoView({ block: "nearest" });
                      panel?.focus({ preventScroll: true });
                    }
                  }}
                >
                  <Icon />
                  <span>
                    <strong>{action.title}</strong>
                    <small>{action.hint}</small>
                  </span>
                  <TimeBadge world={w} command={action.command} />
                </button>
              );
            })}
          </div>
        </section>
      )}
    </section>
  );
});
