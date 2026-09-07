"use client";
import { memo } from "react";
import { TimeBadge } from "./time-badge";
import { WaitControls } from "./wait-controls";

import { Button } from "@/components/ui/button";
import {
  ARTIFACTS,
  CHARACTERS,
  contentText,
  LOCATIONS,
  PACK,
  PRESENTATION,
  REALMS,
  visual,
} from "@/lib/game/content/official";
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
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock3,
  Coins,
  Compass,
  Feather,
  Leaf,
  MapPin,
  Moon,
  ScrollText,
  Swords,
  Wind,
} from "lucide-react";
import { Negotiation } from "./negotiation";
import { GameImage } from "./panels";
import { SideStories } from "./side-stories";

import B from "@/lib/game/content/balance.json";
import { DEPARTURE_FEE } from "@/lib/game/economy";
import { objective } from "@/lib/game/presentation";
import { LootSettlement } from "./loot-settlement";
import type { Send } from "./panels";
type JourneyProps = {
  world: World;
  send: Send;
  act: Send;
  setTab: (tab: string) => void;
  setProfileId: (id: string) => void;
  requestConfirm: (value: "breach") => void;
  pause: () => void;
  blocked: boolean;
  goal: ReturnType<typeof objective>;
};

export const JourneyTab = memo(function JourneyTab({
  world: w,
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

  const artifact = ARTIFACTS.find((a) => a.id === w.profile.artifact)!;
  const nearby = w.npcs.filter((a) => a.alive && a.location === p.location);

  return (
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
              <span>{transition?.eyebrow || current?.eyebrow || "游历 · 此间见闻"}</span>
              <span className="ornament">◆</span>
            </div>
            <h2 className="serif">{transition?.title || current?.title || place.subtitle}</h2>
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
              <LootSettlement
                world={w}
                send={send}
                requestConfirm={requestConfirm}
                blocked={blocked}
              />
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
                    <TimeBadge world={w} command={{ type: "wait", days: 1 }} />
                  </button>
                )}
              {p.location === "inn" && !p.manual && (
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
                      {departure.reason || `山行 1 日 · 路费 ${DEPARTURE_FEE} 灵石 · 将遭遇战斗`}
                    </small>
                  </span>
                  <ArrowRight size={17} />
                  <TimeBadge world={w} command={{ type: "expedition" }} />
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
                  ? `出发时支付 ${DEPARTURE_FEE} 枚灵石。`
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
                    disabled={blocked || p.realm < 1 || readiness.members.some((a) => !a.alive)}
                    onClick={() => send({ type: readiness.ready ? "formParty" : "rally" })}
                  >
                    {p.realm < 1
                      ? "成为炼气修士后组队"
                      : readiness.ready
                        ? "邀二人同行"
                        : w.agreement?.meeting?.location === p.location
                          ? "等候同伴 · 1 日"
                          : "约在此处会合 · 1 日"}
                    <TimeBadge
                      world={w}
                      command={{ type: readiness.ready ? "formParty" : "rally" }}
                    />
                  </Button>
                  {w.agreement.meeting && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={blocked}
                      onClick={() => send({ type: "disband" })}
                    >
                      取消会合
                      <TimeBadge world={w} command={{ type: "disband" }} />
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
                <TimeBadge world={w} command={{ type: "compensate" }} />
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
      <section className="daily-actions" id="practice-link">
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
            <TimeBadge
              world={w}
              command={{
                type: "travel",
                to: p.location === "gate" ? "market" : "inn",
              }}
            />
          </button>
          <button
            disabled={blocked || p.location === "ruins"}
            onClick={() => send({ type: "work" })}
          >
            <Coins />
            <span>
              <strong>接些坊市杂务</strong>
              <small>
                {B.actions.workDays} 日 · 获得 {B.actions.workSpiritStoneReward} 灵石
              </small>
            </span>
            <TimeBadge world={w} command={{ type: "work" }} />
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
            <TimeBadge world={w} command={{ type: "rest" }} />
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
            <TimeBadge world={w} command={{ type: "wait", days: 3 }} />
          </button>
        </div>
      </section>
      <WaitControls world={w} act={act} blocked={blocked} />
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
            <small>{p.location === "gate" || to === "gate" ? "1 日" : "同在坊市"}</small>
            <ArrowRight size={14} />
            <TimeBadge world={w} command={{ type: "travel", to }} />
          </button>
        ))}
        {!place.destinations.length && <span className="subtle">结束遭遇后可返回坊市。</span>}
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
  );
});
