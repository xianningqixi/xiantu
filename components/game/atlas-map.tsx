"use client";
import { B } from "@/lib/game/rules";
import { relation } from "@/lib/game/relationships";
import { sectAt } from "@/lib/game/sect-content";
import { useState, type CSSProperties } from "react";
import { Compass, MapPin, Trees, Mountain, Waves, House, Castle, Footprints } from "lucide-react";
import { atlasPlaces, regionOf, travelRoute } from "@/lib/game/world-map";
import { mainChapters, mainEvent, currentMainStep } from "@/lib/game/main-story";
import { REALMS } from "@/lib/game/content/official";
import type { LocationId, World } from "@/lib/game/types";
import type { Send } from "./panels";

const symbols = { town: Castle, village: House, forest: Trees, mountain: Mountain, water: Waves };
const mobilePoints: Record<string, [number, number]> = {
  qingshi: [25, 84],
  "atlas.luoxia": [24, 65],
  "atlas.cangzhu": [25, 46],
  xiaye: [74, 84],
  "atlas.yanbo": [74, 65],
  "atlas.yunmeng": [75, 46],
  qiudeng: [25, 27],
  "atlas.wendao": [24, 9],
  dongxue: [75, 9],
  "atlas.xuesong": [75, 27],
};

export function AtlasMap({
  world: w,
  send,
  blocked,
}: {
  world: World;
  send: Send;
  blocked: boolean;
}) {
  const places = atlasPlaces(w);
  const current =
    places.find((p) => p.to === w.player.location) ??
    places.find((p) => p.kind === "town" && p.region === regionOf(w.player.location))!;
  const [selectedId, setSelectedId] = useState(current.id);
  const selected = places.find((p) => p.id === selectedId) ?? current;
  const here = selected.id === current.id;
  const route = travelRoute(w.player.location, selected.to as LocationId, w);
  const chapter = mainChapters(w).find((c) => (c.packId ?? "qingshi") === selected.region);
  const towns = places.filter((p) => p.kind === "town");
  const nextStep = currentMainStep(w);
  const connections = places.flatMap((p) => {
    const parent =
      p.kind === "town" ? towns[towns.indexOf(p) - 1] : places.find((t) => t.to === p.gate);
    return parent ? [[parent, p]] : [];
  });
  const routeStops = route?.path.filter((id) => places.some((p) => p.to === id)) ?? [];
  const visitable =
    !blocked &&
    !w.loot &&
    !here &&
    !!route &&
    w.party.every((id) => !w.npcs.find((a) => a.id === id)?.attempt);
  const storyNote =
    !chapter || selected.kind !== "town"
      ? "可以在此歇脚、修行，再循原路回城。"
      : w.player.realm < chapter.minRealm
        ? `人物剧情需${REALMS[chapter.minRealm]}及相应线索；现在也可入城探访。`
        : mainEvent(w, chapter.discovery.id)
          ? "此地的主线旧事已查明，仍可回访故人。"
          : "可先入城探访；人物在场、前置线索与时机齐备后，剧情自然展开。";
  return (
    <div className="atlas-section">
      <div className="atlas-caption">
        <span>
          山河舆图 <small>· {places.length} 处可游历</small>
        </span>
        <span className="atlas-legend">● 此刻所在　◆ 主线去处　◇ 宗门　✓ 已查明</span>
      </div>
      <div className="atlas-canvas" role="group" aria-label="云岚境大地图">
        <svg
          className="atlas-terrain"
          viewBox="0 0 1000 620"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <pattern id="atlas-grid" width="62" height="62" patternUnits="userSpaceOnUse">
              <path d="M62 0H0V62" fill="none" stroke="currentColor" strokeWidth="0.7" />
            </pattern>
            <pattern id="atlas-pines" width="42" height="38" patternUnits="userSpaceOnUse">
              <path
                d="M21 5 12 20H17L10 29H32L25 20H30Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="1000" height="620" fill="url(#atlas-grid)" opacity=".2" />
          <g className="atlas-ridges" fill="none" stroke="currentColor">
            <path d="M-40 160Q70 35 170 100T340 80 520 25 730 40 1060 0M-40 180Q70 55 170 120T340 100 520 45 730 60 1060 20M-40 200Q70 75 170 140T340 120 520 65 730 80 1060 40" />
            <path d="M110 370 210 220 240 263 302 156 392 302 425 257 455 318M210 220 220 273 240 263M302 156 289 254 312 228 345 266M580 215 644 85 679 158 710 121 765 240M644 85 644 157 662 134M780 170 867 31 935 163 982 120 1050 230" />
            <path
              d="M145 380Q275 342 390 371M130 391Q275 353 410 382M585 228Q659 193 777 249M570 245Q659 212 792 264"
              opacity=".6"
            />
          </g>
          <path
            className="atlas-river-bank"
            d="M1030 302C820 305 862 370 699 345S592 290 523 373 346 421 374 491 223 530-25 571"
            fill="none"
          />
          <path
            className="atlas-river"
            d="M1030 302C820 305 862 370 699 345S592 290 523 373 346 421 374 491 223 530-25 571"
            fill="none"
          />
          <g fill="url(#atlas-pines)" className="atlas-woods">
            <ellipse cx="260" cy="347" rx="105" ry="50" />
            <ellipse cx="892" cy="337" rx="110" ry="66" />
            <ellipse cx="107" cy="192" rx="60" ry="45" />
          </g>
          <g className="atlas-land-labels">
            <text x="308" y="182">
              苍 岚 群 山
            </text>
            <text x="580" y="575">
              云 梦 水 系
            </text>
            <text x="800" y="92">
              北 境
            </text>
          </g>
        </svg>
        {([false, true] as const).map((mobile) => (
          <svg
            key={String(mobile)}
            className={`atlas-roads ${mobile ? "atlas-mobile-roads" : "atlas-desktop-roads"}`}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {connections.map(([a, b]) => {
              const [ax, ay] = mobile ? mobilePoints[a.id] : [a.x, a.y];
              const [bx, by] = mobile ? mobilePoints[b.id] : [b.x, b.y];
              const selectedRoute =
                routeStops.includes(a.to as LocationId) && routeStops.includes(b.to as LocationId);
              return (
                <path
                  key={`${a.id}-${b.id}`}
                  d={`M${ax} ${ay}Q${ax} ${by} ${bx} ${by}`}
                  className={selectedRoute ? "is-planned" : ""}
                />
              );
            })}
          </svg>
        ))}
        <span className="atlas-compass" aria-hidden="true">
          北<Compass size={29} />
          <small>云岚境</small>
        </span>
        <div className="atlas-markers">
          {places.map((p) => {
            const Icon = symbols[p.kind as keyof typeof symbols];
            const isHere = p.id === current.id;
            const placeChapter = mainChapters(w).find((c) => (c.packId ?? "qingshi") === p.region);
            const isNext = p.kind === "town" && nextStep?.chapter.id === placeChapter?.id;
            const complete =
              p.kind === "town" && placeChapter && mainEvent(w, placeChapter.discovery.id);
            const sect = sectAt(p.to as LocationId);
            const [mx, my] = mobilePoints[p.id];
            return (
              <button
                key={p.id}
                type="button"
                data-atlas-place={p.id}
                className={`atlas-place ${p.kind === "town" ? "is-town" : ""}${isHere ? " is-here" : ""}${p.id === selected.id ? " is-selected" : ""}`}
                style={
                  {
                    "--map-x": `${p.x}%`,
                    "--map-y": `${p.y}%`,
                    "--mobile-x": `${mx}%`,
                    "--mobile-y": `${my}%`,
                  } as CSSProperties
                }
                aria-label={`查看${p.name}`}
                aria-pressed={p.id === selected.id}
                aria-current={isHere ? "location" : undefined}
                onClick={() => setSelectedId(p.id)}
              >
                <span className="atlas-pin">
                  {isHere ? <MapPin size={20} /> : <Icon size={18} />}
                </span>
                <strong className="serif">{p.name}</strong>
                <small>
                  {isHere
                    ? "● 你在这里"
                    : isNext
                      ? "◆ 主线去处"
                      : complete
                        ? "✓ 已查明"
                        : sect
                          ? `◇ ${sect.name}`
                          : p.kind === "town"
                            ? "城镇"
                            : p.kind === "water"
                              ? "水泽"
                              : p.kind === "forest"
                                ? "林野"
                                : p.kind === "village"
                                  ? "村落"
                                  : "山峰"}
                </small>
              </button>
            );
          })}
        </div>
        <span className="atlas-map-seal" aria-hidden="true">
          山河
          <br />
          任行
        </span>
      </div>
      <div className="atlas-destination" aria-label="目的地详情" aria-live="polite">
        <div className="atlas-destination-copy">
          <span className="eyebrow">
            {here ? "此刻所在" : "下一程"} · {selected.subtitle}
          </span>
          <h3 className="serif">{selected.name}</h3>
          <p>{selected.body}</p>
          {sectAt(selected.to as LocationId) && (
            <p className="atlas-sect-note">
              <strong>{sectAt(selected.to as LocationId)!.name} · </strong>
              {sectAt(selected.to as LocationId)!.description}
            </p>
          )}
          <small>{storyNote}</small>
          {!here && route && (
            <small className="atlas-itinerary">
              行程：
              {[
                current.name,
                ...routeStops
                  .filter((id) => id !== current.to)
                  .map((id) => places.find((p) => p.to === id)!.name),
              ].join(" → ")}
            </small>
          )}
        </div>
        <div className="atlas-departure">
          <p>
            已结识{" "}
            {
              w.npcs.filter(
                (a) =>
                  a.alive &&
                  !a.npcJourney &&
                  a.location === selected.to &&
                  relation(w, a.id)?.known,
              ).length
            }{" "}
            人在此
          </p>
          <p>
            旅途 {here ? 0 : (route?.days ?? 0)} 日 · 遭遇概率{" "}
            {B.travel.randomRoadEncounterBp / 100}%
          </p>
          <button
            disabled={!visitable}
            className="atlas-go"
            onClick={() => void send({ type: "travel", to: selected.to as LocationId })}
          >
            {here ? <MapPin size={17} /> : <Footprints size={17} />}
            {here ? "正在此地" : `启程前往 · ${route?.days ?? 0} 日`}
          </button>
          <small>
            {w.loot
              ? "先返回结算战利品"
              : blocked
                ? "当前行动结束后可启程"
                : !route
                  ? "请先结束当前秘境行程"
                  : "自由往来 · 剧情随缘而起"}
          </small>
        </div>
      </div>
    </div>
  );
}
