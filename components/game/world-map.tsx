"use client";
import { MainQuestLog } from "./main-quest-log";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
} from "@/components/ui/dialog";
import { journeyContext } from "@/lib/game/journey-presentation";
import { sectAt } from "@/lib/game/sect-content";
import { relation } from "@/lib/game/relationships";
import { profileTabForClick, type OpenProfile } from "@/lib/ui/profile-navigation";
import { Compass, MapPin, Footprints, ArrowRight } from "lucide-react";
import { LOCATIONS, localSite, regionOf, regionName, travelRoute } from "@/lib/game/world-map";
import { mainProgress, mainEvent, currentMainStep, hasRubbing } from "@/lib/game/main-story";
import { PACK } from "@/lib/game/content/official";
import { travelDays } from "@/lib/game/action-cost";
import type { LocationId, World } from "@/lib/game/types";
import { AtlasDialog } from "./atlas-dialog";
import { NpcPortrait } from "./npc-portrait";
import type { Send } from "./panels";
import type { objective } from "@/lib/game/presentation";

export function WorldMap({
  world: w,
  send,
  onEnter,
  onProfile,
  blocked,
  goal,
  storyTitle,
}: {
  world: World;
  send: Send;
  onEnter: (to: LocationId) => Promise<void>;
  onProfile: OpenProfile;
  blocked: boolean;
  goal: ReturnType<typeof objective>;
  storyTitle?: string;
}) {
  const [residentPlace, setResidentPlace] = useState<LocationId | null>(null);
  const context = journeyContext(w);
  const progress = mainProgress(w),
    step = currentMainStep(w);
  const currentRegion = regionOf(w.player.location);
  const localSites = (["market", "inn", "gate"] as const).map((kind) =>
    localSite(w.player.location, kind),
  );
  if (!localSites.includes(w.player.location)) localSites.unshift(w.player.location);
  const actorIds = context.participants;
  return (
    <section id="world-map" className="world-map" aria-label="云岚地图">
      <header className="world-map-heading">
        <div>
          <span className="eyebrow">
            <Compass size={15} /> 行路 · 云岚境
          </span>
          <h2 className="serif">山河辽阔，随心而行</h2>
        </div>
        <div className="map-heading-tools">
          <span className="map-date">
            第 {w.day + 1} 日 · {regionName(w.player.location)}
          </span>
          <AtlasDialog world={w} send={send} blocked={blocked} />
        </div>
      </header>
      <button
        className="map-event-link map-current-event"
        onClick={() => void onEnter(w.player.location)}
      >
        <span>
          <span className="eyebrow">此刻 · {LOCATIONS[w.player.location].name}</span>
          <strong>{storyTitle || "查看此处见闻"}</strong>
          <small>{context.actionable ? "故事正在展开 · 进入并回应" : goal.text}</small>
        </span>
        <ArrowRight size={20} />
      </button>
      <div className="map-local-heading">
        <h3 className="serif">此地与周边</h3>
        <span>查看在场人物，或走入街巷</span>
      </div>
      <div className="local-map" aria-label={`${regionName(w.player.location)}地点与人物`}>
        {localSites.map((to) => {
          const place = LOCATIONS[to],
            here = to === w.player.location;
          const connected = !!travelRoute(w.player.location, to, w);
          const unavailable = !here && (blocked || !!w.loot || !connected);
          const residents = w.npcs
            .filter((a) => a.alive && !a.npcJourney && a.location === to)
            .sort(
              (a, b) =>
                Number(actorIds.includes(b.id)) - Number(actorIds.includes(a.id)) ||
                Number(b.sect === sectAt(to)?.name) - Number(a.sect === sectAt(to)?.name) ||
                Number(!!relation(w, b.id)?.known) - Number(!!relation(w, a.id)?.known) ||
                a.id.localeCompare(b.id),
            );
          const target =
            "location" in goal && goal.location
              ? goal.location === to
              : step?.sameRegion && step.location === to;
          return (
            <article
              className={`map-place${here ? " is-current" : ""}${target ? " is-objective" : ""}`}
              key={to}
              data-map-location={to}
            >
              <div className="map-place-top">
                <span className="eyebrow">
                  {here ? "此刻所在" : target ? "主线去处" : "当地去处"}
                </span>
                <span>{residents.length} 人</span>
              </div>
              <h3 className="serif">{place.name}</h3>
              <p>{place.subtitle}</p>
              <div className="map-residents">
                {residents.slice(0, 3).map((actor) => (
                  <button
                    key={actor.id}
                    onClick={(event) => onProfile(actor.id, profileTabForClick(event))}
                    aria-label={`查看${actor.name}的人物资料`}
                  >
                    <NpcPortrait world={w} actor={actor} className="map-person-avatar" />
                    <span>{actor.name}</span>
                  </button>
                ))}
                {!residents.length && <span className="subtle">此刻无人停留</span>}
              </div>
              {residents.length > 3 && (
                <button className="map-more-residents" onClick={() => setResidentPlace(to)}>
                  查看全部 {residents.length} 人
                </button>
              )}
              <button
                className="map-travel"
                disabled={unavailable}
                aria-label={here ? `进入${place.name}` : undefined}
                onClick={() => void onEnter(to)}
              >
                {here ? (
                  <>
                    <MapPin size={14} />
                    进入地点
                  </>
                ) : connected ? (
                  <>
                    <Footprints size={14} />
                    前往 ·{" "}
                    {travelDays(w.player.location, to, w)
                      ? `${travelDays(w.player.location, to, w)} 日`
                      : "不耗日 · 会保存"}
                  </>
                ) : (
                  <>需经{LOCATIONS[localSite(w.player.location, "market")].name}</>
                )}
              </button>
            </article>
          );
        })}
      </div>
      <MainQuestLog world={w} />
      <Dialog open={!!residentPlace} onOpenChange={(open) => !open && setResidentPlace(null)}>
        <DialogContent className="game-modal local-roster-dialog">
          <DialogHeader>
            <DialogTitle>{residentPlace && LOCATIONS[residentPlace].name} · 在场人物</DialogTitle>
            <DialogDescription>查看资料不消耗游戏日。</DialogDescription>
          </DialogHeader>
          <div className="local-roster-list">
            {w.npcs
              .filter((a) => a.alive && !a.npcJourney && a.location === residentPlace)
              .map((actor) => (
                <button
                  key={actor.id}
                  onClick={(event) => {
                    onProfile(actor.id, profileTabForClick(event));
                    setResidentPlace(null);
                  }}
                >
                  <NpcPortrait world={w} actor={actor} className="map-person-avatar" />
                  <span>{actor.name}</span>
                  <span>资料 →</span>
                </button>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
