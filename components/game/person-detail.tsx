"use client";
import { RelationshipStage } from "./relationship-stage";
import { relationshipDisplay, relationshipProgress } from "@/lib/ui/character-presentation";
import { profileTabForClick, type OpenProfile, type ProfileTab } from "@/lib/ui/profile-navigation";
import { IntimacyPanel } from "./intimacy-panel";
import { intimacyHistory, bondPartner } from "@/lib/game/intimacy";
import { sectById } from "@/lib/game/sect-content";
import { useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ARTIFACTS, COLORS, FACES, HAIRS, REALMS } from "@/lib/game/content/official";
import { actorById, threshold } from "@/lib/game/rules";
import { LOCATIONS } from "@/lib/game/world-map";
import { relation, relationshipLabel } from "@/lib/game/relationships";
import { characterVitals, characterRelations, characterHistory } from "@/lib/game/character-sheet";
import { npcProfile } from "@/lib/game/npc-profile";
import { actorPhysique, BODY_BUILDS } from "@/lib/game/physique";
import { npcSubject, playerSubject } from "@/lib/game/portrait-subject";
import { portraitFeatures } from "@/lib/game/portrait-features";
import { canRestorePortrait, originalPortrait } from "@/lib/game/portrait-restore";
import type { Actor, Relation, World } from "@/lib/game/types";
import { PortraitStudio } from "./portrait-studio";
import { PlayerPortrait } from "./player-portrait";
import { NpcPortrait } from "./npc-portrait";
import { Meter, type Send } from "./panels";
import { TimeBadge } from "./time-badge";

function PlayerAvatar({ world: w }: { world: World }) {
  return <PlayerPortrait world={w} className="sheet-avatar" />;
}
function Attitude({
  from,
  to,
  edge,
  bonded,
}: {
  from: string;
  to: string;
  edge?: Relation;
  bonded?: boolean;
}) {
  return (
    <div className="sheet-attitude">
      <span>
        {from} → {to}
      </span>
      {edge ? (
        <>
          <strong>{bonded ? `道侣 · ${relationshipLabel(edge)}` : relationshipLabel(edge)}</strong>
          <details className="relationship-numbers">
            <summary>查看关系数值</summary>
            <dl>
              <div>
                <dt title="对相处的喜爱程度">好感</dt>
                <dd>{edge.favor}</dd>
              </div>
              <div>
                <dt title="对承诺与行事的信赖">信任</dt>
                <dd>{edge.trust}</dd>
              </div>
              <div>
                <dt title="亲密吸引；普通相伴不会直接增加">吸引</dt>
                <dd>{edge.attraction}</dd>
              </div>
            </dl>
            <small>{relationshipProgress(edge)}</small>
          </details>
          {edge.attraction === 0 && <small>吸引尚无变化；普通相伴只增进好感与信任。</small>}
        </>
      ) : (
        <small>尚无这一方向的记录</small>
      )}
    </div>
  );
}
function Biography({ actor: a }: { actor: Actor }) {
  const bio = npcProfile(a);
  return (
    <section className="npc-bio">
      <h3 className="list-heading">身份与心愿</h3>
      <dl>
        <div>
          <dt>出身</dt>
          <dd>{bio.origin}</dd>
        </div>
        <div>
          <dt>性情</dt>
          <dd>{a.personality}</dd>
        </div>
        <div>
          <dt>偏好</dt>
          <dd>{bio.interest}</dd>
        </div>
        <div>
          <dt>心中所愿</dt>
          <dd>{bio.wish}</dd>
        </div>
      </dl>
    </section>
  );
}
export function PersonDetail({
  world: w,
  id,
  send,
  busy,
  onProfile,
  initialTab = "attributes",
  onTabChange,
  result,
  error = "",
}: {
  world: World;
  id: string;
  send: Send;
  busy: boolean;
  onProfile: OpenProfile;
  initialTab?: ProfileTab;
  onTabChange?: (tab: ProfileTab) => void;
  result?: { id: string; notice: string; day: number } | null;
  error?: string;
}) {
  const openingResult = useRef(result?.id);
  const [tab, setActiveTab] = useState<string>(initialTab);
  const setTab = (value: string) => {
    setActiveTab(value);
    onTabChange?.(value as ProfileTab);
  };
  const [relationLimit, setRelationLimit] = useState(12);
  const [historyLimit, setHistoryLimit] = useState(20);
  const [intimacyOnly, setIntimacyOnly] = useState(false);
  const relationships = useMemo(() => characterRelations(w, id), [w, id]);
  const history = useMemo(() => characterHistory(w, id), [w, id]);
  const a = actorById(w, id),
    vitals = characterVitals(w, id);
  if (!a || !vitals) return null;
  const self = id === "PLAYER",
    r = relation(w, id),
    body = actorPhysique(a);
  const present = a.alive && !a.npcJourney && a.location === w.player.location;
  const selfName = self ? "你" : a.name;
  const intimateHistory = intimacyHistory(w, id);
  const shownHistory = intimacyOnly
    ? history.filter((e) => intimateHistory.some((entry) => entry.id === e.id))
    : history;
  const partner = bondPartner(w, id);
  const facts = [
    ["aptitude", "资质", `${a.aptitude} / 100`],
    ["attack", "攻击", vitals.attack],
    ["defense", "防御", vitals.defense],
    ["speed", "速度", vitals.speed],
    ["lifespan", "寿元上限", `${vitals.lifespan} 岁`],
    ["height", "身高", `${body.heightCm} cm`],
    ["build", "身材", BODY_BUILDS[body.build]],
    ["manual", "功法", a.manual ? "已掌握入门功法" : "尚未学会"],
    ["stones", "灵石", a.stones],
    ["healing", "回春丹", a.healing],
    ["pills", "突破丹", a.pills],
    ["grass", "凝元草", a.grass],
  ] as const;
  return (
    <div className="person-detail character-sheet" data-character-id={id}>
      {error ? (
        <p className="profile-feedback error-banner" role="alert">
          {error}
        </p>
      ) : result && result.id !== openingResult.current ? (
        <p className="profile-feedback" role="status">
          {result.notice} <small>第 {result.day + 1} 日 · 已保存</small>
        </p>
      ) : null}
      <div className="sheet-identity">
        <button
          className="sheet-portrait-link"
          aria-label={`查看${a.name}的全身立绘`}
          onClick={() => setTab("portrait")}
        >
          {self ? (
            <PlayerAvatar world={w} />
          ) : (
            <NpcPortrait world={w} actor={a} className="sheet-avatar" />
          )}
        </button>
        <div>
          <div className="person-facts">
            <span>{REALMS[a.realm]}</span>
            <span>{vitals.age} 岁</span>
            <span>{a.sex === "female" ? "女" : "男"}</span>
            <span>{a.sect === "无" ? "散修" : a.sect}</span>
          </div>
          <p>
            {vitals.state} · {LOCATIONS[a.location].name}
          </p>
          <small>
            {self
              ? `已记录 ${relationships.length} 位人物的往来`
              : `与你：${relationshipDisplay(w, "PLAYER", id).label}`}
          </small>
        </div>
      </div>
      {!self && <RelationshipStage world={w} id={id} />}
      <Tabs value={tab} onValueChange={setTab} className="character-tabs">
        <TabsList aria-label="人物资料分类">
          <TabsTrigger value="attributes">属性</TabsTrigger>
          <TabsTrigger value="relations">关系</TabsTrigger>
          <TabsTrigger value="history">经历</TabsTrigger>
          <TabsTrigger value="portrait">立绘</TabsTrigger>
        </TabsList>
        <TabsContent value="attributes">
          <section aria-label="角色属性" className="sheet-attributes">
            <div className="sheet-meters">
              <div data-stat="hp">
                <Meter label="气血" value={vitals.hp} max={vitals.maxHp} kind="health" />
              </div>
              <div data-stat="xp">
                <Meter label="修为" value={a.xp} max={threshold(a)} />
              </div>
            </div>
            <dl className="sheet-stat-grid">
              {facts.map(([key, label, value]) => (
                <div key={key} data-stat={key}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <dl className="sheet-life">
            <div>
              <dt>当前状态</dt>
              <dd>{vitals.state === "在世" ? a.activity : vitals.state}</dd>
            </div>
            <div>
              <dt>修行目标</dt>
              <dd>{a.goal}</dd>
            </div>
            {!self && (
              <div>
                <dt>立绘形貌</dt>
                <dd>
                  {FACES[npcSubject(a).appearance.face]} · {HAIRS[npcSubject(a).appearance.hair]} ·{" "}
                  {COLORS[npcSubject(a).appearance.color]}
                </dd>
              </div>
            )}
            {self && (
              <>
                <div>
                  <dt>伴生法宝</dt>
                  <dd>{ARTIFACTS.find((x) => x.id === w.profile.artifact)?.name}</dd>
                </div>
                <div>
                  <dt>容貌</dt>
                  <dd>
                    {FACES[w.profile.appearance.face]} · {HAIRS[w.profile.appearance.hair]} ·{" "}
                    {COLORS[w.profile.appearance.color]}
                  </dd>
                </div>
              </>
            )}
          </dl>
          {a.sectMembership && (
            <dl className="sheet-life" aria-label="宗门门籍">
              <div>
                <dt>宗门贡献</dt>
                <dd>
                  {a.sectMembership.contribution} / 累计 {a.sectMembership.earned}
                </dd>
              </div>
              <div>
                <dt>宗门心法</dt>
                <dd>
                  {sectById(a.sectMembership.id)!.technique} ·{" "}
                  {a.sectMembership.artLearned ? "已掌握" : "尚未研习"}
                </dd>
              </div>
              <div>
                <dt>门籍登记</dt>
                <dd>第 {a.sectMembership.joinedDay + 1} 日</dd>
              </div>
            </dl>
          )}
          {!self && <Biography actor={a} />}
        </TabsContent>
        <TabsContent value="relations">
          <section aria-label="人物关系" className="sheet-relationships">
            <h3 className="list-heading">人物往来 · {relationships.length} 人</h3>
            <p className="subtle">
              好感表示相处的喜爱，信任表示对行事的信赖；吸引为零表示尚未形成亲密吸引。双方感受可能不同。
            </p>
            {!relationships.length && (
              <p className="empty-copy">尚无已知人物的往来记录。相识与共同经历会在这里留下关系。</p>
            )}
            {relationships.slice(0, relationLimit).map(({ peer, outgoing, incoming }) => (
              <article className="sheet-relation" key={peer.id} data-relation-peer={peer.id}>
                <button
                  className="sheet-peer"
                  onClick={(event) => onProfile(peer.id, profileTabForClick(event))}
                >
                  {peer.id === "PLAYER" ? (
                    <PlayerAvatar world={w} />
                  ) : (
                    <NpcPortrait world={w} actor={peer} className="sheet-avatar" />
                  )}
                  <span>
                    <strong>
                      {peer.name}
                      {peer.id === "PLAYER" ? " · 你" : ""}
                    </strong>
                    <small>
                      {REALMS[peer.realm]} · {peer.alive ? LOCATIONS[peer.location].name : "已逝"}
                    </small>
                  </span>
                  <span className="sheet-peer-action">
                    查看 <ChevronRight size={14} aria-hidden="true" />
                  </span>
                </button>
                <div className="sheet-directions">
                  <Attitude
                    from={selfName}
                    to={peer.id === "PLAYER" ? "你" : peer.name}
                    bonded={relationshipDisplay(w, id, peer.id).bonded}
                    edge={outgoing}
                  />
                  <Attitude
                    from={peer.id === "PLAYER" ? "你" : peer.name}
                    to={selfName}
                    bonded={relationshipDisplay(w, id, peer.id).bonded}
                    edge={incoming}
                  />
                </div>
              </article>
            ))}
            {relationships.length > relationLimit && (
              <Button variant="outline" onClick={() => setRelationLimit((n) => n + 12)}>
                查看更多关系
              </Button>
            )}
          </section>
        </TabsContent>
        <TabsContent value="history">
          <section aria-label="人物经历">
            {!self && (
              <section className="sheet-background" aria-label="生平小传">
                <h3 className="list-heading">生平小传</h3>
                <p>{npcProfile(a).background}</p>
              </section>
            )}
            <h3 className="list-heading">
              {self ? "这一世的经历" : `${a.name}的个人经历`} · {history.length} 条
            </h3>
            <p className="subtle">
              {self ? "你亲身经历的故事。" : "记录此人亲历的修行、交往与人生变故。"}
            </p>
            <div className="history-filters" aria-label="经历类型">
              <Button
                variant={intimacyOnly ? "outline" : "secondary"}
                onClick={() => {
                  setIntimacyOnly(false);
                  setHistoryLimit(20);
                }}
                aria-pressed={!intimacyOnly}
              >
                全部经历
              </Button>
              <Button
                variant={intimacyOnly ? "secondary" : "outline"}
                onClick={() => {
                  setIntimacyOnly(true);
                  setHistoryLimit(20);
                }}
                aria-pressed={intimacyOnly}
              >
                性与亲密经历
              </Button>
            </div>
            <section className="intimacy-history" aria-label="性与亲密经历">
              <strong>性与亲密经历 · {intimateHistory.length} 条</strong>
              <p>
                {partner ? `道侣：${partner.name}${partner.alive ? "" : "（已逝）"}。` : ""}
                {a.sectMembership?.id === "yunv"
                  ? "自述未有性经历，目前守贞清修。"
                  : intimateHistory.length
                    ? "记录自愿结侣、相伴良宵与双修，不记露骨细节。"
                    : "仅呈现已记录的亲密经历，未记载的过往不会推断。"}
              </p>
            </section>
            <div className="memory-list">
              {shownHistory.slice(0, historyLimit).map((e) => (
                <article key={e.id} className="sheet-memory" data-event-id={e.id}>
                  <small>
                    第 {e.day + 1} 日
                    {e.lastDay !== undefined && e.lastDay > e.day && ` — 第 ${e.lastDay + 1} 日`}
                    {e.count !== undefined && e.count > 1 && ` · 累计 ${e.count} 次`}
                    {e.location && ` · ${LOCATIONS[e.location].name}`} ·{" "}
                    {self ? "亲身经历" : e.actors.includes("PLAYER") ? "与你共同经历" : "个人经历"}
                  </small>
                  <p>{e.text}</p>
                  {e.relationshipChange && (
                    <span className="relationship-trend">
                      {e.relationshipChange.favor !== 0 && (
                        <small>
                          好感
                          {e.relationshipChange.favor > 0 ? "+" : ""}
                          {e.relationshipChange.favor}
                          {e.relationshipChange.favor > 0 ? (
                            <ArrowUp size={12} aria-hidden="true" />
                          ) : (
                            <ArrowDown size={12} aria-hidden="true" />
                          )}
                          <span className="sr-only">
                            {e.relationshipChange.favor > 0 ? "上升" : "下降"}
                          </span>
                        </small>
                      )}
                      {e.relationshipChange.trust !== 0 && (
                        <small>
                          信任
                          {e.relationshipChange.trust > 0 ? "+" : ""}
                          {e.relationshipChange.trust}
                          {e.relationshipChange.trust > 0 ? (
                            <ArrowUp size={12} aria-hidden="true" />
                          ) : (
                            <ArrowDown size={12} aria-hidden="true" />
                          )}
                          <span className="sr-only">
                            {e.relationshipChange.trust > 0 ? "上升" : "下降"}
                          </span>
                        </small>
                      )}
                    </span>
                  )}
                </article>
              ))}
            </div>
            {!shownHistory.length && (
              <p className="empty-copy">
                {intimacyOnly ? "尚无此类经历记载。" : "此世尚无新的经历记录。"}
              </p>
            )}
            {shownHistory.length > historyLimit && (
              <Button variant="outline" onClick={() => setHistoryLimit((n) => n + 20)}>
                查看更多经历
              </Button>
            )}
          </section>
        </TabsContent>
        <TabsContent value="portrait" forceMount hidden={tab !== "portrait"}>
          <PortraitStudio
            key={`${w.saveId}:${a.id}`}
            editable
            subject={self ? playerSubject(w.profile, w.seed) : npcSubject(a)}
            actorId={self ? undefined : a.id}
            portraitId={a.portraitId}
            originalPortraitId={originalPortrait(w, a)?.portraitId}
            protectedIds={[w.player, ...w.npcs].flatMap((actor) =>
              [actor.portraitId, actor.portraitOriginal?.portraitId].filter(
                (id): id is string => !!id,
              ),
            )}
            restoreAvailable={canRestorePortrait(w, a)}
            onRestore={async () => {
              const ok = await send({ type: "restorePortrait", target: a.id });
              if (!ok) throw new Error("原立绘尚未恢复，请重新读取后重试。");
            }}
            name={a.name}
            disabled={busy || !!w.longAction || !!w.battle || w.ended || !a.alive}
            onAdopt={async (portraitId, subject) => {
              const ok = await send({
                type: "attachPortrait",
                target: a.id,
                portraitId,
                look: {
                  appearance: subject.appearance,
                  physique: subject.physique,
                  portraitFeatures: portraitFeatures(subject),
                },
              });
              if (!ok) throw new Error("立绘引用尚未保存，请重新读取后重试。");
            }}
          />
          <dl className="physique-facts" aria-label="体貌资料">
            <div>
              <dt>身材</dt>
              <dd>{BODY_BUILDS[body.build]}</dd>
            </div>
            <div>
              <dt>身高</dt>
              <dd>{body.heightCm} cm</dd>
            </div>
            {a.sex === "female" && (
              <div>
                <dt>{body.bustCup ? "胸围" : "胸 / 腰 / 臀"}</dt>
                <dd>{body.bustCup ?? `${body.bustCm} / ${body.waistCm} / ${body.hipsCm} cm`}</dd>
              </div>
            )}
            <div>
              <dt>外貌年龄</dt>
              <dd>
                约 {body.apparentAge} 岁{body.apparentAge < vitals.age ? " · 驻颜" : ""}
              </dd>
            </div>
            {(self || a.sex === "female") && (
              <div className="physique-attire">
                <dt>立绘装束</dt>
                <dd>{portraitFeatures(self ? w.profile : a) || "随整体造型搭配"}</dd>
              </div>
            )}
          </dl>
        </TabsContent>
      </Tabs>
      {!self && tab !== "portrait" && (
        <div className="sheet-contact">
          <Button
            disabled={busy || !present || !!w.battle || !!w.longAction || w.ended}
            onClick={() => send({ type: "meet", target: id })}
          >
            {r?.known ? "聊聊近况" : "上前见礼"}
            <TimeBadge world={w} command={{ type: "meet", target: id }} />
          </Button>
          {tab === "relations" && r?.known && (
            <IntimacyPanel
              world={w}
              actor={a}
              send={send}
              blocked={busy || !!w.longAction || !!w.battle || w.ended}
            />
          )}
          {(!!w.battle || !!w.longAction || busy || !present) && (
            <small>
              {w.battle
                ? "战斗中不可交谈；自动战斗已暂停。"
                : w.longAction
                  ? "请先结束当前长行动。"
                  : busy
                    ? "请先等待当前操作保存完成。"
                    : a.npcJourney
                      ? "对方正在赶路，抵达后才可相见"
                      : a.alive
                        ? "需与对方在同一地点"
                        : "故人已逝，往事仍在"}
            </small>
          )}
        </div>
      )}
    </div>
  );
}
